// ─────────────────────────────────────────────────────────────────────────────
//  RUCH ULICZNY — kierowcy-boty
//  • Graf dróg z sieci jezdni (odcinki dzielone w skrzyżowaniach, węzły zgrzane).
//  • Trasa: A* do losowego celu, po dotarciu — nowy cel.
//  • Jazda prawym pasem, łagodne skręty (krzywa Béziera przez skrzyżowanie).
//  • Odstęp od poprzedzającego auta (także od gracza) + pierwszeństwo na
//    skrzyżowaniu (kto pierwszy wjechał, ten jedzie) → korki powstają same.
//  • Rysowanie: InstancedMesh na wariant koloru i materiał — kilkadziesiąt aut
//    to kilkadziesiąt wywołań rysowania, niezależnie od liczby aut.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { RoadNet } from '../city/roadnet.js';
import { moduleMesh } from './vehicle.js';

const CAR_L = 3.6;

export function buildRoadGraph(streets) {
  const net = new RoadNet(streets);
  // punkty podziału: końce odcinków leżące na innych odcinkach + przecięcia
  const cuts = streets.map(() => [0, 1]);
  streets.forEach((s) => {
    for (const p of [s.a, s.b])
      for (const o of net.near(p[0], p[1])) {
        if (o === s) continue;
        const pr = RoadNet.proj(o, p[0], p[1]);
        if (pr.d < 0.8 && pr.t > 0.01 && pr.t < 0.99) cuts[o.id].push(pr.t);
      }
    for (const o of net.near((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2)) {
      if (o.id <= s.id) continue;
      const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]], q = [o.b[0] - o.a[0], o.b[1] - o.a[1]];
      const den = r[0] * q[1] - r[1] * q[0];
      if (Math.abs(den) < 1e-6) continue;
      const t = ((o.a[0] - s.a[0]) * q[1] - (o.a[1] - s.a[1]) * q[0]) / den;
      const u = ((o.a[0] - s.a[0]) * r[1] - (o.a[1] - s.a[1]) * r[0]) / den;
      if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) { cuts[s.id].push(t); cuts[o.id].push(u); }
    }
  });
  const nodes = [], grid = new Map();
  const node = (x, z) => {
    const gx = Math.floor(x / 2), gz = Math.floor(z / 2);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const id of grid.get((gx + i) * 100003 + gz + j) || []) if (Math.hypot(nodes[id].x - x, nodes[id].z - z) < 1.6) return id;
    const id = nodes.length;
    nodes.push({ x, z, edges: [], lock: -1, lockT: 0 });
    const k = gx * 100003 + gz;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(id);
    return id;
  };
  const edges = [];
  streets.forEach((s, i) => {
    const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const pa = [s.a[0] + (s.b[0] - s.a[0]) * ts[k], s.a[1] + (s.b[1] - s.a[1]) * ts[k]];
      const pb = [s.a[0] + (s.b[0] - s.a[0]) * ts[k + 1], s.a[1] + (s.b[1] - s.a[1]) * ts[k + 1]];
      const a = node(pa[0], pa[1]), b = node(pb[0], pb[1]);
      if (a === b) continue;
      if (nodes[a].edges.some((e) => edges[e].a === b || edges[e].b === b)) continue;
      const len = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z);
      const id = edges.length;
      edges.push({ a, b, len, rw: s.rw, bridge: s.bridge, slow: s.mat === 'dirt' });
      nodes[a].edges.push(id);
      nodes[b].edges.push(id);
    }
  });
  // największa spójna składowa — tylko tam jeżdżą boty
  const comp = new Int32Array(nodes.length).fill(-1);
  let best = -1, bestN = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] >= 0) continue;
    const st = [i]; comp[i] = i; let n = 0;
    while (st.length) {
      const v = st.pop(); n++;
      for (const e of nodes[v].edges) { const w = edges[e].a === v ? edges[e].b : edges[e].a; if (comp[w] < 0) { comp[w] = i; st.push(w); } }
    }
    if (n > bestN) { bestN = n; best = i; }
  }
  const live = nodes.map((_, i) => comp[i] === best);
  return { nodes, edges, live };
}

// A* po grafie dróg
export function astar(G, from, to) {
  const N = G.nodes.length, gs = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), open = [from];
  const h = (i) => Math.hypot(G.nodes[i].x - G.nodes[to].x, G.nodes[i].z - G.nodes[to].z);
  const f = new Float64Array(N).fill(Infinity);
  gs[from] = 0; f[from] = h(from);
  const inOpen = new Uint8Array(N); inOpen[from] = 1;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const v = open.splice(bi, 1)[0]; inOpen[v] = 0;
    if (v === to) break;
    for (const e of G.nodes[v].edges) {
      const E = G.edges[e], w = E.a === v ? E.b : E.a;
      const ng = gs[v] + E.len * (E.slow ? 1.4 : 1);
      if (ng < gs[w]) {
        gs[w] = ng; prev[w] = v; f[w] = ng + h(w);
        if (!inOpen[w]) { open.push(w); inOpen[w] = 1; }
      }
    }
  }
  if (prev[to] < 0 && from !== to) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

const COLORS = [[0.12, 0.13, 0.15], [0.55, 0.12, 0.1], [0.2, 0.32, 0.24], [0.82, 0.8, 0.72], [0.25, 0.35, 0.55], [0.45, 0.32, 0.2], [0.5, 0.42, 0.62], [0.65, 0.55, 0.3]];

export class Traffic {
  constructor(scene, city, grid, M, count) {
    this.city = city;
    this.grid = grid;
    this.G = buildRoadGraph(city.streets);
    this.rng = new Rng(9001);
    this.liveNodes = this.G.nodes.map((_, i) => i).filter((i) => this.G.live[i] && this.G.nodes[i].edges.length);
    this.bots = [];
    this.count = count;
    this.t = 0;
    // warianty kolorów → InstancedMesh dla każdego materiału
    this.variants = COLORS.map((color) => {
      const g = moduleMesh('oldcar', CAR_L, 2.2, 1.7, { color, seat: [0.35, 0.15, 0.1] }, M);
      const parts = g.children.map((m) => {
        const im = new THREE.InstancedMesh(m.geometry, m.material, count);
        im.count = 0;
        im.castShadow = true;
        im.frustumCulled = false;
        scene.add(im);
        return im;
      });
      return { parts, n: 0 };
    });
    // miękki cień pod autem (tańszy niż cień z mapy dla wielu aut)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    const blobTex = new THREE.CanvasTexture(c);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.6, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), count + 1);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    scene.add(this.blobs);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v3 = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
  }

  nodePos(i) {
    return [this.G.nodes[i].x, this.G.nodes[i].z];
  }

  // punkt na prawym pasie krawędzi e, jadąc od węzła "from", w odległości s
  lanePoint(e, from, s) {
    const E = this.G.edges[e], to = E.a === from ? E.b : E.a;
    const A = this.G.nodes[from], B = this.G.nodes[to];
    const ux = (B.x - A.x) / E.len, uz = (B.z - A.z) / E.len;
    const off = E.rw * 0.45;
    return [A.x + ux * s - uz * off, A.z + uz * s + ux * off, Math.atan2(uz, ux)];
  }

  spawn(near) {
    const r = this.rng;
    for (let tries = 0; tries < 40; tries++) {
      const n = this.liveNodes[Math.floor(r.next() * this.liveNodes.length)];
      const p = this.nodePos(n);
      const d = Math.hypot(p[0] - near[0], p[1] - near[1]);
      if (d < 40 || d > 380) continue;
      const bot = { id: this.nextId = (this.nextId || 0) + 1, from: n, path: [n], s: 0, v: 0, vmax: r.float(7.5, 12), variant: Math.floor(r.next() * COLORS.length), x: p[0], z: p[1], h: 0, turn: null, lock: -1, wait: 0 };
      if (!this.plan(bot)) continue;
      if (this.bots.some((b) => Math.hypot(b.x - p[0], b.z - p[1]) < 8)) continue;
      this.bots.push(bot);
      return;
    }
  }

  plan(bot) {
    for (let k = 0; k < 6; k++) {
      const to = this.liveNodes[Math.floor(this.rng.next() * this.liveNodes.length)];
      const d = Math.hypot(this.G.nodes[to].x - this.G.nodes[bot.from].x, this.G.nodes[to].z - this.G.nodes[bot.from].z);
      if (d < 120 || d > 600) continue;
      const path = astar(this.G, bot.from, to);
      if (path && path.length >= 2) {
        bot.path = path;
        bot.edge = this.edgeBetween(path[0], path[1]);
        bot.s = 0;
        return true;
      }
    }
    return false;
  }

  edgeBetween(a, b) {
    return this.G.nodes[a].edges.find((e) => this.G.edges[e].a === b || this.G.edges[e].b === b);
  }

  // usuwa boty w promieniu r (np. zakleszczone z autem w trybie filmowym); ruch uzupełni się sam
  removeNear(x, z, r) {
    this.bots = this.bots.filter((b) => {
      if (Math.hypot(b.x - x, b.z - z) > r) return true;
      if (b.lock >= 0) this.G.nodes[b.lock].lock = -1;
      return false;
    });
  }

  update(dt, player, playerCar) {
    this.t += dt;
    const P = [player.x, player.z];
    // utrzymuj liczbę aut wokół gracza; dalekie znikają i pojawiają się bliżej
    this.bots = this.bots.filter((b) => {
      if (Math.hypot(b.x - P[0], b.z - P[1]) < 470) return true;
      if (b.lock >= 0) this.G.nodes[b.lock].lock = -1;
      return false;
    });
    let guard = 0;
    while (this.bots.length < this.count && guard++ < 3) this.spawn(P);

    for (const b of this.bots) this.drive(b, dt, playerCar);
    this.render(playerCar);
  }

  drive(b, dt, car) {
    const G = this.G;
    const E = G.edges[b.edge];
    const next = b.path[1];
    const fx = Math.cos(b.h), fz = Math.sin(b.h);
    // 1) odstęp od auta z przodu (boty i gracz)
    let target = E.slow ? b.vmax * 0.7 : b.vmax;
    const check = (ox, oz, ov, oh) => {
      const dx = ox - b.x, dz = oz - b.z, along = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
      // tylko auto jadące w podobnym kierunku (albo tuż przed maską) — bez zakleszczeń czołowych
      const same = oh === undefined || Math.cos(oh - b.h) > 0.2 || along < CAR_L + 0.8;
      if (same && along > 0 && along < 16 && lat < 1.8) {
        const gap = along - CAR_L - 1.2;
        target = Math.min(target, Math.max(0, gap * 1.1 + Math.max(0, ov) * 0.5));
      }
    };
    for (const o of this.bots) if (o !== b && Math.abs(o.x - b.x) < 16 && Math.abs(o.z - b.z) < 16) check(o.x, o.z, o.v, o.h);
    if (car) check(car.pos.x, car.pos.z, Math.abs(car.v));
    // 2) skrzyżowanie: pierwszeństwo ma ten, kto pierwszy je zajął
    const left = E.len - b.s;
    const N = G.nodes[next];
    if (!b.turn && N.edges.length >= 3 && left < 11) {
      if (N.lock >= 0 && N.lock !== b.id) target = Math.min(target, Math.max(0, (left - 6.5) * 1.2));
      else if (left < 7.5) { N.lock = b.id; N.lockT = this.t; b.lock = next; }
    }
    if (N.lock >= 0 && this.t - N.lockT > 8) N.lock = -1; // zabezpieczenie przed zakleszczeniem
    // zwolnij przed ostrym zakrętem
    if (!b.turn && b.path.length > 2 && left < 14) {
      const n2 = G.nodes[b.path[2]], n0 = G.nodes[b.path[0]];
      const a1 = Math.atan2(N.z - n0.z, N.x - n0.x), a2 = Math.atan2(n2.z - N.z, n2.x - N.x);
      let da = Math.abs(a2 - a1); if (da > Math.PI) da = Math.PI * 2 - da;
      target = Math.min(target, 12 - da * 5.5);
    }
    b.wait = b.v < 0.3 ? b.wait + dt : 0;
    if (b.wait > 12) { target = Math.max(target, 2.5); if (b.wait > 15) b.wait = 0; } // cierpliwość się kończy
    const acc = target > b.v ? 3.5 : -7.5;
    b.v = Math.max(0, b.v + acc * dt);
    if (target < b.v && target < 0.3) b.v = Math.max(0, b.v - 10 * dt);
    const step = b.v * dt;
    // 3) ruch: prosto po pasie albo łuk przez skrzyżowanie
    if (b.turn) {
      const T = b.turn;
      T.t += step / T.len;
      if (T.t >= 1) {
        b.turn = null;
        b.path.shift();
        b.edge = T.next;
        b.s = T.s0;
        if (b.lock >= 0 && G.nodes[b.lock].lock === b.id) G.nodes[b.lock].lock = -1;
        b.lock = -1;
      } else {
        const t = T.t, u = 1 - t;
        const x = u * u * T.p0[0] + 2 * u * t * T.c[0] + t * t * T.p2[0], z = u * u * T.p0[1] + 2 * u * t * T.c[1] + t * t * T.p2[1];
        const dx = 2 * u * (T.c[0] - T.p0[0]) + 2 * t * (T.p2[0] - T.c[0]), dz = 2 * u * (T.c[1] - T.p0[1]) + 2 * t * (T.p2[1] - T.c[1]);
        b.x = x; b.z = z; b.h = Math.atan2(dz, dx);
        return;
      }
    }
    b.s += step;
    const E2 = G.edges[b.edge];
    const r = Math.min(5, E2.len * 0.4);
    if (b.s >= E2.len - r) {
      if (b.path.length <= 2) {
        // cel osiągnięty — nowa trasa od tego węzła
        b.from = b.path[b.path.length - 1];
        const keep = b.edge;
        if (!this.plan(b)) { b.edge = keep; b.s = 0; b.path = [b.from, E2.a === b.from ? E2.b : E2.a]; }
        else {
          // nowy plan zaczyna się od węzła, w którym stoimy
          const p = this.lanePoint(b.edge, b.path[0], 0);
          b.x = p[0]; b.z = p[1]; b.h = p[2];
        }
        return;
      }
      const nextE = this.edgeBetween(b.path[1], b.path[2]);
      const r2 = Math.min(5, G.edges[nextE].len * 0.4);
      const p0 = this.lanePoint(b.edge, b.path[0], E2.len - r);
      const p2 = this.lanePoint(nextE, b.path[1], r2);
      const n = G.nodes[b.path[1]];
      // punkt kontrolny: przecięcie kierunków pasów (≈ węzeł przesunięty o pas)
      const c = [(p0[0] + p2[0]) / 2 * 0.4 + n.x * 0.6, (p0[1] + p2[1]) / 2 * 0.4 + n.z * 0.6];
      const len = Math.hypot(c[0] - p0[0], c[1] - p0[1]) + Math.hypot(p2[0] - c[0], p2[1] - c[1]) + 0.01;
      b.turn = { p0, c, p2, t: 0, len, next: nextE, s0: r2 };
      return;
    }
    const p = this.lanePoint(b.edge, b.path[0], b.s);
    b.x = p[0]; b.z = p[1]; b.h = p[2];
  }

  render(car) {
    for (const v of this.variants) v.n = 0;
    const T = this.city.terrain;
    let bi = 0;
    for (const b of this.bots) {
      const V = this.variants[b.variant];
      const onBridge = this.grid.type(b.x, b.z) === 5;
      const y = onBridge ? T.bankY + 0.07 : T.height(b.x, b.z) + 0.06;
      this.e.set(0, -b.h, 0);
      this.q.setFromEuler(this.e);
      this.v3.set(b.x, y, b.z);
      this.m.compose(this.v3, this.q, this.one);
      for (const im of V.parts) im.setMatrixAt(V.n, this.m);
      V.n++;
      this.v3.y = y + 0.03;
      this.m.compose(this.v3, this.q, this.one);
      this.blobs.setMatrixAt(bi++, this.m);
    }
    if (car) {
      this.e.set(0, -car.heading, 0);
      this.q.setFromEuler(this.e);
      this.v3.set(car.pos.x, car.pos.y + 0.03, car.pos.z);
      this.m.compose(this.v3, this.q, this.one);
      this.blobs.setMatrixAt(bi++, this.m);
    }
    this.blobs.count = bi;
    this.blobs.instanceMatrix.needsUpdate = true;
    for (const v of this.variants)
      for (const im of v.parts) {
        im.count = v.n;
        im.instanceMatrix.needsUpdate = true;
      }
  }

  // przeszkody dla auta gracza
  near(x, z, r) {
    return this.bots.filter((b) => Math.abs(b.x - x) < r && Math.abs(b.z - z) < r);
  }
}
