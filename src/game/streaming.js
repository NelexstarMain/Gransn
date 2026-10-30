// Ładowanie świata. Przed grą cała mapa jest budowana w workerach i scalana w kilka
// siatek (WorldMesh: jeden BatchedMesh na materiał). W trakcie gry nic się już nie
// generuje ani nie tworzy: co 0,25 s przełączamy tylko widoczność fragmentów
// (detal blisko, LOD dalej, nic za mgłą), a klatka rysuje wyłącznie to, co jest w kadrze.
// Tryb lekki (?low, telefony): detal tylko wokół gracza, reszta jako LOD — pamięci nie starczyłoby na całość.
import * as THREE from 'three';
import { WorldMesh } from './worldmesh.js';

export const DETAIL_IN = 170;  // m od krawędzi fragmentu
export const DETAIL_OUT = 230;
const FAR = 1150;              // dalej mgła zakrywa wszystko (FogExp2 0.0026)

// pojedyncze obiekty ruchome (auta, ludzie) — zwykłe siatki, nie część świata
export function buildMeshes(mats, M, { shadows = true } = {}) {
  const group = new THREE.Group();
  for (const [name, buf] of Object.entries(mats)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(buf.n, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(buf.c, 3, true));
    if (buf.w) g.setAttribute('wear', new THREE.BufferAttribute(buf.w, 4, true));
    g.setIndex(new THREE.BufferAttribute(buf.i, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, M[name]);
    mesh.castShadow = shadows && name !== 'light';
    mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  group.matrixAutoUpdate = false;
  return group;
}

export class Streamer {
  constructor(scene, city, pool, M, { low = false, shadows = true, groundTiles = 7 } = {}) {
    this.low = low;
    this.din = low ? 90 : DETAIL_IN;
    this.dout = low ? 130 : DETAIL_OUT;
    this.city = city;
    this.pool = pool;
    this.groundTiles = groundTiles;
    this.world = new WorldMesh(scene, M, { shadows });
    this.state = city.chunks.map(() => ({ lod: null, detail: null, pending: false, want: false }));
    this.sealed = false;
  }

  distance(id, p) {
    const b = this.city.chunks[id];
    return Math.hypot(b.center[0] - p.x, b.center[1] - p.z) - b.radius;
  }

  // Kolejkuje całą budowę. Zwraca obietnicę, która kończy się, gdy wszystko, co potrzebne
  // przed grą, jest już w siatkach. onProgress(0..1, napis).
  load(p, onProgress) {
    const { city, pool, state, low } = this;
    const seed = city.seed, jobs = [];
    let done = 0, total = 0;
    const track = (promise, needed = true) => {
      total++;
      const t = promise.then((r) => { done++; onProgress(done / total, `Budowanie miasta… ${Math.round((done / total) * 100)}%`); return r; });
      if (needed) jobs.push(t);
      return t;
    };
    track(pool.run({ seed, kind: 'river' }, 5).then((mats) => this.world.add(mats)));
    const ts = (2 * city.half) / this.groundTiles;
    for (let tz = 0; tz < this.groundTiles; tz++)
      for (let tx = 0; tx < this.groundTiles; tx++) {
        const cx = -city.half + (tx + 0.5) * ts, cz = -city.half + (tz + 0.5) * ts;
        track(pool.run({ seed, kind: 'ground', tx, tz }, Math.hypot(cx - p.x, cz - p.z) - 400).then((mats) => this.world.add(mats)));
      }
    city.chunks.forEach((ch, id) => {
      const d = this.distance(id, p);
      track(pool.run({ seed, kind: 'lod', id }, 1000 + d).then((mats) => { state[id].lod = this.world.add(mats, { lod: true }); }));
      // tryb pełny: detal całej mapy przed grą; lekki: tylko okolica startu (reszta doładuje się w grze)
      if (!low || d < this.din) {
        state[id].pending = true;
        track(pool.run({ seed, kind: 'block', id }, d).then((mats) => {
          state[id].pending = false;
          state[id].detail = this.world.add(mats);
          this.world.setVisible(state[id].detail, false);
        }));
      }
    });
    return Promise.all(jobs).then(() => { this.update(p); });
  }

  // po załadowaniu: zwalniamy kopie danych z pamięci procesora (pełny tryb)
  seal() {
    if (this.low || this.sealed) return;
    this.sealed = true;
    this.world.seal();
  }

  update(p) {
    const { world, state, low } = this;
    this.city.chunks.forEach((_, id) => {
      const st = state[id];
      const d = this.distance(id, p);
      if (d < this.din) st.want = true;
      else if (d > this.dout) st.want = false;
      if (low) {
        if (st.want && !st.detail && !st.pending) this.request(id, d);
        if (!st.want && st.detail) { world.remove(st.detail); st.detail = null; }
      }
      if (st.detail) world.setVisible(st.detail, st.want);
      if (st.lod) world.setVisible(st.lod, !(st.want && st.detail) && d < FAR);
    });
  }

  request(id, d) {
    const st = this.state[id];
    st.pending = true;
    this.pool.run({ seed: this.city.seed, kind: 'block', id }, d).then((mats) => {
      st.pending = false;
      if (!st.want) return;
      st.detail = this.world.add(mats);
      if (st.lod) this.world.setVisible(st.lod, false);
    });
  }

  get loaded() {
    return this.state.filter((s) => s.detail).length;
  }

  get pendingCount() {
    return this.state.filter((s) => s.pending).length;
  }
}
