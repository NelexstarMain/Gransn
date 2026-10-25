// Taksówka (wóz z ok. 1900 r.): zręcznościowa fizyka (gaz/hamulec, skręt zależny od prędkości,
// ręczny), kolizje z siatką świata, przechył i pochylenie z wysokości kół.
import * as THREE from 'three';
import { Builder } from '../gen/builder.js';
import { Cage } from '../gen/cage.js';
import { M as MODULES } from '../gen/modules.js';
import { buildMeshes } from './streaming.js';

const L = 3.6, Wd = 1.7;

// siatka dowolnego modułu wycentrowana w (0,0) — do obiektów ruchomych
export function moduleMesh(name, W, H, D, p, M) {
  const b = new Builder();
  b.cell(Cage.quad([-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], 0, H), W, H, D);
  MODULES[name](b, W, H, D, p);
  const g = buildMeshes(b.finish().mats, M);
  g.matrixAutoUpdate = true;
  for (const m of g.children) m.matrixAutoUpdate = true;
  return g;
}

export class Vehicle {
  constructor(scene, grid, M) {
    this.grid = grid;
    this.T = grid.T;
    this.mesh = moduleMesh('oldcar', L, 2.2, Wd, { color: [0.95, 0.76, 0.12], seat: [0.3, 0.12, 0.08], taxi: true }, M);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.heading = 0; // kierunek jazdy w płaszczyźnie (x,z): (cos, sin)
    this.v = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
  }

  place(x, z, heading) {
    this.pos.set(x, this.grid.height(x, z), z);
    this.heading = heading;
    this.v = 0;
    this.sync();
  }

  get fwd() {
    return [Math.cos(this.heading), Math.sin(this.heading)];
  }

  blocked(x, z, h) {
    const c = Math.cos(h), s = Math.sin(h);
    for (const [u, w] of [[L / 2, -Wd / 2], [L / 2, Wd / 2], [-L / 2, -Wd / 2], [-L / 2, Wd / 2], [L / 2, 0], [0, -Wd / 2], [0, Wd / 2]]) {
      const px = x + c * u - s * w, pz = z + s * u + c * w;
      if (this.grid.solid(px, pz)) return true;
      if (this.grid.type(px, pz) !== 5 && this.T.height(px, pz) < this.T.seaY + 0.3) return true;
    }
    return false;
  }

  update(dt, keys, touch = [0, 0]) {
    const k = (c) => keys.has(c);
    const thr = Math.max(-1, Math.min(1, (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + touch[1]));
    const st = Math.max(-1, Math.min(1, (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + touch[0]));
    const hand = k('Space');
    if (thr > 0) this.v += (this.v < 0 ? 16 : 8.5) * dt;
    else if (thr < 0) this.v -= (this.v > 0 ? 16 : 5) * dt;
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 2.2 * dt);
    if (hand) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 20 * dt);
    this.v -= this.v * 0.18 * dt;
    this.v = Math.max(-5, Math.min(17, this.v)); // wóz z 1900 r.: ~60 km/h
    this.steer += (st - this.steer) * Math.min(1, dt * 6);
    const maxA = 0.6 * (1 - Math.min(0.55, Math.abs(this.v) / 45));
    const yawRate = (this.v / 2.3) * Math.tan(this.steer * maxA) * (hand ? 1.6 : 1);
    const nh = this.heading + yawRate * dt;
    const nx = this.pos.x + Math.cos(nh) * this.v * dt, nz = this.pos.z + Math.sin(nh) * this.v * dt;
    if (!this.blocked(nx, nz, nh)) {
      this.pos.x = nx; this.pos.z = nz; this.heading = nh;
    } else if (!this.blocked(nx, this.pos.z, nh)) {
      this.pos.x = nx; this.heading = nh; this.v *= 0.7;
    } else if (!this.blocked(this.pos.x, nz, nh)) {
      this.pos.z = nz; this.heading = nh; this.v *= 0.7;
    } else {
      this.v = -this.v * 0.25;
    }
    // wysokość, pochylenie i przechył z czterech kół
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const hAt = (u, w) => this.grid.height(this.pos.x + c * u - s * w, this.pos.z + s * u + c * w);
    const fl = hAt(1.25, -0.73), fr = hAt(1.25, 0.73), bl = hAt(-1.2, -0.73), br = hAt(-1.2, 0.73);
    const y = (fl + fr + bl + br) / 4;
    this.pos.y += (y - this.pos.y) * Math.min(1, dt * 12);
    this.pitch += (Math.atan2((fl + fr) / 2 - (bl + br) / 2, 2.45) - this.pitch) * Math.min(1, dt * 10);
    this.roll += (Math.atan2((fr + br) / 2 - (fl + bl) / 2, 1.46) - this.roll) * Math.min(1, dt * 10);
    this.sync();
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, 0, 0, 'YZX');
    this.mesh.rotation.y = -this.heading;
    this.mesh.rotation.z = this.pitch;
    this.mesh.rotation.x = -this.roll;
  }

  get kmh() {
    return Math.abs(this.v) * 3.6;
  }
}
