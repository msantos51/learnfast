import './fonts';
import './styles.css';
import type * as AlphaTab from '@coderline/alphatab';
import { analyzeBar, isBassTrack, label, sectionsFromScore, type LabelOptions, type Section } from './analysis/analyze';
import { parseScore } from './analysis/parse';
import { pitchClassesOf } from './app/notes';
import { exportPdf } from './app/pdf';
import { VisualDelay } from './app/sync';

type Score = AlphaTab.model.Score;
type Track = AlphaTab.model.Track;

// O alphaTab é carregado como script clássico (public/vendor/alphatab), porque os workers
// do leitor e do desenho precisam de um ficheiro único que possam reabrir.
const at = (window as unknown as { alphaTab: typeof AlphaTab }).alphaTab;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);

const base = new URL('.', location.href).href;
const vendor = base + 'vendor/alphatab/';
const PLAYING = 1; // alphaTab.synth.PlayerState.Playing

interface State {
  score: Score | null;
  fileKey: string;
  isSample: boolean;
  sections: Section[];
  /** Correções do utilizador, por instrumento (índice da pista) e por compasso. */
  overridesByTrack: Record<number, Record<number, string>>;
  detected: string[];
  fileFlag: boolean[];
  perRow: number;
  viewTrack: number;
  loopSection: number;
  selBar: number;
  playingBar: number;
  api: AlphaTab.AlphaTabApi | null;
  ready: boolean;
  syncMs: number;
}

const st: State = {
  score: null, fileKey: '', isSample: true,
  sections: [], overridesByTrack: {}, detected: [], fileFlag: [],
  perRow: 4, viewTrack: 0,
  loopSection: -1, selBar: -1, playingBar: -1, api: null, ready: false, syncMs: 0,
};
const score = () => st.score as Score;
const api = () => st.api as AlphaTab.AlphaTabApi;
/** Correções do instrumento selecionado. */
const ov = () => (st.overridesByTrack[st.viewTrack] ??= {});

// ---------- Utilidades ----------
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
}
function showErr(msg: string) { const e = $('err'); e.textContent = msg; e.hidden = !msg; }

const storage = {
  get<T>(key: string): T | null {
    try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null; } catch { return null; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento */ }
  },
};
interface SavedSong {
  sections: Section[];
  overridesByTrack?: Record<number, Record<number, string>>;
  /** Formato antigo: correções sem instrumento. */
  overrides?: Record<number, string>;
  perRow: number;
  track?: number;
}
const save = () => storage.set('mapa:' + st.fileKey, {
  sections: st.sections, overridesByTrack: st.overridesByTrack, perRow: st.perRow, track: st.viewTrack,
} satisfies SavedSong);

function opts(): LabelOptions & { splitBars: boolean; useFileChords: boolean } {
  return {
    showMinor: input('optMinor').checked, splitBars: input('optSplit').checked, useFileChords: input('optFileChords').checked,
    latin: select('optNames').value === 'latin', accidentals: select('optAcc').value as LabelOptions['accidentals'],
  };
}

// Altura do leitor flutuante (para margens e barras por cima dele)
new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', $('dock').offsetHeight + 'px')).observe($('dock'));

// ---------- Sincronização ----------
const delay = new VisualDelay(() => st.syncMs, () => !!st.api && st.api.playerState === PLAYING);
function setSync(v: number) {
  st.syncMs = Math.max(0, Math.min(500, Math.round(v / 10) * 10));
  input('syncMs').value = String(st.syncMs);
  $('syncOut').textContent = st.syncMs + ' ms';
  storage.set('mapa:sync', st.syncMs);
}
setSync(storage.get<number>('mapa:sync') ?? 0);
input('syncMs').addEventListener('input', () => setSync(+input('syncMs').value));
$('syncMinus').addEventListener('click', () => setSync(st.syncMs - 10));
$('syncPlus').addEventListener('click', () => setSync(st.syncMs + 10));

// ---------- Carregar música ----------
function loadBytes(bytes: Uint8Array, name: string, isSample: boolean) {
  let s: Score;
  try { s = parseScore(at, bytes); }
  catch { showErr('Não consegui ler “' + name + '”. Confirma que é um ficheiro Guitar Pro (.gp, .gp3, .gp4, .gp5, .gpx) ou MusicXML.'); return; }
  showErr('');
  st.score = s; st.isSample = isSample;
  st.fileKey = (s.title || name) + '|' + (s.artist || '') + '|' + s.masterBars.length;
  const pitched = s.tracks.map((_, i) => i).filter(i => !isPercussion(s.tracks[i]));
  const bassIdx = pitched.find(i => isBassTrack(s.tracks[i]));
  st.loopSection = -1; st.selBar = -1; st.playingBar = -1;

  const saved = storage.get<SavedSong>('mapa:' + st.fileKey);
  // Instrumento: o último escolhido para esta música; senão o baixo; senão o primeiro com notas.
  const savedOk = saved?.track != null && s.tracks[saved.track] && !isPercussion(s.tracks[saved.track]);
  st.viewTrack = savedOk ? saved!.track! : bassIdx ?? pitched[0] ?? 0;
  st.sections = saved?.sections?.length ? saved.sections : sectionsFromScore(s);
  st.overridesByTrack = saved?.overridesByTrack ?? (saved?.overrides ? { [st.viewTrack]: saved.overrides } : {});
  if (saved?.perRow) { st.perRow = saved.perRow; select('perRow').value = String(saved.perRow); }

  renderInfo(name); renderTrackControls(); detect(); renderChart(); renderTab(); updateNow(-1, 0);
}

function renderInfo(name: string) {
  const s = score();
  $('songTitle').textContent = s.title || name.replace(/\.[^.]+$/, '');
  document.title = $('songTitle').textContent + ' · Mapa de Compassos';
  const mb = s.masterBars[0];
  const parts = [s.artist, s.masterBars.length + ' compassos', Math.round(s.tempo) + ' bpm', mb ? mb.timeSignatureNumerator + '/' + mb.timeSignatureDenominator : ''];
  const m = $('songMeta'); m.textContent = parts.filter(Boolean).join(' · ');
  if (st.isSample) { const b = document.createElement('span'); b.className = 'sample'; b.textContent = 'Exemplo'; m.append(b); }
}

const isPercussion = (t: Track) => t.staves.every(x => x.isPercussion);
function trackLabel(t: Track, i: number) {
  const name = t.name || 'Pista ' + (i + 1);
  // Só acrescenta "baixo" quando o nome ainda não o diz ("Baixo" fica "Baixo", não "Baixo · baixo").
  return isBassTrack(t) && !/bass|baixo|bajo/i.test(name) ? name + ' · baixo' : name;
}

/** Preenche os dois seletores de instrumento (ajustes e barra de topo). A bateria fica de fora: não tem tom. */
function renderTrackControls() {
  const s = score();
  for (const sel of [select('viewTrack'), select('trackQuick')]) {
    sel.innerHTML = '';
    s.tracks.forEach((t, i) => {
      if (isPercussion(t)) return;
      const o = document.createElement('option'); o.value = String(i); o.textContent = trackLabel(t, i);
      o.selected = i === st.viewTrack; sel.append(o);
    });
  }
}

/** Muda o instrumento: volta a detetar o tom só com ele, e atualiza a tablatura. */
function setTrack(i: number) {
  if (i === st.viewTrack) return;
  st.viewTrack = i;
  select('viewTrack').value = String(i); select('trackQuick').value = String(i);
  save(); detect(); renderChart(); renderTab();
  toast('Tom detetado a partir de: ' + trackLabel(score().tracks[i], i));
}

// ---------- Deteção ----------
function detect() {
  const s = score(), o = opts();
  st.detected = []; st.fileFlag = [];
  for (let i = 0; i < s.masterBars.length; i++) {
    // O tom é sempre detetado só a partir do instrumento selecionado.
    const res = analyzeBar(s, i, [st.viewTrack], o);
    const kt = s.tracks[st.viewTrack];
    const ks = (kt?.staves[0].bars[i]?.keySignature as number | undefined) ?? 0;
    st.detected[i] = res.length ? res.map(c => label(c, o, ks)).join(' ') : '–';
    st.fileFlag[i] = !!res[0]?.fromFile;
  }
}
const barText = (i: number) => ov()[i] ?? st.detected[i];
const secEnd = (k: number) => (k + 1 < st.sections.length ? st.sections[k + 1].start : score().masterBars.length);
function secOf(i: number) { let k = 0; st.sections.forEach((s, j) => { if (s.start <= i) k = j; }); return k; }

// ---------- Cores por nota ----------
function colorCell(cell: HTMLElement, text: string) {
  const pcs = pitchClassesOf(text);
  cell.classList.remove('two'); delete cell.dataset.pc;
  cell.style.removeProperty('--nc'); cell.style.removeProperty('--nc2');
  if (!pcs.length) return;
  cell.dataset.pc = String(pcs[0]); cell.style.setProperty('--nc', 'var(--n' + pcs[0] + ')');
  if (pcs.length === 2 && pcs[1] !== pcs[0]) { cell.classList.add('two'); cell.style.setProperty('--nc2', 'var(--n' + pcs[1] + ')'); }
}
function renderNoteKey() {
  const o = opts(), key = $('noteKey');
  key.hidden = !input('optColors').checked; key.innerHTML = '';
  for (let pc = 0; pc < 12; pc++) {
    const sp = document.createElement('span'); sp.style.setProperty('--nc', 'var(--n' + pc + ')');
    sp.textContent = label({ pc, minor: false }, { ...o, showMinor: false }, 0);
    key.append(sp);
  }
}

const ICON_LOOP = '<svg class="i" viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';

function selectText(el: HTMLElement) {
  const r = document.createRange(); r.selectNodeContents(el);
  const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
}

// ---------- Esquema ----------
function renderChart() {
  const chart = $('chart');
  chart.innerHTML = '';
  chart.classList.toggle('colored', input('optColors').checked);
  renderNoteKey();
  if (!st.score?.tracks.some(t => !isPercussion(t))) {
    const note = document.createElement('p'); note.className = 'chart-empty';
    note.textContent = 'Esta música não tem nenhum instrumento com notas (só bateria), por isso não há tom para mostrar.';
    chart.append(note);
  }
  st.sections.forEach((sec, k) => {
    const end = secEnd(k);
    const wrap = document.createElement('div'); wrap.className = 'section' + (st.loopSection === k ? ' looping' : ''); wrap.dataset.sec = String(k);
    const head = document.createElement('div'); head.className = 'sec-head';
    const mark = document.createElement('div'); mark.className = 'mark'; mark.contentEditable = 'true'; mark.spellcheck = false;
    mark.textContent = sec.name; mark.setAttribute('aria-label', 'Nome da secção');
    mark.addEventListener('input', () => { sec.name = mark.textContent?.trim() || 'SECÇÃO'; save(); });
    mark.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mark.blur(); } });
    const meta = document.createElement('span'); meta.className = 'sec-meta';
    meta.textContent = 'c. ' + (sec.start + 1) + '–' + end + ' · ' + (end - sec.start) + ' comp.';
    const acts = document.createElement('div'); acts.className = 'sec-actions';
    const loopB = document.createElement('button'); loopB.type = 'button'; loopB.className = 'sbtn' + (st.loopSection === k ? ' on' : '');
    loopB.innerHTML = ICON_LOOP + '<span>' + (st.loopSection === k ? 'A praticar' : 'Praticar') + '</span>';
    loopB.title = 'Repetir esta secção em loop'; loopB.setAttribute('aria-label', 'Praticar ' + sec.name + ' em loop');
    loopB.addEventListener('click', () => practiceSection(k));
    loopB.setAttribute('aria-pressed', String(st.loopSection === k));
    acts.append(loopB);
    head.append(mark, meta, acts); wrap.append(head);

    for (let r = sec.start; r < end; r += st.perRow) {
      const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--per', String(st.perRow));
      for (let i = r; i < Math.min(r + st.perRow, end); i++) row.append(barCell(i));
      wrap.append(row);
    }
    chart.append(wrap);
  });
  markPlaying(st.playingBar, false);
  if (st.playingBar >= 0) updateNow(st.playingBar, 0);
}

function barCell(i: number) {
  const mb = score().masterBars[i];
  const cell = document.createElement('div'); cell.className = 'bar'; cell.dataset.bar = String(i);
  if (ov()[i] != null) cell.classList.add('edited');
  if (st.fileFlag[i] && ov()[i] == null) cell.classList.add('file');
  const num = document.createElement('span'); num.className = 'num'; num.textContent = (mb.isRepeatStart ? '‖: ' : '') + (i + 1);
  const ch = document.createElement('div'); ch.className = 'ch'; ch.contentEditable = 'true'; ch.spellcheck = false;
  ch.textContent = barText(i); ch.setAttribute('aria-label', 'Tom do compasso ' + (i + 1));
  ch.addEventListener('focus', () => { selectBar(i); if (st.ready && st.playingBar !== i) goBar(i, true); });
  ch.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); focusBar(i + 1); }
    if (e.key === 'Tab') { e.preventDefault(); focusBar(e.shiftKey ? i - 1 : i + 1); }
    if (e.key === 'Escape') { ch.blur(); $('barbar').hidden = true; }
  });
  ch.addEventListener('input', () => {
    const v = ch.textContent?.trim() ?? '';
    if (v === st.detected[i] || v === '') delete ov()[i]; else ov()[i] = v;
    cell.classList.toggle('edited', ov()[i] != null); cell.classList.remove('file'); colorCell(cell, v); save();
    $<HTMLButtonElement>('bbReset').disabled = ov()[i] == null;
  });
  cell.addEventListener('click', e => { if (e.target === cell) ch.focus(); });
  colorCell(cell, barText(i));
  cell.append(num, ch);
  if (mb.repeatCount > 0) { const rep = document.createElement('span'); rep.className = 'rep'; rep.textContent = ':‖ ×' + mb.repeatCount; cell.append(rep); }
  return cell;
}
function focusBar(i: number) {
  const el = document.querySelector<HTMLElement>('.bar[data-bar="' + i + '"] .ch');
  if (el) { el.focus(); selectText(el); }
}
function selectBar(i: number) {
  st.selBar = i;
  $('bbLabel').textContent = 'Compasso ' + (i + 1);
  $<HTMLButtonElement>('bbSplit').disabled = st.sections.some(s => s.start === i);
  $<HTMLButtonElement>('bbReset').disabled = ov()[i] == null;
  $('barbar').hidden = false;
}

$('bbClose').addEventListener('click', () => { $('barbar').hidden = true; (document.activeElement as HTMLElement | null)?.blur(); });
$('bbPlay').addEventListener('click', () => { if (st.selBar >= 0) playFrom(st.selBar); });
$('bbReset').addEventListener('click', () => { const i = st.selBar; delete ov()[i]; save(); renderChart(); focusBar(i); });
$('bbSplit').addEventListener('click', () => {
  const i = st.selBar; if (st.sections.some(s => s.start === i)) return;
  st.sections.push({ name: 'NOVA', start: i }); st.sections.sort((a, b) => a.start - b.start);
  clearLoop(); save(); renderChart();
  const k = st.sections.findIndex(s => s.start === i);
  const mark = document.querySelectorAll<HTMLElement>('.mark')[k];
  if (mark) { mark.focus(); selectText(mark); }
  $('barbar').hidden = true;
});

function markPlaying(i: number, scroll = true) {
  document.querySelectorAll('.bar.playing').forEach(e => e.classList.remove('playing'));
  if (i < 0) return;
  const el = document.querySelector<HTMLElement>('.bar[data-bar="' + i + '"]');
  if (!el) return;
  el.classList.add('playing');
  if (!scroll) return;
  const r = el.getBoundingClientRect(), dockH = $('dock').offsetHeight;
  if (r.top < 60 || r.bottom > innerHeight - dockH - 30) {
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

// ---------- Progresso (barra neutra no leitor) ----------
function updateNow(i: number, frac: number) {
  const total = st.score ? st.score.masterBars.length : 1;
  $('progressFill').style.width = (i < 0 ? 0 : ((i + frac) / total) * 100) + '%';
  if (i < 0) {
    $('nowTitle').textContent = st.sections[0] ? st.sections[0].name + ' · compasso 1' : 'Início';
    $('nowChip').textContent = '';
    return;
  }
  const k = secOf(i);
  $('nowTitle').textContent = st.sections[k].name + ' · compasso ' + (i + 1);
  $('nowChip').textContent = st.sections[k].name + ' · c. ' + (i + 1);
}
$('progress').addEventListener('click', e => {
  if (!st.ready || !st.score) return;
  const r = $('progress').getBoundingClientRect();
  const i = Math.floor(((e.clientX - r.left) / r.width) * st.score.masterBars.length);
  goBar(i, true);
});

// ---------- Exportar para PDF ----------
$('pdfBtn').addEventListener('click', async () => {
  if (!st.score) return;
  const s = score(), t = s.tracks[st.viewTrack];
  const mb = s.masterBars[0];
  const meta = [s.artist, trackLabel(t, st.viewTrack), Math.round(s.tempo) + ' bpm', mb ? mb.timeSignatureNumerator + '/' + mb.timeSignatureDenominator : '', s.masterBars.length + ' compassos']
    .filter(Boolean).join(' · ');
  const btn = $<HTMLButtonElement>('pdfBtn'); btn.disabled = true;
  try {
    await exportPdf({
      title: $('songTitle').textContent || 'Música',
      meta,
      perRow: st.perRow,
      colors: input('optColors').checked,
      sections: st.sections.map((sec, k) => {
        const end = secEnd(k), bars = [];
        for (let i = sec.start; i < end; i++) bars.push({ n: i + 1, text: barText(i), pcs: pitchClassesOf(barText(i)) });
        return { name: sec.name, range: 'c. ' + (sec.start + 1) + '–' + end, bars };
      }),
    });
    toast('PDF do esquema descarregado.');
  } catch { toast('Não foi possível criar o PDF.'); }
  finally { btn.disabled = false; }
});

// ---------- Ajustes ----------
function openSettings(v: boolean) {
  $('settings').hidden = !v; $('scrim').hidden = !v; $('settingsBtn').setAttribute('aria-expanded', String(v));
  (v ? $('closeSettings') : $('settingsBtn')).focus();
}
$('settingsBtn').addEventListener('click', () => openSettings(true));
$('closeSettings').addEventListener('click', () => openSettings(false));
$('scrim').addEventListener('click', () => openSettings(false));
input('optColors').addEventListener('change', renderChart);
['optMinor', 'optSplit', 'optFileChords', 'optNames', 'optAcc'].forEach(id => $(id).addEventListener('change', () => { detect(); renderChart(); }));
select('perRow').addEventListener('change', () => { st.perRow = +select('perRow').value; save(); renderChart(); });
$('resetBtn').addEventListener('click', () => {
  st.overridesByTrack[st.viewTrack] = {}; st.sections = sectionsFromScore(score()); clearLoop(); save(); renderChart(); toast('Esquema reposto a partir do ficheiro.');
});
select('viewTrack').addEventListener('change', () => setTrack(+select('viewTrack').value));
select('trackQuick').addEventListener('change', () => setTrack(+select('trackQuick').value));

// ---------- Leitor (alphaTab) ----------
function initApi() {
  const a = new at.AlphaTabApi($('tab'), {
    core: { fontDirectory: vendor + 'font/', scriptFile: vendor + 'alphaTab.min.js', engine: 'svg' },
    display: {
      staveProfile: 'Tab', layoutMode: 'Page', scale: 0.95,
      // Cores da tablatura a condizer com o tema escuro
      resources: {
        staffLineColor: '#3a3f4d', barSeparatorColor: '#4a5060', barNumberColor: '#8a90a2',
        mainGlyphColor: '#e9ebf2', secondaryGlyphColor: '#8a90a2', scoreInfoColor: '#e9ebf2',
      },
    },
    player: {
      playerMode: 'EnabledSynthesizer', outputMode: 'WebAudioScriptProcessor', soundFont: vendor + 'soundfont/sonivox.sf3',
      scrollElement: $('tabScroll'), enableCursor: true, enableAnimatedBeatCursor: true, enableUserInteraction: true, scrollOffsetY: -40,
    },
  });
  st.api = a;
  a.customCursorHandler = delay.cursorHandler(at.midi.MidiTickLookupFindBeatResultCursorMode.ToNextBext);
  a.soundFontLoad.on(e => { if (e.total) $('status').textContent = 'A carregar os sons… ' + Math.round((e.loaded / e.total) * 100) + '%'; });
  a.playerReady.on(() => {
    st.ready = true;
    ['playBtn', 'stopBtn', 'prevBtn', 'nextBtn', 'loopBtn', 'metroBtn', 'countBtn', 'muteBtn'].forEach(id => ($<HTMLButtonElement>(id).disabled = false));
    $('status').textContent = 'Pronto a tocar';
    a.playbackSpeed = +input('speed').value / 100;
    applyMute();
  });
  a.renderStarted.on(() => ($('tabLoading').hidden = false));
  a.renderFinished.on(() => ($('tabLoading').hidden = true));
  a.playerStateChanged.on(e => {
    const playing = e.state === PLAYING;
    if (!playing) delay.clear();
    $('playIcon').innerHTML = playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    $('playBtn').setAttribute('aria-label', playing ? 'Pausa' : 'Tocar');
    setStatus(playing ? 'A tocar' : 'Em pausa');
  });
  a.playedBeatChanged.on(beat => delay.run(() => {
    const mb = beat.voice.bar.masterBar, i = mb.index;
    if (i !== st.playingBar) { st.playingBar = i; markPlaying(i); }
    let frac = 0; try { frac = beat.playbackStart / mb.calculateDuration(); } catch { /* compasso vazio */ }
    updateNow(i, frac);
  }));
  // Clicar numa nota da tablatura leva o esquema para esse compasso.
  a.beatMouseDown.on(beat => {
    const i = beat.voice.bar.masterBar.index;
    if (i === st.playingBar) return;
    leaveLoopIfOutside(i);
    st.playingBar = i; markPlaying(i); updateNow(i, 0);
  });
  a.error.on(e => { $('status').textContent = 'Erro no leitor: ' + (e?.message ?? e); });
}
function setStatus(txt: string) {
  const s = $('status'); s.textContent = txt;
  if (st.loopSection >= 0) { const l = document.createElement('span'); l.className = 'loopinfo'; l.textContent = ' · loop em ' + st.sections[st.loopSection].name; s.append(l); }
  s.append(' · ' + input('speed').value + '%');
}

function renderTab() {
  if (!st.api) initApi();
  const t = score().tracks[st.viewTrack];
  $('tabTrackName').textContent = trackLabel(t, st.viewTrack);
  const allTab = t.staves.every(s => s.showTablature !== false && s.tuning && s.tuning.length);
  api().settings.display.staveProfile = allTab ? at.StaveProfile.Tab : at.StaveProfile.Default;
  api().updateSettings();
  api().renderScore(score(), [st.viewTrack]);
  if (st.ready) applyMute();
}

function applyMute() {
  if (!st.api || !st.score) return;
  const on = $('muteBtn').getAttribute('aria-pressed') === 'true';
  st.api.changeTrackMute(st.score.tracks, false);
  if (on) st.api.changeTrackMute([st.score.tracks[st.viewTrack]], true);
}

function barTick(i: number) {
  const mb = score().masterBars[i];
  try { const t = api().tickCache?.getMasterBarStart(mb); if (t != null) return t; } catch { /* sem cache ainda */ }
  return mb.start;
}
function barEndTick(i: number) {
  if (i + 1 < score().masterBars.length) return barTick(i + 1);
  return barTick(i) + score().masterBars[i].calculateDuration();
}
function leaveLoopIfOutside(i: number) {
  if (st.loopSection < 0) return;
  const s = st.sections[st.loopSection];
  if (i < s.start || i >= secEnd(st.loopSection)) { clearLoop(); renderChart(); }
}
/** Leva o leitor, a tablatura e o esquema para o compasso i. `fromChart`: não mexe no scroll do esquema. */
function goBar(i: number, fromChart = false) {
  if (!st.ready) return;
  i = Math.max(0, Math.min(score().masterBars.length - 1, i));
  leaveLoopIfOutside(i);
  delay.clear();
  api().tickPosition = barTick(i);
  st.playingBar = i; markPlaying(i, !fromChart); updateNow(i, 0);
  // A tablatura acompanha: mostra o compasso escolhido.
  try { api().scrollToCursor(); } catch { /* ainda sem cursor */ }
}
function playFrom(i: number) {
  if (!st.ready) { toast('Os sons ainda estão a carregar.'); return; }
  goBar(i);
  if (api().playerState !== PLAYING) api().play();
}
function practiceSection(k: number) {
  if (!st.ready) { toast('Os sons ainda estão a carregar.'); return; }
  if (st.loopSection === k) { clearLoop(); renderChart(); setStatus(api().playerState === PLAYING ? 'A tocar' : 'Em pausa'); return; }
  st.loopSection = k;
  const s = st.sections[k], end = secEnd(k);
  api().playbackRange = { startTick: barTick(s.start), endTick: barEndTick(end - 1) } as AlphaTab.synth.PlaybackRange;
  api().isLooping = true; setPressed('loopBtn', true);
  renderChart();
  delay.clear();
  api().tickPosition = barTick(s.start);
  if (api().playerState !== PLAYING) api().play(); else setStatus('A tocar');
}
function clearLoop() {
  st.loopSection = -1;
  if (st.api && st.ready) { st.api.playbackRange = null; st.api.isLooping = false; }
  setPressed('loopBtn', false);
}
const setPressed = (id: string, v: boolean) => $(id).setAttribute('aria-pressed', v ? 'true' : 'false');
function toggle(id: string) { const v = $(id).getAttribute('aria-pressed') !== 'true'; setPressed(id, v); return v; }

$('playBtn').addEventListener('click', () => st.api?.playPause());
$('stopBtn').addEventListener('click', () => {
  if (!st.api) return;
  delay.clear(); st.api.stop(); st.playingBar = -1; markPlaying(-1); updateNow(-1, 0);
});
$('prevBtn').addEventListener('click', () => goBar((st.playingBar < 0 ? 0 : st.playingBar) - 1));
$('nextBtn').addEventListener('click', () => goBar((st.playingBar < 0 ? -1 : st.playingBar) + 1));
input('speed').addEventListener('input', () => {
  const v = +input('speed').value; $('speedOut').textContent = v + '%';
  if (st.api) st.api.playbackSpeed = v / 100;
  if (st.ready) setStatus(api().playerState === PLAYING ? 'A tocar' : 'Em pausa');
});
$('loopBtn').addEventListener('click', () => {
  const v = toggle('loopBtn'); api().isLooping = v;
  if (!v && st.loopSection >= 0) { clearLoop(); renderChart(); }
});
$('metroBtn').addEventListener('click', () => { api().metronomeVolume = toggle('metroBtn') ? 1 : 0; });
$('countBtn').addEventListener('click', () => { api().countInVolume = toggle('countBtn') ? 1 : 0; });
$('muteBtn').addEventListener('click', () => { toggle('muteBtn'); applyMute(); });

// Atalhos de teclado
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('settings').hidden) { openSettings(false); return; }
  const t = e.target as HTMLElement;
  if (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!st.ready) return;
  if (e.key === ' ') { e.preventDefault(); api().playPause(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); $('prevBtn').click(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); $('nextBtn').click(); }
});

// Vista no telemóvel
function setView(v: 'chart' | 'tab') {
  document.body.dataset.view = v;
  $('vChart').setAttribute('aria-selected', String(v === 'chart'));
  $('vTab').setAttribute('aria-selected', String(v === 'tab'));
  if (v === 'tab') st.api?.render();
}
$('vChart').addEventListener('click', () => setView('chart'));
$('vTab').addEventListener('click', () => setView('tab'));
setView('chart');

// ---------- Ficheiros ----------
function readFile(f: File | undefined) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { st.api?.stop(); clearLoop(); loadBytes(new Uint8Array(r.result as ArrayBuffer), f.name, false); };
  r.readAsArrayBuffer(f);
}
input('fileInput').addEventListener('change', e => {
  const el = e.target as HTMLInputElement; readFile(el.files?.[0]); el.value = '';
});
let dragN = 0;
addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { dragN++; $('drop').hidden = false; } });
addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) $('drop').hidden = true; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('drop').hidden = true; readFile(e.dataTransfer?.files[0]); });

// Música de exemplo ao abrir
fetch(base + 'exemplo.gp5')
  .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
  .then(b => loadBytes(new Uint8Array(b), 'Exemplo', true))
  .catch(() => { $('songTitle').textContent = 'Carrega um ficheiro Guitar Pro para começar'; });
