// Strumieniowanie świata: w pobliżu gracza pełne kwartały z modułów
// (budowane w workerach), dalej tanie bryły LOD. Histereza zapobiega
// "migotaniu" na granicy zasięgu.
import * as THREE from 'three';

export const DETAIL_IN = 170;  // m od krawędzi kwartału
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
  constructor(scene, city, pool, M) {
    this.scene = scene;
    this.city = city;
    this.pool = pool;
    this.M = M;
    this.state = city.chunks.map(() => ({ lod: null, detail: null, pending: false, want: false }));
    this.tris = 0;
  }

  async loadLOD(onProgress) {
    let done = 0;
    await Promise.all(
      this.city.chunks.map(async (blk, id) => {
        const mats = await this.pool.run({ seed: this.city.seed, kind: 'lod', id }, 1e6);
        const g = buildMeshes(mats, this.M, { shadows: false });
        this.state[id].lod = g;
        this.scene.add(g);
        onProgress?.(++done / this.city.chunks.length);
      }),
    );
  }

  distance(id, p) {
    const b = this.city.chunks[id];
    return Math.hypot(b.center[0] - p.x, b.center[1] - p.z) - b.radius;
  }

  update(p) {
    this.city.chunks.forEach((blk, id) => {
      const st = this.state[id];
      const d = this.distance(id, p);
      if (d < DETAIL_IN) st.want = true;
      else if (d > DETAIL_OUT) st.want = false;
      if (st.want && !st.detail && !st.pending) this.request(id, d);
      if (!st.want && st.detail) this.unload(id);
    });
    this.pool.reprioritize((msg) => (msg.kind === 'block' ? this.distance(msg.id, p) : 1e6));
  }

  request(id, d) {
    const st = this.state[id];
    st.pending = true;
    this.pool.run({ seed: this.city.seed, kind: 'block', id }, d).then((mats) => {
      st.pending = false;
      if (!st.want) return;
      st.detail = buildMeshes(mats, this.M);
      st.tris = Object.values(mats).reduce((s, m) => s + m.i.length / 3, 0);
      this.tris += st.tris;
      this.scene.add(st.detail);
      if (st.lod) st.lod.visible = false;
    });
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
    return this.state.filter((s) => s.detail).length;
  }

  get pendingCount() {
    return this.state.filter((s) => s.pending).length;
  }
}
