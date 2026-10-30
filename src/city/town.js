// ─────────────────────────────────────────────────────────────────────────────
//  PLAN MIASTECZKA ok. 1800–1900 — zamiast jednej, jednakowej siatki komórek.
//
//  Małe miasta tej epoki nie wyglądają „losowo”, tylko według kilku znanych schematów
//  (typologia układów: szachownica lokacyjna, owalnica, ulicowo-placowy, promienisty)
//  i według etapów wzrostu: jądro średniowieczne z rynkiem i ratuszem → promenada
//  (planty) na miejscu murów → przedmieścia wzdłuż dróg z bram → rozbudowa XIX w.
//  → wille na wzgórzach. Ten moduł wybiera typ i parametry z ziarna i zwraca:
//   • ziarna diagramu Voronoi (to one wyznaczają szkielet ulic; połączenie z L-systemem
//     Parish & Müller zostaje bez zmian) z rodzajem dzielnicy,
//   • rynek jako wielokąt (wycinany z sieci, z ulicami wokół),
//   • pierścień plant, bramy i drogi z bram (ulice główne),
//   • funkcje dla L-systemu: gdzie wolno rosnąć i jak gęsto.
//  Źródła: Parish & Müller 2001; Watabou, Medieval Fantasy City Generator (ziarna ze spirali,
//  mur z bramami, dzielnice); typologie planów małych miast Dolnego Śląska (Eysymontt 2016,
//  Adamska); plan lokacyjny: prostokątny rynek, ulice z naroży, działki krótszym bokiem do rynku.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hash } from '../core/rng.js';
import { noise3 } from '../core/noise.js';

const TAU = Math.PI * 2;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function bboxOf(poly) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return [x0, z0, x1, z1];
}

// wielokąt z szybkim odrzuceniem punktów spoza prostokąta otaczającego
export function region(poly) {
  const bb = bboxOf(poly);
  return { poly, bb, has: (x, z) => x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3] && pointInPoly(poly, x, z) };
}

// kierunek: ramka (środek C, obrót th) między układem planu (u wzdłuż e1, v wzdłuż e2) a światem
export function frame(C, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return {
    C, th, e1: [c, s], e2: [-s, c],
    w: (u, v) => [C[0] + u * c - v * s, C[1] + u * s + v * c],
    l: (x, z) => { const dx = x - C[0], dz = z - C[1]; return [dx * c + dz * s, -dx * s + dz * c]; },
  };
}

// ── rodzaje dzielnic: strefa siatki budynków, głębokość zabudowy, nazwa w HUD ─
//  court: od jakiego odstępu od jezdni (m) zaczyna się podwórze (puste wnętrze kwartału)
export const KINDS = {
  plaza: { zone: 'houses', court: 13, name: 'Rynek' },
  old: { zone: 'tenement', court: 21, name: 'Stare Miasto', levels: [2.6, 1.0] },
  tenement: { zone: 'tenement', court: 18, name: 'Śródmieście', levels: [4.6, 1.1] },
  houses: { zone: 'houses', court: 15, name: 'Przedmieście' },
  villa: { zone: 'houses', court: 15, name: 'Dzielnica willowa', garden: 0.5 },
  industrial: { zone: 'houses', court: 17, name: 'Okolica fabryczna' },
  cemetery: { zone: 'houses', court: 13, name: 'Cmentarz' },
  park: { zone: 'houses', court: 13, name: 'Park' },
  planty: { zone: 'houses', court: 13, name: 'Planty' },
  church: { zone: 'houses', court: 13, name: 'Kościół' },
  nature: { zone: 'nature', court: 13, name: 'Las i wydmy' },
};

// numer rodzaju dzielnicy w tablicy punktów siatki (grid.KIND)
export const KIND_ID = Object.fromEntries(Object.keys(KINDS).map((k, i) => [k, i]));

// ─────────────────────────────────────────────────────────────────────────────
const landOK = (T, half, x, z, riverGap = 24) =>
  Math.abs(x) < half - 8 && Math.abs(z) < half - 8 && T.inland(x, z) > 45 && T.river(x, z).d > T.hw + riverGap;

// ile metrów lądu jest od punktu w danym kierunku (do brzegu albo rzeki)
function landSpan(T, p, ang, max = 600) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let d = 10; d <= max; d += 10) {
    const x = p[0] + c * d, z = p[1] + s * d;
    if (T.inland(x, z) < 40 || T.river(x, z).d < T.hw + 12) return d;
  }
  return max;
}

// zaokrąglona krzywa przez punkty kontrolne (Catmull-Rom), próbkowana co ~step m
export function smoothPath(ctrl, step = 9) {
  const out = [ctrl[0]];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(k === n ? p2 : [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function convexHull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// ── rynek: prostokąt (lokacja, ulicówka), wielokąt foremny (promienisty) lub nieregularny (owalnica)
function makeRynek(type, F, rng) {
  if (type === 'lokacja') {
    const a = rng.float(34, 52), b = rng.chance(0.3) ? a * rng.float(0.62, 0.85) : rng.float(30, 50);
    return { shape: 'rect', a, b, poly: [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => F.w(u, v)) };
  }
  if (type === 'ulicowka') {
    const a = rng.float(56, 78), b = rng.float(15, 21);
    return { shape: 'rect', a, b, poly: [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => F.w(u, v)) };
  }
  if (type === 'promienisty') {
    const n = rng.int(7, 10), r = rng.float(38, 48), a0 = rng.float(0, TAU);
    return { shape: 'poly', a: r, b: r, poly: Array.from({ length: n }, (_, i) => F.w(Math.cos(a0 + (i / n) * TAU) * r, Math.sin(a0 + (i / n) * TAU) * r)) };
  }
  // owalnica: czworokąt/pięciokąt/sześciokąt o nierównych bokach (trapez, „żagiel”)
  const n = rng.int(4, 6), rb = rng.float(33, 46), a0 = rng.float(0, TAU), stretch = rng.float(0.7, 1.3);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + rng.float(-0.26, 0.26) * (TAU / n), rr = rb * rng.float(0.78, 1.2);
    pts.push(F.w(Math.cos(a) * rr * stretch, Math.sin(a) * rr / stretch));
  }
  const poly = convexHull(pts);
  const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
  const rad = Math.max(...poly.map((p) => dist(p, c)));
  return { shape: 'poly', a: rad, b: rad * 0.8, poly };
}

// obrys jądra (superelipsa z falowaniem promienia): ρ(t) w ramce planu
function makeOutline(F, A, B, n, o) {
  const rho = (t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const base = 1 / (Math.abs(c / A) ** n + Math.abs(s / B) ** n) ** (1 / n);
    return base * (1 + 0.07 * noise3(c * 1.3 + o, s * 1.3, 0.4));
  };
  const N = 96, pts = [];
  for (let i = 0; i < N; i++) { const t = (i / N) * TAU, r = rho(t); pts.push(F.w(Math.cos(t) * r, Math.sin(t) * r)); }
  return {
    A, B, rho, pts,
    // odległość znormalizowana: 1 na obrysie, <1 wewnątrz
    dn: (x, z) => { const [u, v] = F.l(x, z); return Math.hypot(u, v) / rho(Math.atan2(v, u)); },
  };
}

// pierścień plant: pas o szerokości w tuż za obrysem jądra (jak na miejscu rozebranych murów)
function makeRing(outline, F, w) {
  const P1 = outline.pts, n = P1.length, P2 = [];
  const cen = F.C;
  for (let i = 0; i < n; i++) {
    const a = P1[(i + n - 1) % n], b = P1[(i + 1) % n];
    let nx = b[1] - a[1], nz = -(b[0] - a[0]);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if ((P1[i][0] - cen[0]) * nx + (P1[i][1] - cen[1]) * nz < 0) { nx = -nx; nz = -nz; }
    P2.push([P1[i][0] + nx * w, P1[i][1] + nz * w]);
  }
  return { inner: P1, outer: P2, w, band: null, inner_r: region(P1), outer_r: region(P2) };
}

// ── droga z punktu o kierunku dir: łagodnie skręca, kończy się przy brzegu, rzece albo krawędzi mapy
function roadFrom(T, half, p0, dir, rng, { len = 560, wig = 0.1, stopRiver = 14 } = {}) {
  const ctrl = [p0];
  let p = p0, ang = Math.atan2(dir[1], dir[0]);
  const step = 70;
  let drift = rng.float(-1, 1) * wig;
  for (let d = 0; d < len; d += step) {
    drift = drift * 0.6 + rng.float(-1, 1) * wig * 0.8;
    ang += drift;
    const q = [p[0] + Math.cos(ang) * step, p[1] + Math.sin(ang) * step];
    if (T.inland(q[0], q[1]) < 30 || Math.abs(q[0]) > half - 12 || Math.abs(q[1]) > half - 12 || T.river(q[0], q[1]).d < T.hw + stopRiver) break;
    ctrl.push(q); p = q;
  }
  return ctrl.length < 2 ? null : smoothPath(ctrl, 9);
}


// długość osi rzeki i punkt (z styczną) w odległości s wzdłuż łuku — do rozmieszczania fabryk nad wodą
function riverLen(T) {
  let L = 0;
  for (let i = 0; i < T.pts.length - 1; i++) L += dist(T.pts[i], T.pts[i + 1]);
  return L;
}
function riverAt(T, s) {
  let acc = 0;
  for (let i = 0; i < T.pts.length - 1; i++) {
    const a = T.pts[i], b = T.pts[i + 1], l = dist(a, b);
    if (s <= acc + l) { const t = (s - acc) / l; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }; }
    acc += l;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
export function makeTownPlan(seed, T, bridges, half) {
  const rng = new Rng(hash(seed, 6006));
  const C = T.center;
  const rv = T.river(C[0], C[1]);
  // kierunek planu: wzdłuż rzeki (jak większość miast nad rzeką), czasem obrócony
  let th = rv.d < 340 ? Math.atan2(rv.tz, rv.tx) : rng.float(0, Math.PI);
  th += rng.chance(0.55) ? 0 : rng.float(-0.3, 0.3);
  const type = rng.weighted([['lokacja', 3.2], ['owalnica', 2.6], ['ulicowka', 1.5], ['promienisty', 1.1]]);
  if (type === 'ulicowka') {
    // oś ulicy wzdłuż najdłuższego pasa lądu przez środek
    let best = th, bs = -1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI, s = Math.min(landSpan(T, C, a), landSpan(T, C, a + Math.PI));
      if (s > bs + 20 || (Math.abs(s - bs) <= 20 && angDiff(a, th) < angDiff(best, th))) { bs = s; best = a; }
    }
    th = best;
  }
  const F = frame(C, th);
  const R = makeRynek(type, F, rng);
  const bridgeBlocked = (x, z) => bridges.some((b) => {
    const dx = x - b.p[0], dz = z - b.p[1];
    return Math.abs(dx * b.axis[0] + dz * b.axis[1]) < b.L + 90 && Math.abs(dx * b.perp[0] + dz * b.perp[1]) < 46;
  });
  const okSeed = (x, z) => landOK(T, half, x, z) && !bridgeBlocked(x, z);
  const rynekR = region(R.poly);
  const seeds = [];
  const add = (x, z, kind, fixed = true, extra = {}) => {
    if (!okSeed(x, z)) return false;
    const dead = rynekR.has(x, z);
    seeds.push({ x, z, fixed: fixed || dead, kind: dead ? 'plaza' : kind, dead, ...extra });
    return true;
  };

  // ── jądro (stare miasto) ───────────────────────────────────────────────────
  let outline;
  const o1 = rng.float(0, 50);
  if (type === 'lokacja') {
    const target = [rng.float(50, 70), rng.float(56, 84)];
    const kk = (len, tg) => { let best = 1, bd = 1e9; for (const k of [1, 2, 3]) { const s = len / k, d = Math.abs(s - tg) + (s > 78 ? 30 : 0); if (d < bd) { bd = d; best = k; } } return best; };
    const k1 = kk(2 * R.a, target[0]), k2 = kk(2 * R.b, target[1]);
    const sx = (2 * R.a) / k1, sy = (2 * R.b) / k2;
    outline = makeOutline(F, R.a + sx * rng.float(2.3, 3.6), R.b + sy * rng.float(2, 3), rng.float(3, 4), o1);
    const amp = rng.float(3, 8), wl = 190, jit = rng.float(0.04, 0.1);
    for (let i = -8; i <= k1 + 7; i++) {
      for (let j = -8; j <= k2 + 7; j++) {
        let u = -R.a + (i + 0.5) * sx, v = -R.b + (j + 0.5) * sy;
        if (outline.dn(...F.w(u, v)) > 1.02) continue;
        const damp = sstep(R.a * 0.9, R.a * 3, Math.hypot(u, v));
        const hh = hash(seed, i + 100, j + 100, 61);
        u += ((hh & 1023) / 1023 - 0.5) * 2 * jit * sx + noise3(u / wl + 3.1, 0.7, v / wl) * amp * damp;
        v += (((hh >> 10) & 1023) / 1023 - 0.5) * 2 * jit * sy + noise3(u / wl - 5.3, 1.9, v / wl + 2.2) * amp * damp;
        const p = F.w(u, v);
        add(p[0], p[1], 'old', true, { lat: true });
      }
    }
  } else if (type === 'owalnica' || type === 'promienisty') {
    const Aax = type === 'owalnica' ? rng.float(150, 205) : rng.float(165, 200);
    const Bax = type === 'owalnica' ? Aax * rng.float(0.68, 1) : Aax;
    outline = makeOutline(F, Aax, Bax, type === 'owalnica' ? 2.15 : 2, o1);
    if (type === 'owalnica') {
      // ziarna ze spirali (złoty kąt), gęściej w środku — jak w generatorze Watabou
      const GOLD = 2.399963;
      const K = Math.round((Math.PI * Aax * Bax) / 2800), a0 = rng.float(0, TAU), pw = rng.float(0.55, 0.62);
      for (let k = 0; k < K; k++) {
        const rr = Math.pow((k + 0.5) / K, pw), t = a0 + k * GOLD;
        const rho = outline.rho(t) * 0.96;
        const p = F.w(Math.cos(t) * rr * rho, Math.sin(t) * rr * rho);
        add(p[0], p[1], 'old', false);
      }
    } else {
      // pierścienie ziaren: te same kąty co pierścień, więc promienie ulic są ciągłe
      const n0 = rng.int(6, 9), dr = rng.float(56, 68), r1 = R.a + dr * 0.55;
      for (let ring = 0, r = r1; r < Aax * 0.98; ring++, r += dr) {
        const n = n0 * Math.max(1, Math.round((TAU * r) / (n0 * rng.float(52, 62))));
        for (let k = 0; k < n; k++) {
          const t = ((k + 0.5) / n) * TAU + (ring % 2 ? 0 : 0);
          const p = F.w(Math.cos(t) * r, Math.sin(t) * r);
          add(p[0], p[1], 'old', true);
        }
      }
    }
  } else {
    // ulicówka: dwa rzędy ziaren po obu stronach ulicy, z szerokim rynkiem pośrodku
    const Aax = rng.float(215, 250), Bax = rng.float(95, 125);
    outline = makeOutline(F, Aax, Bax, 2.6, o1);
    const su = rng.float(58, 74), d1 = rng.float(25, 31), d2 = rng.float(46, 54);
    const u0 = -Math.floor(Aax / su) * su;
    for (let u = u0; u <= Aax; u += su) {
      for (const sd of [-1, 1]) {
        for (const [row, v0] of [[0, d1], [1, d1 + d2], [2, d1 + d2 * 1.9]]) {
          const v = sd * (R.b + v0);
          const uu = u + (row % 2 ? su / 2 : 0) + (((hash(seed, Math.round(u), sd, row, 62) & 255) / 255 - 0.5) * 8);
          if (outline.dn(...F.w(uu, v)) > 1.02) continue;
          const p = F.w(uu, v);
          add(p[0], p[1], 'old', true, { lat: true });
        }
      }
    }
  }
  return finish();

  function finish() {
    // pierścień plant za obrysem jądra
    const ringOn = rng.chance(type === 'ulicowka' ? 0.35 : 0.7);
    const ring = ringOn ? makeRing(outline, F, rng.float(30, 42)) : null;
    const inRing = (x, z) => !!ring && ring.outer_r.has(x, z) && !ring.inner_r.has(x, z);
    const inCore = (x, z) => outline.dn(x, z) < 1.04 || inRing(x, z);

    // ── ulice główne: z naroży (lokacja) albo promieniście z rynku do bram ──────
    const roads = [];
    const gates = [];
    const rays = [];
    // punkt, w którym promień z środka rynku wychodzi z jego wielokąta (dokładnie na jego krawędzi)
    const exitPoint = (dir) => {
      const o = F.C, d = Math.hypot(dir[0], dir[1]) || 1, dx = dir[0] / d, dz = dir[1] / d;
      let best = null;
      for (let i = 0; i < R.poly.length; i++) {
        const c = R.poly[i], e = R.poly[(i + 1) % R.poly.length];
        const sx = e[0] - c[0], sz = e[1] - c[1], den = dx * sz - dz * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c[0] - o[0]) * sz - (c[1] - o[1]) * sx) / den, u = ((c[0] - o[0]) * dz - (c[1] - o[1]) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, p: [o[0] + dx * t, o[1] + dz * t] };
      }
      return best ? best.p : null;
    };
    if (type === 'lokacja') {
      // z każdego narożnika rynku wychodzą dwie ulice przedłużające boki (jak w planie lokacyjnym)
      for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const corner = F.w(su * R.a, sv * R.b);
        rays.push({ p: corner, dir: [su * F.e1[0], su * F.e1[1]] });
        rays.push({ p: corner, dir: [sv * F.e2[0], sv * F.e2[1]] });
      }
    } else {
      const g0 = rng.float(0, TAU), n = rng.int(3, 5);
      for (let k = 0; k < n; k++) {
        const t = g0 + (k / n) * TAU + rng.float(-0.25, 0.25) * (TAU / n), dir = [Math.cos(t), Math.sin(t)];
        const q = exitPoint(dir);
        if (q) rays.push({ p: q, dir });
      }
    }
    for (const r of rays) r.w = Math.atan2(r.dir[1], r.dir[0]);
    // wybór bram: rozstawione kątowo, nie wpadające od razu w rzekę
    const want = rng.int(3, 4);
    const cand = rays.map((r) => ({ ...r, road: roadFrom(T, half, r.p, r.dir, rng, { wig: type === 'lokacja' ? 0 : 0.1 }) })).filter((r) => r.road && r.road.length > 8);
    cand.sort((a, b) => b.road.length - a.road.length);
    const picked = [];
    for (const c of cand) {
      if (picked.length >= want) break;
      if (picked.some((p) => angDiff(p.w, c.w) < 0.8)) continue;
      picked.push(c);
    }
    const gateRoads = [];
    for (const c of picked) {
      roads.push({ pts: c.road, rw: 4.2, role: 'gate', main: true, planned: type === 'lokacja' });
      gates.push(c.p);
      // gdzie droga wychodzi z jądra i plant
      let ex = c.road.findIndex((q) => !inCore(q[0], q[1]));
      if (ex < 0) ex = c.road.length - 1;
      gateRoads.push({ pts: c.road, ex, start: c.road[Math.max(0, ex - 1)] });
    }
    // ulica z rynku do najbliższego mostu (zakończona prostym najazdem na most)
    if (bridges.length) {
      const b0 = bridges.reduce((a, b) => (dist(b.p, C) < dist(a.p, C) ? b : a));
      const near = dist(b0.e0, C) < dist(b0.e1, C) ? b0.e0 : b0.e1, far = near === b0.e0 ? b0.e1 : b0.e0;
      const bl = dist(near, far) || 1, ax = [(near[0] - far[0]) / bl, (near[1] - far[1]) / bl];
      const pre = [near[0] + ax[0] * 26, near[1] + ax[1] * 26];
      const q = exitPoint([pre[0] - F.C[0], pre[1] - F.C[1]]);
      if (q && dist(q, pre) > 20) roads.push({ pts: smoothPath([q, [(q[0] + pre[0]) / 2 + (pre[1] - q[1]) * 0.06, (q[1] + pre[1]) / 2 - (pre[0] - q[0]) * 0.06], pre, near], 9), rw: 4.2, role: 'bridge', main: true, planned: false });
    }
    // ulice wokół rynku i po obu stronach plant
    roads.push({ pts: [...R.poly, R.poly[0]], rw: 3.6, role: 'front', main: true, planned: true });
    if (ring) {
      // ulice wzdłuż plant przerywają się na rzece (przez rzekę idą tylko mosty)
      for (const loop of [ring.inner, ring.outer]) {
        const pts = [...loop, loop[0]];
        let run = [];
        const flush = () => { if (run.length >= 2) roads.push({ pts: run, rw: 3.6, role: 'ring', main: true, planned: true }); run = []; };
        for (const q of pts) { if (T.river(q[0], q[1]).d > T.hw + 9 && T.inland(q[0], q[1]) > 30) run.push(q); else flush(); }
        flush();
      }
    }

    // ── za plantami: przedmieścia wstęgowe wzdłuż dróg z bram, rozbudowa XIX w. i wille ──
    const feats = { ring: !!ring, gates: picked.length, ribbons: 0, expansions: 0, villas: 0 };
    const tryAdd = (x, z, kind, minSep, extra = {}) => {
      if (inCore(x, z)) return false;
      for (const s of seeds) if ((s.x - x) ** 2 + (s.z - z) ** 2 < minSep * minSep) return false;
      return add(x, z, kind, true, extra);
    };
    const walk = (pts, from, step, fn) => {
      let acc = 0, next = 0;
      for (let i = from; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], l = dist(a, b);
        while (next <= acc + l) {
          const t = (next - acc) / l;
          fn([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [(b[0] - a[0]) / l, (b[1] - a[1]) / l]);
          next += step;
        }
        acc += l;
      }
    };
    const order = gateRoads.map((g, i) => i).sort((a, b) => (gateRoads[b].pts.length - gateRoads[b].ex) - (gateRoads[a].pts.length - gateRoads[a].ex));
    order.forEach((gi, rank) => {
      const g = gateRoads[gi], remain = g.pts.length - g.ex;
      if (remain < 8) return; // droga kończy się zaraz za plantami
      const mode = rank === 0 && rng.chance(0.7) ? 'quarter' : 'ribbon';
      if (mode === 'quarter') {
        // rozbudowa XIX w.: kratka wyrównana do drogi, bulwar w osi (ulica z bramy jest linią kratki)
        const a0 = g.pts[Math.max(0, g.ex - 1)], a1 = g.pts[Math.min(g.pts.length - 1, g.ex + 2)];
        const F2 = frame(a0, Math.atan2(a1[1] - a0[1], a1[0] - a0[0]));
        const sx2 = rng.float(62, 78), sy2 = rng.float(60, 74), Lx = rng.float(170, 250);
        let n = 0;
        for (let i = 0; (i + 0.5) * sx2 < Lx; i++) {
          for (let j = -2; j <= 1; j++) {
            const u = 12 + (i + 0.5) * sx2, v = (j + 0.5) * sy2;
            const jt = sx2 * 0.05, hh = hash(seed, gi, i + 50, j + 50, 64);
            const p = F2.w(u + (((hh & 255) / 255) - 0.5) * 2 * jt, v + ((((hh >> 8) & 255) / 255) - 0.5) * 2 * jt);
            if (tryAdd(p[0], p[1], i < 2 ? 'tenement' : 'houses', Math.min(sx2, sy2) * 0.55, { lat: true })) n++;
          }
        }
        if (n) { feats.expansions++; return; }
      }
      // wstęga: dwa rzędy ziaren po obu stronach drogi (działki prostopadłe do drogi)
      const su = rng.float(44, 58);
      let n = 0;
      walk(g.pts, g.ex, su, (p, t) => {
        const nx = -t[1], nz = t[0];
        for (const sd of [-1, 1]) {
          if (tryAdd(p[0] + nx * 30 * sd, p[1] + nz * 30 * sd, 'houses', 30)) n++;
          if (rng.chance(0.55) && tryAdd(p[0] + nx * 82 * sd + t[0] * su * 0.5, p[1] + nz * 82 * sd + t[1] * su * 0.5, rng.chance(0.6) ? 'houses' : 'nature', 40)) n++;
        }
      });
      if (n) feats.ribbons++;
    });

    // ── dzielnica willowa na wzgórzu za miastem (wille w ogrodach, szerokie ulice) ──
    if (rng.chance(0.7)) {
      let best = null;
      for (let i = 0; i < 80; i++) {
        const a = rng.float(0, TAU), d = rng.float(170, 360), x = C[0] + Math.cos(a) * d, z = C[1] + Math.sin(a) * d;
        if (!okSeed(x, z) || inCore(x, z) || T.inland(x, z) < 115 || T.river(x, z).d < T.hw + 70) continue;
        const sc = T.hills(x, z) - 0.015 * Math.abs(d - 250);
        if (!best || sc > best.sc) best = { sc, x, z };
      }
      if (best) {
        let n = 0;
        for (let tries = 0; tries < 160 && n < 8; tries++) {
          const a = rng.float(0, TAU), d = Math.sqrt(rng.next()) * 125;
          if (tryAdd(best.x + Math.cos(a) * d, best.z + Math.sin(a) * d, 'villa', 84)) n++;
        }
        if (n >= 3) feats.villas = n;
      }
    }
    // ── okolica fabryczna przy rzece (komin, ceglane hale), z dala od rynku ──
    if (rng.chance(0.55)) {
      const L = riverLen(T), cand = [];
      for (let s0 = 0; s0 < L; s0 += 16) {
        const q = riverAt(T, s0);
        if (!q) continue;
        for (const sd of [-1, 1]) {
          const x = q.p[0] - q.t[1] * sd * (T.hw + 62), z = q.p[1] + q.t[0] * sd * (T.hw + 62), dC = Math.hypot(x - C[0], z - C[1]);
          if (dC > 210 && dC < 400 && okSeed(x, z) && !inCore(x, z) && T.inland(x, z) > 100) cand.push({ x, z, t: q.t, sd });
        }
      }
      if (cand.length) {
        const c0 = cand[rng.int(0, cand.length - 1)];
        let n = 0;
        for (let k = -2; k <= 2 && n < 4; k++) {
          if (tryAdd(c0.x + c0.t[0] * 84 * k, c0.z + c0.t[1] * 84 * k, 'industrial', 70)) n++;
        }
        if (n >= 2) feats.industry = n;
      }
    }
    // ── cmentarz poza miastem (jak w XIX w.: za bramą, przy drodze) ──
    {
      let best = null;
      for (let i = 0; i < 160; i++) {
        const a = rng.float(0, TAU), d = rng.float(200, 420), x = C[0] + Math.cos(a) * d, z = C[1] + Math.sin(a) * d;
        if (!okSeed(x, z) || inCore(x, z) || T.inland(x, z) < 80 || T.river(x, z).d < T.hw + 45) continue;
        if (seeds.some((s0) => (s0.x - x) ** 2 + (s0.z - z) ** 2 < 58 * 58)) continue;
        let near = 1e9;
        for (const g of gateRoads) for (let k = g.ex; k < g.pts.length; k += 2) near = Math.min(near, Math.hypot(g.pts[k][0] - x, g.pts[k][1] - z));
        const sc = -Math.min(near, 200) + rng.float(0, 30);
        if (!best || sc > best.sc) best = { sc, x, z };
      }
      if (best && tryAdd(best.x, best.z, 'cemetery', 56)) feats.cemetery = 1;
    }

    // ── reszta wyspy: ziarna rozproszone, rzadsze i luźniejsze z dala od jądra ──
    const spacingAt = (x, z) => 62 + 20 * sstep(0, 240, (outline.dn(x, z) - 1) * 110);
    const kindAt = (x, z) => {
      const d = (outline.dn(x, z) - 1) * 110; // ok. metrów za obrysem
      const inl = T.inland(x, z), h = hash(seed, Math.round(x), Math.round(z), 63) / 4294967296;
      if (inl < 135 && h < 0.6) return 'nature';
      if (d < 70) return h < 0.5 ? 'tenement' : 'houses';
      if (d < 200) return h < 0.1 ? 'park' : h < 0.15 ? 'tenement' : 'houses';
      return h < 0.5 ? 'nature' : h < 0.1 ? 'park' : 'houses';
    };
    for (let i = 0; i < 9000; i++) {
      const x = rng.float(-half + 10, half - 10), z = rng.float(-half + 10, half - 10);
      if (!okSeed(x, z) || inCore(x, z)) continue;
      const sp = spacingAt(x, z);
      let ok = true;
      for (const s of seeds) if ((s.x - x) ** 2 + (s.z - z) ** 2 < sp * sp) { ok = false; break; }
      if (ok) seeds.push({ x, z, fixed: false, kind: kindAt(x, z) });
    }
    // ratusz: w środku rynku (blok śródrynkowy), przesunięty ku jednemu końcowi albo wcale (wtedy fontanna)
    const hr = hash(seed, 6007, 3) / 4294967296, side = hash(seed, 6008, 5) & 1 ? 1 : -1;
    let hall = { u: 0, v: 0, none: false };
    const noneP = { lokacja: 0.1, ulicowka: 0.2, promienisty: 0.14, owalnica: 0.15 }[type], offP = { lokacja: 0.25, ulicowka: 0.3, promienisty: 0, owalnica: 0.3 }[type];
    if (hr < noneP) hall = { u: 0, v: 0, none: true };
    else if (hr < noneP + offP) {
      // przesunięcie ratusza ku końcowi rynku: bierzemy to z kandydatów, które trzymają ≥ 17 m od pierzei
      // (blok ratusza ma ok. 14 m, a przy jezdni musi zostać pas bez budynków); inaczej ratusz stoi pośrodku
      const edgeDist = (p) => { let d = 1e9; for (let i = 0; i < R.poly.length; i++) d = Math.min(d, segPointDist(p, R.poly[i], R.poly[(i + 1) % R.poly.length])); return d; };
      const k = R.shape === 'rect' ? 0.5 : 0.3;
      let bestC = null;
      for (const [u, v] of [[side * R.a * k, 0], [-side * R.a * k, 0], [0, side * R.b * 0.35], [0, -side * R.b * 0.35]]) {
        const p = F.w(u, v);
        if (!rynekR.has(p[0], p[1])) continue;
        const d = edgeDist(p);
        if (d >= 17 && (!bestC || d > bestC.d)) bestC = { u, v, d };
      }
      if (bestC) hall = { u: bestC.u, v: bestC.v, none: false };
    }
    // gęstość L-systemu: w jądrze największa, w pierścieniu i rynku brak wzrostu
    const noGrow = (x, z) => rynekR.has(x, z) || inRing(x, z);
    const density = (x, z) => {
      const d = outline.dn(x, z);
      const base = d < 1 ? 1 : 0.85 - 0.5 * sstep(1, 2.6, d);
      return Math.max(0, Math.min(1, base * (0.8 + 0.4 * (0.5 + 0.5 * noise3(x / 260 + 4.4, 0.7, z / 260)))));
    };
    return { type, C, th, F, hall: { ...hall, r: hr }, rynek: { ...R, region: rynekR }, outline, ring, roads, gates, seeds, feats, noGrow, density, inRing, alleyRate: type === 'lokacja' ? 0.26 : type === 'ulicowka' ? 0.32 : 0.4, overrideKind: (x, z) => (rynekR.has(x, z) ? 'plaza' : inRing(x, z) ? 'planty' : null) };
  }
}

// ── obróbka krawędzi Voronoi pod plan: wycięcie rynku i plant, usunięcie duplikatów dróg głównych ──
function clipOutside(a, b, regions) {
  // zwraca kawałki odcinka a–b leżące poza wszystkimi regionami
  const ts = [0, 1];
  for (const r of regions) {
    const P = r.poly;
    for (let i = 0; i < P.length; i++) {
      const c = P[i], d = P[(i + 1) % P.length];
      const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < 1e-6) continue;
    const m = (ts[i] + ts[i + 1]) / 2, x = a[0] + (b[0] - a[0]) * m, z = a[1] + (b[1] - a[1]) * m;
    if (regions.some((r) => r.has(x, z))) continue;
    const p = [a[0] + (b[0] - a[0]) * ts[i], a[1] + (b[1] - a[1]) * ts[i]], q = [a[0] + (b[0] - a[0]) * ts[i + 1], a[1] + (b[1] - a[1]) * ts[i + 1]];
    if (out.length && dist(out[out.length - 1].b, p) < 1e-6) out[out.length - 1].b = q; else out.push({ a: p, b: q });
  }
  return out;
}

function segPointDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}

// krawędzie Voronoi (a, b, rw) → po wycięciu rynku i plant, bez dubli dróg głównych, plus drogi planu
export function applyPlan(plan, vEdges, T) {
  const carve = [plan.rynek.region];
  if (plan.ring) carve.push({ poly: plan.ring.outer, has: (x, z) => plan.inRing(x, z) });
  const mainSegs = [];
  for (const r of plan.roads) for (let i = 0; i < r.pts.length - 1; i++) if (r.main && r.role !== 'front' && r.role !== 'ring') mainSegs.push([r.pts[i], r.pts[i + 1]]);
  const dupOf = (e) => {
    const L = dist(e.a, e.b);
    if (L < 1) return false;
    const ang = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
    let hit = 0;
    for (let k = 0; k < 4; k++) {
      const p = [e.a[0] + ((e.b[0] - e.a[0]) * (k + 0.5)) / 4, e.a[1] + ((e.b[1] - e.a[1]) * (k + 0.5)) / 4];
      for (const [c, d] of mainSegs) {
        if (segPointDist(p, c, d) > 9) continue;
        if (angDiff(ang, Math.atan2(d[1] - c[1], d[0] - c[0])) % Math.PI < 0.5 || angDiff(ang, Math.atan2(d[1] - c[1], d[0] - c[0])) > Math.PI - 0.5) { hit++; break; }
      }
    }
    return hit >= 3;
  };
  const out = [];
  for (const e of vEdges) {
    for (const piece of clipOutside(e.a, e.b, carve)) {
      if (dist(piece.a, piece.b) < 3) continue;
      const ne = { ...e, a: piece.a, b: piece.b };
      if (dupOf(ne)) continue;
      out.push(ne);
    }
  }
  const base = [...out];
  for (const r of plan.roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      if (dist(r.pts[i], r.pts[i + 1]) < 0.5) continue;
      base.push({ a: r.pts[i], b: r.pts[i + 1], rw: r.rw, type: 'v', main: !!r.main, planned: !!r.planned });
    }
  }
  return base;
}
