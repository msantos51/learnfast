import { parseChordName } from '../analysis/analyze';

const LATIN_PC: Record<string, number> = { do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };

/** Classe de nota de um nome escrito pelo utilizador ("F#m", "Sib", "Ré"…), ou null. */
export function tokenPc(tok: string): number | null {
  const m = /^(d[oó]|r[eé]|mi|f[aá]|sol|l[aá]|si)([#b♯♭]?)/i.exec(tok);
  if (m) {
    const key = m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let pc = LATIN_PC[key];
    if (m[2] === '#' || m[2] === '♯') pc++;
    if (m[2] === 'b' || m[2] === '♭') pc--;
    return ((pc % 12) + 12) % 12;
  }
  const p = parseChordName(tok);
  return p ? p.pc : null;
}

/** Até duas classes de nota a partir do texto de um compasso ("A", "C G", "Dó Sol"…). */
export function pitchClassesOf(text: string): number[] {
  return String(text)
    .split(/\s+/)
    .map(tokenPc)
    .filter((p): p is number => p != null)
    .slice(0, 2);
}
