import type * as AlphaTab from '@coderline/alphatab';

type AlphaTabModule = typeof AlphaTab;
type Score = AlphaTab.model.Score;

const REPLACEMENT_CHAR = '\uFFFD';

/**
 * Lê um ficheiro Guitar Pro / MusicXML.
 * Os ficheiros GP3–GP5 antigos usam Windows-1252: se os textos vierem com caracteres
 * inválidos, volta a ler com essa codificação (ex.: "REFRÃO").
 */
export function parseScore(at: AlphaTabModule, bytes: Uint8Array): Score {
  const load = (encoding?: string) => {
    const settings = new at.Settings();
    if (encoding) settings.importer.encoding = encoding;
    return at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  };
  const score = load();
  const texts = [score.title, score.artist]
    .concat(score.tracks.map(t => t.name))
    .concat(score.masterBars.map(m => (m.section ? m.section.text : '')));
  if (texts.some(t => t && t.includes(REPLACEMENT_CHAR))) {
    try { return load('windows-1252'); } catch { /* fica com a primeira leitura */ }
  }
  return score;
}
