// Skrót (FNV-1a) całej wygenerowanej geometrii: fragmenty, LOD, rzeka, teren.
// Po optymalizacji generatora skrót musi być IDENTYCZNY — to dowód, że wygląd świata
// się nie zmienił.  Użycie: node scripts/hash-world.mjs [seed] [liczba_fragmentów]
import { generateCity } from '../src/city/layout.js';
import { buildChunk, buildChunkLOD, buildRiver, buildGroundTile, GROUND_TILES } from '../src/gen/assemble.js';

const seed = Number(process.argv[2]) || 1984;
const only = Number(process.argv[3]) || Infinity;
let h = 0x811c9dc5, bytes = 0;
const feed = (arr) => {
  const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  bytes += u.length;
};
const scan = (o) => {
  for (const name of Object.keys(o.mats).sort()) {
    const m = o.mats[name];
    feed(Uint8Array.from(name, (c) => c.charCodeAt(0)));
    feed(m.p); feed(m.n); feed(m.uv); feed(m.c); feed(m.i);
  }
};
const t = performance.now();
const c = generateCity(seed);
const n = Math.min(only, c.chunks.length);
for (let i = 0; i < n; i++) { scan(buildChunk(c, i)); scan(buildChunkLOD(c, i)); }
if (n === c.chunks.length) {
  scan(buildRiver(c));
  for (let x = 0; x < GROUND_TILES; x++) for (let z = 0; z < GROUND_TILES; z++) scan(buildGroundTile(c, x, z));
}
const g = c.grid, T = c.terrain;
const probe = new Float64Array(2000);
for (let i = 0; i < probe.length; i++) probe[i] = T.height(((i * 7919) % 1100) - 550, ((i * 104729) % 1100) - 550);
feed(probe);
console.log('hash', h.toString(16), 'bytes', bytes, 'ms', Math.round(performance.now() - t));
