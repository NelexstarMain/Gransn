// Strumieniowanie świata: w pobliżu gracza pełne kwartały z modułów
// (budowane w workerach), dalej tanie bryły LOD. Histereza zapobiega
// "migotaniu" na granicy zasięgu.
import * as THREE from 'three';

export const DETAIL_IN = 170;  // m od krawędzi fragmentu
export const DETAIL_OUT = 230;

export function buildMeshes(mats, M, { shadows = true } = {}) {
  const group = new THREE.Group();
  for (const [name, buf] of Object.entries(mats)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(buf.n, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(buf.c, 3, true));
    g.setIndex(new THREE.BufferAttribute(buf.i, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, M[name]);
    const ground = name === 'cobble' || name === 'slab' || name === 'curb';
    mesh.castShadow = shadows && !ground && name !== 'light';
    mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  group.matrixAutoUpdate = false;
  return group;
}

export function disposeGroup(group) {
  for (const m of group.children) m.geometry.dispose();
}

export class Streamer {
  constructor(scene, city, pool, M, low = false) {
    this.din = low ? 90 : DETAIL_IN;
    this.dout = low ? 130 : DETAIL_OUT;
    this.scene = scene;
    this.city = city;
    this.pool = pool;
    this.M = M;
    this.state = city.chunks.map(() => ({ lod: null, detail: null, pending: false, want: false }));
    this.tris = 0;
    this.addQ = [];      // dodawanie siatek do sceny po jednej na klatkę (wysyłka do GPU bez skoków)
    this.loadedN = 0;
    this.pendingN = 0;
  }

  // odłóż dodanie siatki do sceny; wołane co klatkę zdejmuje jedną z kolejki
  defer(fn) {
    this.addQ.push(fn);
  }

  tick() {
    if (this.addQ.length) this.addQ.shift()();
  }

  // LOD całego miasta w tle — dalekie fragmenty na końcu kolejki
  loadLOD() {
    this.city.chunks.forEach((ch, id) => {
      this.pool.run({ seed: this.city.seed, kind: 'lod', id }, 1000 + Math.hypot(ch.center[0], ch.center[1])).then((mats) => this.defer(() => {
        const g = buildMeshes(mats, this.M, { shadows: false });
        this.state[id].lod = g;
        g.visible = !this.state[id].detail;
        this.scene.add(g);
      }));
    });
  }

  distance(id, p) {
    const b = this.city.chunks[id];
    return Math.hypot(b.center[0] - p.x, b.center[1] - p.z) - b.radius;
  }

  update(p) {
    let loaded = 0, pending = 0;
    this.city.chunks.forEach((blk, id) => {
      const st = this.state[id];
      const d = this.distance(id, p);
      if (d < this.din) st.want = true;
      else if (d > this.dout) st.want = false;
      if (st.want && !st.detail && !st.pending) this.request(id, d);
      if (!st.want && st.detail) this.unload(id);
      if (st.detail) loaded++;
      if (st.pending) pending++;
    });
    this.loadedN = loaded;
    this.pendingN = pending;
    this.pool.reprioritize((msg, old) => (msg.kind === 'block' ? this.distance(msg.id, p) : msg.kind === 'lod' ? 1000 + this.distance(msg.id, p) : old));
  }

  request(id, d) {
    const st = this.state[id];
    st.pending = true;
    this.pool.run({ seed: this.city.seed, kind: 'block', id }, d).then((mats) => this.defer(() => {
      st.pending = false;
      if (!st.want) return;
      st.detail = buildMeshes(mats, this.M);
      st.tris = Object.values(mats).reduce((s, m) => s + m.i.length / 3, 0);
      this.tris += st.tris;
      this.scene.add(st.detail);
      if (st.lod) st.lod.visible = false;
    }));
  }

  unload(id) {
    const st = this.state[id];
    this.scene.remove(st.detail);
    disposeGroup(st.detail);
    st.detail = null;
    this.tris -= st.tris;
    if (st.lod) st.lod.visible = true;
  }

  get loaded() {
    return this.loadedN;
  }

  get pendingCount() {
    return this.pendingN;
  }
}
