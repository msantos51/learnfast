import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { analyzeBar, label } from '../src/analysis/analyze';
import { parseScore } from '../src/analysis/parse';

// O mesmo exemplo guardado em Guitar Pro 3, 4 e 5 (gerado com PyGuitarPro).
describe.each(['exemplo.gp3', 'exemplo.gp4', 'exemplo.gp5'])('%s', file => {
  const bytes = readFileSync(fileURLToPath(new URL('./fixtures/' + file, import.meta.url)));
  const score = parseScore(alphaTab, new Uint8Array(bytes));

  it('abre com as pistas, os compassos e os acentos certos', () => {
    expect(score.masterBars).toHaveLength(52);
    expect(score.tracks.map(t => t.name)).toEqual(['Guitarra', 'Baixo']);
    expect(score.artist).toBe('Esquema de demonstração');
  });

  it('deteta o mesmo tom nos primeiros compassos', () => {
    const tons = [0, 1, 2, 3, 4, 5, 6, 7].map(i => label(analyzeBar(score, i, [1])[0]));
    expect(tons).toEqual(['A', 'B', 'A', 'B', 'B', 'C', 'B', 'G']);
  });
});
