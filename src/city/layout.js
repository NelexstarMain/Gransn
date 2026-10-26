// Układ miasta — czyste dane (bez geometrii), deterministyczne z seeda.
//
//  1. Teren + rzeka (terrain.js), plac z ratuszem w środku.
//  2. Mosty (plan.js): aleje z rynku trafiają w rzekę, most jest prostopadły do niej.
//  3. Siatka ulic (plan.js): aleje promieniste, pierścienie, ulice poprzeczne;
//     autostrada i kolej to łuki pierścieni. Ściany grafu ulic = kwartały.
//  4. Kwartały dostają rodzaj (plac / park / kamienice / domki / dzika przyroda).
//     Same budynki powstają na nieregularnej siatce czworokątów (grid.js).
import { Rng, hash } from '../core/rng.js';
import { makeQuadGrid, classifyGrid, decorate, makeChunks } from './grid.js';
import { planCity, chooseBridges } from './plan.js';
import { RoadNet } from './roadnet.js';
import { Terrain } from './terrain.js';

export const HALF = 520; // wyspa ~0,45 km² lądu (było 460)

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const hyp = Math.hypot;

export function polyCentroid(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length];
    const c = x0 * z1 - x1 * z0;
    a += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c;
  }
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

// Odsunięcie wielokąta do środka o różne odległości na każdej krawędzi.
export function offsetPoly(q, d) {
  const n = q.length, c = polyCentroid(q);
  const lines = [];
  for (let k = 0; k < n; k++) {
    const a = q[k], b = q[(k + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    let nx = -dz / l, nz = dx / l;
    if ((c[0] - (a[0] + b[0]) / 2) * nx + (c[1] - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
    lines.push({ p: [a[0] + nx * d[k], a[1] + nz * d[k]], d: [dx / l, dz / l], n: [nx, nz] });
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const L1 = lines[(k + n - 1) % n], L2 = lines[k];
    const den = L1.d[0] * L2.d[1] - L1.d[1] * L2.d[0];
    if (Math.abs(den) < 1e-6) { out.push(L2.p); continue; }
    const t = ((L2.p[0] - L1.p[0]) * L2.d[1] - (L2.p[1] - L1.p[1]) * L2.d[0]) / den;
    out.push([L1.p[0] + L1.d[0] * t, L1.p[1] + L1.d[1] * t]);
  }
  out.normals = lines.map((l) => l.n);
  return out;
}

// krawędzie nie mogą się "przewrócić" (krótkie krawędzie przy T-skrzyżowaniach pomijamy)
function offsetValid(orig, off, minLen = 3) {
  const n = orig.length;
  for (let k = 0; k < n; k++) {
    const a = orig[k], b = orig[(k + 1) % n], c = off[k], d = off[(k + 1) % n];
    if (dist(a, b) < Math.max(minLen, 6)) continue; // krótkie krawędzie (przy T-skrzyżowaniach) mogą się lokalnie odwrócić
    const dot = (b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]);
    if (dot <= 0) return false;
  }
  return polyArea(off) > 50;
}

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function inradius(poly, c) {
  let r = 1e9;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    r = Math.min(r, Math.abs((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / l);
  }
  return r;
}

// ── ulice ───────────────────────────────────────────────────────────────────
const SPEC = {
  bank: { road: 0.35, walk: 4.5, bank: true },
  border: { road: 0.35, walk: 3, border: true },
  bridge: { road: 4.2, walk: 3.3 },
  lane: { road: 3.0, walk: 1.8 },
  street: { road: 3.4, walk: 2.6 },
  avenue: { road: 4.2, walk: 3.4 },
  highway: { road: 5.5, walk: 3.5 },
};

// ─────────────────────────────────────────────────────────────────────────────
export function generateCity(seed = 1984) {
  const rng = new Rng(seed);
  const terrain = new Terrain(seed, HALF);
  const center = [0, 0];
  terrain.plaza = { x: center[0], z: center[1], r: 70, y: terrain.hills(center[0], center[1]) };
  const bridges = chooseBridges(terrain, rng);

  // zaplanowana siatka ulic (plan.js): aleje, pierścienie, ulice poprzeczne, kwartały
  const plan = planCity(terrain, seed, bridges);
  const g = plan.g;
  const seeds = [];
  const blocks = [];
  const cells = g.cells.slice().sort((p, q) => (p.seed.x * p.seed.x + p.seed.z * p.seed.z) - (q.seed.x * q.seed.x + q.seed.z * q.seed.z));
  // największe kwartały z dala od rynku zostają parkami (kilka prawdziwych skwerów)
  const parkIds = new Set(cells.filter((c) => hyp(c.seed.x, c.seed.z) > 110 && terrain.inland(c.seed.x, c.seed.z) > 70).sort((p, q) => q.area - p.area).slice(0, 4).map((c) => c.ids.join()));
  for (const cell of cells) {
    const poly = cell.ids.map((id) => [g.V[id].x, g.V[id].z]);
    const n = poly.length;
    const sp = cell.ids.map((id, k) => SPEC[plan.edgeCls(id, cell.ids[(k + 1) % n])] || SPEC.street);
    const curb = offsetPoly(poly, sp.map((s) => s.road));
    const bline = offsetPoly(poly, sp.map((s) => s.road + s.walk));
    const ok = offsetValid(poly, curb, 2) && offsetValid(curb, bline, 2);
    const c = polyCentroid(poly);
    const blk = { id: blocks.length, poly, specs: sp, curb: ok ? curb : poly, bline: ok ? bline : poly, center: c, bc: polyCentroid(ok ? bline : poly) };
    const br = new Rng(hash(seed, Math.round(c[0] * 10), Math.round(c[1] * 10)));
    const rIn = inradius(blk.bline, blk.bc);
    const dC = hyp(c[0] - center[0], c[1] - center[1]);
    const isPlaza = pointInPoly(poly, center[0], center[1]);
    if (isPlaza) blk.kind = 'plaza';
    else if (parkIds.has(cell.ids.join()) || polyArea(blk.bline) < 420 || br.chance(0.045)) blk.kind = 'park';
    else if (br.chance(Math.max(0.2, Math.min(0.95, 1.35 - dC / 330))) && rIn > 9) blk.kind = 'tenement';
    else blk.kind = 'houses';
    // dzika przyroda tylko tuż przy brzegu wyspy
    if (blk.kind !== 'plaza' && blk.kind !== 'park' && terrain.inland(c[0], c[1]) < 105 && br.chance(0.6)) blk.kind = 'nature';
    const sd = { x: c[0], z: c[1], fixed: isPlaza, plaza: isPlaza, kind: blk.kind };
    seeds.push(sd);
    if (blk.kind === 'plaza') fillPlaza(blk, terrain);
    blocks.push(blk);
  }

  // start: na środku mostu najbliżej centrum, twarzą w stronę placu
  const plaza = blocks.find((b) => b.kind === 'plaza');
  const monuments = blocks
    .filter((b) => b.kind === 'park' && polyArea(b.bline) > 1400 && terrain.inland(b.bc[0], b.bc[1]) > 40)
    .map((b, i) => ({ p: b.bc, kind: i % 2 ? 'fountain' : 'monument' }));
  const billboards = [];
  const hs0 = plaza.ministry.tiers[0], pc = [terrain.plaza.x, terrain.plaza.z];
  ['war', 'freedom', 'ignorance', 'bb4'].forEach((name, i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, d = [Math.cos(a), Math.sin(a)];
    const r0 = hs0 * 0.55 + 12;
    billboards.push({ p: [pc[0] + d[0] * r0, pc[1] + d[1] * r0], n: [-d[0], -d[1]], e: [-d[1], d[0]], name, y: 0, size: name.startsWith('bb') ? [5, 10] : [12, 3] });
  });
  const b0 = bridges.reduce((a, b) => (Math.abs(b.p[0]) < Math.abs(a.p[0]) ? b : a), bridges[0]);
  const toP = [plaza.center[0] - b0.p[0], plaza.center[1] - b0.p[1]];
  const sgn = toP[0] * b0.axis[0] + toP[1] * b0.axis[1] > 0 ? 1 : -1;
  const spawn = { x: b0.p[0] + b0.perp[0] * 2, z: b0.p[1] + b0.perp[1] * 2, yaw: Math.atan2(-b0.axis[0] * sgn, -b0.axis[1] * sgn) };

  const routes = plan.routes;
  const streets = plan.streets;
  // nawierzchnia: bruk w mieście, ubita droga w lesie
  const kindAt = (x, z) => {
    let best = null, bd = 1e18;
    for (const sd of seeds) { const d = (sd.x - x) ** 2 + (sd.z - z) ** 2; if (d < bd) { bd = d; best = sd; } }
    return best ? best.kind : 'houses';
  };
  for (const st of streets) {
    const mx = (st.a[0] + st.b[0]) / 2, mz = (st.a[1] + st.b[1]) / 2;
    st.mat = st.type === 'v' && (kindAt(mx, mz) === 'nature' || terrain.inland(mx, mz) < 40) ? 'dirt' : 'cobble';
    st.town = st.mat === 'cobble' && st.type === 'v';
  }
  const roads = new RoadNet(streets);
  const extras = makeExtras(terrain, routes, rng);
  const city = { seed, blocks, terrain, bridges, spawn, streets, roads, seedList: seeds, monuments, billboards, routes, extras, size: 2 * HALF, half: HALF, plan };
  city.grid = makeQuadGrid(seed, HALF);
  classifyGrid(city);
  decorate(city);
  city.chunks = makeChunks(city);
  return city;
}

// ── plac Ministerstwa ───────────────────────────────────────────────────────
function fillPlaza(blk, terrain) {
  const r = inradius(blk.curb, [terrain.plaza.x, terrain.plaza.z]);
  const hs = Math.max(22, Math.min(46, r * 0.55));
  blk.ministry = { tiers: [1, 0.79, 0.6, 0.42].map((k) => hs * k), tierH: 22, y: terrain.plaza.y };
}

// ── latarnia morska, molo, dworzec z pociągiem ──────────────────────────────
function makeExtras(T, routes, rng) {
  const out = [];
  const coastPt = (a, inset) => { const r = T.coastR(a) - inset; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const far = (p, d) => routes.highway.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > d) && routes.rail.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > d) && T.river(p[0], p[1]).d > 60;
  let la = rng.float(0, Math.PI * 2);
  for (let i = 0; i < 24 && !far(coastPt(la, 6), 80); i++) la += 0.27;
  out.push({ kind: 'lighthouse', p: coastPt(la, 6), clear: 12 });
  for (let k = 0; k < 2; k++) {
    let a = la + 1.6 + k * 2.2;
    for (let i = 0; i < 24 && !far(coastPt(a, 30), 60); i++) a += 0.2;
    const p = coastPt(a, 30), o = coastPt(a, -60);
    const L = Math.hypot(o[0] - p[0], o[1] - p[1]);
    const e = [(o[0] - p[0]) / L, (o[1] - p[1]) / L];
    out.push({ kind: 'pier', p, e, len: L, clear: 6 });
  }
  const R = routes.rail, i = R.station;
  const a = R.pts[i - 5], b = R.pts[i + 5];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-e[1], e[0]];
  out.push({ kind: 'station', p: R.pts[i], e, n, y: R.y[i], clear: 34 });
  return out;
}
