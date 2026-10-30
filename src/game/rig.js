// Szkielet człowieka: geometria części (z gen/people.js), losowy wygląd i poza.
// Pozę liczymy na procesorze jako macierze przegubów: root → miednica → tułów → głowa/ramiona,
// biodra → kolana → stopy. Te same funkcje służą grze (instancje) i podglądowi w Node.
import * as THREE from 'three';
import { Builder } from '../gen/builder.js';
import { Cage } from '../gen/cage.js';
import { PEOPLE_PARTS, PART_TINT, PELVIS_Y, DIM } from '../gen/people.js';

export const BASE_SCALE = 0.92; // model ma ~1,9 m, gra ~1,75 m
const lin = (c) => Math.pow(c, 2.2);

// ── geometria części: początek układu = przegub, współrzędne świata = lokalne ──
export function buildPartGeometries(M) {
  const unit = () => new Cage([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]);
  const out = {};
  for (const [name, fn] of Object.entries(PEOPLE_PARTS)) {
    const b = new Builder();
    b.cell(unit(), 1, 1, 1);
    fn(b);
    const buf = b.finish().mats.cloth;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(buf.n, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(buf.c, 3, true));
    g.setIndex(new THREE.BufferAttribute(buf.i, 1));
    g.computeBoundingSphere();
    out[name] = { geometry: g, material: M.cloth, tint: PART_TINT[name], tris: buf.i.length / 3 };
  }
  return out;
}

// geometria modułu we współrzędnych absolutnych (klatka jednostkowa = bez przesunięcia) —
// części zależnie od materiału: [{ name, geometry, material }]
export function identityParts(fn, p, M) {
  const b = new Builder();
  b.cell(new Cage([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]), 1, 1, 1);
  fn(b, 1, 1, 1, p);
  const out = [];
  for (const [name, buf] of Object.entries(b.finish().mats)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(buf.n, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(buf.c, 3, true));
    g.setIndex(new THREE.BufferAttribute(buf.i, 1));
    g.computeBoundingSphere();
    out.push({ name, geometry: g, material: M[name] });
  }
  return out;
}

// ── losowy wygląd (kolory w przestrzeni liniowej) ────────────────────────────
const SKIN = [[0.93, 0.78, 0.66], [0.86, 0.66, 0.52], [0.76, 0.55, 0.41], [0.55, 0.38, 0.28], [0.4, 0.27, 0.2]];
const HAIR = [[0.07, 0.06, 0.05], [0.2, 0.13, 0.08], [0.33, 0.21, 0.12], [0.5, 0.25, 0.1], [0.78, 0.65, 0.4], [0.62, 0.62, 0.62]];
const COATS_M = [[0.14, 0.14, 0.16], [0.28, 0.2, 0.14], [0.2, 0.25, 0.36], [0.36, 0.36, 0.3], [0.22, 0.3, 0.24], [0.42, 0.34, 0.26], [0.5, 0.5, 0.52], [0.3, 0.12, 0.1]];
const PANTS_M = [[0.1, 0.1, 0.12], [0.22, 0.2, 0.18], [0.32, 0.3, 0.28], [0.16, 0.18, 0.26], [0.35, 0.27, 0.2]];
const DRESS_F = [[0.2, 0.28, 0.45], [0.5, 0.15, 0.18], [0.24, 0.4, 0.3], [0.62, 0.42, 0.45], [0.72, 0.68, 0.58], [0.4, 0.4, 0.45], [0.55, 0.38, 0.2], [0.35, 0.22, 0.38]];
const SHIRTS = [[0.92, 0.9, 0.84], [0.88, 0.9, 0.95], [0.85, 0.82, 0.7], [0.95, 0.95, 0.93]];
const HATS = [[0.08, 0.08, 0.09], [0.2, 0.14, 0.1], [0.4, 0.38, 0.34], [0.55, 0.45, 0.3], [0.2, 0.24, 0.3]];
const HATS_F = [[0.85, 0.8, 0.7], [0.3, 0.2, 0.3], [0.2, 0.2, 0.25], [0.55, 0.25, 0.25], [0.8, 0.7, 0.75]];

const lc = (a) => [lin(a[0]), lin(a[1]), lin(a[2])];
const jit = (a, r, k = 0.1) => lc(a.map((c) => Math.max(0, Math.min(1, c * (1 + (r.next() - 0.5) * k * 2)))));

// opts: { female, child, driver }
export function makeStyle(r, opts = {}) {
  const female = opts.female ?? r.chance(0.42), child = !!opts.child;
  const s = { female, child, skin: jit(r.pick(SKIN), r, 0.05), hairC: jit(r.pick(HAIR), r, 0.15), shirt: lc(r.pick(SHIRTS)), pants: jit(r.pick(PANTS_M), r), accent: jit(r.pick(DRESS_F), r) };
  s.w = (child ? 0.8 : 1) * (0.92 + r.next() * 0.18) * (female ? 0.94 : 1);
  s.h = child ? 0.64 + r.next() * 0.1 : (female ? 0.93 : 1) * (0.94 + r.next() * 0.12);
  if (female && !child) {
    s.torso = r.chance(0.8) ? 'dress' : 'jacket';
    s.coat = jit(r.pick(DRESS_F), r, 0.08);
    s.hair = r.chance(0.55) ? 'hairBun' : 'hairLong';
    s.hat = r.chance(0.55) ? 'hatBonnet' : null;
    s.hatC = jit(r.pick(HATS_F), r);
    s.pants = lc([0.12, 0.11, 0.11]);
    s.hasShirt = s.torso === 'jacket';
    s.scarf = r.chance(0.3);
  } else {
    s.torso = child ? 'jacket' : r.chance(0.28) ? 'coat' : 'jacket';
    s.coat = jit(r.pick(COATS_M), r, 0.1);
    s.hair = r.chance(0.35) && !child ? 'hairStache' : 'hairShort';
    s.hat = child ? (r.chance(0.5) ? 'hatCap' : null) : r.weighted([['hatTop', 12], ['hatBowler', 30], ['hatCap', 25], [null, 33]]);
    s.hatC = jit(r.pick(HATS), r);
    s.hasShirt = true;
    s.scarf = false;
  }
  if (child && female) { s.torso = 'dress'; s.coat = jit(r.pick(DRESS_F), r, 0.1); s.hair = 'hairLong'; s.hasShirt = false; }
  return s;
}

// ── poza: macierze przegubów ─────────────────────────────────────────────────
const TMP = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), ax: new THREE.Vector3() };
const ONE = new THREE.Vector3(1, 1, 1);

// out = parent · T(tx,ty,tz) · Ry · Rz · Rx (obrót wokół przegubu)
function joint(out, parent, tx, ty, tz, rx, ry, rz) {
  TMP.p.set(tx, ty, tz);
  TMP.q.setFromEuler(TMP.e.set(rx, ry, rz, 'YZX'));
  TMP.m.compose(TMP.p, TMP.q, ONE);
  return out.multiplyMatrices(parent, TMP.m);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const M_ = Array.from({ length: 12 }, () => new THREE.Matrix4());
const ROOT = new THREE.Matrix4();

// h: { x,y,z,yaw, speed, phase, t, sit, wave, fall, fallDx, fallDz, look, steer, style }
// emit(partName, matrix, style) wywoływane dla każdej części
export function pose(h, emit) {
  const st = h.style, k = BASE_SCALE;
  const gait = clamp(h.speed / 1.4, 0, 3.4), sit = h.sit || 0, wave = h.wave || 0, fall = h.fall || 0, ph = h.phase, t = h.t;
  const Ah = clamp(0.38 * Math.pow(gait, 0.75), 0, 0.92) * (1 - sit);
  const Kn = clamp(0.8 * Math.pow(gait, 0.6), 0, 1.5) * (1 - sit);
  const bob = 0.022 * Math.min(gait, 2) * Math.cos(2 * ph) * (1 - sit);
  const pelvisY = lerp(PELVIS_Y, 0.14, sit) + bob + fall * 0.0;
  const sph = Math.sin(ph), cph = Math.cos(ph);

  // root: położenie + (upadek: obrót wokół osi poziomej przez stopy) + kurs + skala
  TMP.p.set(h.x, h.y, h.z);
  TMP.q.setFromEuler(TMP.e.set(0, -h.yaw, 0));
  TMP.s.set(st.w * k, st.h * k, st.w * k);
  ROOT.compose(TMP.p, TMP.q, TMP.s);
  if (fall > 0) {
    TMP.ax.set(h.fallDz, 0, -h.fallDx);
    TMP.q.setFromAxisAngle(TMP.ax, fall * Math.PI * 0.5);
    TMP.m.makeRotationFromQuaternion(TMP.q);
    // obrót wokół punktu (x,z) na ziemi; potem przesunięcie o kilka cm, żeby ciało leżało na ziemi, a nie w niej
    TMP.p.set(h.x, h.y + 0.1 * fall, h.z);
    const T1 = M_[11].makeTranslation(TMP.p.x, TMP.p.y, TMP.p.z);
    const Tm = new THREE.Matrix4().makeTranslation(-h.x, -h.y, -h.z);
    ROOT.premultiply(Tm).premultiply(TMP.m).premultiply(T1);
  }
  // tułów: pochylenie do przodu (bieg), skręt biodra, oddychanie
  const lean = clamp(0.045 * gait, 0, 0.3) + sit * 0.0 + (st.child ? 0.02 : 0);
  const idle = Math.sin(t * 1.7) * 0.012 * (1 - Math.min(1, gait));
  const twist = -sph * 0.12 * Math.min(gait, 1.6) * (1 - sit);
  const T = joint(M_[0], ROOT, 0, pelvisY * 1, 0, -sph * 0.02 * Math.min(gait, 1.4) + idle * 0.6, twist, -lean - sit * 0.06 + fall * 0.0);
  emit(st.torso, T, st);
  if (st.hasShirt && st.torso !== 'dress') emit('shirt', T, st);
  if (st.scarf) emit('scarf', T, st);
  // głowa: odchyla się, żeby patrzeć przed siebie; rozgląda się na postoju
  const headYaw = (h.look || 0) - twist * 0.6 + Math.sin(t * 0.6 + h.id * 1.7) * 0.18 * (1 - Math.min(1, gait * 1.5)) * (1 - sit) * (1 - fall);
  const H = joint(M_[1], T, 0, DIM.torso, 0, 0, headYaw, lean * 0.8 + sit * 0.06);
  emit('head', H, st);
  if (st.hair) emit(st.hair, H, st);
  if (st.hat) emit(st.hat, H, st);

  // ramiona
  const aSw = Ah * 0.75, flop = fall;
  for (const s of [-1, 1]) {
    // s = +1 prawa (z>0). Lewe ramię do przodu, gdy prawa noga do przodu
    let swing = (s > 0 ? sph : -sph) * aSw;
    let elbow = 0.18 + 0.32 * Math.min(gait, 2) * 0.5 + Math.max(0, swing) * 0.5;
    let spread = 0.07 + 0.04 * Math.sin(t * 1.3 + s) * (1 - Math.min(1, gait));
    // siedzi: kierowca trzyma kierownicę, pasażer (lap) opiera dłonie na kolanach
    const lap = h.lap || 0;
    swing = lerp(swing, lerp(1.0 + (h.steer || 0) * s * 0.12, 0.38, lap), sit);
    elbow = lerp(elbow, lerp(0.85, 1.15, lap), sit);
    spread = lerp(spread, lerp(spread, 0.12, lap), sit);
    if (s > 0 && wave > 0) {
      swing = lerp(swing, 2.55, wave);
      spread = lerp(spread, 0.25, wave);
      elbow = lerp(elbow, 0.55 + 0.5 * Math.sin(t * 9), wave);
    }
    swing = lerp(swing, 0.5 + 0.3 * s, flop);
    spread = lerp(spread, 0.7, flop);
    elbow = lerp(elbow, 0.3, flop);
    const A = joint(M_[2], T, 0, DIM.shoulderY, s * DIM.shoulderZ, -s * spread, 0, swing);
    emit('upperArm', A, st);
    const F = joint(M_[3], A, 0, -DIM.upper, 0, 0, 0, elbow);
    emit('foreArm', F, st);
    const Hd = joint(M_[4], F, 0, -DIM.fore, 0, 0, 0, 0.1);
    emit('hand', Hd, st);
  }
  // nogi
  for (const s of [-1, 1]) {
    // faza nogi: prawa przeciwnie do lewej
    const p = s > 0 ? ph + Math.PI : ph;
    let hip = Math.sin(p) * Ah;
    let knee = -(Kn * Math.pow(Math.max(0, Math.cos(p - 0.25)), 1.4) + 0.05 * (1 - sit));
    hip = lerp(hip, 1.5, sit);
    knee = lerp(knee, -1.28, sit);
    hip = lerp(hip, 0.2 + 0.1 * s, fall);
    knee = lerp(knee, -0.3, fall);
    const ankle = clamp(-(hip + knee) * 0.6, -0.6, 0.6) * (1 - sit) + sit * 0.0;
    const spreadL = fall * 0.12 * s;
    const Th = joint(M_[5], ROOT, 0, pelvisY, s * DIM.hipZ, -s * spreadL, 0, hip);
    // przy siedzeniu miednica jest niżej niż stojąc, a tułów ją niesie — nogi zaczynają od miednicy
    emit('thigh', Th, st);
    if (st.torso === 'coat') emit('coatFlap', Th, st);
    const Sh = joint(M_[6], Th, 0, -DIM.thigh, 0, 0, 0, knee);
    emit('shin', Sh, st);
    const Sf = joint(M_[7], Sh, 0, -DIM.shin, 0, 0, 0, ankle);
    emit('shoe', Sf, st);
  }
}

// podgląd w Node: pozowana figura jako zestaw siatek (kolory instancji wpieczone w wierzchołki)
export function previewFigure(seed, mode = 'stand', Rng, parts, place = {}) {
  const r = new Rng(seed);
  const st = makeStyle(r, { female: mode.includes('f') ? true : mode.includes('m') ? false : undefined });
  const h = { x: place.x ?? 0, y: place.y ?? 0, z: place.z ?? 0, yaw: place.yaw ?? 0, speed: 0, phase: 0.6, t: 0.3, sit: 0, wave: 0, fall: 0, fallDx: 1, fallDz: 0, look: 0, steer: 0, id: 1, lap: place.lap || 0, style: st };
  if (mode.includes('walk')) { h.speed = 1.4; }
  if (mode.includes('run')) { h.speed = 4.2; h.phase = 0.9; }
  if (mode.includes('sit')) { h.sit = 1; if (place.y === undefined) h.y = 0.7; }
  if (mode.includes('wave')) h.wave = 1;
  if (mode.includes('fall')) h.fall = 1;
  const out = [];
  pose(h, (name, mat, style) => {
    const P = parts[name];
    const pos = P.geometry.attributes.position, nor = P.geometry.attributes.normal, col = P.geometry.attributes.color, idx = P.geometry.index;
    const tint = P.tint ? style[P.tint] : [1, 1, 1];
    const n = pos.count, p = new Float32Array(n * 3), nn = new Int8Array(n * 3), c = new Uint8Array(n * 3), v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(mat);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mat);
      p.set([v.x, v.y, v.z], i * 3);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      nn.set([Math.round(v.x * 127), Math.round(v.y * 127), Math.round(v.z * 127)], i * 3);
      for (let k = 0; k < 3; k++) c[i * 3 + k] = Math.min(255, Math.round(col.array[i * 3 + k] * tint[k]));
    }
    out.push({ cloth: { p, n: nn, uv: new Float32Array(n * 2), c, i: Uint32Array.from(idx.array) } });
  });
  return out;
}
