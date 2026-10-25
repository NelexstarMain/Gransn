import { generateCity } from '../src/city/layout.js';
import { quadGeom, filled, buildingInfo } from '../src/city/grid.js';
const c = generateCity(Number(process.argv[2]) || 1984), g = c.grid, R = c.roads;
const all = [
  ...c.lamps.map((p) => ({ ...p, r: 0.35, k: 'lamp' })), ...c.benches.map((p) => ({ ...p, r: 1.0, k: 'bench' })),
  ...c.trees.map((p) => ({ ...p, r: 1.0, k: 'tree' })), ...c.props.map((p) => ({ ...p, r: { bin: 0.4, booth: 0.7, kiosk: 1.6, busstop: 1.7, bush: 1.1, car: 1.9, column: 0.4 }[p.kind], k: p.kind })),
];
let onRoad = 0, overlap = 0;
const bad = {}; for (const p of all) if (p.k !== 'column' && R.clearance(p.p[0], p.p[1]) < (p.k === 'tree' ? 0 : p.r)) { onRoad++; bad[p.k] = (bad[p.k] || 0) + 1; }
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  const a = all[i], b = all[j];
  if (Math.abs(a.p[0] - b.p[0]) > 5 || Math.abs(a.p[1] - b.p[1]) > 5) continue;
  if (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < a.r + b.r) overlap++;
}
let wallOnRoad = 0, quarters = 0;
for (let q = 0; q < g.quads.length / 4; q++) {
  const G = quadGeom(g, q);
  for (let i = 0; i < 4; i++) {
    if (!filled(g, G.v[i], 0)) continue;
    quarters++;
    for (const p of [G.m[i], G.c, G.m[(i + 3) % 4]]) if (R.clearance(p[0], p[1]) < 0) { wallOnRoad++; break; }
  }
}
const shapes = {};
const seen = new Set();
for (let v = 0; v < g.N; v++) if (g.TY[v] === 1 && g.BID[v] >= 0 && !seen.has(g.BID[v])) { seen.add(g.BID[v]); const s = buildingInfo(c.seed, g.BID[v], g.ZN[v]).shape; shapes[s] = (shapes[s] || 0) + 1; }
const mats = {}; for (const s of c.streets) mats[s.mat] = (mats[s.mat] || 0) + 1;
console.log(bad); console.log({ props: all.length, onRoad, overlap, wallOnRoad, bldQuarters: quarters, buildings: seen.size, shapes, roads: c.streets.length, mats, minRw: Math.min(...c.streets.map((s) => s.rw)) });
