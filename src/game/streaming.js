// Ładowanie świata. Przed grą budowane są w workerach i scalane w kilka siatek (WorldMesh: jeden
// BatchedMesh na materiał): teren, rzeka, LOD CAŁEJ wyspy i pełny detal w promieniu PRELOAD_R od
// startu. Pełny detal całej wyspy to ok. 320 MB, więc dalsze fragmenty doładowują się w trakcie
// jazdy (po jednym na klatkę) i są zwalniane, gdy gracz odjedzie. Fragmenty z pamięci stałej
// przełączają się tylko flagą widoczności (detal blisko, LOD dalej, nic za mgłą), a klatka rysuje
// wyłącznie to, co jest w kadrze. Telefony (?low): promień zerowy, detal tylko wokół gracza.
import * as THREE from 'three';
import { WorldMesh } from './worldmesh.js';
import { isSurface, surfaceOrder } from '../render/layers.js';

export const DETAIL_IN = 170;  // m od krawędzi fragmentu
export const DETAIL_OUT = 230;
const FAR = 1150;              // dalej mgła zakrywa wszystko (FogExp2)
const PRELOAD_R = 260;         // m od startu: pełny detal budowany przed grą

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
    mesh.renderOrder = surfaceOrder(name);
    mesh.castShadow = shadows && !isSurface(name) && name !== 'light';
    mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  group.matrixAutoUpdate = false;
  return group;
}

export class Streamer {
  constructor(scene, city, pool, M, low = false, groundTiles = 7) {
    this.low = low;
    this.din = low ? 90 : DETAIL_IN;
    this.dout = low ? 130 : DETAIL_OUT;
    this.city = city;
    this.pool = pool;
    this.groundTiles = groundTiles;
    this.world = new WorldMesh(scene, M, { shadows: true });
    this.state = city.chunks.map(() => ({ lod: null, detail: null, pending: false, want: false, keep: false }));
    this.tris = 0;       // trójkąty detalu załadowane do świata
    this.loadedN = 0;
    this.pendingN = 0;
    this.addQ = [];      // dodawanie do świata po jednym kawałku na klatkę w trakcie gry (bez skoków)
    this.preloadR = low ? 0 : PRELOAD_R;
  }

  defer(fn) { this.addQ.push(fn); }

  tick() {
    if (this.addQ.length) this.addQ.shift()();
  }

  distance(id, p) {
    const b = this.city.chunks[id];
    return Math.hypot(b.center[0] - p.x, b.center[1] - p.z) - b.radius;
  }

  // Kolejkuje całą budowę. Zwraca obietnicę, która kończy się, gdy wszystko, co potrzebne
  // przed grą, jest już w siatkach. onProgress(0..1, napis).
  load(p, onProgress) {
    const { city, pool, state } = this;
    const seed = city.seed, jobs = [];
    let done = 0, total = 0;
    const track = (promise) => {
      total++;
      jobs.push(promise.then(() => { done++; onProgress(done / total, `Budowanie miasta… ${Math.round((done / total) * 100)}%`); }));
    };
    track(pool.run({ seed, kind: 'river' }, 5).then((mats) => this.world.add(mats)));
    const GT = this.groundTiles, ts = (2 * city.half) / GT;
    for (let tz = 0; tz < GT; tz++)
      for (let tx = 0; tx < GT; tx++) {
        const cx = -city.half + (tx + 0.5) * ts, cz = -city.half + (tz + 0.5) * ts;
        track(pool.run({ seed, kind: 'ground', tx, tz }, Math.hypot(cx - p.x, cz - p.z) - 400).then((mats) => this.world.add(mats)));
      }
    city.chunks.forEach((ch, id) => {
      const d = this.distance(id, p);
      track(pool.run({ seed, kind: 'lod', id }, 1000 + d).then((mats) => { state[id].lod = this.world.add(mats, { lod: true }); }));
      // tryb pełny: detal całej mapy przed grą; lekki: tylko okolica startu (reszta doładuje się w grze)
      if (d < Math.max(this.preloadR, this.din)) {
        state[id].keep = d < this.preloadR;
        state[id].pending = true;
        track(pool.run({ seed, kind: 'block', id }, d).then((mats) => {
          state[id].pending = false;
          const h = this.world.add(mats);
          state[id].detail = h;
          this.tris += h.tris;
          this.world.setVisible(h, false); // widoczność ustawia update()
        }));
      }
    });
    return Promise.all(jobs).then(() => this.update(p));
  }

  update(p) {
    const { world, state } = this;
    let loaded = 0, pending = 0;
    this.city.chunks.forEach((_, id) => {
      const st = state[id];
      const d = this.distance(id, p);
      if (d < this.din) st.want = true;
      else if (d > this.dout) st.want = false;
      if (!st.keep) {
        if (st.want && !st.detail && !st.pending) this.request(id, d);
        if (!st.want && st.detail) { this.tris -= st.detail.tris; world.remove(st.detail); st.detail = null; }
      }
      if (st.detail) { world.setVisible(st.detail, st.want); loaded++; }
      if (st.pending) pending++;
      if (st.lod) world.setVisible(st.lod, !(st.want && st.detail) && d < FAR);
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
      st.detail = this.world.add(mats);
      this.tris += st.detail.tris;
      if (st.lod) this.world.setVisible(st.lod, false);
    }));
  }

  get loaded() { return this.loadedN; }
  get pendingCount() { return this.pendingN; }
}
