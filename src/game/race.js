// ─────────────────────────────────────────────────────────────────────────────
//  WYŚCIGI — zadania rozsiane po mieście.
//  • W mieście stoją 3 punkty startu (pierścień na jezdni + słup światła widoczny z daleka,
//    zielona flaga na minimapie). Wjedź w pierścień powoli taksówką — wyścig się zaczyna.
//  • Trasa: A* po grafie dróg botów przez kilka losowych punktów (ok. 1,3–1,9 km), prawy pas.
//    Na jezdni świecą żółte strzałki na najbliższe ~170 m, co ~200 m stoi bramka kontrolna,
//    na końcu meta w szachownicę. Trasa jest też na minimapie.
//  • Rywale: 3 auta z tą samą fizyką co taksówka, sterowane autopilotem (pure pursuit, jak tryb
//    filmowy) z lekkim „gumowaniem” (prowadzący trochę zwalnia, ostatni trochę przyspiesza).
//  • Odliczanie 3-2-1, pozycja na żywo, nagroda za miejsce. Wyjście z auta przerywa wyścig.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { astar } from './traffic.js';
import { Vehicle } from './vehicle.js';
import { makeStyle } from './rig.js';
import { Rng, hash } from '../core/rng.js';

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const NOKEYS = new Set();
const RIVALS = [['roadster', [0.62, 0.1, 0.08], 15.9], ['tourer', [0.12, 0.26, 0.5], 15.2], ['sedan', [0.16, 0.34, 0.2], 14.5]];
const PRIZE = [120, 60, 30, 0];

export class Races {
  constructor({ scene, city, grid, traffic, M, kit, car, job, crowd }) {
    Object.assign(this, { scene, city, grid, traffic, M, kit, car, job, crowd });
    this.state = 'idle';
    this.cool = new Map();
    this.starts = this.pickStarts();
    // znacznik startu: pierścień na jezdni + słup światła
    const ringM = new THREE.MeshBasicMaterial({ color: 0x3dff8a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const beamM = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vec3(0.15, 0.9, 0.45) * (1.0 - vY) * 0.55, 1.0); }',
    });
    this.markers = this.starts.map((s) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5, 40).rotateX(-Math.PI / 2), ringM);
      ring.position.y = 0.14;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true).translate(0, 20, 0), beamM);
      g.add(ring, beam);
      g.position.set(s.x, grid.height(s.x, s.z), s.z);
      scene.add(g);
      return g;
    });
    // strzałki na jezdni (instancje), bramki kontrolne, meta
    const sh = new THREE.Shape();
    sh.moveTo(1.1, 0); sh.lineTo(-0.5, 1.1); sh.lineTo(-0.5, 0.55); sh.lineTo(0.35, 0); sh.lineTo(-0.5, -0.55); sh.lineTo(-0.5, -1.1); sh.closePath();
    const arrowG = new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2);
    this.arrowM = new THREE.MeshBasicMaterial({ color: 0xffc82e, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, side: THREE.DoubleSide });
    this.MAXA = 400;
    this.arrows = new THREE.InstancedMesh(arrowG, this.arrowM, this.MAXA);
    this.arrows.frustumCulled = false; this.arrows.visible = false; this.arrows.renderOrder = 45;
    scene.add(this.arrows);
    this.gateM = new THREE.MeshBasicMaterial({ color: 0xffc82e, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    this.finishM = new THREE.MeshBasicMaterial({ map: checker(), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    this.gates = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sc = new THREE.Vector3(); this.p = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);font:bold 22px "Trebuchet MS",sans-serif;color:#fff;text-shadow:0 2px 4px #000;text-align:center;pointer-events:none;display:none;z-index:6';
    document.body.appendChild(this.hud);
    this.big = document.createElement('div');
    this.big.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);font:bold 110px "Trebuchet MS",sans-serif;color:#ffc82e;text-shadow:0 4px 10px #000;pointer-events:none;display:none;z-index:6';
    document.body.appendChild(this.big);
    this.hintT = 0;
  }

  // 3 punkty startu w mieście, daleko od siebie, przy ulicach z co najmniej dwiema krawędziami
  pickStarts() {
    const { traffic, city } = this, G = traffic.G, r = new Rng(hash(city.seed, 777));
    const cand = traffic.liveNodes.filter((i) => G.nodes[i].edges.length === 2 && city.terrain.inland(G.nodes[i].x, G.nodes[i].z) > 70);
    const out = [];
    for (let t = 0; t < 400 && out.length < 3; t++) {
      const i = cand[Math.floor(r.next() * cand.length)];
      if (i === undefined) break;
      const n = G.nodes[i];
      if (out.some((o) => Math.hypot(o.x - n.x, o.z - n.z) < 260)) continue;
      if (Math.hypot(n.x - city.spawn.x, n.z - city.spawn.z) < 40) continue;
      out.push({ node: i, x: n.x, z: n.z });
    }
    return out;
  }

  nearestNode(x, z) {
    const G = this.traffic.G;
    let best = -1, bd = 1e18;
    for (const i of this.traffic.liveNodes) { const d = (G.nodes[i].x - x) ** 2 + (G.nodes[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }

  // trasa: start → kilka punktów oddalonych o 250–420 m → węzły A* → prawy pas
  buildRoute(from, heading) {
    const { traffic, grid } = this, G = traffic.G;
    let nodes = [from], len = 0, dir = heading;
    for (let k = 0; k < 40 && len < 1300; k++) {
      dir += (Math.random() - 0.5) * 2.2;
      const last = G.nodes[nodes[nodes.length - 1]], d = 250 + Math.random() * 170;
      const to = this.nearestNode(last.x + Math.cos(dir) * d, last.z + Math.sin(dir) * d);
      if (to < 0 || to === nodes[nodes.length - 1]) continue;
      const path = astar(G, nodes[nodes.length - 1], to);
      if (!path || path.length < 2) continue;
      for (let i = 1; i < path.length; i++) nodes.push(path[i]);
      for (let ch = true; ch;) { ch = false; for (let i = 2; i < nodes.length; i++) if (nodes[i] === nodes[i - 2]) { nodes.splice(i - 1, 2); ch = true; break; } }
      len = 0;
      for (let i = 1; i < nodes.length; i++) len += Math.hypot(G.nodes[nodes[i]].x - G.nodes[nodes[i - 1]].x, G.nodes[nodes[i]].z - G.nodes[nodes[i - 1]].z);
    }
    if (nodes.length < 3) return null;
    const P = nodes.map((n) => [G.nodes[n].x, G.nodes[n].z]);
    const rw = nodes.map((n, i) => { const e = traffic.edgeBetween(n, i < nodes.length - 1 ? nodes[i + 1] : nodes[i - 1]); return e === undefined ? 3 : G.edges[e].rw; });
    const room = (x, z, h) => { const c = Math.cos(h), s = Math.sin(h); for (const [u, w] of [[1.9, -0.95], [1.9, 0.95], [-1.9, -0.95], [-1.9, 0.95]]) if (grid.solid(x + c * u - s * w, z + s * u + c * w)) return false; return true; };
    const R = P.map((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, h = Math.atan2(dz, dx);
      for (const k of [0.3, 0.15, 0, -0.15]) { const off = rw[i] * k, q = [p[0] - (dz / l) * off, p[1] + (dx / l) * off]; if (room(q[0], q[1], h)) return q; }
      return [p[0], p[1]];
    });
    // wygładzenie narożników (jedno przejście Chaikina), żeby strzałki i autopilot szły łukiem
    const S = [R[0]];
    for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1]; S.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    S.push(R[R.length - 1]);
    const cum = [0];
    for (let i = 1; i < S.length; i++) cum.push(cum[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
    return { R: S, cum, len: cum[cum.length - 1] };
  }

  at(s) {
    const { R, cum } = this.route;
    s = Math.max(0, Math.min(cum[cum.length - 1], s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [R[lo][0] + (R[hi][0] - R[lo][0]) * t, R[lo][1] + (R[hi][1] - R[lo][1]) * t, Math.atan2(R[hi][1] - R[lo][1], R[hi][0] - R[lo][0])];
  }

  // postęp po trasie: najbliższy punkt w oknie przed ostatnią pozycją
  progress(x, z, s0) {
    let best = 1e18, bs = s0;
    for (let s = Math.max(0, s0 - 6); s < s0 + 40; s += 1.5) { const p = this.at(s), d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < best) { best = d; bs = s; } }
    return { s: Math.max(s0, bs), d: Math.sqrt(best) };
  }

  start(st) {
    const G = this.traffic.G, car = this.car;
    const route = this.buildRoute(st.node, car.heading);
    if (!route) return;
    this.route = route;
    this.state = 'count'; this.t = 0; this.st = st;
    this.markers.forEach((m) => { m.visible = false; });
    // rywale ustawieni przed taksówką na trasie, gracz na końcu stawki
    this.rivals = RIVALS.map(([kind, color, vmax], i) => {
      const v = new Vehicle(this.kit ? this.scene : null, this.grid, this.M, this.kit, kind, color); // bez zestawu modeli (symulacja): sama fizyka
      v.active = true;
      v.obstacles = (x, z) => this.traffic.near(x, z, 6);
      const s = [26, 18, 2][i], [x, z, h] = this.at(s); // stawka: dwóch rywali przed taksówką, jeden za nią
      v.place(x, z, h);
      v.auto = { steer: 0, v: 0 };
      const drv = this.crowd ? this.crowd.add(makeStyle(new Rng(hash(i, 91)), {}), { sit: 1, sitT: 1 }) : null;
      return { v, s, vmax, stuck: 0, done: 0, drv };
    });
    const [x, z, h] = this.at(10);
    car.place(x, z, h);
    this.ps = 10; this.cp = 1; this.off = 0;
    // bramki co ~200 m, meta na końcu
    const n = Math.max(2, Math.round(route.len / 200));
    this.cps = [];
    for (let k = 1; k <= n; k++) this.cps.push((route.len * k) / n);
    this.gates = this.cps.map((s, k) => {
      const [gx, gz, gh] = this.at(s), last = k === this.cps.length - 1;
      const w = 9.5, mesh = new THREE.Mesh(last ? new THREE.PlaneGeometry(w, 1.6) : new THREE.TorusGeometry(w / 2, 0.18, 6, 32, Math.PI), last ? this.finishM : this.gateM.clone());
      const gy = this.grid.height(gx, gz);
      if (last) { mesh.position.set(gx, gy + 4.6, gz); mesh.rotation.y = -gh + Math.PI / 2; const pm = new THREE.MeshBasicMaterial({ color: 0xffffff }); for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6), pm); post.position.set(sd * w / 2, -2.3, 0); mesh.add(post); } }
      else { mesh.position.set(gx, gy, gz); mesh.rotation.y = -gh + Math.PI / 2; }
      this.scene.add(mesh);
      return mesh;
    });
    this.buildSigns();
    this.placeArrows();
    this.arrows.visible = true;
    this.hud.style.display = 'block';
    this.job.say('Wyścig! Jedź za żółtymi strzałkami, przejedź przez bramki do mety.', 4);
  }

  // Znaki ostrego skrętu: tam, gdzie trasa zmienia kierunek o > ~55° na 28 m, tablica ze strzałką
  // stoi przed zakrętem po zewnętrznej stronie łuku, zwrócona do nadjeżdżających.
  buildSigns() {
    const tex = (dir) => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#111'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ffc82e'; g.fillRect(6, 6, 116, 116);
      g.save(); g.translate(64, 64); g.scale(dir, 1);
      g.fillStyle = '#111';
      for (const x of [-26, 10]) { g.beginPath(); g.moveTo(x, -38); g.lineTo(x + 30, 0); g.lineTo(x, 38); g.lineTo(x - 15, 38); g.lineTo(x + 15, 0); g.lineTo(x - 15, -38); g.closePath(); g.fill(); }
      g.restore();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    if (!this.signTex) this.signTex = { 1: tex(1), '-1': tex(-1) };
    const grp = new THREE.Group(), pole = new THREE.MeshBasicMaterial({ color: 0x222222 });
    let last = -100;
    for (let s = 24; s < this.route.len - 20; s += 4) {
      const hIn = this.at(s - 14)[2], hOut = this.at(s + 14)[2], d = norm(hOut - hIn);
      if (Math.abs(d) < 0.95 || s - last < 45) continue;
      const h = this.at(s - 10), ex = Math.sin(h[2]) * -Math.sign(d), ez = -Math.cos(h[2]) * -Math.sign(d); // zewnętrzna strona łuku
      let pos = null;
      for (const off of [5.4, 4.4, 6.6]) { const x = h[0] + ex * off, z = h[1] + ez * off; if (!this.grid.solid(x, z) && !this.grid.solid(x + ex, z + ez)) { pos = [x, z]; break; } }
      if (!pos) continue;
      last = s;
      const y = this.grid.height(pos[0], pos[1]), g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), pole); post.position.y = 1.2;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: this.signTex[d > 0 ? 1 : -1], side: THREE.DoubleSide }));
      board.position.y = 2.7;
      g.add(post, board);
      g.position.set(pos[0], y, pos[1]);
      g.rotation.y = Math.atan2(-Math.cos(h[2]), -Math.sin(h[2]));
      grp.add(g);
    }
    this.signs = grp;
    this.scene.add(grp);
  }

  placeArrows() {
    const { m, q, sc, p, up } = this;
    let k = 0;
    for (let s = 6; s < this.route.len - 4 && k < this.MAXA; s += 7) {
      const vis = s > this.ps - 8 && s < this.ps + 170;
      const [x, z, h] = this.at(s);
      p.set(x, this.grid.height(x, z) + 0.13, z);
      q.setFromAxisAngle(up, -h);
      sc.setScalar(vis ? 1 : 0);
      m.compose(p, q, sc);
      this.arrows.setMatrixAt(k++, m);
    }
    this.arrows.count = k;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  drive(r, dt, lead) {
    const car = r.v;
    r.s = this.progress(car.pos.x, car.pos.z, r.s).s;
    const Ld = Math.max(4.5, Math.min(14, 3.5 + Math.abs(car.v) * 0.75));
    // wyprzedzanie: auto wyścigu (taksówka albo inny rywal) tuż przed maską → zjazd 2,6 m w lewo,
    // jeśli tam jest miejsce; po minięciu powrót na linię trasy
    const fc = Math.cos(car.heading), fs = Math.sin(car.heading);
    let block = false;
    for (const o of [this.car, ...this.rivals.map((q) => q.v)]) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z, al = dx * fc + dz * fs, lat = -dx * fs + dz * fc;
      if (al > 0 && al < 18 && Math.abs(lat - (r.lo || 0) * -2.6) < 2.4) block = true;
    }
    const tp0 = this.at(r.s + 10), lx = Math.sin(tp0[2]) * 2.6, lz = -Math.cos(tp0[2]) * 2.6;
    const room = !this.grid.solid(tp0[0] + lx * 1.3, tp0[1] + lz * 1.3) && !this.grid.solid(car.pos.x + lx, car.pos.z + lz);
    r.want = block && room ? 1 : block ? r.want || 0 : (r.passT = (r.passT || 0) + dt) > 1.2 ? 0 : r.want || 0;
    if (block) r.passT = 0;
    r.lo = (r.lo || 0) + ((r.want || 0) - (r.lo || 0)) * Math.min(1, dt * 1.8);
    const tq = this.at(r.s + Ld), tp = [tq[0] + Math.sin(tq[2]) * 2.6 * r.lo, tq[1] - Math.cos(tq[2]) * 2.6 * r.lo, tq[2]];
    const alpha = norm(Math.atan2(tp[1] - car.pos.z, tp[0] - car.pos.x) - car.heading);
    const delta = Math.atan((2 * (car.wb || 2.4) * Math.sin(alpha)) / Ld);
    const steer = Math.max(-1, Math.min(1, delta / car.steerMax()));
    const turn = Math.abs(norm(this.at(r.s + 26)[2] - this.at(r.s + 5)[2]));
    // gumowanie: przed graczem trochę wolniej, za nim trochę szybciej
    const vmax = r.vmax * (1 + Math.max(-0.2, Math.min(0.12, (lead - r.s) / 250)));
    let v = Math.max(5.5, Math.min(vmax, Math.sqrt(((r.lat || 8.2) * 21) / Math.max(turn, 0.05)))); // rywale biorą zakręty odważniej niż autopilot filmu
    const need = Math.atan((car.wb || 2.4) * Math.abs((2 * Math.sin(alpha)) / Ld));
    while (v > 4 && need > 0.9 * car.steerMax(v)) v -= 0.5;
    // przeszkody przed maską: boty, inni rywale, taksówka
    const c = Math.cos(car.heading), sn = Math.sin(car.heading);
    let free = 99;
    const others = [this.car, ...this.rivals.map((o) => o.v)].filter((o) => o !== car);
    for (const d of [4, 7, 10, 14]) {
      const x = car.pos.x + c * d, z = car.pos.z + sn * d;
      for (const o of this.traffic.near(x, z, 6)) if (Math.hypot(o.x - x, o.z - z) < 2.4) free = Math.min(free, d);
      for (const o of others) if (Math.hypot(o.pos.x - x, o.pos.z - z) < (r.lo > 0.6 ? 1.6 : 2.2)) free = Math.min(free, d);
    }
    if (free < 99) v = Math.min(v, Math.max(0, (free - 5) * 1.2));
    r.stuck = car.v < 0.5 ? r.stuck + dt : 0;
    if (r.stuck > 2.5 && r.stuck - dt <= 2.5) this.traffic.removeNear(car.pos.x, car.pos.z, 9);
    if (r.stuck > 5) { const [x, z, h] = this.at(r.s + 12); car.place(x, z, h); r.s += 12; r.stuck = 0; }
    return { steer, v };
  }

  stop(msg) {
    for (const r of this.rivals || []) { this.scene.remove(r.v.mesh); if (r.drv) this.crowd.remove(r.drv); }
    for (const g of this.gates) this.scene.remove(g);
    this.gates = [];
    if (this.signs) { this.scene.remove(this.signs); this.signs = null; } this.rivals = null; this.route = null;
    this.arrows.visible = false;
    this.hud.style.display = 'none';
    this.big.style.display = 'none';
    this.cool.set(this.st.node, performance.now() + 45000);
    this.state = 'idle';
    if (msg) this.job.say(msg, 6);
  }

  update(dt, inCar) {
    const car = this.car;
    if (this.state === 'idle') {
      const now = performance.now();
      this.starts.forEach((s, i) => { this.markers[i].visible = !(this.cool.get(s.node) > now); this.markers[i].children[0].rotation.y += dt * 0.6; });
      if (!inCar) return;
      for (const s of this.starts) {
        if (this.cool.get(s.node) > now) continue;
        const d = Math.hypot(car.pos.x - s.x, car.pos.z - s.z);
        if (d < 5 && Math.abs(car.v) < 6) { this.start(s); return; }
        if (d < 40 && (this.hintT -= dt) < 0) { this.hintT = 8; this.job.say('Wyścig uliczny: wjedź powoli w zielony pierścień, żeby wystartować.', 4); }
      }
      return;
    }
    if (!inCar) { this.stop('Wyścig przerwany — wysiadłeś z auta.'); return; }
    this.t += dt;
    if (this.state === 'count') {
      const [x, z, h] = this.at(10);
      car.place(x, z, h);
      for (const r of this.rivals) r.v.auto = { steer: 0, v: 0 };
      const n = 3 - Math.floor(this.t);
      this.big.style.display = 'block';
      this.big.textContent = n > 0 ? String(n) : 'START!';
      if (this.t > 3) { this.state = 'run'; this.t = 0; }
    } else if (this.state === 'run') {
      if (this.t > 1) this.big.style.display = 'none';
      const pr = this.progress(car.pos.x, car.pos.z, this.ps);
      this.ps = pr.s;
      // bramki: zaliczone po kolei (gracz musi przez nie przejechać, czyli być blisko trasy)
      while (this.cp - 1 < this.cps.length && this.ps >= this.cps[this.cp - 1] && pr.d < 9) {
        const g = this.gates[this.cp - 1];
        if (this.cp < this.cps.length) g.visible = false;
        this.cp++;
      }
      this.gates.forEach((g, k) => { if (k === this.cp - 1 && g.material !== this.finishM) g.material.color.setHex(0x3dff8a); });
      this.off = pr.d > 35 ? this.off + dt : 0;
      if (this.off > 12) { this.stop('Wyścig przerwany — zgubiłeś trasę.'); return; }
      for (const r of this.rivals) {
        if (r.done) { r.v.auto = { steer: 0, v: 0 }; continue; }
        r.v.auto = this.drive(r, dt, this.ps);
        if (r.s >= this.route.len - 3) r.done = this.t;
      }
      for (const r of this.rivals) {
        r.v.update(dt, NOKEYS, [0, 0]);
        if (r.drv) { const a = r.v.anchorWorld('driver', this.p); r.drv.x = a.x; r.drv.y = a.y - 0.12; r.drv.z = a.z; r.drv.yaw = r.v.heading; r.drv.steer = r.v.steer; r.drv.speed = 0; }
      }
      const place = 1 + this.rivals.filter((r) => r.done || r.s > this.ps).length;
      this.acc = (this.acc || 0) + dt;
      if (this.acc > 0.25) { this.acc = 0; this.placeArrows(); }
      this.hud.innerHTML = `Miejsce ${place}/${this.rivals.length + 1} · bramka ${Math.min(this.cp, this.cps.length)}/${this.cps.length}<br><span style="font-size:15px">${Math.round(this.ps)} / ${Math.round(this.route.len)} m · ${this.t.toFixed(1)} s</span>`;
      if (this.cp > this.cps.length) {
        const prize = PRIZE[place - 1];
        this.job.money += prize;
        this.big.style.display = 'block';
        this.big.style.fontSize = '64px';
        this.big.textContent = place === 1 ? 'ZWYCIĘSTWO!' : `META · ${place}. miejsce`;
        setTimeout(() => { this.big.style.display = 'none'; this.big.style.fontSize = '110px'; }, 3500);
        this.stop(`Meta! ${place}. miejsce na ${this.rivals.length + 1}, czas ${this.t.toFixed(1)} s${prize ? ` · nagroda ${prize} zł` : ''}.`);
      }
    }
    if (this.rivals) for (const r of this.rivals) if (this.state === 'count') { r.v.update(dt, NOKEYS, [0, 0]); if (r.drv) { const a = r.v.anchorWorld('driver', this.p); r.drv.x = a.x; r.drv.y = a.y - 0.12; r.drv.z = a.z; r.drv.yaw = r.v.heading; } }
  }

  // minimapa: zielone flagi startów, trasa i rywale
  drawMap(ctx, P) {
    if (this.state === 'idle') {
      const now = performance.now();
      ctx.fillStyle = '#3dff8a';
      for (const s of this.starts) { if (this.cool.get(s.node) > now) continue; const [x, y] = P([s.x, s.z]); ctx.fillRect(x - 1, y - 9, 2, 10); ctx.fillRect(x + 1, y - 9, 6, 4); }
      return;
    }
    if (!this.route) return;
    ctx.strokeStyle = '#ffc82e'; ctx.lineWidth = 2; ctx.beginPath();
    this.route.R.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#ff5a3c';
    for (const r of this.rivals) { const [x, y] = P([r.v.pos.x, r.v.pos.z]); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  }
}

function checker() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
