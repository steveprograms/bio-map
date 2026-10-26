// Copies MapLibre's worker files into public/ so Next.js serves them.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/maplibre-gl/dist';
const dest = 'public/maplibre';
mkdirSync(dest, { recursive: true });

for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  if (existsSync(`${src}/${file}`)) {
    copyFileSync(`${src}/${file}`, `${dest}/${file}`);
    console.log(`Copied ${file} to ${dest}/`);
  }
}