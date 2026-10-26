// ─────────────────────────────────────────────────────────────────────────────
//  PLAN MIASTA — zaplanowana siatka ulic zamiast losowych wielokątów
//
//  Wokół rynku (ratusza) leży wielokąt placu. Z jego narożników biegną AL-E PROMIENISTE;
//  między nimi pierścienie (okręgi co 54 m), a w każdym pasie między pierścieniami
//  ulice poprzeczne dzielą kwartały na regularne czworoboki ~55 × 54 m. Liczba ulic
//  poprzecznych rośnie ku brzegowi w potęgach dwójki (1, 2, 4, 8), więc istniejące
//  ulice biegną dalej prosto, a nowe odgałęziają się jak w planowanym mieście.
//  Mosty leżą na osiach alej (aleja skręca na oś mostu fazowaniem), autostrada to
//  fragment jednego z pierścieni, kolej biegnie środkiem pasa między pierścieniami.
//
//  Wszystkie linie (aleje, pierścienie, ulice, brzegi rzeki, kontur wyspy) trafiają
//  do jednego układu (arrangement): cięcie w przecięciach, scalanie wierzchołków,
//  obcinanie ślepych uliczek i wyciąganie ścian (kwartałów) z grafu płaskiego.
//  Ściany są kwartałami (blocks), krawędzie ulicami.
// ─────────────────────────────────────────────────────────────────────────────
import { noise3 } from '../core/noise.js';
import { Rng, hash } from '../core/rng.js';
import { makeBridge } from './bridges.js';

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const hyp = Math.hypot;

export const R0 = 48;                                         // promień placu
export const RING = [48, 102, 156, 210, 264, 318, 372, 426];  // pierścienie (granice pasów, 54 m)
export const RAIL_RING = 183;                                  // kolej: środek pasa 156–210
export const HWY_RING = 264;                                   // autostrada: pierścień
export const EDGE_INLAND = 32;                                 // ulice kończą się 32 m od brzegu morza

export const CLS = {
  avenue: { rw: 4.2, pri: 5, road: true },
  highway: { rw: 5.5, pri: 6, road: true },
  street: { rw: 3.4, pri: 4, road: true },
  lane: { rw: 3.0, pri: 3, road: true },
  bridge: { rw: 4.2, pri: 7, road: true },
  bank: { rw: 0, pri: 2, road: false },
  border: { rw: 0, pri: 1, road: false },
};

const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
const angDiff = (a, b) => { let d = Math.abs(norm(a) - norm(b)); return d > Math.PI ? TAU - d : d; };

// ── teren: gdzie wolno poprowadzić ulicę ────────────────────────────────────
function makeTests(T) {
  const land = (p) => T.inland(p[0], p[1]) >= EDGE_INLAND && T.river(p[0], p[1]).d >= T.hw;
  const coastOnly = (p) => T.inland(p[0], p[1]) >= EDGE_INLAND;
  return { land, coastOnly };
}

// Obcina łamaną do obszaru ok(p): zwraca listę łamanych (końce dociągnięte bisekcją do granicy)
function clipLine(pts, ok, minLen = 14) {
  const runs = [];
  let cur = null;
  const edge = (p, q) => { // p ok, q nie (albo odwrotnie): znajdź punkt graniczny
    let lo = p, hi = q;
    for (let i = 0; i < 18; i++) { const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]; if (ok(m)) lo = m; else hi = m; }
    return lo;
  };
  let prev = null, prevOk = false;
  for (const p of pts) {
    const o = ok(p);
    if (o) {
      if (!cur) { cur = []; if (prev && !prevOk) cur.push(edge(p, prev)); }
      cur.push(p);
    } else if (cur) {
      cur.push(edge(prev, p));
      runs.push(cur); cur = null;
    }
    prev = p; prevOk = o;
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => {
    let L = 0;
    for (let i = 1; i < r.length; i++) L += hyp(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    return L >= minLen;
  });
}

// ── mosty: aleja z początku układu trafia w rzekę → most prostopadły do rzeki ──
const riverSide = (T, x, z) => { const r = T.river(x, z); return r.tx * (z - r.pz) - r.tz * (x - r.px); };

function riverHits(T) {
  const out = [];
  for (let k = 0; k < 360; k++) {
    const a = (k / 360) * TAU, u = [Math.cos(a), Math.sin(a)];
    let prev = riverSide(T, u[0] * 60, u[1] * 60), pr = 60;
    for (let r = 63; r < 480; r += 3) {
      const s = riverSide(T, u[0] * r, u[1] * r);
      if (prev * s < 0) {
        let lo = pr, hi = r;
        for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (riverSide(T, u[0] * m, u[1] * m) * prev > 0) lo = m; else hi = m; }
        const rr = (lo + hi) / 2, p = [u[0] * rr, u[1] * rr], rv = T.river(p[0], p[1]);
        if (rv.d < 2 && T.inland(p[0], p[1]) > 90) {
          const tl = hyp(rv.tx, rv.tz), tan = [rv.tx / tl, rv.tz / tl], nrm = [-tan[1], tan[0]];
          out.push({ a, p, r: rr, tan, phi: Math.acos(Math.min(1, Math.abs(u[0] * nrm[0] + u[1] * nrm[1]))) });
        }
        break;
      }
      prev = s; pr = r;
    }
  }
  return out;
}

// punkt na osi rzeki z zapasem prostego odcinka po obu stronach (brzegi łamią się w wierzchołkach)
function siteAt(T, p, margin = 28) {
  const P = T.pts, rv = T.river(p[0], p[1]);
  const a = P[rv.seg], b = P[rv.seg + 1], len = hyp(b[0] - a[0], b[1] - a[1]);
  let s = rv.t * len;
  s = len > 2 * margin ? Math.max(margin, Math.min(len - margin, s)) : len / 2;
  return { p: [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len], tangent: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
}

// dwa mosty miejskie: po obu stronach „stopy” najkrótszej drogi z rynku do rzeki
export function chooseBridges(T, rng) {
  const hits = riverHits(T).filter((h) => h.phi < 0.62);
  if (hits.length < 2) return [];
  const foot = hits.reduce((a, b) => (b.r < a.r ? b : a));
  const lat = (h) => (h.p[0] - foot.p[0]) * foot.tan[0] + (h.p[1] - foot.p[1]) * foot.tan[1];
  const want = [-rng.float(95, 150), rng.float(95, 150)];
  const out = [];
  for (const w of want) {
    let best = null;
    for (const h of hits) {
      if (out.some((o) => angDiff(o.ang, h.a) < 0.35)) continue;
      const sc = Math.abs(lat(h) - w) + h.phi * 60;
      if (!best || sc < best.sc) best = { h, sc };
    }
    if (best) out.push({ h: best.h });
  }
  return out.map(({ h }) => {
    const site = siteAt(T, h.p);
    const br = makeBridge(T, site, { cols: 3, hint: [site.p[0], site.p[1]] });
    br.ang = Math.atan2(site.p[1], site.p[0]);
    return br;
  });
}

// ── układ (arrangement) ─────────────────────────────────────────────────────
function arrange(lines, tol = 0.7) {
  const segs = [];
  for (const L of lines)
    for (let i = 0; i < L.pts.length - 1; i++) {
      const a = L.pts[i], b = L.pts[i + 1], len = hyp(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      segs.push({ a, b, len, cls: L.cls, splits: [] });
    }
  const G = 32, grid = new Map(), key = (i, j) => i * 100003 + j;
  segs.forEach((s, id) => {
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / G), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / G);
    const z0 = Math.floor(Math.min(s.a[1], s.b[1]) / G), z1 = Math.floor(Math.max(s.a[1], s.b[1]) / G);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id); }
  });
  const seen = new Set(), N = segs.length;
  for (const list of grid.values())
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        const i = Math.min(list[x], list[y]), j = Math.max(list[x], list[y]), pk = i * N + j;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const s = segs[i], t = segs[j];
        const rx = s.b[0] - s.a[0], rz = s.b[1] - s.a[1], qx = t.b[0] - t.a[0], qz = t.b[1] - t.a[1];
        const den = rx * qz - rz * qx;
        if (Math.abs(den) < 1e-9) continue;
        const cx = t.a[0] - s.a[0], cz = t.a[1] - s.a[1];
        const tt = (cx * qz - cz * qx) / den, uu = (cx * rz - cz * rx) / den;
        const es = tol / s.len, et = tol / t.len;
        if (tt < -es || tt > 1 + es || uu < -et || uu > 1 + et) continue;
        const p = [s.a[0] + rx * Math.max(0, Math.min(1, tt)), s.a[1] + rz * Math.max(0, Math.min(1, tt))];
        s.splits.push(p); t.splits.push(p);
      }
  // wierzchołki z tolerancją
  const V = [], vg = new Map();
  const vid = (p) => {
    const gx = Math.floor(p[0] / 2), gz = Math.floor(p[1] / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const id of vg.get(key(gx + i, gz + j)) || []) if (hyp(V[id][0] - p[0], V[id][1] - p[1]) < tol) return id;
    const id = V.length; V.push([p[0], p[1]]);
    const k = key(gx, gz); if (!vg.has(k)) vg.set(k, []); vg.get(k).push(id);
    return id;
  };
  const edges = new Map();
  for (const s of segs) {
    const dx = (s.b[0] - s.a[0]) / s.len, dz = (s.b[1] - s.a[1]) / s.len;
    const pts = [s.a, ...s.splits, s.b].map((p) => ({ p, t: (p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dz })).sort((m, n) => m.t - n.t);
    let prev = vid(pts[0].p);
    for (let k = 1; k < pts.length; k++) {
      const cur = vid(pts[k].p);
      if (cur !== prev) {
        const ek = prev < cur ? `${prev}_${cur}` : `${cur}_${prev}`, old = edges.get(ek);
        if (!old || CLS[s.cls].pri > CLS[old.cls].pri) edges.set(ek, { u: Math.min(prev, cur), v: Math.max(prev, cur), cls: s.cls });
      }
      prev = cur;
    }
  }
  return { V, edges: [...edges.values()] };
}

// usuwa ślepe uliczki (wierzchołki stopnia 1) aż do ustabilizowania
function prune(nv, edges) {
  let alive = edges.slice();
  for (;;) {
    const deg = new Int32Array(nv);
    for (const e of alive) { deg[e.u]++; deg[e.v]++; }
    const next = alive.filter((e) => deg[e.u] > 1 && deg[e.v] > 1);
    if (next.length === alive.length) return next;
    alive = next;
  }
}

// ściany grafu płaskiego (wielokąty CCW w układzie x–z)
function faces(V, edges) {
  const adj = V.map(() => []);
  const from = [], to = [], ecls = [];
  edges.forEach((e, i) => {
    from.push(e.u, e.v); to.push(e.v, e.u); ecls.push(e.cls, e.cls);
    adj[e.u].push(2 * i); adj[e.v].push(2 * i + 1);
  });
  const pos = new Int32Array(from.length);
  adj.forEach((list, v) => {
    list.sort((a, b) => Math.atan2(V[to[a]][1] - V[v][1], V[to[a]][0] - V[v][0]) - Math.atan2(V[to[b]][1] - V[v][1], V[to[b]][0] - V[v][0]));
    list.forEach((h, k) => { pos[h] = k; });
  });
  const used = new Uint8Array(from.length), out = [];
  for (let h0 = 0; h0 < from.length; h0++) {
    if (used[h0]) continue;
    const ids = [];
    let h = h0, guard = 0;
    do {
      used[h] = 1; ids.push(from[h]);
      const tw = h ^ 1, v = to[h], list = adj[v];
      h = list[(pos[tw] - 1 + list.length) % list.length];
    } while (h !== h0 && ++guard < 5000);
    if (h !== h0) continue;
    let A = 0;
    for (let i = 0; i < ids.length; i++) { const p = V[ids[i]], q = V[ids[(i + 1) % ids.length]]; A += p[0] * q[1] - q[0] * p[1]; }
    out.push({ ids, area: A / 2 });
  }
  return { faces: out, ecls: (u, v) => { for (const h of adj[u]) if (to[h] === v) return ecls[h]; return null; } };
}

// ── główny generator ────────────────────────────────────────────────────────
export function planCity(T, seed, bridges) {
  const rng = new Rng(hash(seed, 5150));
  const { land, coastOnly } = makeTests(T);
  const aOff = rng.float(0, TAU);

  // 1. kąty alej: osiem co 45° (poza okolicą mostów) + osie mostów
  const bridgeAng = bridges.map((b) => b.ang);
  const prim = [];
  for (let k = 0; k < 8; k++) {
    const a = norm(aOff + (k * TAU) / 8);
    if (!bridgeAng.some((b) => angDiff(a, b) < 0.4)) prim.push({ a, bridge: null });
  }
  bridges.forEach((b, i) => prim.push({ a: b.ang, bridge: b, i }));
  prim.sort((x, y) => x.a - y.a);
  const K = prim.length;

  // 2. wygięcie ulic: łagodne, zanika przy rynku i przy mostach (mosty są proste)
  const centers = bridges.map((b) => b.p);
  const warp = (p) => {
    let w = smooth((hyp(p[0], p[1]) - 70) / 70);
    for (const c of centers) w *= smooth((hyp(p[0] - c[0], p[1] - c[1]) - 62) / 40);
    if (w <= 0) return p;
    return [p[0] + 6 * w * noise3(p[0] / 230 + 11.1, 0.3, p[1] / 230), p[1] + 6 * w * noise3(p[0] / 230 - 7.7, 5.2, p[1] / 230 + 3.3)];
  };

  const lines = [];
  const add = (pts, cls, ok = land) => { for (const run of clipLine(pts, ok)) lines.push({ pts: run, cls }); };
  const rayPts = (a, r0, r1, step = 18) => { const o = []; for (let r = r0; r < r1; r += step) o.push(warp(polar(a, r))); o.push(warp(polar(a, r1))); return o; };

  // 3. plac: wielokąt o wierzchołkach na końcach alej
  const plazaPts = prim.map((p) => polar(p.a, R0));
  lines.push({ pts: [...plazaPts, plazaPts[0]], cls: 'avenue' });

  // 4. aleje
  const RMAX = 500;
  prim.forEach((p) => {
    if (!p.bridge) { add(rayPts(p.a, R0, RMAX), 'avenue'); return; }
    // aleja do mostu: prosto po promieniu, faza na oś mostu, most, faza z powrotem na promień
    const br = p.bridge, C = br.p, u = [Math.cos(p.a), Math.sin(p.a)];
    let w = br.axis;
    if (w[0] * C[0] + w[1] * C[1] < 0) w = [-w[0], -w[1]];
    const legN = br.L + 20;                       // 42,5 m od środka mostu
    const X = [C[0] - u[0] * legN, C[1] - u[1] * legN], Y = [C[0] - w[0] * legN, C[1] - w[1] * legN];
    const Y2 = [C[0] + w[0] * legN, C[1] + w[1] * legN], X2 = [C[0] + u[0] * legN, C[1] + u[1] * legN];
    const e0 = [C[0] - w[0] * br.L, C[1] - w[1] * br.L], e1 = [C[0] + w[0] * br.L, C[1] + w[1] * br.L];
    const rX = hyp(X[0], X[1]);
    const near = [...rayPts(p.a, R0, rX - 1, 18), X, Y, e0];
    add(near, 'avenue', coastOnly);
    lines.push({ pts: [e0, e1], cls: 'bridge', bridge: true });
    const rX2 = hyp(X2[0], X2[1]);
    add([e1, Y2, X2, ...rayPts(p.a, rX2 + 1, RMAX, 18)], 'avenue', coastOnly);
    p.keep = { X, Y, Y2, X2, C };
  });

  // 5. ulice poprzeczne w pasach: potęgi dwójki, jeden wspólny odcinek od pierwszego pasa do brzegu
  const gaps = prim.map((p, i) => [p.a, prim[(i + 1) % K].a + (i + 1 === K ? TAU : 0)]);
  const sub = []; // { a, r0, cls }
  gaps.forEach(([a0, a1], j) => {
    const gap = a1 - a0, fr = new Map();
    for (let i = 0; i < RING.length - 1; i++) {
      const rm = (RING[i] + RING[i + 1]) / 2, want = (gap * rm) / 58;
      const m = Math.max(1, Math.min(8, Math.pow(2, Math.round(Math.log2(Math.max(1, want))))));
      for (let s = 1; s < m; s++) { const f = s / m, k2 = f.toFixed(5); if (!fr.has(k2)) fr.set(k2, { f, band: i }); }
    }
    for (const { f, band } of fr.values()) sub.push({ a: a0 + gap * f, r0: RING[band], j });
  });
  // odrzuć ulice dopiero biegnące tuż obok alei z fazowaniem (zrobiłyby wąskie paski)
  const keepSegs = [];
  prim.forEach((p) => { if (p.keep) keepSegs.push([p.keep.X, p.keep.Y], [p.keep.Y, p.keep.Y2], [p.keep.Y2, p.keep.X2]); });
  const dSeg = (q, [a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return hyp(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t); };
  for (const s of sub) {
    let bad = false;
    for (let r = s.r0 + 6; r < RMAX && !bad; r += 7) { const q = polar(s.a, r); if (keepSegs.some((sg) => dSeg(q, sg) < 20)) bad = true; }
    if (bad) continue;
    // klasa: ulica w śródmieściu, zaułek na obrzeżach
    const split = 276;
    if (s.r0 < split) add(rayPts(s.a, s.r0, Math.min(split, RMAX)), 'street');
    add(rayPts(s.a, Math.max(s.r0, split), RMAX), 'lane');
  }

  // 6. pierścienie (okno autostrady i klasa wg numeru), plac jest pierścieniem 0
  const ringPts = (r, a0 = 0, a1 = TAU) => { const o = []; const n = Math.max(2, Math.ceil(((a1 - a0) / TAU) * 48)); for (let k = 0; k <= n; k++) o.push(warp(polar(a0 + ((a1 - a0) * k) / n, r))); return o; };
  const score = (r, a0, span) => { let bad = 0; for (let k = 0; k <= 60; k++) { const q = polar(a0 + (span * k) / 60, r); if (!land(q)) bad++; } return bad; };
  const pickWindow = (r, span, pref) => {
    let best = null;
    for (let k = 0; k < 72; k++) { const a0 = (k / 72) * TAU, sc = score(r, a0, span) * 10 + Math.abs(angDiff(a0 + span / 2, pref)) * 2 + rng.float(0, 0.5); if (!best || sc < best.sc) best = { a0, sc }; }
    return best.a0;
  };
  const hwSpan = 2.5, railSpan = 2.1;
  const hwA0 = pickWindow(HWY_RING, hwSpan, aOff + 1);
  const railA0 = pickWindow(RAIL_RING, railSpan, aOff + 3.4);
  RING.forEach((r, i) => {
    if (i === 0) return;
    const cls = i === 2 || i === 4 ? 'avenue' : r > 330 ? 'lane' : 'street';
    if (r === HWY_RING) {
      const a1 = hwA0 + hwSpan;
      add(ringPts(r, hwA0, a1), 'highway');
      add(ringPts(r, a1, hwA0 + TAU), cls);
    } else add(ringPts(r), cls);
  });

  // 7. brzegi rzeki i kontur wyspy (granice kwartałów, nie ulice)
  for (const bank of [T.bankL, T.bankR]) add(densify(bank, 6), 'bank', coastOnly);
  const contour = [];
  for (let k = 0; k <= 180; k++) { const a = (k / 180) * TAU; contour.push(polar(a, T.coastR(a) - EDGE_INLAND)); }
  lines.push({ pts: contour, cls: 'border' });

  // 8. układ → ściany
  const arr = arrange(lines);
  const edges = prune(arr.V.length, arr.edges);
  const F = faces(arr.V, edges);

  // 9. trasy: autostrada (okno pierścienia) i kolej (środek pasa)
  const routes = makeRoutes(T, warp, land, coastOnly, hwA0, hwSpan, railA0, railSpan);

  // 10. kwartały: ściany o dodatnim polu, nie woda
  const cells = [], used = new Set();
  const V = arr.V.map(([x, z]) => ({ x, z, bank: false, border: false }));
  for (const e of edges) { if (e.cls === 'bank') { V[e.u].bank = V[e.v].bank = true; } if (e.cls === 'border') { V[e.u].border = V[e.v].border = true; } }
  for (const f of F.faces) {
    if (f.area < 250) continue;
    let cx = 0, cz = 0;
    for (const id of f.ids) { cx += V[id].x / f.ids.length; cz += V[id].z / f.ids.length; }
    if (T.river(cx, cz).d < T.hw + 1 || T.inland(cx, cz) < EDGE_INLAND - 4) continue;
    cells.push({ ids: f.ids, seed: { x: cx, z: cz, fixed: false }, area: f.area });
    for (const id of f.ids) used.add(id);
  }
  // ulice: krawędzie klasy drogowej
  const streets = [];
  for (const e of edges) {
    const c = CLS[e.cls];
    if (!c.road) continue;
    const a = arr.V[e.u], b = arr.V[e.v];
    streets.push({ a, b, rw: c.rw, type: e.cls === 'highway' ? 'H' : e.cls === 'bridge' ? 'h' : 'v', bridge: e.cls === 'bridge', s0: 0, cls: e.cls });
  }
  return { g: { V, cells }, edgeCls: (u, v) => F.ecls(u, v), streets, routes, plazaPts, prim, aOff };
}

function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(hyp(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ── autostrada i kolej jako łuki pierścieni ─────────────────────────────────
function makeRoutes(T, warp, land, coastOnly, hwA0, hwSpan, railA0, railSpan) {
  const arc = (r, a0, span, step, ok) => {
    const n = Math.ceil((span * r) / step), pts = [];
    for (let k = 0; k <= n; k++) pts.push(warp(polar(a0 + (span * k) / n, r)));
    const runs = clipLine(pts, ok, 30);
    return runs.sort((p, q) => q.length - p.length)[0] || pts.slice(0, 2);
  };
  const hw = arc(HWY_RING, hwA0, hwSpan, 8, land);
  const rok = (p) => T.inland(p[0], p[1]) >= 20 && T.river(p[0], p[1]).d >= T.hw + 8;
  const rw = arc(RAIL_RING, railA0, railSpan, 6, rok);
  const rh = rw.map(([x, z]) => Math.max(T.height(x, z), T.seaY + 1));
  const smoothY = (ys, w) => ys.map((_, i) => { let s = 0, n = 0; for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < ys.length) { s += ys[j]; n++; } } return s / n; });
  const ry = smoothY(rh, 1).map((y, i) => Math.max(rh[i] - 0.2, Math.min(rh[i] + 0.2, y)));
  return {
    highway: { pts: hw, width: 11, bridge: null },
    rail: { pts: rw, y: ry, width: 5, bridge: null, station: Math.floor(rw.length * 0.5) },
  };
}
