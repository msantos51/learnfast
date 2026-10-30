import type { Section } from '../analysis/analyze';

/** Linhas do esquema: nome da secção, linhas de compassos, linha vazia entre secções. */
export function exportRows(sections: Section[], totalBars: number, perRow: number, barText: (i: number) => string): string[][] {
  const out: string[][] = [];
  sections.forEach((sec, k) => {
    const end = k + 1 < sections.length ? sections[k + 1].start : totalBars;
    out.push([sec.name]);
    for (let r = sec.start; r < end; r += perRow) {
      const row: string[] = [];
      for (let i = r; i < Math.min(r + perRow, end); i++) row.push(barText(i));
      out.push(row);
    }
    out.push([]);
  });
  return out;
}

/** Formato para colar no Excel (separado por tabulações). */
export const toTsv = (rows: string[][]) => rows.map(r => r.join('\t')).join('\n');

/** Formato de texto simples com barras de compasso. */
export const toText = (rows: string[][]) =>
  rows.map(r => (r.length === 1 ? '[' + r[0] + ']' : r.length ? '| ' + r.join(' | ') + ' |' : '')).join('\n');
