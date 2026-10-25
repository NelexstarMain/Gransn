// ─────────────────────────────────────────────────────────────────────────────
//  SIEĆ DRÓG — Parish & Müller, "Procedural Modeling of Cities" (SIGGRAPH 2001)
//
//  Rozszerzony L-system: każdy odcinek proponuje "idealnych następców"
//  (prosto + odgałęzienia), a potem:
//   • CELE GLOBALNE  — kierunek autostrad wybierany w stronę większej gęstości
//     zaludnienia (mapa z szumu), ulice odgałęziają się tylko tam, gdzie
//     gęstość jest wystarczająca;
//   • OGRANICZENIA LOKALNE — przecięcie z istniejącą drogą = skrzyżowanie
//     (odcinek przycięty), koniec blisko skrzyżowania = przyciągnięcie,
//     koniec blisko drogi = przedłużenie do niej; woda i brzeg wyspy
//     odrzucają odcinek (rzekę można przejść tylko mostem).
//  Kolejka priorytetowa po "czasie" daje naturalny wzrost miasta od centrum.
//  Połączenie z Voronoi: krawędzie komórek Voronoi są gotowym szkieletem
//  ulic głównych, a L-system zagęszcza kwartały bocznymi uliczkami.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hash } from '../core/rng.js';
import { noise3 } from '../core/noise.js';

// rw = połowa szerokości jezdni (m); przejazd zawsze ≥ 6 m
const HIGHWAY = { len: 30, rw: 4.0 }, STREET = { len: 19, rw: 3.0 };

function segInter(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t <= 1e-4 || t >= 1 - 1e-4 || u <= 1e-4 || u >= 1 - 1e-4) return null;
  return { t, p: [a[0] + r[0] * t, a[1] + r[1] * t] };
}

function projT(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1);
  return { t, d: Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t), q: [a[0] + dx * t, a[1] + dz * t] };
}

export function growRoads(seed, T, bridges, center, base = []) {
  const rng = new Rng(hash(seed, 1999));
  const pop = (x, z) => {
    const inl = T.inland(x, z);
    if (inl < 25 || T.river(x, z).d < T.hw + 4) return 0;
    const dc = Math.hypot(x - center[0], z - center[1]);
    const n = 0.5 + 0.5 * noise3(x / 260 + 4.4, 0.7, z / 260);
    return Math.max(0, Math.min(1, (1.15 - dc / 420) * 0.75 + n * 0.45)) * Math.min(1, inl / 90);
  };

  const segs = [];
  const B = 40, buckets = new Map();
  const bkey = (gx, gz) => gx * 100000 + gz;
  const insert = (s) => {
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / B), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / B);
    const z0 = Math.floor(Math.min(s.a[1], s.b[1]) / B), z1 = Math.floor(Math.max(s.a[1], s.b[1]) / B);
    for (let gx = x0; gx <= x1; gx++)
      for (let gz = z0; gz <= z1; gz++) {
        const k = bkey(gx, gz);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(s);
      }
    segs.push(s);
  };
  const near = (p, r) => {
    const out = new Set();
    for (let gx = Math.floor((p[0] - r) / B); gx <= Math.floor((p[0] + r) / B); gx++)
      for (let gz = Math.floor((p[1] - r) / B); gz <= Math.floor((p[1] + r) / B); gz++) for (const s of buckets.get(bkey(gx, gz)) || []) out.add(s);
    return out;
  };

  const queue = [];
  const push = (s) => queue.push(s);
  const mk = (a, ang, type, t, extra = {}) => {
    const L = type === 'h' ? HIGHWAY.len : STREET.len;
    return { a, b: [a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L], ang, type, t, ...extra };
  };

  // aksjomaty: mosty (stałe) + autostrady promieniście od placu
  for (const br of bridges) {
    const ang = Math.atan2(br.axis[1], br.axis[0]);
    insert({ a: br.e0, b: br.e1, ang, type: 'h', bridge: true, rw: 3.5 });
    push(mk(br.e1, ang, 'h', 0));
    push(mk(br.e0, ang + Math.PI, 'h', 0));
  }
  // szkielet z diagramu Voronoi: gotowe ulice główne; z nich L-system
  // wypuszcza prostopadłe uliczki do wnętrza kwartałów
  for (const e of base) {
    if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) < 6) continue;
    const ang = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
    insert({ a: e.a, b: e.b, ang, type: e.type || 'v', rw: e.rw, s0: e.s0 });
    const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    for (let d = 22 + rng.float(0, 12); d < L - 18; d += rng.float(30, 46)) {
      const p = [e.a[0] + Math.cos(ang) * d, e.a[1] + Math.sin(ang) * d];
      for (const sd of [-1, 1]) if (rng.chance(0.55)) push(mk(p, ang + sd * (Math.PI / 2 + rng.float(-0.15, 0.15)), 's', 3 + rng.float(0, 4)));
    }
  }
  const r0 = rng.float(0, Math.PI * 2);
  for (let k = 0; k < 4; k++) {
    const ang = r0 + (k * Math.PI) / 2;
    push(mk([center[0] + Math.cos(ang) * 55, center[1] + Math.sin(ang) * 55], ang, 'h', 0));
  }

  // ograniczenia lokalne: zwraca zmodyfikowany odcinek albo null
  const localConstraints = (s) => {
    if (pop(s.b[0], s.b[1]) <= 0.02 && T.inland(s.b[0], s.b[1]) < 20) return null;
    if (Math.abs(s.b[0]) > T.half - 10 || Math.abs(s.b[1]) > T.half - 10) return null;
    for (let k = 1; k <= 4; k++) {
      const x = s.a[0] + ((s.b[0] - s.a[0]) * k) / 4, z = s.a[1] + ((s.b[1] - s.a[1]) * k) / 4;
      if (T.river(x, z).d < T.hw + 3 || T.inland(x, z) < 18) return null;
    }
    const cand = near(s.b, 30);
    // 1) przecięcie → skrzyżowanie
    let best = null;
    for (const o of cand) {
      const hit = segInter(s.a, s.b, o.a, o.b);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    if (best && s.type === 'h') {
      // autostrada przecina drogę i jedzie dalej (skrzyżowanie bez zakończenia)
    } else if (best) {
      s.b = best.p;
      s.severed = true;
    } else {
      // 2) przyciągnięcie do istniejącego skrzyżowania
      let snap = null, sd = 9;
      for (const o of cand)
        for (const p of [o.a, o.b]) {
          const d = Math.hypot(p[0] - s.b[0], p[1] - s.b[1]);
          if (d < sd && Math.hypot(p[0] - s.a[0], p[1] - s.a[1]) > 1) { sd = d; snap = p; }
        }
      if (snap) { s.b = snap; s.severed = true; }
      else {
        // 3) przedłużenie do pobliskiej drogi
        for (const o of cand) {
          const pr = projT(s.b, o.a, o.b);
          if (pr.t > 0.05 && pr.t < 0.95 && pr.d < 11) {
            const ext = projT(s.a, o.a, o.b);
            if (Math.abs(ext.d - pr.d) > 2) { s.b = pr.q; s.severed = true; break; }
          }
        }
      }
    }
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (L < 5) return null;
    // za mały kąt z drogą wychodzącą z tego samego punktu
    for (const o of near(s.a, 2)) {
      for (const [p, q] of [[o.a, o.b], [o.b, o.a]]) {
        if (Math.hypot(p[0] - s.a[0], p[1] - s.a[1]) > 0.5) continue;
        const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]), a2 = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
        let da = Math.abs(a1 - a2) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < 0.5) return null;
      }
    }
    s.rw = s.type === 'h' ? HIGHWAY.rw : STREET.rw;
    return s;
  };

  // cele globalne: następcy zaakceptowanego odcinka
  const globalGoals = (s) => {
    if (s.severed) return [];
    const out = [];
    const end = s.b;
    if (s.type === 'h') {
      let bestA = s.ang, bestP = -1;
      for (let k = -3; k <= 3; k++) {
        const a = s.ang + k * 0.09 + rng.float(-0.03, 0.03);
        const p = pop(end[0] + Math.cos(a) * 120, end[1] + Math.sin(a) * 120);
        if (p > bestP) { bestP = p; bestA = a; }
      }
      if (bestP > 0.05) out.push(mk(end, bestA, 'h', s.t + 1));
      if (rng.chance(0.06)) out.push(mk(end, s.ang + (rng.chance(0.5) ? 1 : -1) * (Math.PI / 2 + rng.float(-0.15, 0.15)), 'h', s.t + 1));
      for (const sd of [-1, 1]) if (rng.chance(0.42)) out.push(mk(end, s.ang + sd * (Math.PI / 2 + rng.float(-0.12, 0.12)), 's', s.t + 6));
    } else {
      const p = pop(end[0], end[1]);
      if (p > 0.18) out.push(mk(end, s.ang + rng.float(-0.18, 0.18), 's', s.t + 1));
      for (const sd of [-1, 1]) if (p > 0.32 && rng.chance(0.38)) out.push(mk(end, s.ang + sd * (Math.PI / 2 + rng.float(-0.2, 0.2)), 's', s.t + 2 + rng.int(0, 2)));
    }
    return out;
  };

  let guard = 0;
  while (queue.length && segs.length < 3200 && guard++ < 40000) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].t < queue[bi].t) bi = i;
    const s = queue.splice(bi, 1)[0];
    const ok = localConstraints(s);
    if (!ok) continue;
    insert(ok);
    for (const n of globalGoals(ok)) push(n);
  }
  return segs.map((s) => ({ a: s.a, b: s.b, rw: s.rw, type: s.type, bridge: !!s.bridge, s0: s.s0 || 0 }));
}
