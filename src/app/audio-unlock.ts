// Som no iPhone/iPad com o botão de silêncio ligado.
//
// O leitor usa Web Audio. No iOS, o Web Audio é tratado como "som de toque": com o interruptor de
// silêncio ligado, não se ouve nada. Para o site tocar como uma app de música:
//  1. Safari 17+: pedir a sessão de áudio "playback" (navigator.audioSession).
//  2. Versões anteriores: tocar em loop um <audio> silencioso enquanto o leitor toca — isso põe a página
//     na categoria de reprodução de média e o Web Audio passa a ignorar o interruptor.
// Ambos têm de começar dentro de um toque/clique do utilizador.

interface AudioSessionNav { audioSession?: { type: string } }

let silent: HTMLAudioElement | null = null;

/** WAV mono de 8 kHz com ~0,5 s de silêncio (gerado aqui para não depender de ficheiros). */
function silentWavUrl(): string {
  const samples = 4000, bytes = 44 + samples;
  const b = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); b.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true); b.setUint32(28, 8000, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true);
  str(36, 'data'); b.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) b.setUint8(44 + i, 128); // 8 bits: 128 = silêncio
  return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }));
}

const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Chamar dentro de um toque/clique, antes de começar a tocar. */
export function unlockAudio(): void {
  const nav = navigator as Navigator & AudioSessionNav;
  if (nav.audioSession) {
    try { nav.audioSession.type = 'playback'; } catch { /* sem suporte */ }
    return;
  }
  if (!isAppleMobile()) return;
  if (!silent) {
    silent = document.createElement('audio');
    silent.src = silentWavUrl();
    silent.loop = true;
    silent.setAttribute('playsinline', '');
    silent.setAttribute('x-webkit-airplay', 'deny');
    silent.hidden = true;
    document.body.append(silent);
  }
  silent.play().catch(() => { /* o browser recusou; o leitor continua a funcionar */ });
}

/** Parar o <audio> silencioso quando o leitor para (evita o controlo de média no ecrã bloqueado). */
export function releaseAudio(): void {
  silent?.pause();
}
