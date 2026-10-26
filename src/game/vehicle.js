// Taksówka (wóz z ok. 1900 r.).
//  • Fizyka: prędkość jako WEKTOR niezależny od kursu → poślizg i drift na ręcznym;
//    przyspieszenie z krzywą momentu i trzema biegami (zmiana biegu na chwilę tnie moc),
//    hamulec/wsteczny, opór zależny od nawierzchni, tarcie boczne ograniczone przyczepnością.
//  • Zawieszenie: sprężyny tłumiące na przechył/pochylenie od przyspieszeń + nachylenie terenu.
//  • Koła się obracają (zablokowane tylne na ręcznym) i skręcają; tylne światła przy hamowaniu.
//  • Kolizje: sub-kroki, ślizg po ścianie, siła uderzenia (kamera, iskry, dźwięk), boty i piesi.
import * as THREE from 'three';
import { WHEEL_NOMINAL } from './carkit.js';
import { GROUND, WALK, COURT, PLAZA, BRIDGE } from './collision.js';

const GRAV = 9.8;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const NOKEYS = new Set();

export class Vehicle {
  constructor(scene, grid, M, kit, kind = 'taxi', color = [0.95, 0.76, 0.12]) {
    this.grid = grid;
    this.T = grid.T;
    this.city = grid.city;
    this.kind = kind;
    this.K = kit.kinds[kind];
    this.anchors = kit.anchors(kind);
    this.wb = this.K.L - this.K.front - this.K.rear; // rozstaw osi
    this.L = this.K.L;
    this.W = this.K.Wd;

    // root = pozycja i kurs, body = zawieszenie, koła w pivotach (skręt) → spin (obrót)
    this.mesh = new THREE.Group();
    this.body = new THREE.Group();
    this.mesh.add(this.body);
    this.tailMat = M.tail.clone();
    for (const p of kit.body(kind, 2, color)) {
      const m = new THREE.Mesh(p.geometry, p.name === 'tail' ? this.tailMat : p.material);
      m.castShadow = p.name !== 'light' && p.name !== 'tail';
      m.receiveShadow = true;
      this.body.add(m);
    }
    this.wheels = [];
    const solid = !!this.K.solid, nom = solid ? WHEEL_NOMINAL.solid : WHEEL_NOMINAL.spoke;
    const wparts = kit.wheel(solid, 2);
    for (const w of this.anchors.wheels) {
      const pivot = new THREE.Group(), spin = new THREE.Group();
      pivot.position.set(w.x, w.y, w.z);
      pivot.scale.setScalar(w.r / nom);
      for (const p of wparts) {
        const m = new THREE.Mesh(p.geometry, p.material);
        m.castShadow = true;
        m.receiveShadow = true;
        spin.add(m);
      }
      pivot.add(spin);
      this.body.add(pivot);
      this.wheels.push({ pivot, spin, front: w.front, r: w.r });
    }
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.heading = 0; // kierunek jazdy w płaszczyźnie (x,z): (cos, sin)
    this.vx = 0;
    this.vz = 0;
    this.v = 0;        // prędkość wzdłuż auta (ze znakiem)
    this.lat = 0;      // prędkość boczna (poślizg)
    this.yawRate = 0;
    this.steer = 0;    // wychylenie kierownicy -1..1
    this.steerAngle = 0;
    this.pitch = 0; this.roll = 0;               // nachylenie terenu
    this.bp = 0; this.bpv = 0; this.br = 0; this.brv = 0; this.heave = 0; this.heaveV = 0; // zawieszenie
    this.gear = 0; this.shiftT = 0; this.rpm = 0; this.throttle = 0;
    this.spinF = 0; this.spinR = 0;
    this.skid = false; this.surface = 'asphalt'; this.gripK = 0.95;
    this.impact = 0;   // siła ostatniego uderzenia (zerowana przez konsumenta)
    this.shake = 0;
    this.braking = false;
    this.active = false;
    this.traffic = null;
    this.peds = null;
    this._uPrev = 0;
    this._m = new THREE.Matrix4();
  }

  place(x, z, heading) {
    this.pos.set(x, this.grid.height(x, z), z);
    this.heading = heading;
    this.vx = this.vz = this.v = this.lat = this.yawRate = 0;
    this.sync();
  }

  get fwd() {
    return [Math.cos(this.heading), Math.sin(this.heading)];
  }

  get kmh() {
    return Math.abs(this.v) * 3.6;
  }

  blocked(x, z, h) {
    const c = Math.cos(h), s = Math.sin(h), g = this.grid, hl = this.L / 2 - 0.1, hw = this.W / 2 - 0.1;
    for (const [u, w] of [[hl, -hw], [hl, hw], [-hl, -hw], [-hl, hw], [hl, 0], [-hl, 0], [0, -hw], [0, hw]]) {
      const px = x + c * u - s * w, pz = z + s * u + c * w;
      if (g.solid(px, pz)) return true;
      if (g.type(px, pz) !== BRIDGE && this.T.height(px, pz) < this.T.seaY + 0.3) return true;
    }
    return false;
  }

  // nawierzchnia pod autem: przyczepność i maksymalna prędkość
  surfaceAt(x, z) {
    const t = this.grid.type(x, z);
    if (t === GROUND) {
      const n = this.city.roads.nearest(x, z);
      if (n && n.c < 0.4 && n.s.mat === 'dirt') return { name: 'dirt', grip: 0.78, vmax: 0.8, drag: 0.9 };
      return { name: 'grass', grip: 0.6, vmax: 0.5, drag: 2.4 };
    }
    if (t === WALK || t === PLAZA || t === COURT) return { name: 'walk', grip: 0.9, vmax: 0.85, drag: 0.9 };
    const n = this.city.roads.nearest(x, z);
    if (n && n.s.mat === 'cobble') return { name: 'cobble', grip: 0.92, vmax: 0.95, drag: 0.3 };
    if (n && n.s.mat === 'dirt') return { name: 'dirt', grip: 0.78, vmax: 0.8, drag: 0.9 };
    return { name: 'asphalt', grip: 1, vmax: 1, drag: 0 };
  }

  update(dt, keys, touch = [0, 0]) {
    if (!this.active) { keys = NOKEYS; touch = [0, 0]; }
    const k = (c) => keys.has(c);
    const thr = clamp((k('KeyW') || k('ArrowUp') ? 1 : 0) + Math.max(0, touch[1]), 0, 1);
    const brk = clamp((k('KeyS') || k('ArrowDown') ? 1 : 0) + Math.max(0, -touch[1]), 0, 1);
    const st = clamp((k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + touch[0], -1, 1);
    const hand = k('Space') || !this.active; // zaparkowane auto trzyma ręczny
    this.throttle = thr;

    const fx = Math.cos(this.heading), fz = Math.sin(this.heading), rx = -fz, rz = fx;
    let u = this.vx * fx + this.vz * fz, w = this.vx * rx + this.vz * rz;
    const sf = this.surfaceAt(this.pos.x, this.pos.z);
    this.surface = sf.name;
    const vmax = 18.5 * sf.vmax, au = Math.abs(u);

    // biegi: wyższy bieg = mniejsze przyspieszenie; zmiana biegu chwilowo ucina moc
    const gtop = [6.4, 11.6, 19];
    if (this.gear < 2 && au > gtop[this.gear] * 0.96 && thr > 0.1) { this.gear++; this.shiftT = 0.3; }
    else if (this.gear > 0 && au < gtop[this.gear - 1] * 0.6) { this.gear--; this.shiftT = 0.12; }
    this.shiftT = Math.max(0, this.shiftT - dt);
    const lo = this.gear ? gtop[this.gear - 1] * 0.55 : 0;
    this.rpm = clamp(0.18 + 0.82 * ((au - lo) / (gtop[this.gear] - lo)), 0.15, 1) * (thr > 0 || au > 0.5 ? 1 : 0.8);

    let aLong = 0;
    if (thr > 0) {
      if (u < -0.6) aLong += 11 * thr;
      else aLong += thr * [7.6, 5.2, 3.5][this.gear] * (1 - Math.pow(clamp(Math.max(0, u) / vmax, 0, 1), 3)) * (this.shiftT > 0 ? 0.3 : 1);
    }
    this.braking = false;
    if (brk > 0) {
      if (u > 0.6) { aLong -= brk * 8.5; this.braking = true; }
      else if (u > -5 * sf.vmax) aLong -= brk * 3.8;
    }
    // ręczny: mocno hamuje tylko bez skrętu; w skręcie pozwala ślizgać się, zachowując tempo
    if (hand && au > 0.3) { aLong -= Math.sign(u) * Math.min(au / dt, 2.2 + 4 * (1 - Math.abs(this.steer))); this.braking = true; }
    // opory: toczenie, aerodynamika, nawierzchnia, nachylenie; po puszczeniu gazu hamuje silnik
    aLong -= Math.sign(u) * Math.min(au / dt, 0.4 + 0.0011 * u * u + sf.drag);
    if (thr === 0 && brk === 0 && !hand) aLong -= Math.sign(u) * Math.min(au / dt, 1.5);
    aLong -= GRAV * Math.sin(this.pitch) * 0.6;

    // tarcie boczne: ogranicza przyczepność (koło tarcia), ręczny odpuszcza tył → drift
    // przyczepność spada od razu po pociągnięciu ręcznego, a wraca łagodnie (drift trwa chwilę po puszczeniu)
    const gripT = hand && au > 2 ? 0.3 : 0.95;
    this.gripK += (gripT - this.gripK) * Math.min(1, dt * (gripT < this.gripK ? 12 : 2));
    const mu = this.gripK * sf.grip * GRAV;
    const muLat = mu * (1 - 0.3 * clamp(Math.abs(aLong) / mu, 0, 1));
    const aLat = clamp(-w / Math.max(dt, 1e-3), -muLat, muLat);

    this.vx += (aLong * fx + aLat * rx) * dt;
    this.vz += (aLong * fz + aLat * rz) * dt;
    if (!this.active && Math.hypot(this.vx, this.vz) < 0.5) { this.vx = this.vz = 0; } // zaparkowane: stoi, nie spełza z górki

    // kierownica i obrót (model rowerowy): skręt maleje z prędkością
    this.steer += (st - this.steer) * Math.min(1, dt * (st === 0 ? 9 : 5.5));
    const dMax = 0.58 / (1 + (au / 6.5) * (au / 6.5));
    this.steerAngle = this.steer * dMax;
    let yawT = (u * Math.tan(this.steerAngle)) / this.wb;
    if (hand && au > 3) yawT *= 1.4; // ręczny: tył ucieka, auto się kręci
    yawT = clamp(yawT, -1.7, 1.7);
    this.yawRate += (yawT - this.yawRate) * Math.min(1, dt * 9);

    // ruch w sub-krokach, żeby przy dużej prędkości nie przeskakiwać ścian
    const speed = Math.hypot(this.vx, this.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.25)), sdt = dt / steps;
    let hit = 0;
    for (let i = 0; i < steps; i++) hit = Math.max(hit, this.step(sdt));
    if (hit > 0.3) this.hitWall(hit);
    this.resolveTraffic();
    if (this.peds) this.peds.carHit(this);

    // zestaw po ruchu: składowe, poślizg, koła
    const f2x = Math.cos(this.heading), f2z = Math.sin(this.heading);
    this.v = this.vx * f2x + this.vz * f2z;
    this.lat = this.vx * -f2z + this.vz * f2x;
    this.skid = (Math.abs(this.lat) > 2.2 && Math.abs(this.v) > 2) || (brk > 0.8 && this.v > 6) || (hand && Math.abs(this.v) > 3);

    // wysokość i nachylenie z czterech kół
    const hAt = (a, b) => this.grid.height(this.pos.x + f2x * a - f2z * b, this.pos.z + f2z * a + f2x * b);
    const lf = this.L / 2 - 0.55, tw = this.W / 2 - 0.15;
    const fl = hAt(lf, -tw), fr = hAt(lf, tw), bl = hAt(-lf, -tw), br = hAt(-lf, tw);
    const y = (fl + fr + bl + br) / 4;
    this.pos.y += (y - this.pos.y) * Math.min(1, dt * 14);
    this.pitch += (Math.atan2((fl + fr) / 2 - (bl + br) / 2, lf * 2) - this.pitch) * Math.min(1, dt * 10);
    this.roll += (Math.atan2((fr + br) / 2 - (fl + bl) / 2, tw * 2) - this.roll) * Math.min(1, dt * 10);

    // sprężyny zawieszenia: hamowanie nurkuje, przyspieszenie przysiada, zakręt przechyla
    const ax = clamp((this.v - this._uPrev) / Math.max(dt, 1e-3), -12, 12);
    this._uPrev = this.v;
    const pT = clamp(ax * 0.0045, -0.05, 0.05), rT = clamp(this.v * this.yawRate * 0.0075, -0.075, 0.075);
    this.bpv += (-70 * (this.bp - pT) - 9.5 * this.bpv) * dt; this.bp += this.bpv * dt;
    this.brv += (-70 * (this.br - rT) - 9.5 * this.brv) * dt; this.br += this.brv * dt;
    this.heaveV += (-110 * this.heave - 11 * this.heaveV) * dt; this.heave += this.heaveV * dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);

    // koła
    const wr = this.v * dt;
    this.spinF += wr / this.K.rf;
    if (!(hand && Math.abs(this.v) > 1)) this.spinR += wr / this.K.rr;
    this.tailMat.emissiveIntensity = this.braking || brk > 0.1 ? 2.4 : 0.35;
    this.sync();
  }

  // jeden sub-krok: kurs, położenie, ślizg po ścianie; zwraca siłę uderzenia
  step(dt) {
    const nh = this.heading + this.yawRate * dt;
    const nx = this.pos.x + this.vx * dt, nz = this.pos.z + this.vz * dt;
    if (!this.blocked(nx, nz, nh)) { this.pos.x = nx; this.pos.z = nz; this.heading = nh; return 0; }
    const bx = this.blocked(nx, this.pos.z, nh), bz = this.blocked(this.pos.x, nz, nh);
    let nxn = 0, nzn = 0, moved = false;
    if (!bx) { this.pos.x = nx; this.heading = nh; moved = true; nzn = -Math.sign(this.vz) || 0; }
    else if (!bz) { this.pos.z = nz; this.heading = nh; moved = true; nxn = -Math.sign(this.vx) || 0; }
    else { nxn = -Math.sign(this.vx) || 0; nzn = -Math.sign(this.vz) || 0; }
    // normalna uderzenia i odbicie składowej normalnej (restytucja 0.22), tarcie stycznej
    const l = Math.hypot(nxn, nzn) || 1;
    nxn /= l; nzn /= l;
    const vn = this.vx * nxn + this.vz * nzn;
    if (vn < 0) {
      const e = 0.22;
      this.vx -= (1 + e) * vn * nxn; this.vz -= (1 + e) * vn * nzn;
      this.vx *= 0.94; this.vz *= 0.94;
      if (!moved) { this.yawRate *= 0.5; }
      return -vn;
    }
    return 0;
  }

  hitWall(strength) {
    this.impact = Math.max(this.impact, strength);
    this.shake = Math.min(1, this.shake + strength * 0.07);
    this.heaveV -= Math.min(2.4, strength * 0.25);
  }

  // auta-boty: trzy koła kolizji na auto; gracz jest wypychany, bot zwalnia
  resolveTraffic() {
    if (!this.traffic) return;
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading), R = 0.92;
    const pl = this.L / 2 - R;
    for (const o of this.traffic.near(this.pos.x, this.pos.z, 7)) {
      const oc = Math.cos(o.h), os = Math.sin(o.h), ol = o.len / 2 - R;
      for (const a of [-pl, 0, pl])
        for (const b2 of [-ol, 0, ol]) {
          const dx = this.pos.x + fx * a - (o.x + oc * b2), dz = this.pos.z + fz * a - (o.z + os * b2);
          const d = Math.hypot(dx, dz);
          if (d >= R * 2 || d < 1e-4) continue;
          const nx = dx / d, nz = dz / d, pen = R * 2 - d;
          this.pos.x += nx * pen * 0.7; this.pos.z += nz * pen * 0.7;
          // prędkość względna wzdłuż normalnej
          const rv = (this.vx - oc * o.v) * nx + (this.vz - os * o.v) * nz;
          if (rv < 0) {
            const j = -(1.25) * rv;
            this.vx += nx * j * 0.75; this.vz += nz * j * 0.75;
            o.v = Math.max(0, o.v - j * 0.5 * Math.abs(nx * oc + nz * os) - 0.2);
            o.bump = 1.2;
            if (-rv > 1.5) { this.impact = Math.max(this.impact, -rv); this.shake = Math.min(1, this.shake + -rv * 0.05); }
          }
        }
    }
  }

  // macierz świata punktu zakotwiczenia (kierowca, pasażer) — z uwzględnieniem zawieszenia
  anchorWorld(name, out) {
    const a = this.anchors[name];
    this.mesh.updateMatrixWorld(true);
    return out.set(a[0], a[1], a[2]).applyMatrix4(this.body.matrixWorld);
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, 0, 0, 'YZX');
    this.mesh.rotation.y = -this.heading;
    this.mesh.rotation.z = this.pitch;
    this.mesh.rotation.x = -this.roll;
    this.body.position.y = this.heave;
    this.body.rotation.set(-this.br, 0, this.bp, 'YZX');
    for (const w of this.wheels) {
      w.pivot.rotation.y = w.front ? -this.steerAngle : 0;
      w.spin.rotation.z = -(w.front ? this.spinF : this.spinR);
    }
  }

  // kamera zza auta: mysz obraca, po chwili wraca za taksówkę; FOV rośnie z prędkością
  updateCamera(dt, camera, player) {
    const carYaw = Math.atan2(-Math.cos(this.heading), -Math.sin(this.heading));
    if (performance.now() - player.lookT > 1500) {
      let d = carYaw - player.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.yaw += d * Math.min(1, dt * 2.5);
      player.pitch += (-0.14 - player.pitch) * Math.min(1, dt * 2);
    }
    const sp = Math.abs(this.v), cp = Math.cos(player.pitch), dist = 7.4 + Math.min(2.2, sp * 0.1);
    const tx = this.pos.x + Math.sin(player.yaw) * cp * dist, tz = this.pos.z + Math.cos(player.yaw) * cp * dist;
    let ty = this.pos.y + 1.7 - Math.sin(player.pitch) * dist;
    ty = Math.max(ty, this.grid.height(tx, tz) + 0.8);
    const k = Math.min(1, dt * (7 + sp * 0.15));
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    if (this.shake > 0.01) {
      const s = this.shake * this.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
    }
    camera.lookAt(this.pos.x, this.pos.y + 1.35, this.pos.z);
    const fov = 72 + Math.min(11, sp * 0.55);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  }
}
