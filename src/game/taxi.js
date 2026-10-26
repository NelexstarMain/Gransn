// Praca taksówkarza: pasażerowie (ludzie z tłumu) czekają na chodnikach i machają,
// podjedź, zatrzymaj się obok — podejdą, wsiądą na tylną ławkę, zawieź do celu, wysiądą
// i pójdą dalej jako zwykli przechodnie. Opłata zależy od odległości; premia za czas.
import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { T_STREET } from '../city/grid.js';
import { makeStyle } from './rig.js';

const STREETS = ['Portowa', 'Lipowa', 'Rybacka', 'Mostowa', 'Ogrodowa', 'Latarników', 'Kolejowa', 'Słoneczna', 'Klonowa', 'Bursztynowa', 'Rynek', 'Nadbrzeżna', 'Kwiatowa', 'Wydmowa', 'Parkowa', 'Młyńska', 'Żeglarska', 'Topolowa', 'Kasztanowa', 'Szkolna'];

export class TaxiJob {
  constructor(scene, city, M, crowd = null, peds = null) {
    this.scene = scene;
    this.city = city;
    this.M = M;
    this.crowd = crowd;
    this.peds = peds;
    this.rng = new Rng(4711);
    this.money = 0;
    this.trips = 0;
    this.waiting = [];
    this.fare = null;
    this.msg = null;
    this.rider = null;     // pasażer w aucie
    this.boarding = null;  // pasażer idący do drzwi
    this.v = new THREE.Vector3();
    // punkty postoju: chodniki tuż przy jezdni (miasto), bez innych obiektów
    const g = city.grid;
    const busy = city.props.map((p) => p.p).concat(city.lamps.map((l) => l.p), city.trees.map((t) => t.p), city.benches.map((x) => x.p));
    const occ = new Set(busy.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`));
    this.stands = [];
    for (let v = 0; v < g.N; v++) {
      if (g.TY[v] !== T_STREET || !g.nearBld[v] || g.ZN[v] === 3) continue;
      const c = g.CL[v];
      if (c < 0.6 || c > 3.5 || occ.has(`${Math.round(g.X[v])},${Math.round(g.Z[v])}`)) continue;
      this.stands.push([g.X[v], g.Z[v]]);
    }
    this.ringGeo = new THREE.RingGeometry(1.6, 2.1, 32).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85, depthWrite: false });
    const beamGeo = new THREE.CylinderGeometry(2.4, 2.4, 60, 24, 1, true);
    beamGeo.translate(0, 30, 0);
    this.target = new THREE.Group();
    this.target.add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x46e08a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
    this.target.add(new THREE.Mesh(new THREE.RingGeometry(3.2, 4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x46e08a, transparent: true, opacity: 0.8, depthWrite: false })));
    this.target.visible = false;
    scene.add(this.target);
    this.t = 0;
  }

  streetName(p) {
    return 'ul. ' + STREETS[Math.abs(Math.floor(p[0] * 0.07) * 31 + Math.floor(p[1] * 0.07)) % STREETS.length];
  }

  pickStand(from, dMin, dMax) {
    for (let i = 0; i < 200; i++) {
      const s = this.stands[Math.floor(this.rng.next() * this.stands.length)];
      const d = Math.hypot(s[0] - from[0], s[1] - from[1]);
      if (d >= dMin && d <= dMax) return s;
    }
    return this.stands[Math.floor(this.rng.next() * this.stands.length)];
  }

  spawnPassenger(near) {
    const p = this.pickStand(near, 60, 380);
    const h = this.crowd.add(makeStyle(this.rng, {}), { x: p[0], z: p[1], y: this.grid.height(p[0], p[1]), yaw: this.rng.next() * 6.28 });
    if (!h) return false;
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.position.set(p[0], h.y + 0.05, p[1]);
    this.scene.add(ring);
    this.waiting.push({ p, h, ring, phase: this.rng.next() * 6 });
    return true;
  }

  say(text, t = 4) {
    this.msg = { text, t };
  }

  remove(w) {
    this.scene.remove(w.ring);
    this.crowd.remove(w.h);
  }

  update(dt, car, grid) {
    this.grid = grid;
    this.t += dt;
    const cp = [car.pos.x, car.pos.z];
    // utrzymuj ~8 czekających w okolicy
    this.waiting = this.waiting.filter((w) => {
      if (Math.hypot(w.p[0] - cp[0], w.p[1] - cp[1]) < 650) return true;
      this.remove(w);
      return false;
    });
    let guard = 0;
    while (this.waiting.length < 8 && this.stands.length && guard++ < 2) if (!this.spawnPassenger(cp)) break;
    for (const w of this.waiting) {
      const d = Math.hypot(w.p[0] - cp[0], w.p[1] - cp[1]), h = w.h;
      // patrzą na taksówkę i machają, gdy jest blisko i nie mają kursu
      const want = Math.atan2(cp[1] - w.p[1], cp[0] - w.p[0]);
      let dy = want - h.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (d < 90) h.yaw += dy * Math.min(1, dt * 3);
      h.waveT = !this.fare && d < 55 && !w.leaving ? 1 : 0;
      h.y = grid.height(w.p[0], w.p[1]);
      h.speed = 0;
      w.ring.scale.setScalar(1 + Math.sin(this.t * 4 + w.phase) * 0.08);
      w.ring.visible = d < 300;
    }
    const slow = Math.abs(car.v) < 2.5;
    if (this.boarding) this.board(dt, car);
    else if (!this.fare) {
      if (!slow || !car.active) return;
      const i = this.waiting.findIndex((w) => Math.hypot(w.p[0] - cp[0], w.p[1] - cp[1]) < 7);
      if (i < 0) return;
      const w = this.waiting.splice(i, 1)[0];
      this.scene.remove(w.ring);
      w.h.waveT = 0;
      w.h.speed = 0;
      this.boarding = w;
      w.t = 0;
      this.say('Pasażer idzie do drzwi…', 3);
      return;
    }
    if (!this.fare) return;
    const f = this.fare;
    f.left -= dt;
    this.target.rotation.y += dt;
    // pasażer siedzi na tylnej ławce, razem z zawieszeniem auta
    if (this.rider) {
      const h = this.rider.h;
      car.anchorWorld('rider', this.v);
      h.x = this.v.x; h.y = this.v.y - 0.1; h.z = this.v.z; h.yaw = car.heading; h.speed = 0;
    }
    if (slow && car.active && Math.hypot(f.dest[0] - cp[0], f.dest[1] - cp[1]) < 9) {
      const base = Math.round(6 + f.dist * 0.025);
      const tip = f.left > 0 ? Math.round(base * 0.4) : 0;
      this.money += base + tip;
      this.trips++;
      this.say(tip ? `Zapłacono ${base} zł + ${tip} zł napiwku. Dziękuję!` : `Zapłacono ${base} zł. Trochę za długo…`);
      this.fare = null;
      this.target.visible = false;
      if (this.rider) this.dropOff(car);
    }
  }

  // pasażer podchodzi do prawych tylnych drzwi i siada
  board(dt, car) {
    const w = this.boarding, h = w.h, K = car.K;
    w.t += dt;
    if (Math.abs(car.v) > 3.5 || w.t > 7) {
      // taksówka odjechała — pasażer zostaje i znów czeka
      this.boarding = null;
      w.ring.position.set(h.x, h.y + 0.05, h.z);
      this.scene.add(w.ring);
      w.p = [h.x, h.z];
      this.waiting.push(w);
      this.say('Odjechałeś. Pasażer wciąż czeka.', 3);
      return;
    }
    // drzwi: z boku, na wysokości tylnej ławki
    car.mesh.updateMatrixWorld(true);
    this.v.set(car.anchors.rider[0] + 0.2, 0, K.Wd / 2 + 0.55).applyMatrix4(car.mesh.matrixWorld);
    const dx = this.v.x - h.x, dz = this.v.z - h.z, d = Math.hypot(dx, dz);
    if (d > 0.5) {
      const sp = 2.1 * Math.min(1, d / 0.6 + 0.3), st = Math.min(d, sp * dt);
      h.x += (dx / d) * st; h.z += (dz / d) * st;
      let dy = Math.atan2(dz, dx) - h.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      h.yaw += dy * Math.min(1, dt * 8);
      h.speed = st / Math.max(dt, 1e-3);
      h.y = this.grid.height(h.x, h.z);
      return;
    }
    // wsiadł: siedzi
    this.boarding = null;
    this.rider = w;
    h.sitT = 1; h.speed = 0;
    const pr = this.rng;
    const dest = this.pickStand([car.pos.x, car.pos.z], 250, 900), cp = [car.pos.x, car.pos.z];
    const dd = Math.hypot(dest[0] - cp[0], dest[1] - cp[1]);
    this.fare = { dest, from: cp.slice(), dist: dd, time: Math.round(dd / 8 + 25), left: Math.round(dd / 8 + 25), name: this.streetName(dest) };
    this.target.position.set(dest[0], this.grid.height(dest[0], dest[1]), dest[1]);
    this.target.visible = true;
    void pr;
    this.say(`„Dzień dobry! Na ${this.fare.name}, proszę.”`);
  }

  // pasażer wysiada po prawej stronie i idzie dalej jako przechodzień
  dropOff(car) {
    const w = this.rider, h = w.h, K = car.K;
    this.rider = null;
    car.mesh.updateMatrixWorld(true);
    this.v.set(car.anchors.rider[0] + 0.2, 0, K.Wd / 2 + 1.0).applyMatrix4(car.mesh.matrixWorld);
    h.x = this.v.x; h.z = this.v.z; h.y = this.grid.height(h.x, h.z);
    h.sitT = 0; h.sit = 0.6; h.waveT = 0; h.yaw = car.heading + Math.PI / 2;
    if (!this.peds || !this.peds.adopt(h, h.x, h.z)) this.crowd.remove(h);
  }
}
