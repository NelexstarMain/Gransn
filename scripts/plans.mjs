// Raport planów miasteczek: typ, rzeka, wyspa, rynek, pierścień, dzielnice, kościół, sieć ulic.
// Pokazuje różnorodność układów na wielu ziarnach i wyłapuje dziwne przypadki (rynek w rzece,
// brak kościoła, obrys poza lądem). Użycie: node scripts/plans.mjs [od] [do] [--table]
import { generateCity } from '../src/city/layout.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const from = Number(args[0]) || 1, to = Number(args[1]) || from + 23;
const table = process.argv.includes('--table');
const rows = [];
const angDiff = (a, b) => { let d = Math.abs(a - b) % Math.PI; return d > Math.PI / 2 ? Math.PI - d : d; };

for (let seed = from; seed <= to; seed++) {
  const c = generateCity(seed), P = c.plan, T = c.terrain;
  // odległość wielokąta rynku od osi rzeki (najmniejsza z wierzchołków i środków boków)
  const R = P.rynek.poly;
  let rd = 1e9;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length];
    for (const t of [0, 0.5]) rd = Math.min(rd, T.river(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t).d);
  }
  // jaka część obrysu jądra leży na lądzie (z dala od brzegu)
  const onLand = P.outline.pts.filter((p) => T.inland(p[0], p[1]) > 35).length / P.outline.pts.length;
  // ortogonalność: długość ulic w jądrze równoległych do osi planu (±12°) / długość wszystkich
  let lenAll = 0, lenOrtho = 0, lenCore = 0;
  for (const s of c.streets) {
    const l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    if (P.outline.dn(m[0], m[1]) > 1.05) continue;
    lenCore += l;
    const ang = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
    if (angDiff(ang, P.th) < 0.21 || angDiff(ang, P.th + Math.PI / 2) < 0.21) lenOrtho += l;
    lenAll += l;
  }
  const kinds = {};
  for (const b of c.blocks) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
  const km = c.streets.reduce((s, st) => s + Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]), 0) / 1000;
  const bids = new Set();
  for (let v = 0; v < c.grid.N; v++) if (c.grid.BID[v] >= 0 && c.grid.TY[v] === 1) bids.add(c.grid.BID[v]);
  const church = c.extras.find((e) => e.kind === 'church');
  rows.push({
    seed, type: P.type, river: T.riverMode, isl: T.isl.kind, rynek: `${(P.rynek.a * 2).toFixed(0)}×${(P.rynek.b * 2).toFixed(0)}${P.rynek.shape === 'poly' ? 'p' : ''}`,
    rynekRiver: Math.round(rd), ring: P.ring ? 'T' : '-', gates: P.feats.gates, rib: P.feats.ribbons, exp: P.feats.expansions, vil: P.feats.villas,
    church: church ? 'T' : '-', ortho: lenCore ? Math.round((100 * lenOrtho) / lenCore) : 0, onLand: Math.round(onLand * 100), km: Math.round(km * 10) / 10, streets: c.streets.length,
    bld: bids.size, kinds: Object.entries(kinds).map(([k, v]) => `${k[0]}${v}`).join(' '),
  });
}
if (table) console.table(rows);
else for (const r of rows) console.log(JSON.stringify(r));
const cnt = (key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
console.log('typy', cnt('type'), 'rzeka', cnt('river'), 'wyspa', cnt('isl'));
const bad = rows.filter((r) => r.rynekRiver < 28 || r.church === '-' || r.onLand < 55);
console.log('podejrzane:', bad.map((r) => `${r.seed}(${r.rynekRiver < 28 ? 'rynek-przy-rzece ' : ''}${r.church === '-' ? 'bez-kościoła ' : ''}${r.onLand < 55 ? 'obrys-w-morzu' : ''})`).join(' ') || 'brak');
