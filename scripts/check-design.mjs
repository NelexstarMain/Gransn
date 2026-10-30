// Sprawdza projekt budynków i fasad w Node (bez przeglądarki):
//  - determinizm: dwa przebiegi generateCity dają ten sam projekt,
//  - najlepsza z N kontra pierwsza próba: oceny, kolory sąsiadów, samotne "ołówki",
//  - fragmenty fasad mieszczą się w panelu i nie nakładają się na siebie,
//  - różnorodność: ile różnych kombinacji stylu, opasek, balkonów, wykuszy.
// Użycie: node scripts/check-design.mjs [seed]
import { generateCity } from '../src/city/layout.js';
import { buildingInfo, T_BLD } from '../src/city/grid.js';
import { facadesOf } from '../src/city/facades.js';
import { programOf, panelPlan } from '../src/gen/facade.js';

const seed = Number(process.argv[2]) || 1984;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

function lots(c) {
  const g = c.grid, m = new Map();
  for (let v = 0; v < g.N; v++) {
    if (g.TY[v] !== T_BLD || g.BID[v] < 0) continue;
    const e = m.get(g.BID[v]) || { bid: g.BID[v], zone: g.ZN[v], n: 0, x: 0, z: 0, hmax: 0, vs: [] };
    e.n++; e.x += g.X[v]; e.z += g.Z[v]; e.hmax = Math.max(e.hmax, g.H[v]); e.vs.push(v);
    m.set(e.bid, e);
  }
  for (const e of m.values()) { e.x /= e.n; e.z /= e.n; }
  return [...m.values()].sort((a, b) => a.bid - b.bid);
}

function signature(c) {
  const g = c.grid, parts = [];
  for (const e of lots(c)) {
    const i = g.design.get(e.bid), p = programOf(c, e.bid, i);
    parts.push([e.bid, i.style, i.shape, i.levels, i.tint.map((x) => x.toFixed(3)), p.w.toFixed(3), p.fr.n, p.fr.m, p.arch.n, [...p.ent], [...p.shops], [...p.cols], p.bay && p.bay.key, p.portal, p.quoin].join('|'));
  }
  return parts.join('\n');
}

const c = generateCity(seed), g = c.grid, F = facadesOf(c), L = lots(c);
let fail = 0;

// 1. determinizm
const sigA = signature(c), sigB = signature(generateCity(seed));
const same = sigA === sigB;
if (!same) fail++;
console.log('determinizm (2 przebiegi):', same ? 'OK' : 'RÓŻNICA');

// 2. najlepsza z N kontra pierwsza próba
const st = g.designStats;
console.log(`bryła i styl: ${st.lots} działek, średni zysk oceny najlepszej z ${5}+${4} prób nad pierwszą: bryła +${(st.massGain / st.lots).toFixed(2)}, styl +${(st.styleGain / st.lots).toFixed(2)}`);
const progs = L.map((e) => programOf(c, e.bid, g.design.get(e.bid)));
console.log(`program fasady: średni zysk najlepszej z 6 prób nad pierwszą: +${mean(progs.map((p) => p.gain)).toFixed(2)}`);

// sąsiedzi: kolor i styl (projekt kontra pierwsza próba z gramatyki)
const adj = Array.from({ length: g.N }, () => []);
for (let q = 0; q < g.quads.length / 4; q++) for (let i = 0; i < 4; i++) { const a = g.quads[q * 4 + i], b = g.quads[q * 4 + ((i + 1) % 4)]; adj[a].push(b); adj[b].push(a); }
const legacy = new Map(L.map((e) => [e.bid, buildingInfo(seed, e.bid, e.zone, 0)]));
const pairs = [];
for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z) < 14) pairs.push([L[i].bid, L[j].bid]);
const clash = (map) => pairs.filter(([a, b]) => hueDist(map.get(a).hue, map.get(b).hue) < 15).length / pairs.length;
const sameStyle = (map) => pairs.filter(([a, b]) => map.get(a).style === map.get(b).style).length / pairs.length;
const chosen = g.design;
const pencil = (map) => L.filter((e) => {
  const touch = e.vs.some((v) => adj[v].some((u) => g.TY[u] === T_BLD && g.BID[u] !== e.bid));
  return !touch && e.n <= 2 && map === chosen ? e.hmax > 3 : false;
}).length;
console.log(`sąsiednie budynki (${pairs.length} par): zbliżony kolor <15°: ${(clash(legacy) * 100).toFixed(1)}% → ${(clash(chosen) * 100).toFixed(1)}%, ten sam styl: ${(sameStyle(legacy) * 100).toFixed(0)}% → ${(sameStyle(chosen) * 100).toFixed(0)}%`);
console.log('samotne słupki 1–2 punkty wyższe niż 3 piętra:', pencil(chosen));

// 3. fragmenty fasad mieszczą się w panelu i nie nakładają się
let panels = 0, bad = 0, noWin = 0;
const examples = [];
const holeOf = (f) => (f.k === 'win' || f.k === 'balc' || f.k === 'jul' ? [f.x - f.w / 2, f.x + f.w / 2] : f.k === 'door' ? [f.x - f.w / 2 - 0.38, f.x + f.w / 2 + 0.38] : null);
for (const s of F.segs) {
  const info = g.design.get(s.bid);
  if (!info || info.zone === 2 || info.style === 'modern') continue;
  const top = g.H[s.a], H = s.L === 0 ? 3.8 : 3.2, W = s.w;
  if (W < 1.25) continue;
  const plan = panelPlan(c, info, programOf(c, s.bid, info), s, s.L, top, W, H, s.court, 0.5);
  panels++;
  if (plan.mod !== 'panel') { if (plan.mod === 'wall') noWin++; continue; }
  const holes = [];
  for (const f of plan.spec) {
    let err = null;
    const h = holeOf(f);
    if (f.k === 'win' && (f.x - f.w / 2 < 0.2 - 1e-6 || f.x + f.w / 2 > W - 0.2 + 1e-6 || f.y < 0.5 || f.y + f.h > H - 0.3 + 1e-6)) err = 'okno poza panelem';
    if (f.k === 'door' && (h[0] < -1e-6 || h[1] > W + 1e-6)) err = 'drzwi poza panelem';
    if ((f.k === 'balc' || f.k === 'jul') && (h[0] < 0.2 - 1e-6 || h[1] > W - 0.2 + 1e-6)) err = 'balkon poza panelem';
    if (f.k === 'bay' && (f.x - f.w / 2 < 0.3 - 1e-6 || f.x + f.w / 2 > W - 0.3 + 1e-6)) err = 'wykusz poza panelem';
    if (h) holes.push(h);
    if (err) { bad++; if (examples.length < 5) examples.push(`${err}: W=${W.toFixed(2)} L=${s.L} ${JSON.stringify(f)}`); }
  }
  holes.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < holes.length; i++) if (holes[i][0] < holes[i - 1][1] - 1e-6) { bad++; if (examples.length < 5) examples.push('nakładające się otwory'); }
}
if (bad) fail++;
console.log(`panele: ${panels}, błędne fragmenty: ${bad}, panele bez okna (goła ściana): ${noWin}`);
for (const e of examples) console.log('  ', e);

// 4. różnorodność
const combo = L.map((e, i) => { const x = g.design.get(e.bid), p = progs[i]; return [x.style, x.shape, p.fr.n, p.fr.m, p.arch.n, p.balc, !!p.bay, p.portal, p.quoin].join('/'); });
const kinds = {};
for (const k of combo) kinds[k] = (kinds[k] || 0) + 1;
const counts = Object.values(kinds);
const H = -counts.reduce((a, n) => a + (n / combo.length) * Math.log2(n / combo.length), 0);
console.log(`różnorodność: ${counts.length} różnych kombinacji na ${combo.length} budynków, entropia ${H.toFixed(2)} bitu`);
const feat = { balkon: progs.filter((p) => p.cols.size).length, wykusz: progs.filter((p) => p.bay).length, portal: progs.filter((p) => p.portal).length, lizena: progs.filter((p) => p.lizena).length, narożniki: progs.filter((p) => p.quoin).length, łuki: progs.filter((p) => p.arch.n || p.arch.m).length, sklepy: progs.filter((p) => p.shops.size).length, lukarny: L.filter((e) => g.design.get(e.bid).dormers).length };
console.log('budynki z elementem:', feat);
console.log(fail ? `BŁĘDY: ${fail}` : 'wszystko w porządku');
process.exit(fail ? 1 : 0);
