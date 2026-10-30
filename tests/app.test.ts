import { describe, expect, it } from 'vitest';
import { pitchClassesOf, tokenPc } from '../src/app/notes';
import { exportRows, toText, toTsv } from '../src/app/export';

describe('tokenPc', () => {
  it('aceita letras e Dó Ré Mi, com e sem acentos', () => {
    expect(tokenPc('C')).toBe(0);
    expect(tokenPc('F#m')).toBe(6);
    expect(tokenPc('Dó')).toBe(0);
    expect(tokenPc('Re')).toBe(2);
    expect(tokenPc('Sib')).toBe(10);
    expect(tokenPc('Lá#')).toBe(10);
    expect(tokenPc('–')).toBeNull();
  });
});

describe('pitchClassesOf', () => {
  it('lê até dois acordes por compasso', () => {
    expect(pitchClassesOf('A')).toEqual([9]);
    expect(pitchClassesOf('C G')).toEqual([0, 7]);
    expect(pitchClassesOf('C G D')).toEqual([0, 7]);
    expect(pitchClassesOf('')).toEqual([]);
  });
});

describe('exportar', () => {
  const sections = [{ name: 'INTRO', start: 0 }, { name: 'VERSO', start: 2 }];
  const bars = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rows = exportRows(sections, bars.length, 2, i => bars[i]);

  it('agrupa por secção e por linhas', () => {
    expect(rows).toEqual([['INTRO'], ['A', 'B'], [], ['VERSO'], ['C', 'D'], ['E', 'F'], []]);
  });
  it('gera texto para o Excel e texto simples', () => {
    expect(toTsv(rows).split('\n')[1]).toBe('A\tB');
    expect(toText(rows).split('\n').slice(0, 2)).toEqual(['[INTRO]', '| A | B |']);
  });
});
