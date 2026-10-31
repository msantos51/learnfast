import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { barView } from '../src/analysis/bar';
import { parseScore } from '../src/analysis/parse';
import { autoSub, beatInfo, countLabels, slotOf } from '../src/app/count';

describe('contagem do compasso', () => {
  it('conta tempos de semínima em x/4 e de colcheia em x/8', () => {
    expect(beatInfo(4, 4)).toEqual({ beats: 4, beatTicks: 960 });
    expect(beatInfo(3, 4)).toEqual({ beats: 3, beatTicks: 960 });
    expect(beatInfo(6, 8)).toEqual({ beats: 6, beatTicks: 480 });
  });

  it('gera "1 & 2 &" e "1 e & a"', () => {
    expect(countLabels(4, 1)).toEqual(['1', '2', '3', '4']);
    expect(countLabels(4, 2).join(' ')).toBe('1 & 2 & 3 & 4 &');
    expect(countLabels(3, 2).join(' ')).toBe('1 & 2 & 3 &');
    expect(countLabels(2, 4).join(' ')).toBe('1 e & a 2 e & a');
    expect(countLabels(6, 1).join(' ')).toBe('1 2 3 4 5 6');
  });

  it('escolhe a contagem mais simples que acerta nas notas', () => {
    expect(autoSub([0, 960, 1920, 2880], 960)).toBe(1);
    expect(autoSub([0, 480, 1440, 2880], 960)).toBe(2);
    expect(autoSub([0, 240, 960], 960)).toBe(4);
    expect(autoSub([], 960)).toBe(1);
  });

  it('coloca cada nota na posição certa da contagem', () => {
    expect(slotOf(0, 960, 2, 8)).toBe(0);
    expect(slotOf(1440, 960, 2, 8)).toBe(3); // "&" do 2
    expect(slotOf(3840, 960, 2, 8)).toBe(7); // nunca passa do fim
  });
});

describe('barView', () => {
  const bytes = readFileSync(fileURLToPath(new URL('./fixtures/exemplo.gp5', import.meta.url)));
  const score = parseScore(alphaTab, new Uint8Array(bytes));

  it('lê as notas do compasso 6 do baixo, com corda e casa', () => {
    const v = barView(score, 5, 1);
    expect(v.strings).toEqual(['G', 'D', 'A', 'E']);
    expect(v.numerator).toBe(4);
    expect(v.duration).toBe(3840);
    // Dó (Lá 3), Sol (Sol solta), Dó (Lá 3), Mi (Ré 2) em semínimas
    expect(v.notes.map(n => [n.start, v.strings[n.line], n.fret])).toEqual([
      [0, 'A', 3], [960, 'G', 0], [1920, 'A', 3], [2880, 'D', 2],
    ]);
  });

  it('lê as seis cordas da guitarra', () => {
    expect(barView(score, 5, 0).strings).toEqual(['E', 'B', 'G', 'D', 'A', 'E']);
  });
});
