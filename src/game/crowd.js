// Tłum: wszyscy ludzie w grze (piesi, kierowcy, pasażerowie) rysowani instancjami.
// Jedna siatka na część ciała (głowa, tułów, ramię…), kolor skóry/ubrania z instanceColor,
// poza liczona na procesorze (rig.js). Daleko od kamery — bez rysowania i bez animacji.
import * as THREE from 'three';
import { buildPartGeometries, makeStyle, pose } from './rig.js';
import { Rng } from '../core/rng.js';

const PAIRS = new Set(['upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'shoe']); // po dwie na osobę

export class Crowd {
  constructor(scene, M, max = 150, drawR = 170) {
    this.max = max;
    this.drawR = drawR;
    this.parts = buildPartGeometries(M);
    this.meshes = {};
    for (const [name, P] of Object.entries(this.parts)) {
      const cap = max * (PAIRS.has(name) ? 2 : 1);
      const im = new THREE.InstancedMesh(P.geometry, P.material, cap);
      im.count = 0;
      im.visible = false;
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      let color = null;
      if (P.tint) {
        color = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        color.setUsage(THREE.DynamicDrawUsage);
        im.instanceColor = color;
      }
      scene.add(im);
      this.meshes[name] = { im, n: 0, cap, tint: P.tint, color };
    }
    // miękki cień pod stopami
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 32, 32);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }), max);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.blobs.count = 0;
    scene.add(this.blobs);
    this.people = [];
    this.rng = new Rng(777);
    this.nextId = 1;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.e = new THREE.Euler();
    this.emit = (name, mat, st) => {
      const M = this.meshes[name];
      if (!M || M.n >= M.cap) return;
      M.im.instanceMatrix.array.set(mat.elements, M.n * 16);
      if (M.color) {
        const col = st[M.tint], a = M.color.array, i = M.n * 3;
        a[i] = col[0]; a[i + 1] = col[1]; a[i + 2] = col[2];
      }
      M.n++;
    };
  }

  // nowy człowiek; style = z makeStyle, st = początkowy stan
  add(style, st = {}) {
    if (this.people.length >= this.max) return null;
    const r = this.rng;
    const h = {
      id: this.nextId++, style, x: 0, y: 0, z: 0, yaw: 0, speed: 0, phase: r.next() * 6.28, t: r.next() * 20,
      sit: 0, sitT: 0, wave: 0, waveT: 0, fall: 0, fallDx: 1, fallDz: 0, look: 0, steer: 0, hidden: false,
      ...st,
    };
    this.people.push(h);
    return h;
  }

  // kierowca-bot: mężczyzna, siedzi od razu
  addDriver(r) {
    return this.add(makeStyle(r, { female: false }), { sit: 1, sitT: 1 });
  }

  addRandom(r, opts) {
    return this.add(makeStyle(r, opts));
  }

  remove(h) {
    const i = this.people.indexOf(h);
    if (i >= 0) { this.people[i] = this.people[this.people.length - 1]; this.people.pop(); }
  }

  // dt, pozycja kamery (do ucinania dalekich)
  update(dt, cam) {
    for (const k in this.meshes) this.meshes[k].n = 0;
    const R2 = this.drawR * this.drawR;
    let bi = 0;
    const { m, q, v, s, e } = this;
    for (const h of this.people) {
      h.t += dt;
      // wygładzenie przejść (siedzenie, machanie)
      if (h.sit !== h.sitT) { h.sit += (h.sitT - h.sit) * Math.min(1, dt * 5); if (Math.abs(h.sit - h.sitT) < 0.01) h.sit = h.sitT; }
      h.wave += (h.waveT - h.wave) * Math.min(1, dt * 7);
      const dx = h.x - cam.x, dz = h.z - cam.z;
      if (dx * dx + dz * dz > R2) continue;
      // faza kroku z przebytej drogi: długość kroku rośnie z tempem (bieg = dłuższy krok)
      if (h.speed > 0.05) {
        const gait = h.speed / 1.4, step = 0.74 * h.style.h * (1 + Math.max(0, gait - 1.6) * 0.45);
        h.phase += (Math.PI * h.speed * dt) / step;
        if (h.phase > 1e4) h.phase -= 1e4;
      }
      if (h.hidden) continue;
      pose(h, this.emit);
      // cień-plama
      const sc = (h.style.w + 0.3) * 0.62;
      v.set(h.x, h.y + 0.03, h.z);
      q.setFromEuler(e.set(0, -h.yaw, 0));
      s.set(sc * (1 + h.fall * 1.2), 1, sc * (1 + h.fall * 2.4));
      m.compose(v, q, s);
      this.blobs.setMatrixAt(bi++, m);
    }
    this.blobs.count = bi;
    this.blobs.instanceMatrix.needsUpdate = true;
    for (const k in this.meshes) {
      const M = this.meshes[k];
      M.im.count = M.n;
      M.im.visible = M.n > 0;
      if (M.n) {
        M.im.instanceMatrix.needsUpdate = true;
        if (M.color) M.color.needsUpdate = true;
      }
    }
  }

  get count() {
    return this.people.length;
  }
}
