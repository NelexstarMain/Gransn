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
import { CAR_KINDS } from '../gen/vehicles.js';
import { WHEEL_NOMINAL } from './carkit.js';

// rozkład typów aut na ulicach i palety lakierów (sRGB)
const KINDS = [['tourer', 30], ['sedan', 25], ['roadster', 11], ['taxi', 9], ['van', 15], ['truck', 10]];
const COLORS = [[0.12, 0.13, 0.15], [0.55, 0.12, 0.1], [0.2, 0.32, 0.24], [0.82, 0.8, 0.72], [0.25, 0.35, 0.55], [0.45, 0.32, 0.2], [0.5, 0.42, 0.62], [0.65, 0.55, 0.3], [0.62, 0.6, 0.58], [0.1, 0.22, 0.35]];
const WORK_COLORS = [[0.2, 0.27, 0.22], [0.35, 0.2, 0.14], [0.22, 0.3, 0.42], [0.48, 0.44, 0.34], [0.5, 0.15, 0.12]];
const OPEN = new Set(['tourer', 'taxi', 'roadster', 'truck']); // widać kierowcę
const lin = (c) => Math.pow(c, 2.2);

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

// A* po grafie dróg — kopiec binarny i bufory wielokrotnego użytku (bez alokacji na wywołanie;
// wcześniej open.splice() dawał zacięcia przy planowaniu trasy)
export function astar(G, from, to) {
  const N = G.nodes.length;
  let S = G._as;
  if (!S) S = G._as = { g: new Float64Array(N), f: new Float64Array(N), prev: new Int32Array(N), seen: new Int32Array(N), stamp: 0, ids: [], keys: [] };
  const stamp = ++S.stamp, { g, f, prev, seen, ids, keys } = S;
  ids.length = 0; keys.length = 0;
  const tx = G.nodes[to].x, tz = G.nodes[to].z;
  const h = (i) => Math.hypot(G.nodes[i].x - tx, G.nodes[i].z - tz);
  const push = (id, k) => {
    let i = ids.length;
    ids.push(id); keys.push(k);
    while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= k) break; ids[i] = ids[p]; keys[i] = keys[p]; i = p; }
    ids[i] = id; keys[i] = k;
  };
  const pop = () => {
    const top = ids[0], lastId = ids.pop(), lastK = keys.pop(), n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastK) break;
        ids[i] = ids[c]; keys[i] = keys[c]; i = c;
      }
      ids[i] = lastId; keys[i] = lastK;
    }
    return top;
  };
  seen[from] = stamp; g[from] = 0; f[from] = h(from); prev[from] = -1;
  push(from, f[from]);
  let found = false;
  while (ids.length) {
    const kTop = keys[0], v = pop();
    if (kTop > f[v] + 1e-9) continue; // nieaktualny wpis
    if (v === to) { found = true; break; }
    for (const e of G.nodes[v].edges) {
      const E = G.edges[e], w = E.a === v ? E.b : E.a;
      const ng = g[v] + E.len * (E.slow ? 1.4 : 1);
      if (seen[w] !== stamp || ng < g[w]) {
        seen[w] = stamp; g[w] = ng; prev[w] = v; f[w] = ng + h(w);
        push(w, f[w]);
      }
    }
  }
  if (!found && from !== to) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

export class Traffic {
  // kit = CarKit (siatki aut), crowd = ludzie (kierowcy); bez nich (symulacja w Node) liczy się sam ruch
  constructor(scene, city, grid, M, count, kit = null, crowd = null) {
    this.city = city;
    this.grid = grid;
    this.G = buildRoadGraph(city.streets);
    this.rng = new Rng(9001);
    this.liveNodes = this.G.nodes.map((_, i) => i).filter((i) => this.G.live[i] && this.G.nodes[i].edges.length);
    this.bots = [];
    this.count = count;
    this.t = 0;
    this.kit = kit;
    this.crowd = crowd;
    this.peds = null;
    this.foot = null;      // gracz pieszo ({x, z}) — auta zatrzymują się przed nim jak przed pieszym
    this.nearBuf = [];
    if (!kit) return;
    // karoserie: po jednym InstancedMesh na typ i materiał; lakier (`body`) dostaje kolor z instanceColor
    this.sets = {};
    for (const [kind] of KINDS) {
      const parts = kit.body(kind, 1, [1, 1, 1]).map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, count);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = p.name !== 'light' && p.name !== 'tail';
        im.receiveShadow = true;
        if (p.name === 'body') {
          im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
          im.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(im);
        return im;
      });
      this.sets[kind] = { parts, n: 0, color: parts.find((im) => im.instanceColor) };
    }
    // koła: wspólne dla wszystkich aut (4 instancje na auto), osobno szprychowe i pełne
    this.wheelSets = {};
    for (const solid of [false, true]) {
      const parts = kit.wheel(solid, 1).map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, count * 4);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = false;
        im.receiveShadow = true;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(im);
        return im;
      });
      this.wheelSets[solid ? 'solid' : 'spoke'] = { parts, n: 0 };
    }
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
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), count + 1);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    scene.add(this.blobs);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v3 = new THREE.Vector3();
    this.sc = new THREE.Vector3(1, 1, 1);
    this.tint = new THREE.Color();
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
      const kind = r.weighted(KINDS), K = CAR_KINDS[kind];
      const rgb = kind === 'van' || kind === 'truck' ? r.pick(WORK_COLORS) : kind === 'taxi' ? [0.95, 0.76, 0.12] : r.pick(COLORS);
      const bot = {
        id: this.nextId = (this.nextId || 0) + 1, from: n, path: [n], s: 0, v: 0, vmax: r.float(7.5, 12) * (kind === 'truck' ? 0.8 : 1), kind, len: K.L, rgb: rgb.map(lin), wb: K.L - K.front - K.rear,
        x: p[0], z: p[1], h: 0, turn: null, lock: -1, wait: 0, bump: 0, sf: 0, sr: 0, steer: 0, hPrev: 0, drv: null,
      };
      if (!this.plan(bot)) continue;
      if (this.bots.some((b) => Math.hypot(b.x - p[0], b.z - p[1]) < 8)) continue;
      const p0 = this.lanePoint(bot.edge, bot.path[0], 0);
      bot.x = p0[0]; bot.z = p0[1]; bot.h = bot.hPrev = p0[2];
      if (this.crowd && OPEN.has(kind)) bot.drv = this.crowd.addDriver(r);
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

  remove(b) {
    if (b.lock >= 0 && this.G.nodes[b.lock].lock === b.id) this.G.nodes[b.lock].lock = -1;
    if (b.drv && this.crowd) this.crowd.remove(b.drv);
  }

  // usuwa boty w promieniu r (np. zakleszczone z autem w trybie filmowym); ruch uzupełni się sam
  removeNear(x, z, r) {
    let w = 0;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (Math.hypot(b.x - x, b.z - z) > r) this.bots[w++] = b;
      else this.remove(b);
    }
    this.bots.length = w;
  }

  update(dt, player, playerCar) {
    this.t += dt;
    const P = [player.x, player.z];
    // utrzymuj liczbę aut wokół gracza; dalekie znikają i pojawiają się bliżej (kompaktowanie w miejscu)
    let w = 0;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (Math.hypot(b.x - P[0], b.z - P[1]) < 470) this.bots[w++] = b;
      else this.remove(b);
    }
    this.bots.length = w;
    if (this.bots.length < this.count) this.spawn(P); // jedno auto na klatkę — A* nie robi zacięć
    for (const b of this.bots) this.drive(b, dt, playerCar);
    if (this.kit) this.render(dt, playerCar, P);
  }

  drive(b, dt, car) {
    const G = this.G;
    const E = G.edges[b.edge];
    const next = b.path[1];
    const fx = Math.cos(b.h), fz = Math.sin(b.h);
    // 1) odstęp od auta z przodu (boty i gracz) oraz od pieszych na jezdni
    let target = E.slow ? b.vmax * 0.7 : b.vmax;
    for (const o of this.bots) {
      if (o === b || Math.abs(o.x - b.x) > 16 || Math.abs(o.z - b.z) > 16) continue;
      const dx = o.x - b.x, dz = o.z - b.z, along = dx * fx + dz * fz;
      if (along <= 0 || along >= 16 || Math.abs(-dx * fz + dz * fx) >= 1.8) continue;
      // tylko auto jadące w podobnym kierunku (albo tuż przed maską) — bez zakleszczeń czołowych
      if (Math.cos(o.h - b.h) > 0.2 || along < (b.len + o.len) / 2 + 0.8) {
        const gap = along - (b.len + o.len) / 2 - 1.2;
        target = Math.min(target, Math.max(0, gap * 1.1 + Math.max(0, o.v) * 0.5));
      }
    }
    if (car) {
      const dx = car.pos.x - b.x, dz = car.pos.z - b.z, along = dx * fx + dz * fz;
      if (along > 0 && along < 16 && Math.abs(-dx * fz + dz * fx) < 1.8) target = Math.min(target, Math.max(0, (along - (b.len + car.L) / 2 - 1.2) * 1.1 + Math.max(0, Math.abs(car.v)) * 0.5));
    }
    if (this.peds) {
      const d = this.peds.ahead(b.x, b.z, fx, fz, 11, 1.7);
      if (d >= 0) target = Math.min(target, Math.max(0, (d - b.len / 2 - 1.6) * 1.2));
    }
    if (this.foot) {
      const dx = this.foot.x - b.x, dz = this.foot.z - b.z, along = dx * fx + dz * fz;
      if (along > 0.3 && along < 11 && Math.abs(-dx * fz + dz * fx) < 1.9) target = Math.min(target, Math.max(0, (along - b.len / 2 - 1.6) * 1.2));
    }
    if (b.bump > 0) { b.bump -= dt; target = Math.min(target, 0); }
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
    if (b.wait > 12) { target = Math.max(target, 2.5); if (b.bump > 0) b.bump = 0; if (b.wait > 15) b.wait = 0; } // cierpliwość się kończy
    const acc = target > b.v ? 3.5 : -7.5;
    b.v = Math.max(0, b.v + acc * dt);
    if (target < b.v && target < 0.3) b.v = Math.max(0, b.v - 10 * dt);
    const step = b.v * dt;
    // koła: obrót od przebytej drogi
    const K = CAR_KINDS[b.kind];
    b.sf += step / K.rf; b.sr += step / K.rr;
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
        this.steerOf(b, dt);
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
        b.hPrev = b.h;
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
    this.steerOf(b, dt);
  }

  // kąt skrętu przednich kół z tempa zmiany kursu (model rowerowy), wygładzony
  steerOf(b, dt) {
    let dh = b.h - b.hPrev;
    if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
    b.hPrev = b.h;
    const yr = dt > 0 ? dh / dt : 0;
    const t = Math.atan2(b.wb * yr, Math.max(2, b.v));
    b.steer += (Math.max(-0.5, Math.min(0.5, t)) - b.steer) * Math.min(1, dt * 8);
  }

  render(dt, car, P) {
    for (const k in this.sets) this.sets[k].n = 0;
    this.wheelSets.spoke.n = 0; this.wheelSets.solid.n = 0;
    const T = this.city.terrain, { m, q, e, v3, sc, tint } = this;
    let bi = 0;
    for (const b of this.bots) {
      const dx = b.x - P[0], dz = b.z - P[1];
      const far = dx * dx + dz * dz > 260 * 260;
      const onBridge = this.grid.type(b.x, b.z) === 5;
      const y = onBridge ? T.bankY + 0.07 : T.height(b.x, b.z) + 0.06;
      const ch = Math.cos(b.h), sh = Math.sin(b.h);
      b.y = y;
      if (b.drv) this.seat(b, ch, sh, y);
      if (far) continue;
      const K = CAR_KINDS[b.kind], S = this.sets[b.kind];
      // karoseria + kolor lakieru
      q.setFromEuler(e.set(0, -b.h, 0));
      v3.set(b.x, y, b.z);
      sc.set(1, 1, 1);
      m.compose(v3, q, sc);
      for (const im of S.parts) im.setMatrixAt(S.n, m);
      tint.setRGB(b.rgb[0], b.rgb[1], b.rgb[2]);
      S.color.setColorAt(S.n, tint);
      S.n++;
      // koła: pozycja z nominalnych punktów, obrót od drogi, skręt przednich
      const solid = K.solid, W = this.wheelSets[solid ? 'solid' : 'spoke'], nom = solid ? WHEEL_NOMINAL.solid : WHEEL_NOMINAL.spoke;
      const half = K.Wd / 2 - 0.1, xf = K.L - K.front - K.L / 2, xr = K.rear - K.L / 2;
      for (let i = 0; i < 4; i++) {
        const front = i < 2, lx = front ? xf : xr, lz = (i & 1 ? 1 : -1) * half, r = front ? K.rf : K.rr;
        q.setFromEuler(e.set(0, -(b.h + (front ? b.steer : 0)), -(front ? b.sf : b.sr), 'YXZ'));
        v3.set(b.x + ch * lx - sh * lz, y + r, b.z + sh * lx + ch * lz);
        sc.setScalar(r / nom);
        m.compose(v3, q, sc);
        for (const im of W.parts) im.setMatrixAt(W.n, m);
        W.n++;
      }
      // cień-plama
      v3.set(b.x, y + 0.03, b.z);
      q.setFromEuler(e.set(0, -b.h, 0));
      sc.set(b.len + 1.0, 1, K.Wd + 0.8);
      m.compose(v3, q, sc);
      this.blobs.setMatrixAt(bi++, m);
    }
    if (car) {
      v3.set(car.pos.x, car.pos.y + 0.03, car.pos.z);
      q.setFromEuler(e.set(0, -car.heading, 0));
      sc.set(car.L + 1.0, 1, car.W + 0.8);
      m.compose(v3, q, sc);
      this.blobs.setMatrixAt(bi++, m);
    }
    this.blobs.count = bi;
    this.blobs.instanceMatrix.needsUpdate = true;
    for (const k in this.sets) {
      const S = this.sets[k];
      for (const im of S.parts) { im.count = S.n; im.visible = S.n > 0; im.instanceMatrix.needsUpdate = true; }
      S.color.instanceColor.needsUpdate = true;
    }
    for (const k of ['spoke', 'solid']) {
      const W = this.wheelSets[k];
      for (const im of W.parts) { im.count = W.n; im.visible = W.n > 0; im.instanceMatrix.needsUpdate = true; }
    }
  }

  // kierowca siedzi w aucie: pozycja z kotwicy modułu, kurs zgodny z autem
  seat(b, ch, sh, y) {
    const a = this.kit.anchors(b.kind).driver, d = b.drv;
    d.x = b.x + ch * a[0] - sh * a[2];
    d.z = b.z + sh * a[0] + ch * a[2];
    d.y = y + a[1] - 0.12;
    d.yaw = b.h;
    d.speed = b.v;
    d.steer = b.steer;
  }

  // przeszkody dla auta gracza (bufor wielokrotnego użytku — bez alokacji w każdej klatce)
  near(x, z, r) {
    const out = this.nearBuf;
    out.length = 0;
    for (const b of this.bots) if (Math.abs(b.x - x) < r && Math.abs(b.z - z) < r) out.push(b);
    return out;
  }

  // promień → najbliższe auto-bot (OBB w układzie auta); zwraca { t, bot } albo null
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    for (const b of this.bots) {
      const rx = b.x - ox, rz = b.z - oz;
      if (rx * rx + rz * rz > (maxT + 4) * (maxT + 4)) continue;
      const ch = Math.cos(b.h), sh = Math.sin(b.h);
      // promień w układzie auta: x wzdłuż, z w poprzek
      const px = (ox - b.x) * ch + (oz - b.z) * sh, pz = -(ox - b.x) * sh + (oz - b.z) * ch;
      const vx = dx * ch + dz * sh, vz = -dx * sh + dz * ch;
      const K = CAR_KINDS[b.kind];
      let t0 = 0, t1 = maxT;
      const slab = (p, v, lo, hi) => {
        if (Math.abs(v) < 1e-9) return p >= lo && p <= hi;
        let a = (lo - p) / v, c = (hi - p) / v;
        if (a > c) { const tmp = a; a = c; c = tmp; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        return t0 <= t1;
      };
      if (!slab(px, vx, -b.len / 2, b.len / 2) || !slab(oy - b.y, dy, 0.3, 1.9) || !slab(pz, vz, -K.Wd / 2, K.Wd / 2)) continue;
      if (!best || t0 < best.t) best = { t: t0, bot: b };
    }
    return best;
  }

  // trafienie: kierowca "wciska gaz" — ucieka, ale przez chwilę stoi w szoku
  shot(b) {
    b.bump = 1.5;
    b.vmax = Math.min(14, b.vmax * 1.25);
  }
}
