// Buduje CAŁY świat w Node (bez przeglądarki): wszystkie fragmenty, LOD, rzekę,
// teren. Wyłapuje wyjątki i NaN w geometrii.  Użycie: node scripts/build-all.mjs [seed]
import { generateCity } from '../src/city/layout.js';
import { buildChunk, buildChunkLOD, buildRiver, buildGroundTile, GROUND_TILES } from '../src/gen/assemble.js';

const seed = Number(process.argv[2]) || 1984;
let t = performance.now();
const c = generateCity(seed);
console.log('layout ms', Math.round(performance.now() - t), 'chunks', c.chunks.length, 'roads', c.streets.length);
t = performance.now();
let tris = 0, nan = 0, err = 0;
const scan = (o) => { for (const m of Object.values(o.mats)) { tris += m.i.length / 3; for (const v of m.p) if (!Number.isFinite(v)) { nan++; break; } } };
for (const ch of c.chunks) {
  try { scan(buildChunk(c, ch.id)); scan(buildChunkLOD(c, ch.id)); } catch (e) { err++; if (err < 4) console.log(e.stack.split('\n').slice(0, 3).join(' | ')); }
}
scan(buildRiver(c));
for (let x = 0; x < GROUND_TILES; x++) for (let z = 0; z < GROUND_TILES; z++) scan(buildGroundTile(c, x, z));
console.log('s', ((performance.now() - t) / 1000).toFixed(1), 'tris', (tris / 1e6).toFixed(2) + 'M', 'nan', nan, 'errors', err);
const g = c.grid, T = c.terrain;
let under = 0;
for (let v = 0; v < g.N; v++) if (g.TY[v] !== 7 && g.TY[v] !== 8 && T.height(g.X[v], g.Z[v]) < T.seaY + 0.3) under++;
console.log('land below sea:', under);
