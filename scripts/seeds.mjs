// Sprawdza wiele ziaren naraz: czy miasto w ogóle się generuje i czy trzymają się reguły świata.
//   node scripts/seeds.mjs [od] [do] [--build]   (--build: dodatkowo buduje geometrię kilku fragmentów)
import { generateCity } from '../src/city/layout.js';
import { quadGeom, filled } from '../src/city/grid.js';
import { buildChunk, buildChunkLOD } from '../src/gen/assemble.js';

const a = process.argv.slice(2).filter((x) => !x.startsWith('--')).map(Number);
const from = a[0] ?? 1, to = a[1] ?? from + 19, BUILD = process.argv.includes('--build');
let bad = 0;
for (let seed = from; seed <= to; seed++) {
  const row = { seed };
  try {
    const t0 = performance.now();
    const c = generateCity(seed), g = c.grid, R = c.roads, T = c.terrain;
    row.ms = Math.round(performance.now() - t0);
    row.bridges = c.bridges.length;
    row.streets = c.streets.length;
    row.chunks = c.chunks.length;
    let bld = 0, min = new Set();
    for (let v = 0; v < g.N; v++) if (g.TY[v] === 1 && g.BID[v] >= 0 && !min.has(g.BID[v])) { min.add(g.BID[v]); bld++; }
    row.bld = bld;
    row.townhall = c.extras.some((e) => e.kind === 'townhall');
    row.plan = c.plan.type; // rynek bez ratusza (fontanna pośrodku) to jeden z wariantów planu
    row.church = c.extras.some((e) => e.kind === 'church');
    row.hall = c.plan.hall.none ? 'brak' : c.plan.hall.u || c.plan.hall.v ? 'bok' : 'środek';
    row.props = c.props.length + c.lamps.length + c.trees.length;
    let onRoad = 0;
    for (const p of [...c.lamps, ...c.benches, ...c.props.filter((q) => q.kind !== 'column')]) if (R.clearance(p.p[0], p.p[1]) < 0) onRoad++;
    let wallOnRoad = 0;
    for (let q = 0; q < g.quads.length / 4; q++) {
      const G = quadGeom(g, q);
      for (let i = 0; i < 4; i++) {
        if (!filled(g, G.v[i], 0)) continue;
        for (const p of [G.m[i], G.c, G.m[(i + 3) % 4]]) if (R.clearance(p[0], p[1]) < 0) { wallOnRoad++; break; }
      }
    }
    let under = 0;
    for (let v = 0; v < g.N; v++) if (g.TY[v] !== 7 && g.TY[v] !== 8 && T.height(g.X[v], g.Z[v]) < T.seaY + 0.3) under++;
    row.onRoad = onRoad; row.wallOnRoad = wallOnRoad; row.under = under;
    const sp = c.spawn;
    row.spawnClear = +R.clearance(sp.x, sp.z).toFixed(1);
    if (BUILD) {
      let nan = 0, tris = 0;
      const ids = c.chunks.map((h) => [h.id, h.quads.length]).sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]); // najgęstsze fragmenty
      for (const id of ids) for (const o of [buildChunk(c, id), buildChunkLOD(c, id)]) for (const m of Object.values(o.mats)) { tris += m.i.length / 3; for (const v of m.p) if (!Number.isFinite(v)) { nan++; break; } }
      row.nan = nan; row.kTri = Math.round(tris / 1000);
    }
    if (onRoad || wallOnRoad || under || !row.bridges || (!row.townhall && !c.plan.hall.none) || !row.church || row.spawnClear > 1 || row.nan) bad++;
  } catch (e) {
    row.error = String(e.stack).split('\n').slice(0, 3).join(' | ');
    bad++;
  }
  console.log(JSON.stringify(row));
}
console.log(bad ? `PROBLEMY: ${bad} z ${to - from + 1}` : `OK: ${to - from + 1} ziaren bez problemów`);
process.exitCode = bad ? 1 : 0;
