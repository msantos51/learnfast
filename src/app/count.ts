// Contagem de um compasso ("1 & 2 & 3 & 4 &") a partir da fórmula de compasso e das notas.
// Ticks do alphaTab: semínima = 960, portanto uma semibreve = 3840.

/** Divisão de cada tempo na contagem: 1 = só tempos, 2 = colcheias (&), 4 = semicolcheias (e & a). */
export type Sub = 1 | 2 | 4;

const WHOLE = 3840;

/** Número de tempos e duração de cada tempo em ticks (em 6/8 conta-se cada colcheia: 6 tempos). */
export function beatInfo(numerator: number, denominator: number): { beats: number; beatTicks: number } {
  return { beats: Math.max(1, numerator), beatTicks: WHOLE / Math.max(1, denominator) };
}

const onGrid = (t: number, step: number) => Math.abs(t / step - Math.round(t / step)) < 0.02;

/** Escolhe a contagem mais simples que acerta em todas as notas do compasso. */
export function autoSub(onsets: number[], beatTicks: number): Sub {
  if (onsets.every(t => onGrid(t, beatTicks))) return 1;
  if (onsets.every(t => onGrid(t, beatTicks / 2))) return 2;
  return 4;
}

/** Etiquetas da contagem, por ordem: ["1","&","2","&",…] ou ["1","e","&","a",…]. */
export function countLabels(beats: number, sub: Sub): string[] {
  const between = sub === 1 ? [] : sub === 2 ? ['&'] : ['e', '&', 'a'];
  const out: string[] = [];
  for (let b = 1; b <= beats; b++) out.push(String(b), ...between);
  return out;
}

/** Posição (0…beats·sub−1) de uma nota que começa em `start` ticks dentro do compasso. */
export function slotOf(start: number, beatTicks: number, sub: Sub, slots: number): number {
  return Math.max(0, Math.min(slots - 1, Math.round(start / (beatTicks / sub))));
}
