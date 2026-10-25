// Praca taksówkarza: pasażerowie czekają na chodnikach, podjedź, zatrzymaj
// się obok, zawieź do celu. Opłata zależy od odległości; premia za czas.
import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { T_STREET } from '../city/grid.js';
import { moduleMesh } from './vehicle.js';

const STREETS = ['Portowa', 'Lipowa', 'Rybacka', 'Mostowa', 'Ogrodowa', 'Latarników', 'Kolejowa', 'Słoneczna', 'Klonowa', 'Bursztynowa', 'Rynek', 'Nadbrzeżna', 'Kwiatowa', 'Wydmowa', 'Parkowa', 'Młyńska', 'Żeglarska', 'Topolowa', 'Kasztanowa', 'Szkolna'];
const SHIRTS = [[0.7, 0.2, 0.2], [0.2, 0.35, 0.65], [0.85, 0.8, 0.7], [0.3, 0.55, 0.3], [0.9, 0.6, 0.2], [0.5, 0.3, 0.6]];

export class TaxiJob {
  constructor(scene, city, M) {
    this.scene = scene;
    this.city = city;
    this.M = M;
    this.rng = new Rng(4711);
    this.money = 0;
    this.trips = 0;
    this.waiting = [];
    this.fare = null;
    this.msg = null;
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
    const ringGeo = new THREE.RingGeometry(1.6, 2.1, 32).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85, depthWrite: false });
    this.ringGeo = ringGeo;
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
    const r = this.rng;
    const mesh = moduleMesh('person', 0.6, 1.9, 0.4, {
      shirt: r.pick(SHIRTS), pants: r.pick([[0.15, 0.17, 0.25], [0.3, 0.28, 0.25], [0.1, 0.1, 0.1]]), skin: r.pick([[0.9, 0.75, 0.62], [0.75, 0.56, 0.42], [0.5, 0.36, 0.26]]),
      hat: r.chance(0.3) ? r.pick([[0.2, 0.2, 0.2], [0.6, 0.15, 0.15]]) : null,
    }, this.M);
    const y = this.grid.height(p[0], p[1]);
    mesh.position.set(p[0], y, p[1]);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.position.set(p[0], y + 0.05, p[1]);
    this.scene.add(mesh, ring);
    this.waiting.push({ p, mesh, ring, phase: r.next() * 6 });
  }

  say(text, t = 4) {
    this.msg = { text, t };
  }

  update(dt, car, grid) {
    this.grid = grid;
    this.t += dt;
    const cp = [car.pos.x, car.pos.z];
    // utrzymuj ~8 czekających w okolicy
    this.waiting = this.waiting.filter((w) => {
      if (Math.hypot(w.p[0] - cp[0], w.p[1] - cp[1]) < 650) return true;
      this.scene.remove(w.mesh, w.ring);
      return false;
    });
    while (this.waiting.length < 8 && this.stands.length) this.spawnPassenger(cp);
    for (const w of this.waiting) {
      w.mesh.rotation.y = Math.atan2(cp[0] - w.p[0], cp[1] - w.p[1]);
      w.mesh.position.y = grid.height(w.p[0], w.p[1]) + Math.abs(Math.sin(this.t * 3 + w.phase)) * 0.08;
      w.ring.scale.setScalar(1 + Math.sin(this.t * 4 + w.phase) * 0.08);
    }
    const slow = Math.abs(car.v) < 2.5;
    if (!this.fare) {
      if (!slow || !car.active) return;
      const i = this.waiting.findIndex((w) => Math.hypot(w.p[0] - cp[0], w.p[1] - cp[1]) < 7);
      if (i < 0) return;
      const w = this.waiting.splice(i, 1)[0];
      this.scene.remove(w.mesh, w.ring);
      // pasażer siada na tylnej ławce
      w.mesh.position.set(-1.05, 0.38, 0);
      w.mesh.rotation.set(0, Math.PI / 2, 0);
      car.mesh.add(w.mesh);
      this.rider = w.mesh;
      const dest = this.pickStand(cp, 250, 900);
      const d = Math.hypot(dest[0] - cp[0], dest[1] - cp[1]);
      this.fare = { dest, from: cp.slice(), dist: d, time: Math.round(d / 8 + 25), left: Math.round(d / 8 + 25), name: this.streetName(dest) };
      this.target.position.set(dest[0], grid.height(dest[0], dest[1]), dest[1]);
      this.target.visible = true;
      this.say(`„Dzień dobry! Na ${this.fare.name}, proszę.”`);
      return;
    }
    const f = this.fare;
    f.left -= dt;
    this.target.rotation.y += dt;
    if (slow && car.active && Math.hypot(f.dest[0] - cp[0], f.dest[1] - cp[1]) < 9) {
      const base = Math.round(6 + f.dist * 0.025);
      const tip = f.left > 0 ? Math.round(base * 0.4) : 0;
      this.money += base + tip;
      this.trips++;
      this.say(tip ? `Zapłacono ${base} zł + ${tip} zł napiwku. Dziękuję!` : `Zapłacono ${base} zł. Trochę za długo…`);
      this.fare = null;
      this.target.visible = false;
      if (this.rider) { car.mesh.remove(this.rider); this.rider = null; }
    }
  }
}
