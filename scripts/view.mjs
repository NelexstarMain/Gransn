// Podgląd budynków bez przeglądarki (programowy rasteryzator, tylko Node).
//   node scripts/view.mjs --bid N --yaw 40 --dist 20 --ty 6 --pitch -5 --out a.png
//   node scripts/view.mjs --x 10 --z 20 --yaw 90 --dist 70 --h 25 --pitch -22 --R 90
//   node scripts/view.mjs --list [--zone 1 --top 25]     lista największych budynków
// Opcje: --seed, --bid (cel = środek budynku), --x/--z, --yaw (0 = +x, 90 = +z), --dist, --ty (wysokość celu),
//        --h (przesunięcie kamery w górę), --pitch, --fov, --R (zasięg fragmentów), --w/--hh (rozdzielczość),
//        --sheet (4 widoki co 90°), --noground, --out (domyślnie plik tymczasowy)
import os from 'node:os';
import path from 'node:path';
import { generateCity } from '../src/city/layout.js';
import { buildChunk, buildGroundTile, GROUND_TILES } from '../src/gen/assemble.js';
import { renderMeshes, writePNG } from './raster.mjs';

const OUT_DEFAULT = path.join(os.tmpdir(), 'gransn-view.png');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']); return acc; }, []));
const num = (k, d) => (args[k] !== undefined ? Number(args[k]) : d);
const seed = num('seed', 1984);
const city = generateCity(seed), g = city.grid;

// opis budynków
const B = new Map();
for (let v = 0; v < g.N; v++) {
  if (g.TY[v] !== 1 || g.BID[v] < 0) continue;
  let e = B.get(g.BID[v]);
  if (!e) { e = { bid: g.BID[v], zone: g.ZN[v], n: 0, x: 0, z: 0, hmax: 0, cl: 1e9 }; B.set(e.bid, e); }
  e.n++; e.x += g.X[v]; e.z += g.Z[v]; e.hmax = Math.max(e.hmax, g.H[v]); e.cl = Math.min(e.cl, g.CL[v]);
}
for (const e of B.values()) { e.x /= e.n; e.z /= e.n; }
if (args.list) {
  const arr = [...B.values()].filter((e) => e.zone === (num('zone', 1))).sort((a, b) => b.n - a.n).slice(0, num('top', 25));
  for (const e of arr) console.log(e.bid, 'zone', e.zone, 'pts', e.n, 'hmax', e.hmax, 'x', e.x.toFixed(0), 'z', e.z.toFixed(0), 'clmin', e.cl.toFixed(1));
  process.exit(0);
}
let tx = num('x', 0), tz = num('z', 0);
if (args.bid) { const e = B.get(Number(args.bid)); tx = e.x; tz = e.z; }
const T = city.terrain;
const ty = T.height(tx, tz) + num('ty', 5);
const yaw = (num('yaw', 0) * Math.PI) / 180, pitch = (num('pitch', -8) * Math.PI) / 180, dist = num('dist', 28);
// kamera patrzy w kierunku yaw (0 = +x, 90 = +z), stoi "za" celem
const dir = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)];
const eye = [tx - dir[0] * dist, ty - dir[1] * dist + num('h', 0), tz - dir[2] * dist];
const target = [tx, ty, tz];

// fragmenty w okolicy
const R = num('R', dist + 45);
const meshes = [];
let ids = 0;
for (const ch of city.chunks) {
  if (Math.hypot(ch.center[0] - tx, ch.center[1] - tz) > R + ch.radius) continue;
  const o = buildChunk(city, ch.id); ids++;
  for (const [mat, m] of Object.entries(o.mats)) meshes.push({ mat, p: m.p, n: m.n, c: m.c, i: m.i });
}
if (!args.noground) {
  const size = (2 * city.half) / GROUND_TILES;
  for (let x = 0; x < GROUND_TILES; x++) for (let z = 0; z < GROUND_TILES; z++) {
    const cx = -city.half + (x + 0.5) * size, cz = -city.half + (z + 0.5) * size;
    if (Math.hypot(cx - tx, cz - tz) > R + size) continue;
    const o = buildGroundTile(city, x, z);
    for (const [mat, m] of Object.entries(o.mats)) meshes.push({ mat, p: m.p, n: m.n, c: m.c, i: m.i });
  }
}
const t0 = performance.now();
const camFor = (yawDeg) => {
  const y = (yawDeg * Math.PI) / 180;
  const d = [Math.cos(y) * Math.cos(pitch), Math.sin(pitch), Math.sin(y) * Math.cos(pitch)];
  return [tx - d[0] * dist, ty - d[1] * dist + num('h', 0), tz - d[2] * dist];
};
if (args.sheet) {
  const w = num('w', 1200) >> 1, hq = num('hh', 800) >> 1;
  const W2 = w * 2, H2 = hq * 2, out = Buffer.alloc(W2 * H2 * 4);
  [0, 90, 180, 270].forEach((dy, k) => {
    const im = renderMeshes(meshes, { W: w, H: hq, eye: camFor(num('yaw', 0) + dy), target, fov: num('fov', 55) });
    const ox = (k % 2) * w, oy = Math.floor(k / 2) * hq;
    for (let y = 0; y < hq; y++) im.rgba.copy(out, ((oy + y) * W2 + ox) * 4, y * w * 4, (y + 1) * w * 4);
  });
  writePNG(args.out || OUT_DEFAULT, { W: W2, H: H2, rgba: out });
  console.log('sheet ms', Math.round(performance.now() - t0), '->', args.out || OUT_DEFAULT);
} else {
  const img = renderMeshes(meshes, { W: num('w', 1200), H: num('hh', 800), eye, target, fov: num('fov', 55), ortho: num('ortho', 0) });
  writePNG(args.out || OUT_DEFAULT, img);
  console.log('chunks', ids, 'tris', img.tris, 'ms', Math.round(performance.now() - t0), '->', args.out || OUT_DEFAULT);
}
