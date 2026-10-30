import { generateCity } from '../src/city/layout.js';
import { quadGeom, filled } from '../src/city/grid.js';
import { PROPS } from '../src/city/props.js';
import { onBridge } from '../src/city/bridges.js';
import { polyDist } from '../src/city/routes.js';
const c = generateCity(Number(process.argv[2]) || 1984), g = c.grid, R = c.roads;
const all = [
  ...c.lamps.map((p) => ({ ...p, r: 0.35, k: 'lamp' })), ...c.benches.map((p) => ({ ...p, r: 1.0, k: 'bench' })),
  ...c.trees.map((p) => ({ ...p, r: 0.55, k: 'tree' })), ...c.props.map((p) => ({ ...p, r: p.kind === 'column' ? 0.4 : PROPS[p.kind].r, k: p.kind })),
];
let onRoad = 0, overlap = 0, onBridgeN = 0, onRouteN = 0, inRiver = 0;
const T = c.terrain;
for (const p of all) { if (c.bridges.some((b) => onBridge(b, p.p[0], p.p[1], 0.5))) onBridgeN++; if (polyDist(c.routes.rail, p.p[0], p.p[1]) < p.r + 2 || polyDist(c.routes.highway, p.p[0], p.p[1]) < p.r + 5) onRouteN++; if (T.river(p.p[0], p.p[1]).d < T.hw + 1) inRiver++; }
const bad = {}; for (const p of all) if (p.k !== 'column' && R.clearance(p.p[0], p.p[1]) < (p.k === 'tree' ? 0 : p.r)) { onRoad++; bad[p.k] = (bad[p.k] || 0) + 1; }
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  const a = all[i], b = all[j];
  if (Math.abs(a.p[0] - b.p[0]) > 5 || Math.abs(a.p[1] - b.p[1]) > 5) continue;
  if (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < a.r + b.r) { overlap++; if (overlap < 4) console.log('nakłada się:', a.k, b.k, a.p.map((v) => v.toFixed(1)), Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]).toFixed(2), a.r + b.r); }
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
// ogrodzenia ogrodów: nie na jezdni, w rzece, na moście ani trasie, nie przecinają rekwizytów
const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
};
let fenceOnRoad = 0, fenceInRiver = 0, fenceOnBridge = 0, fenceHitsProp = 0;
const hitKinds = {};
for (const f of c.fences) {
  let road = false, river = false, bridge = false;
  for (let k = 0; k <= 4; k++) {
    const x = f.a[0] + (f.b[0] - f.a[0]) * k / 4, z = f.a[1] + (f.b[1] - f.a[1]) * k / 4;
    if (R.clearance(x, z) < 0) road = true;
    if (T.river(x, z).d < T.hw + 0.5) river = true;
    if (c.bridges.some((b) => onBridge(b, x, z, 0.5))) bridge = true;
  }
  if (road) fenceOnRoad++; if (river) fenceInRiver++; if (bridge) fenceOnBridge++;
  for (const p of all) {
    if (p.k === 'tree') continue;
    if (segDist(p.p[0], p.p[1], f.a, f.b) < Math.min(p.r, 1) * 0.6) { fenceHitsProp++; hitKinds[p.k] = (hitKinds[p.k] || 0) + 1; break; }
  }
}
let postOnRoad = 0, postInRiver = 0;
for (const po of c.posts) { if (R.clearance(po.p[0], po.p[1]) < 0) postOnRoad++; if (T.river(po.p[0], po.p[1]).d < T.hw + 0.5) postInRiver++; }
console.log({ fences: c.fences.length, posts: c.posts.length, fenceOnRoad, fenceInRiver, fenceOnBridge, fenceHitsProp, hitKinds, postOnRoad, postInRiver });
const shapes = {};
const seen = new Set();
for (let v = 0; v < g.N; v++) if (g.TY[v] === 1 && g.BID[v] >= 0 && !seen.has(g.BID[v])) { seen.add(g.BID[v]); const s = g.design.get(g.BID[v]).shape; shapes[s] = (shapes[s] || 0) + 1; }
const mats = {}; for (const s of c.streets) mats[s.mat] = (mats[s.mat] || 0) + 1;
console.log(bad); console.log({ props: all.length, onRoad, overlap, onBridgeN, onRouteN, inRiver, wallOnRoad, bldQuarters: quarters, buildings: seen.size, shapes, roads: c.streets.length, mats, minRw: Math.min(...c.streets.map((s) => s.rw)) });
