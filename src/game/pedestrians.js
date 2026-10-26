// ─────────────────────────────────────────────────────────────────────────────
//  SILNIK PIESZYCH — własna symulacja NPC (bez grafiki; rysuje ją Crowd).
//  • Chodniki: pas wzdłuż każdej krawędzi grafu dróg po prawej stronie kierunku marszu
//    (odstęp od krawędzi jezdni `c` różny dla każdego), na skrzyżowaniu: skręt w stronę
//    własnej strony = cięcie rogu, prosto / w drugą stronę = przejście przez jezdnię.
//  • Zachowania: marsz, postój (rozglądanie się), czekanie na krawężniku aż auta będą
//    daleko, omijanie latarni i drzew (boczne przesunięcie), unik przed autem, panika po
//    strzale (ucieczka, w tym zawrót), upadek po potrąceniu / trafieniu, potem znikają.
//  • Auta ustępują pieszym na jezdni: Traffic pyta o `ahead(...)`.
//  Zachowuje kolejność: ten sam seed → ta sama populacja startowa (Rng, bez Math.random).
// ─────────────────────────────────────────────────────────────────────────────
import { Rng } from '../core/rng.js';
import { makeStyle } from './rig.js';
import { GROUND, WALK, COURT, PLAZA, ROAD, BRIDGE, SOLID } from './collision.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const WALKABLE = new Set([WALK, COURT, PLAZA, GROUND]);

export class Pedestrians {
  constructor(city, grid, G, crowd, count, seed = 31337) {
    this.city = city;
    this.grid = grid;
    this.G = G;
    this.crowd = crowd;
    this.count = count;
    this.rng = new Rng(seed);
    this.walkers = [];
    this.time = 0;
    this.cars = null;       // { bots, car } — ustawiane w update()
    this.onEvent = null;    // (typ, x, z) → dźwięk / efekty
    this.stats = { downed: 0 };
    // promień jezdni przy węzłach (szerokość skrzyżowania) i lista spacerowych krawędzi
    this.nodeRw = G.nodes.map((n) => n.edges.reduce((m, e) => Math.max(m, G.edges[e].rw), 0));
    this.edges = [];
    G.edges.forEach((E, i) => { if (!E.bridge && E.len > 9 && G.live[E.a]) this.edges.push(i); });
    // siatka krawędzi do szybkiego szukania najbliższej (adopcja pasażera)
    this.cell = 60;
    this.hash = new Map();
    for (const i of this.edges) {
      const E = G.edges[i], A = G.nodes[E.a], B = G.nodes[E.b], n = Math.max(1, Math.ceil(E.len / 30));
      for (let k = 0; k <= n; k++) {
        const x = A.x + ((B.x - A.x) * k) / n, z = A.z + ((B.z - A.z) * k) / n, key = Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell);
        let l = this.hash.get(key);
        if (!l) this.hash.set(key, (l = []));
        if (!l.includes(i)) l.push(i);
      }
    }
    this._lp = { x: 0, z: 0, ux: 1, uz: 0, nx: 0, nz: 1 };
  }

  // ── pas ruchu: punkt na krawędzi e od węzła a, w odległości d, po stronie side (+1 prawa) ──
  lane(e, a, d, side, c, out = this._lp) {
    const E = this.G.edges[e], A = this.G.nodes[a], B = this.G.nodes[E.a === a ? E.b : E.a];
    const ux = (B.x - A.x) / E.len, uz = (B.z - A.z) / E.len, nx = -uz, nz = ux, off = side * (E.rw + c);
    out.x = A.x + ux * d + nx * off;
    out.z = A.z + uz * d + nz * off;
    out.ux = ux; out.uz = uz; out.nx = nx; out.nz = nz;
    return out;
  }

  trim(node, c) {
    return this.nodeRw[node] + c + 0.4;
  }

  heightAt(x, z) {
    return this.grid.height(x, z);
  }

  // ── tworzenie ──
  makeWalker(h, e, a, d, side, c) {
    const r = this.rng;
    return {
      h, e, a, b: this.other(e, a), d, side, c, lat: 0, latT: 0, fx: 0, fz: 0, mode: 'walk', modeT: 0, vmax: h.style.child ? r.float(1.4, 1.9) : r.float(1.05, 1.6),
      v: 0, corner: null, onRoad: false, stuck: 0, kx: 0, kz: 0, dead: 0, panic: 0, nextPause: r.float(6, 40), age: 0, jay: false,
    };
  }

  other(e, a) {
    const E = this.G.edges[e];
    return E.a === a ? E.b : E.a;
  }

  spawn(P, view) {
    const r = this.rng;
    for (let tries = 0; tries < 30; tries++) {
      const e = this.edges[Math.floor(r.next() * this.edges.length)], E = this.G.edges[e];
      const rev = r.chance(0.5), a = rev ? E.b : E.a, c = r.float(1.0, 1.9);
      const d0 = this.trim(a, c), d1 = E.len - this.trim(this.other(e, a), c);
      if (d1 - d0 < 2) continue;
      const d = r.float(d0, d1), p = this.lane(e, a, d, 1, c);
      const dx = p.x - P.x, dz = p.z - P.z, dist = Math.hypot(dx, dz);
      if (dist < 25 || dist > 150) continue;
      // nie pojawiaj się na oczach gracza
      if (view && dist < 95 && (dx * view.x + dz * view.z) / dist > 0.35) continue;
      const t = this.grid.type(p.x, p.z);
      if (!WALKABLE.has(t) || this.grid.solid(p.x, p.z)) continue;
      const h = this.crowd.add(makeStyle(r));
      if (!h) return null;
      h.x = p.x; h.z = p.z; h.y = this.heightAt(p.x, p.z); h.yaw = Math.atan2(p.uz, p.ux);
      const w = this.makeWalker(h, e, a, d, 1, c);
      this.walkers.push(w);
      return w;
    }
    return null;
  }

  // piesza osoba z zewnątrz (pasażer wysiadający z taksówki) wchodzi w obieg
  adopt(h, x, z) {
    const key = Math.floor(x / this.cell), zk = Math.floor(z / this.cell);
    let best = null, bd = 1e9, bu = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const e of this.hash.get((key + i) * 100003 + zk + j) || []) {
      const E = this.G.edges[e], A = this.G.nodes[E.a], B = this.G.nodes[E.b];
      const ux = (B.x - A.x) / E.len, uz = (B.z - A.z) / E.len;
      const u = clamp(((x - A.x) * ux + (z - A.z) * uz), 0, E.len), px = A.x + ux * u, pz = A.z + uz * u, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = e; bu = u; }
    }
    if (best == null) return null;
    const E = this.G.edges[best], c = clamp(bd - E.rw, 1.0, 1.9);
    const A = this.G.nodes[E.a], B = this.G.nodes[E.b];
    const side = ((x - A.x) * -((B.z - A.z) / E.len) + (z - A.z) * ((B.x - A.x) / E.len)) >= 0 ? 1 : -1;
    // idź w tę stronę, w którą jest kierunek patrzenia (prawa strona ↔ a→b)
    const dirAB = Math.cos(h.yaw) * ((B.x - A.x) / E.len) + Math.sin(h.yaw) * ((B.z - A.z) / E.len) >= 0;
    const a = dirAB ? E.a : E.b, d = dirAB ? bu : E.len - bu;
    const w = this.makeWalker(h, best, a, clamp(d, this.trim(a, c), Math.max(this.trim(a, c), E.len - this.trim(this.other(best, a), c))), dirAB ? side : -side, c);
    this.walkers.push(w);
    return w;
  }

  // ── zagrożenie od aut: czy do punktu (x,z) zbliża się samochód ──
  danger(x, z) {
    const C = this.cars;
    if (!C) return false;
    const check = (cx, cz, h, v) => {
      if (v < 0.7) return false;
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d > 7 + v * 2.4) return false;
      return d < 5 || (dx * Math.cos(h) + dz * Math.sin(h)) / d > 0.3;
    };
    for (const b of C.bots) if (Math.abs(b.x - x) < 30 && Math.abs(b.z - z) < 30 && check(b.x, b.z, b.h, b.v)) return true;
    const car = C.car;
    return !!(car && check(car.pos.x, car.pos.z, car.heading, Math.abs(car.v)));
  }

  // odległość do najbliższego pieszego przed autem (x,z; kierunek f), albo -1
  ahead(x, z, fx, fz, range, halfW) {
    let best = -1;
    for (const w of this.walkers) {
      if (w.mode === 'down' || (!w.onRoad && w.mode !== 'cross')) continue;
      const dx = w.h.x - x, dz = w.h.z - z, along = dx * fx + dz * fz;
      if (along < 0.3 || along > range || Math.abs(-dx * fz + dz * fx) > halfW) continue;
      if (best < 0 || along < best) best = along;
    }
    return best;
  }

  // ── trafienia ──
  down(w, dx, dz, power = 1) {
    if (w.mode === 'down') return;
    w.mode = 'down';
    w.modeT = 0;
    w.dead = 0;
    const l = Math.hypot(dx, dz) || 1;
    w.h.fallDx = dx / l; w.h.fallDz = dz / l;
    w.kx = (dx / l) * power * 2.4; w.kz = (dz / l) * power * 2.4;
    w.h.speed = 0; w.h.waveT = 0;
    this.stats.downed++;
    if (this.onEvent) this.onEvent('down', w.h.x, w.h.z);
    this.panicAround(w.h.x, w.h.z, 38, w);
  }

  panicAround(x, z, r, except = null) {
    for (const w of this.walkers) {
      if (w === except || w.mode === 'down') continue;
      const d = Math.hypot(w.h.x - x, w.h.z - z);
      if (d < r) { w.panic = Math.max(w.panic, 5 + (r - d) * 0.15); w.threat = { x, z }; }
    }
  }

  // piesi potrąceni przez auto (box wokół auta); auto traci trochę pędu
  carHit(car) {
    const sp = Math.abs(car.v);
    if (sp < 2) return;
    const c = Math.cos(car.heading), s = Math.sin(car.heading), hl = car.L / 2 + 0.25, hw = car.W / 2 + 0.25;
    for (const w of this.walkers) {
      if (w.mode === 'down') continue;
      const dx = w.h.x - car.pos.x, dz = w.h.z - car.pos.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const along = dx * c + dz * s, lat = -dx * s + dz * c;
      if (Math.abs(along) < hl && Math.abs(lat) < hw) {
        this.down(w, c * Math.sign(car.v) + (-s) * lat * 0.4, s * Math.sign(car.v) + c * lat * 0.4, clamp(sp / 8, 0.4, 2));
        car.vx *= 0.93; car.vz *= 0.93;
        car.shake = Math.min(1, car.shake + 0.15);
      }
    }
  }

  // promień → najbliższy stojący pieszy (walec); { t, w, head }
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    const hlen = Math.hypot(dx, dz) || 1e-9;
    for (const w of this.walkers) {
      if (w.mode === 'down') continue;
      const h = w.h, rx = h.x - ox, rz = h.z - oz;
      if (rx * rx + rz * rz > (maxT + 2) * (maxT + 2)) continue;
      const R = 0.3 * h.style.w + 0.04;
      // najbliższe zbliżenie w płaszczyźnie xz
      const tc = (rx * dx + rz * dz) / (hlen * hlen), px = ox + dx * tc - h.x, pz = oz + dz * tc - h.z;
      const d2 = px * px + pz * pz;
      if (d2 > R * R || tc < 0) continue;
      const t = tc - Math.sqrt(R * R - d2) / hlen;
      if (t < 0 || t > maxT) continue;
      const y = oy + dy * t, top = h.style.h * 1.78;
      if (y < h.y - 0.05 || y > h.y + top + 0.2) continue;
      if (!best || t < best.t) best = { t, w, head: y > h.y + top * 0.83 };
    }
    return best;
  }

  shoot(w, fromX, fromZ) {
    this.down(w, w.h.x - fromX, w.h.z - fromZ, 0.9);
  }

  // ── pętla ──
  update(dt, P, cars, view) {
    this.time += dt;
    this.cars = cars;
    const r = this.rng;
    // utrzymuj populację wokół gracza
    let n = 0;
    for (let i = 0; i < this.walkers.length; i++) {
      const w = this.walkers[i], d = Math.hypot(w.h.x - P.x, w.h.z - P.z);
      if (d > 210 || w.dead > 8) { this.crowd.remove(w.h); continue; }
      this.walkers[n++] = w;
    }
    this.walkers.length = n;
    if (this.walkers.length < this.count) this.spawn(P, view);
    for (const w of this.walkers) this.step(w, dt, P);
  }

  step(w, dt, P) {
    const h = w.h, G = this.G, grid = this.grid;
    w.age += dt;
    w.modeT += dt;
    // upadek: animacja, poślizg, leżenie, znikanie
    if (w.mode === 'down') {
      h.fall = Math.min(1, h.fall + dt * 2.2);
      h.speed = 0;
      const k = Math.max(0, 1 - w.modeT * 2.2);
      const nx = h.x + w.kx * k * dt, nz = h.z + w.kz * k * dt;
      if (!grid.solid(nx, nz)) { h.x = nx; h.z = nz; }
      h.y = this.heightAt(h.x, h.z);
      w.dead += dt;
      if (w.dead > 6) h.y -= (w.dead - 6) * 0.5; // zapada się pod ziemię i znika
      return;
    }
    if (w.panic > 0) { w.panic -= dt; if (w.panic <= 0) { w.mode = 'walk'; } }
    const panicking = w.panic > 0;
    // postój
    if (w.mode === 'pause') {
      h.speed = 0;
      h.sitT = 0;
      if (w.modeT > w.pauseLen) { w.mode = 'walk'; w.nextPause = this.rng.float(10, 50); }
      h.y = this.heightAt(h.x, h.z);
      return;
    }
    if (w.mode === 'wait') {
      h.speed = 0;
      if (!this.danger(w.waitX, w.waitZ) || w.modeT > 9) { w.mode = 'walk'; w.crossOk = this.time + 3; }
      h.y = this.heightAt(h.x, h.z);
      return;
    }
    // losowy postój i rozglądanie się
    if (!panicking && !w.corner && w.age > w.nextPause && this.rng.chance(dt * 0.15) && !w.onRoad) {
      w.mode = 'pause'; w.modeT = 0; w.pauseLen = this.rng.float(2, 8); w.nextPause = 1e9;
      return;
    }
    // ucieczka od zagrożenia: tempo i kierunek
    let want = panicking ? 3.9 : w.vmax;
    if (panicking && w.threat && !w.corner) this.fleeDir(w);
    w.v += (want * (w.onRoad ? 1.2 : 1) - w.v) * Math.min(1, dt * 4);
    let step = w.v * dt;

    // unik przed autem: przesunięcie bocznie poza tor jazdy
    const C = this.cars;
    if (C) {
      const dodge = (cx, cz, ch, cv) => {
        if (cv < 2.2) return;
        const dx = h.x - cx, dz = h.z - cz, c = Math.cos(ch), s = Math.sin(ch), along = dx * c + dz * s, lat = -dx * s + dz * c;
        if (along > -2 && along < 3.5 + cv * 0.9 && Math.abs(lat) < 2.2) {
          const sg = lat >= 0 ? 1 : -1;
          w.fx += -s * sg * dt * 7; w.fz += c * sg * dt * 7;
          step *= 1.15;
          if (w.v < 3) w.v = Math.min(3.2, w.v + dt * 8);
        }
      };
      for (const b of C.bots) if (Math.abs(b.x - h.x) < 14 && Math.abs(b.z - h.z) < 14) dodge(b.x, b.z, b.h, b.v);
      if (C.car) dodge(C.car.pos.x, C.car.pos.z, C.car.heading, Math.abs(C.car.v));
    }
    const fl = Math.hypot(w.fx, w.fz);
    if (fl > 3) { w.fx *= 3 / fl; w.fz *= 3 / fl; }
    if (fl > 0) { const decay = Math.exp(-dt * 0.9); w.fx *= decay; w.fz *= decay; }

    // ruch: po pasie albo przez narożnik — najpierw liczymy nowe położenie, stan zatwierdza commit()
    let px, pz, commit;
    if (w.corner) {
      const K = w.corner, t2 = Math.min(1, K.t + step / K.len);
      px = K.p0x + (K.p2x - K.p0x) * t2; pz = K.p0z + (K.p2z - K.p0z) * t2;
      commit = () => {
        K.t = t2;
        if (t2 >= 1) { w.e = K.e; w.a = K.a; w.b = this.other(K.e, K.a); w.d = K.d; w.side = K.side; w.corner = null; w.lat = 0; w.latT = 0; }
      };
    } else {
      const E = G.edges[w.e], dEnd = Math.max(this.trim(w.a, w.c), E.len - this.trim(w.b, w.c));
      this.avoid(w, dt); // przeszkody na pasie: omiń bokiem
      const nd = w.d + step;
      const L = this.lane(w.e, w.a, Math.min(nd, dEnd), w.side, w.c);
      px = L.x + L.nx * w.lat * w.side; pz = L.z + L.nz * w.lat * w.side;
      commit = () => { if (nd >= dEnd) this.beginCorner(w); else w.d = nd; };
    }
    px += w.fx; pz += w.fz;
    // przejście przez jezdnię: poczekaj na krawężniku, aż auta będą daleko
    const t = grid.type(px, pz), onRoadNext = t === ROAD || t === BRIDGE;
    if (onRoadNext && !w.onRoad && !panicking && this.time > (w.crossOk || 0) && this.danger(px, pz)) {
      w.mode = 'wait'; w.modeT = 0; w.waitX = px; w.waitZ = pz; h.speed = 0;
      return;
    }
    w.onRoad = onRoadNext;
    // wolne? (tereny zablokowane: budynki, woda)
    if (grid.solid(px, pz)) {
      w.stuck += dt;
      w.fx = 0; w.fz = 0;
      if (w.stuck > 2.5) { w.dead = 99; }
      return;
    }
    w.stuck = 0;
    commit();
    const mx = px - h.x, mz = pz - h.z, mv = Math.hypot(mx, mz);
    h.x = px; h.z = pz;
    h.y += (this.heightAt(px, pz) - h.y) * Math.min(1, dt * 14);
    h.speed = dt > 0 ? mv / dt : 0;
    if (mv > 1e-4) h.yaw += angDiff(h.yaw, Math.atan2(mz, mx)) * Math.min(1, dt * (panicking ? 12 : 7));
    h.look *= 0.9;
  }

  // omijanie latarni, drzew i ławek: boczne przesunięcie w obrębie pasa
  avoid(w, dt) {
    const grid = this.grid;
    const free = (lat, ahead) => {
      const q = this.lane(w.e, w.a, w.d + ahead, w.side, w.c);
      return !grid.solid(q.x + q.nx * lat * w.side, q.z + q.nz * lat * w.side);
    };
    if (!free(w.latT, 0.9) || !free(w.latT, 0.45)) {
      for (const lat of [0.8, -0.8, 1.5, -1.5, 0]) if (lat !== w.latT && free(lat, 0.9) && free(lat, 0.45) && free(lat, 1.6)) { w.latT = lat; break; }
    } else if (w.latT !== 0 && free(0, 1.4) && free(0, 2.2)) w.latT = 0;
    w.lat += clamp(w.latT - w.lat, -dt * 1.6, dt * 1.6);
  }

  // dojście do końca krawędzi: wybierz następną i narożnik
  beginCorner(w) {
    const G = this.G, node = w.b, E = G.edges[w.e];
    const A = G.nodes[w.a], B = G.nodes[node];
    const u1x = (B.x - A.x) / E.len, u1z = (B.z - A.z) / E.len;
    const cands = [];
    for (const e2 of B.edges) {
      if (e2 === w.e) continue;
      const E2 = G.edges[e2];
      if (E2.bridge || E2.len < 8 || !G.live[E2.a]) continue;
      const o = this.other(e2, node), O = G.nodes[o];
      const ux = (O.x - B.x) / E2.len, uz = (O.z - B.z) / E2.len;
      const cross = u1x * uz - u1z * ux, dot = u1x * ux + u1z * uz;
      let wgt = dot > 0.6 ? 3 : 2;
      if (w.panic > 0 && w.threat) wgt *= 0.2 + Math.max(0, (O.x - B.x) * (B.x - w.threat.x) + (O.z - B.z) * (B.z - w.threat.z)) / (Math.hypot(O.x - B.x, O.z - B.z) * Math.hypot(B.x - w.threat.x, B.z - w.threat.z) + 1e-6) * 3;
      cands.push({ e2, o, cross, dot, ux, uz, wgt });
    }
    const c = w.c;
    if (!cands.length) {
      // ślepy zaułek: zawróć po tej samej fizycznej stronie
      w.a = node; w.b = w.a === G.edges[w.e].a ? G.edges[w.e].b : G.edges[w.e].a;
      w.d = this.trim(node, c); w.side = -w.side; w.lat = 0; w.latT = 0;
      return;
    }
    let tot = 0;
    for (const k of cands) tot += k.wgt;
    let pick = this.rng.next() * tot, ch = cands[0];
    for (const k of cands) { if ((pick -= k.wgt) <= 0) { ch = k; break; } }
    // strona na nowej krawędzi: skręt w stronę własnej strony tnie róg, w drugą — przejście przez jezdnię
    const towards = ch.cross * w.side;
    const side2 = towards < -0.3 ? -w.side : w.side;
    const p0 = this.lane(w.e, w.a, Math.max(this.trim(w.a, c), E.len - this.trim(node, c)), w.side, c, { x: 0, z: 0, ux: 0, uz: 0, nx: 0, nz: 0 });
    const d2 = this.trim(node, c);
    const p2 = this.lane(ch.e2, node, d2, side2, c, { x: 0, z: 0, ux: 0, uz: 0, nx: 0, nz: 0 });
    const len = Math.hypot(p2.x - p0.x, p2.z - p0.z) + 0.01;
    w.corner = { p0x: p0.x, p0z: p0.z, p2x: p2.x, p2z: p2.z, len, t: 0, e: ch.e2, a: node, d: d2, side: side2, ux: (p2.x - p0.x) / len, uz: (p2.z - p0.z) / len };
    w.lat = 0; w.latT = 0;
  }

  // ucieczka: pas, który prowadzi od zagrożenia (zawróć, jeśli zagrożenie jest z przodu)
  fleeDir(w) {
    const h = w.h, L = this.lane(w.e, w.a, w.d, w.side, w.c);
    const dot = (w.threat.x - h.x) * L.ux + (w.threat.z - h.z) * L.uz;
    if (dot > 1 && w.panic > 0.5 && !w.turned) {
      // zagrożenie przed nami wzdłuż pasa → zawróć (ten sam fizyczny chodnik)
      const E = this.G.edges[w.e];
      w.a = w.b; w.b = this.other(w.e, w.a);
      w.d = E.len - w.d; w.side = -w.side; w.lat = -w.lat; w.latT = -w.latT;
      w.turned = true;
      void E;
    }
    if (w.panic < 0.3) w.turned = false;
  }
}
