// ─────────────────────────────────────────────────────────────────────────────
//  WYKOŃCZENIE SIECI ULIC — mechanizmy, które z surowego wyniku Voronoi + L-system
//  robią spójny graf planarny bez błędów:
//   1. planaryzacja     każde przecięcie i każdy T-kontakt dzieli odcinki, końce
//                       zgrzewają się w jeden węzeł (nic nie krzyżuje się „w powietrzu”)
//   2. równoległe       dwie prawie równoległe, zbyt bliskie ulice → znika krótsza
//   3. krótkie          odcinki < 6 m zwijają się w jeden węzeł
//   4. ostre kąty       dwie ulice wychodzące z węzła pod kątem < 23° → znika krótsza
//   5. wyspy            odłączone kawałki sieci łączą się z główną (jeśli blisko) albo znikają
//   6. ślepe uliczki    koniec ulicy przedłuża się do najbliższej drogi albo odcinek znika
//  Pętla powtarza się, aż nic się nie zmienia. Mosty i autostrada nigdy nie są ruszane
//  (ich końce są nieruchome; wszystko inne dopasowuje się do nich).
// ─────────────────────────────────────────────────────────────────────────────
import { crossPoint, segIndex } from './audit.js';
import { tidyStreets } from './tidy.js';

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const TOL = 1.2;       // zgrzewanie końców (m)
const MIN_EDGE = 6;    // krótszy odcinek zwija się
const PAR_ANGLE = 0.3; // „prawie równolegle” (rad)
const SHARP = 0.4;     // „zbyt ostry kąt” (rad)

function projSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return { t, d: Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t), q: [a[0] + dx * t, a[1] + dz * t] };
}

const prio = (s) => (s.bridge ? 0 : s.type === 'H' ? 1 : s.gen ? 3 : 2);

// ── 1. planaryzacja ─────────────────────────────────────────────────────────
export function planarize(segs) {
  const L = segs.map((s) => dist(s.a, s.b));
  const idx = segIndex(segs, 30, 2);
  const cuts = segs.map(() => []);
  segs.forEach((s, i) => {
    for (const j of idx.near([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], L[i] / 2 + 3)) {
      if (j <= i) continue;
      const hit = crossPoint(s.a, s.b, segs[j].a, segs[j].b);
      if (hit) { cuts[i].push({ t: hit.t, p: hit.p }); cuts[j].push({ t: hit.u, p: hit.p }); }
    }
    for (const p of [s.a, s.b])
      for (const j of idx.near(p, 2)) {
        if (j === i) continue;
        const o = segs[j];
        if (dist(p, o.a) < TOL || dist(p, o.b) < TOL) continue;
        const pr = projSeg(p, o.a, o.b);
        if (pr.d < TOL + 0.3 && pr.t > 0 && pr.t < 1) cuts[j].push({ t: pr.t, p: [p[0], p[1]] });
      }
  });
  // kawałki
  const pieces = [];
  segs.forEach((s, i) => {
    const cs = cuts[i].sort((x, y) => x.t - y.t);
    const pts = [{ t: 0, p: s.a }];
    for (const c of cs) if (c.t - pts[pts.length - 1].t > 1e-4) pts.push(c);
    pts.push({ t: 1, p: s.b });
    for (let k = 0; k < pts.length - 1; k++) pieces.push({ ...s, a: pts[k].p, b: pts[k + 1].p, s0: (s.s0 || 0) + pts[k].t * L[i] });
  });
  // zgrzewanie końców: reprezentantem zostaje punkt z odcinka o najwyższym priorytecie
  pieces.sort((x, y) => prio(x) - prio(y));
  const reps = [], grid = new Map();
  const rep = (p) => {
    const gx = Math.floor(p[0] / 3), gz = Math.floor(p[1] / 3);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const r of grid.get((gx + i) * 100003 + gz + j) || []) if (dist(r, p) < TOL) return r;
    const r = [p[0], p[1]];
    reps.push(r);
    const k = gx * 100003 + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(r);
    return r;
  };
  const out = [], seen = new Map();
  for (const s of pieces) {
    const a = rep(s.a), b = rep(s.b);
    if (a === b || dist(a, b) < 0.5) continue;
    const ia = reps.indexOf(a), ib = reps.indexOf(b);
    const key = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
    if (seen.has(key)) continue; // ten sam odcinek drugi raz (nakładające się ulice)
    seen.set(key, true);
    out.push({ ...s, a, b });
  }
  return out;
}

// ── graf roboczy ────────────────────────────────────────────────────────────
class Net {
  constructor(segs) {
    this.N = []; this.E = [];
    const key = new Map();
    const node = (p) => {
      const k = `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
      let id = key.get(k);
      if (id === undefined) { id = this.N.length; this.N.push({ x: p[0], z: p[1], fixed: false, e: [] }); key.set(k, id); }
      return id;
    };
    for (const s of segs) {
      const { a, b, ...m } = s;
      const ia = node(a), ib = node(b);
      if (ia === ib) continue;
      const e = { a: ia, b: ib, m, alive: true };
      this.E.push(e);
      this.N[ia].e.push(e); this.N[ib].e.push(e);
      if (m.bridge || m.type === 'H') { this.N[ia].fixed = true; this.N[ib].fixed = true; }
    }
  }
  live(n) { return this.N[n].e.filter((e) => e.alive); }
  deg(n) { let d = 0; for (const e of this.N[n].e) if (e.alive) d++; return d; }
  len(e) { return Math.hypot(this.N[e.b].x - this.N[e.a].x, this.N[e.b].z - this.N[e.a].z); }
  pos(n) { return [this.N[n].x, this.N[n].z]; }
  other(e, n) { return e.a === n ? e.b : e.a; }
  kill(e) { e.alive = false; }
  add(a, b, m) {
    const e = { a, b, m, alive: true };
    this.E.push(e); this.N[a].e.push(e); this.N[b].e.push(e);
    return e;
  }
  edges() { return this.E.filter((e) => e.alive); }
  toSegs() {
    return this.edges().map((e) => ({ ...e.m, a: this.pos(e.a), b: this.pos(e.b) }));
  }
  // składowe spójności: tablica indeksów węzłów
  comps() {
    const comp = new Int32Array(this.N.length).fill(-1), list = [];
    for (let i = 0; i < this.N.length; i++) {
      if (comp[i] >= 0 || !this.deg(i)) continue;
      const st = [i], nodes = []; comp[i] = list.length;
      while (st.length) {
        const v = st.pop(); nodes.push(v);
        for (const e of this.live(v)) { const w = this.other(e, v); if (comp[w] < 0) { comp[w] = list.length; st.push(w); } }
      }
      let length = 0, bridge = false;
      for (const v of nodes) for (const e of this.live(v)) { length += this.len(e) / 2; if (e.m.bridge) bridge = true; }
      list.push({ nodes, length, bridge });
    }
    return { comp, list };
  }
  // indeks przestrzenny żywych krawędzi
  index() {
    const es = this.edges();
    const view = es.map((e) => ({ a: this.pos(e.a), b: this.pos(e.b) }));
    const idx = segIndex(view, 30, 2);
    return { es, view, near: (p, r) => [...idx.near(p, r)].map((i) => i) };
  }
}

const angleOf = (net, n, e) => { const o = net.other(e, n); return Math.atan2(net.N[o].z - net.N[n].z, net.N[o].x - net.N[n].x); };
const angDiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
const removable = (e) => e.alive && !e.m.bridge && e.m.type !== 'H';

// ── 2. równoległe, zbyt bliskie ulice ───────────────────────────────────────
function dropParallel(net) {
  const ix = net.index();
  let n = 0;
  const gen = ix.es.map((e, i) => [e, i]).filter(([e]) => e.m.gen && removable(e)).sort((x, y) => net.len(x[0]) - net.len(y[0]));
  for (const [e, i] of gen) {
    if (!e.alive) continue;
    const A = net.pos(e.a), B = net.pos(e.b), Le = dist(A, B);
    if (Le < 4) continue;
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const cand = ix.near([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Le / 2 + 20);
    let hits = 0, samples = 0;
    const NS = 5;
    for (let k = 0; k < NS; k++) {
      const p = [A[0] + (B[0] - A[0]) * ((k + 0.5) / NS), A[1] + (B[1] - A[1]) * ((k + 0.5) / NS)];
      samples++;
      for (const j of cand) {
        const f = ix.es[j];
        if (f === e || !f.alive || f.m.bridge) continue;
        if (f.a === e.a || f.a === e.b || f.b === e.a || f.b === e.b) continue;
        const FA = net.pos(f.a), FB = net.pos(f.b);
        const pr = projSeg(p, FA, FB);
        if (pr.t <= 0.02 || pr.t >= 0.98) continue;
        const af = Math.atan2(FB[1] - FA[1], FB[0] - FA[0]);
        let da = Math.abs(ang - af) % Math.PI; if (da > Math.PI / 2) da = Math.PI - da;
        if (da < PAR_ANGLE && pr.d < e.m.rw + f.m.rw + 15 && pr.d > 0.8) { hits++; break; }
      }
    }
    if (hits >= 4) { net.kill(e); n++; }
  }
  return n;
}

// ── 3. krótkie odcinki ──────────────────────────────────────────────────────
function collapseShort(net) {
  let n = 0;
  for (let it = 0; it < 4000; it++) {
    let best = null, bl = MIN_EDGE;
    for (const e of net.E) {
      if (!e.alive || e.m.bridge) continue;
      const l = net.len(e);
      if (l < bl && !(net.N[e.a].fixed && net.N[e.b].fixed)) { bl = l; best = e; }
    }
    if (!best) break;
    let { a, b } = best;
    if (net.N[b].fixed) [a, b] = [b, a]; // a zostaje (fixed albo środek)
    const A = net.N[a], B = net.N[b];
    if (!A.fixed) { A.x = (A.x + B.x) / 2; A.z = (A.z + B.z) / 2; }
    best.alive = false;
    for (const e of B.e) {
      if (!e.alive) continue;
      if (e.a === b) e.a = a; else e.b = a;
      A.e.push(e);
    }
    B.e = [];
    // duplikaty (a–c i b–c po zlaniu): zostaje ważniejszy
    const byOther = new Map();
    for (const e of net.live(a)) {
      const o = net.other(e, a);
      const prev = byOther.get(o);
      if (prev) { const drop = prio(prev.m) <= prio(e.m) ? e : prev; drop.alive = false; byOther.set(o, drop === e ? prev : e); } else byOther.set(o, e);
    }
    n++;
  }
  return n;
}

// ── 4. ostre kąty w węźle ───────────────────────────────────────────────────
function fixSharp(net) {
  let n = 0;
  for (let v = 0; v < net.N.length; v++) {
    for (let guard = 0; guard < 6; guard++) {
      const es = net.live(v);
      if (es.length < 2) break;
      let victim = null;
      for (let i = 0; i < es.length && !victim; i++)
        for (let j = i + 1; j < es.length; j++) {
          if (angDiff(angleOf(net, v, es[i]), angleOf(net, v, es[j])) >= SHARP) continue;
          const c = [es[i], es[j]].filter((e) => e.m.gen && removable(e)).sort((p, q) => net.len(p) - net.len(q));
          if (c.length) { victim = c[0]; break; }
        }
      if (!victim) break;
      net.kill(victim); n++;
    }
  }
  return n;
}

// ── pomocnicze: czy po drodze nie ma wody ───────────────────────────────────
function clearPath(T, a, b) {
  const L = dist(a, b), k = Math.max(2, Math.ceil(L / 4));
  for (let i = 0; i <= k; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / k, z = a[1] + ((b[1] - a[1]) * i) / k;
    if (T.river(x, z).d < T.hw + 3 || T.inland(x, z) < 16 || Math.abs(x) > T.half - 10 || Math.abs(z) > T.half - 10) return false;
  }
  return true;
}

// ── 5. wyspy ────────────────────────────────────────────────────────────────
function connectIslands(net, T) {
  const { comp, list } = net.comps();
  if (list.length < 2) return 0;
  let main = 0;
  list.forEach((c, i) => { if (c.length > list[main].length) main = i; });
  const ix = net.index();
  const mainEdges = ix.es.map((e, i) => [e, i]).filter(([e]) => comp[e.a] === main);
  let n = 0;
  list.forEach((c, ci) => {
    if (ci === main) return;
    const reach = c.bridge ? 200 : 85;
    let best = null;
    for (const v of c.nodes) {
      const p = net.pos(v);
      for (const j of ix.near(p, reach)) {
        const f = ix.es[j];
        if (comp[f.a] !== main || !f.alive) continue;
        const pr = projSeg(p, net.pos(f.a), net.pos(f.b));
        if (pr.d < reach && (!best || pr.d < best.d) && clearPath(T, p, pr.q)) best = { v, f, pr, d: pr.d };
      }
    }
    void mainEdges;
    if (best) {
      const f = best.f;
      let to;
      if (best.pr.t < 0.03) to = f.a; else if (best.pr.t > 0.97) to = f.b;
      else {
        // T-kontakt: nowy węzeł na krawędzi, krawędź dzieli się na dwie
        to = net.N.length;
        net.N.push({ x: best.pr.q[0], z: best.pr.q[1], fixed: false, e: [] });
        f.alive = false;
        net.add(f.a, to, { ...f.m, s0: f.m.s0 });
        net.add(to, f.b, { ...f.m, s0: (f.m.s0 || 0) + best.pr.t * net.len(f) });
      }
      const ref = net.live(best.v)[0];
      net.add(best.v, to, { rw: ref.m.rw, type: 's', bridge: false, s0: 0, gen: true });
      n++;
    } else if (!c.bridge) {
      for (const v of c.nodes) for (const e of net.live(v)) net.kill(e);
      n++;
    }
  });
  return n;
}

// ── 6. ślepe uliczki ────────────────────────────────────────────────────────
function healDeadEnds(net, T) {
  const ix = net.index();
  let n = 0;
  const dead = [];
  // koniec mostu bez dojazdu też dostaje ulicę (ale sam most nigdy nie jest usuwany)
  for (let v = 0; v < net.N.length; v++) if (net.deg(v) === 1 && (!net.N[v].fixed || net.live(v)[0].m.bridge)) dead.push(v);
  for (const v of dead) {
    if (net.deg(v) !== 1) continue;
    const e = net.live(v)[0];
    const P = net.pos(v);
    if (T.inland(P[0], P[1]) < 30) continue; // koniec przy plaży jest w porządku
    const heading = angleOf(net, v, e) + Math.PI;
    // kandydaci: węzły w stożku i trafienia promienia w krawędzie
    let best = null;
    const consider = (target, d, ang, node) => {
      const score = d * (1 + angDiff(ang, heading) * 1.5);
      if (d < 4 || d > 48 || !clearPath(T, P, target)) return;
      if (!best || score < best.score) best = { score, target, node };
    };
    for (const j of ix.near(P, 48)) {
      const f = ix.es[j];
      if (!f.alive || f === e) continue;
      for (const w of [f.a, f.b]) {
        if (w === v || w === net.other(e, v)) continue;
        const q = net.pos(w), ang = Math.atan2(q[1] - P[1], q[0] - P[0]);
        if (angDiff(ang, heading) < 0.65 && net.deg(w) >= 2) consider(q, dist(P, q), ang, w);
      }
      if (f.a === v || f.b === v) continue;
      // trafienie promieniem z lekkimi odchyleniami
      for (const da of [0, -0.25, 0.25, -0.5, 0.5]) {
        const ang = heading + da, R = [P[0] + Math.cos(ang) * 48, P[1] + Math.sin(ang) * 48];
        const hit = crossPoint(P, R, net.pos(f.a), net.pos(f.b), 0);
        if (hit && !f.m.bridge) consider(hit.p, dist(P, hit.p), ang, null);
      }
    }
    if (best) {
      let to = best.node;
      if (to === null) to = (() => { const id = net.N.length; net.N.push({ x: best.target[0], z: best.target[1], fixed: false, e: [] }); return id; })();
      net.add(v, to, { ...e.m, bridge: false, gen: true, s0: 0 });
      n++;
    } else if (e.m.gen && removable(e)) {
      net.kill(e); n++;
    }
  }
  return n;
}

// ── całość ──────────────────────────────────────────────────────────────────
export function finalizeNetwork(streets, T) {
  let segs = planarize(streets.map((s) => ({ ...s })));
  for (let it = 0; it < 6; it++) {
    const net = new Net(segs);
    let changed = 0;
    changed += dropParallel(net);
    changed += collapseShort(net);
    changed += fixSharp(net);
    changed += connectIslands(net, T);
    changed += healDeadEnds(net, T);
    segs = planarize(net.toSegs());
    if (!changed) break;
  }
  // końcowe usunięcie ślepych, wygładzone krótkie odcinki i łączenie współliniowych
  return tidyStreets(segs, { minStub: 0 });
}
