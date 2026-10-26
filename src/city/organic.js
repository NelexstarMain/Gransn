// ─────────────────────────────────────────────────────────────────────────────
//  ORGANICZNE ULICE — zaokrąglenie prostej sieci (Voronoi + L-system + netfix).
//  Sieć dzieli się na łańcuchy: odcinki między skrzyżowaniami (węzły stopnia ≠ 2).
//  Każdy łańcuch zamienia się w gładką krzywą (Catmull-Rom przez punkty po ścięciu
//  narożników Chaikina, a prosty odcinek dostaje lekki łuk) i znów w krótkie odcinki ~9 m.
//  Krzywa jest przyjmowana tylko wtedy, gdy:
//   • nie przecina żadnej innej ulicy,
//   • nie zbliża się do innej ulicy bardziej niż było (min. 9 m),
//   • nie wchodzi w rzekę ani nie wychodzi poza ląd.
//  W przeciwnym razie łańcuch zostaje prosty. Mosty, autostrada i dojazdy do mostów
//  (proste, bo most jest prosty) nie są ruszane. Skrzyżowania stoją w miejscu.
// ─────────────────────────────────────────────────────────────────────────────
import { crossPoint } from './audit.js';
import { hash } from '../core/rng.js';

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const STEP = 9;        // długość odcinka po zaokrągleniu (m)
const MIN_GAP = 9;     // najmniejszy odstęp od innych ulic (m)

function distSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}

function nearestOn(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return [a[0] + dx * t, a[1] + dz * t];
}

// Chaikin: ścina narożniki, końce zostają
function chaikin(P, rounds) {
  let pts = P;
  for (let r = 0; r < rounds; r++) {
    if (pts.length < 3) break;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (i > 0) out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < pts.length - 2) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Catmull-Rom przez punkty, potem równe odcinki ~STEP m wzdłuż krzywej (bez drobnicy)
function spline(P) {
  const dense = [P[0]];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(dist(p1, p2) / 1.5));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push(k === n ? p2 : [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dist(dense[i - 1], dense[i]));
  const total = cum[cum.length - 1], n = Math.max(2, Math.round(total / STEP));
  const out = [dense[0]];
  let j = 0;
  for (let k = 1; k < n; k++) {
    const want = (total * k) / n;
    while (j < cum.length - 2 && cum[j + 1] < want) j++;
    const t = (want - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    out.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * t, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * t]);
  }
  out.push(dense[dense.length - 1]);
  return out;
}

export function organicStreets(streets, T, seed) {
  const key = (p) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;
  const nodes = new Map();
  streets.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = key(p);
      if (!nodes.has(k)) nodes.set(k, { p, e: [] });
      nodes.get(k).e.push(i);
    }
  });
  // węzeł-złącze: skrzyżowanie, koniec albo zmiana rodzaju ulicy
  const keep = (s) => s.bridge || s.type === 'H';
  const bridgeNode = new Set();
  streets.forEach((s) => { if (s.bridge) { bridgeNode.add(key(s.a)); bridgeNode.add(key(s.b)); } });
  const joint = (k) => {
    const nd = nodes.get(k);
    if (nd.e.length !== 2) return true;
    const a = streets[nd.e[0]], b = streets[nd.e[1]];
    return a.rw !== b.rw || a.type !== b.type || keep(a) || keep(b);
  };

  // siatka segmentów aktualnego układu (do testów przecięć i odstępów)
  const CELL = 30, grid = new Map();
  const cellsOf = (a, b) => {
    const out = [];
    for (let gx = Math.floor((Math.min(a[0], b[0]) - 12) / CELL); gx <= Math.floor((Math.max(a[0], b[0]) + 12) / CELL); gx++)
      for (let gz = Math.floor((Math.min(a[1], b[1]) - 12) / CELL); gz <= Math.floor((Math.max(a[1], b[1]) + 12) / CELL); gz++) out.push(gx * 100003 + gz);
    return out;
  };
  const cur = new Map(); // id -> {a,b}
  let nextId = 0;
  const addSeg = (a, b) => {
    const id = nextId++, s = { a, b, id };
    cur.set(id, s);
    for (const c of cellsOf(a, b)) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push(s); }
    return s;
  };
  const delSeg = (s) => {
    cur.delete(s.id);
    for (const c of cellsOf(s.a, s.b)) { const l = grid.get(c); if (l) { const i = l.indexOf(s); if (i >= 0) l.splice(i, 1); } }
  };
  const orig = streets.map((s) => addSeg(s.a, s.b));
  const around = (p, r) => {
    const out = new Set();
    for (let gx = Math.floor((p[0] - r) / CELL); gx <= Math.floor((p[0] + r) / CELL); gx++)
      for (let gz = Math.floor((p[1] - r) / CELL); gz <= Math.floor((p[1] + r) / CELL); gz++) for (const s of grid.get(gx * 100003 + gz) || []) out.add(s);
    return out;
  };

  // łańcuchy
  const used = new Array(streets.length).fill(false);
  const chains = [];
  const walk = (i0, fromKey) => {
    // idzie od węzła fromKey wzdłuż krawędzi i0 przez węzły stopnia 2
    const pts = [], idx = [];
    let i = i0, k = fromKey;
    for (let guard = 0; guard < 200; guard++) {
      const s = streets[i];
      const ka = key(s.a), kb = key(s.b);
      const nk = ka === k ? kb : ka;
      idx.push(i);
      pts.push(ka === k ? s.b : s.a);
      if (joint(nk)) { return { pts, idx, endKey: nk }; }
      const nd = nodes.get(nk);
      const ni = nd.e.find((j) => j !== i);
      if (ni === undefined || used[ni]) return { pts, idx, endKey: nk };
      i = ni; k = nk;
    }
    return { pts, idx, endKey: k };
  };
  streets.forEach((s, i) => {
    if (used[i] || keep(s)) return;
    // cofnij się do początku łańcucha
    let start = i, startKey = key(s.a), guard = 0;
    while (!joint(startKey) && guard++ < 200) {
      const nd = nodes.get(startKey);
      const prev = nd.e.find((j) => j !== start);
      if (prev === undefined || prev === i) break;
      const ps = streets[prev];
      startKey = key(ps.a) === startKey ? key(ps.b) : key(ps.a);
      start = prev;
      if (startKey === key(s.a) && prev === i) break;
    }
    const sk = startKey;
    const ch = walk(start, sk);
    for (const j of ch.idx) used[j] = true;
    chains.push({ startKey: sk, startP: nodes.get(sk).p, ...ch });
  });

  const out = new Array(streets.length).fill(null);
  streets.forEach((s, i) => { if (keep(s)) out[i] = [{ ...s }]; });
  let curved = 0;

  for (const ch of chains) {
    const meta = streets[ch.idx[0]];
    const P = [ch.startP, ...ch.pts];
    const total = P.slice(1).reduce((s, p, i) => s + dist(P[i], p), 0);
    const straight = () => { for (const j of ch.idx) out[j] = [{ ...streets[j] }]; };
    // rynek (ratusz) zostaje regularny: łuk nie może zabrać miejsca budynkom wokół placu
    const pl = T.plaza ? Math.min(...P.map((p) => Math.hypot(p[0] - T.plaza.x, p[1] - T.plaza.z))) < T.plaza.r + 40 : false;
    if (pl || bridgeNode.has(ch.startKey) || bridgeNode.has(ch.endKey) || total < 20) { straight(); continue; }
    // kształt: ścięte narożniki + łuk dla prostych odcinków
    let Q = chaikin(P, 2);
    if (P.length === 2) {
      const a = P[0], b = P[1], L = dist(a, b);
      const h = hash(seed, Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1])) / 4294967296;
      const amp = Math.min(6.5, L * (0.035 + 0.05 * h)) * (h < 0.5 ? 1 : -1);
      const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      // dwa punkty kontrolne (1/3 i 2/3) dają łagodny łuk S/C zależnie od ziarna
      const h2 = hash(seed, Math.round(b[0]), Math.round(b[1]), 9) / 4294967296;
      const s2 = h2 < 0.35 ? -0.6 : 1; // czasem lekka „esa”
      Q = [a, [a[0] + (b[0] - a[0]) / 3 + nx * amp, a[1] + (b[1] - a[1]) / 3 + nz * amp], [a[0] + ((b[0] - a[0]) * 2) / 3 + nx * amp * s2, a[1] + ((b[1] - a[1]) * 2) / 3 + nz * amp * s2], b];
    }
    const C = spline(Q);
    // walidacja
    const mine = new Set(ch.idx.map((j) => orig[j].id));
    const ownSegs = [...mine].map((id) => cur.get(id)).filter(Boolean);
    let ok = true;
    const minRiver = Math.min(...P.map((p) => T.river(p[0], p[1]).d)), minInl = Math.min(...P.map((p) => T.inland(p[0], p[1])));
    for (let i = 0; i < C.length - 1 && ok; i++) {
      const a = C[i], b = C[i + 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (T.river(m[0], m[1]).d < Math.min(T.hw + 3, minRiver - 1) || T.inland(m[0], m[1]) < Math.min(16, minInl - 2) || Math.abs(m[0]) > T.half - 10 || Math.abs(m[1]) > T.half - 10) { ok = false; break; }
      for (const o of around(m, 20)) {
        if (ownSegs.includes(o)) continue;
        if (crossPoint(a, b, o.a, o.b, 0)) { ok = false; break; }
      }
    }
    // odstęp od innych ulic: nie mniejszy niż 9 m, chyba że już na początku był mniejszy
    for (let i = 1; i < C.length - 1 && ok; i++) {
      const p = C[i];
      if (dist(p, ch.startP) < 14 || dist(p, ch.pts[ch.pts.length - 1]) < 14) continue;
      let dn = 1e9;
      for (const o of around(p, 24)) { if (!ownSegs.includes(o)) dn = Math.min(dn, distSeg(p, o.a, o.b)); }
      if (dn >= MIN_GAP) continue;
      // punkt prostego łańcucha najbliższy temu punktowi krzywej: jak blisko innych ulic był tam on?
      let q = p, bd = 1e9;
      for (const o of ownSegs) { const d = distSeg(p, o.a, o.b); if (d < bd) { bd = d; q = nearestOn(p, o.a, o.b); } }
      let dOrig = 1e9;
      for (const o of around(q, 24)) { if (!ownSegs.includes(o)) dOrig = Math.min(dOrig, distSeg(q, o.a, o.b)); }
      if (dn < Math.min(MIN_GAP, dOrig - 0.5)) ok = false;
    }
    if (!ok) { straight(); continue; }
    // przyjęte: wymień odcinki łańcucha na krzywą
    for (const o of ownSegs) delSeg(o);
    const pieces = [];
    for (let i = 0; i < C.length - 1; i++) { pieces.push({ ...meta, a: C[i], b: C[i + 1], s0: 0 }); addSeg(C[i], C[i + 1]); }
    out[ch.idx[0]] = pieces;
    for (let q = 1; q < ch.idx.length; q++) out[ch.idx[q]] = [];
    curved++;
  }
  const res = out.flat().filter(Boolean);
  res.curved = curved;
  return res;
}
