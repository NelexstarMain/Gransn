// Cały świat jako kilka siatek: dla każdego materiału JEDEN BatchedMesh (jedno wywołanie
// rysowania), w którym każdy fragment mapy jest osobnym zakresem indeksów. Dzięki temu:
//  • ok. 25 draw calli zamiast setek (fragmenty × materiały),
//  • rysowane jest tylko to, co widać: three.js sam odrzuca fragmenty poza kadrem
//    (osobno w przebiegu kamery i w przebiegu cienia) i sortuje je od najbliższych,
//  • przełączenie detal ↔ LOD to jedna flaga widoczności, bez tworzenia ani kasowania geometrii.
import * as THREE from 'three';

const GROUND = new Set(['cobble', 'slab', 'curb', 'cobblelod']);
const ATTRS = [['position', 'p', 3, false], ['normal', 'n', 3, true], ['uv', 'uv', 2, false], ['color', 'c', 3, true], ['wear', 'w', 4, true]];

// geometria jednego fragmentu dla jednego materiału (tymczasowa — BatchedMesh kopiuje dane)
function chunkGeometry(buf) {
  const g = new THREE.BufferGeometry();
  for (const [name, key, size, norm] of ATTRS) if (buf[key]) g.setAttribute(name, new THREE.BufferAttribute(buf[key], size, norm));
  g.setIndex(new THREE.BufferAttribute(buf.i, 1));
  return g;
}

export class WorldMesh {
  constructor(scene, M, { shadows = true } = {}) {
    this.scene = scene;
    this.M = M;
    this.shadows = shadows;
    this.sets = { detail: new Map(), lod: new Map() };
    this.removed = 0;
    this.sealed = false;
  }

  _batch(setName, name, verts, idx) {
    const set = this.sets[setName];
    let b = set.get(name);
    if (!b) {
      const cap = { v: Math.max(1 << 16, Math.ceil(verts * 1.5)), i: Math.max(1 << 17, Math.ceil(idx * 1.5)) };
      b = new THREE.BatchedMesh(64, cap.v, cap.i, this.M[name]);
      b.cap = cap;
      b.frustumCulled = false; // przycinanie robi BatchedMesh osobno dla każdego fragmentu
      b.matrixAutoUpdate = false;
      const detail = setName === 'detail';
      b.castShadow = this.shadows && detail && !GROUND.has(name) && name !== 'light';
      b.receiveShadow = this.shadows && detail;
      this.scene.add(b);
      set.set(name, b);
    }
    // rośnie skokowo (×1,5), więc kopiowanie przy rozbudowie zdarza się kilka razy w całym ładowaniu
    if (b.unusedVertexCount < verts || b.unusedIndexCount < idx) {
      const usedV = b.cap.v - b.unusedVertexCount, usedI = b.cap.i - b.unusedIndexCount;
      b.cap = { v: Math.max(Math.ceil(b.cap.v * 1.5), usedV + verts + 8192), i: Math.max(Math.ceil(b.cap.i * 1.5), usedI + idx + 16384) };
      b.setGeometrySize(b.cap.v, b.cap.i);
    }
    if (b.instanceCount >= b.maxInstanceCount) b.setInstanceCount(b.maxInstanceCount * 2);
    return b;
  }

  // mats: { materiał: { p, n, uv, c, w?, i } } z buildChunk / buildChunkLOD / ...
  add(mats, { lod = false } = {}) {
    if (this.sealed) throw new Error('WorldMesh: świat jest już scalony');
    const items = [];
    let tris = 0;
    for (const [name, buf] of Object.entries(mats)) {
      if (!this.M[name]) continue;
      const b = this._batch(lod ? 'lod' : 'detail', name, buf.p.length / 3, buf.i.length);
      const g = chunkGeometry(buf);
      const gid = b.addGeometry(g);
      const iid = b.addInstance(gid);
      g.dispose();
      items.push({ b, gid, iid });
      tris += buf.i.length / 3;
    }
    return { items, tris, visible: true };
  }

  setVisible(h, v) {
    if (!h || h.visible === v) return;
    h.visible = v;
    for (const it of h.items) it.b.setVisibleAt(it.iid, v);
  }

  remove(h) {
    for (const it of h.items) { it.b.deleteInstance(it.iid); it.b.deleteGeometry(it.gid); }
    this.removed++;
    // po serii usunięć zagęszczamy bufory (BatchedMesh nie wypełnia dziur sam)
    if (this.removed >= 8) { this.removed = 0; this.optimize(); }
  }

  optimize() {
    for (const set of Object.values(this.sets)) for (const b of set.values()) b.optimize();
  }

  // Po załadowaniu całego świata: dane wierzchołków są już na karcie graficznej, więc kopie w
  // pamięci procesora (ok. 150 MB) można zwolnić. Indeksów zostawiamy (BatchedMesh czyta ich typ).
  seal() {
    this.sealed = true;
    for (const set of Object.values(this.sets))
      for (const b of set.values())
        for (const a of Object.values(b.geometry.attributes)) a.array = null;
  }
}
