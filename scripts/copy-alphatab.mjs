// Copia o alphaTab (script, fonte de música e banco de sons) para public/vendor/alphatab.
// O alphaTab é servido como script clássico porque os workers do leitor reabrem o mesmo ficheiro.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// O pacote não exporta package.json; parte do ficheiro principal (dist/alphaTab.js).
const dist = dirname(require.resolve('@coderline/alphatab'));
const out = join(process.cwd(), 'public/vendor/alphatab');

const files = [
  'alphaTab.min.js',
  'font/Bravura.woff2',
  'font/Bravura.woff',
  'font/Bravura-OFL.txt',
  'soundfont/sonivox.sf3',
  'soundfont/LICENSE',
];
for (const f of files) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(join(dist, f), join(out, f));
}
console.log(`alphaTab copiado para ${out}`);
