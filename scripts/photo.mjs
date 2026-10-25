// „Aparat”: zdjęcia świata gry bez przeglądarki (Node + programowy renderer).
// Używa tych samych modułów, tekstur, materiałów i światła co gra.
//   node scripts/photo.mjs [--out katalog] [--seed N] [--only nazwa,nazwa] [--fast]
// Wynik: PNG z ujęciami miasta (ulice, kamienice, rynek, rzeka…) i plansze
// „studyjne” z każdym elementem osobno.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, Image as NImage } from '@napi-rs/canvas';
import { Tex, Env, render, srgbToLin } from './photo/raster.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(arg('--out', path.join(ROOT, 'zdjecia')));
const SEED = Number(arg('--seed', 1984));
const ONLY = arg('--only', '') ? arg('--only').split(',') : null;
const FAST = args.includes('--fast');
fs.mkdirSync(OUT, { recursive: true });

// ── canvas i obrazki w Node (tekstury i plakaty rysują się tym samym kodem co w grze) ─
globalThis.document = { createElement: () => createCanvas(300, 150) };
globalThis.Image = class extends NImage {
  set src(v) {
    if (typeof v === 'string') {
      const f = path.join(ROOT, 'public', v.replace(/^\/+/, ''));
      try { super.src = fs.readFileSync(f); } catch { setTimeout(() => this.onerror?.(new Error(f)), 0); }
    } else super.src = v;
  }
};

const THREE = await import('three');
const { createMaterials } = await import('../src/render/materials.js');
const { LIGHTS } = await import('../src/render/atmosphere.js');
const { generateCity } = await import('../src/city/layout.js');
const { buildChunk, buildChunkLOD, buildRiver, buildGroundTile, GROUND_TILES } = await import('../src/gen/assemble.js');
const { Builder } = await import('../src/gen/builder.js');
const { Cage } = await import('../src/gen/cage.js');
const { M: MOD } = await import('../src/gen/modules.js');
const { DETAIL_IN } = await import('../src/game/streaming.js');
const grid = await import('../src/city/grid.js');

// ── materiały gry → opis dla renderera ──────────────────────────────────────
const texCache = new Map();
function texOf(t, srgb) {
  if (!t) return null;
  const img = t.image, key = img;
  const k2 = srgb ? 's' : 'l';
  let e = texCache.get(key);
  if (!e) texCache.set(key, (e = {}));
  if (!e[k2]) {
    const data = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    e[k2] = new Tex(img.width, img.height, data, { srgb, flipY: t.flipY });
  }
  return e[k2];
}
const { M } = await createMaterials();
const mats = {};
for (const [name, m] of Object.entries(M)) {
  const em = m.emissive && m.emissiveIntensity ? [m.emissive.r * m.emissiveIntensity, m.emissive.g * m.emissiveIntensity, m.emissive.b * m.emissiveIntensity] : null;
  mats[name] = {
    color: [m.color.r, m.color.g, m.color.b],
    vertexColors: !!m.vertexColors,
    map: texOf(m.map, true), mapRep: m.map ? [m.map.repeat.x, m.map.repeat.y] : [1, 1], mapOff: m.map ? [m.map.offset.x, m.map.offset.y] : [0, 0],
    normalMap: texOf(m.normalMap, false), nRep: m.normalMap ? [m.normalMap.repeat.x, m.normalMap.repeat.y] : [1, 1], nOff: m.normalMap ? [m.normalMap.offset.x, m.normalMap.offset.y] : [0, 0],
    normalScale: m.normalScale ? [m.normalScale.x, m.normalScale.y] : [1, 1],
    roughness: m.roughness ?? 1, metalness: m.metalness ?? 0, envInt: m.envMapIntensity ?? 1,
    emissive: em && (em[0] + em[1] + em[2] > 0) ? em : null, emissiveMap: texOf(m.emissiveMap, true),
    double: m.side === THREE.DoubleSide, bias: m.polygonOffset ? 3e-5 : 0,
  };
}

// ── światło i niebo z atmosphere.js ─────────────────────────────────────────
const col = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
const sd = LIGHTS.sunDir, sl = Math.hypot(...sd), SUN = [sd[0] / sl, sd[1] / sl, sd[2] / sl];
const TOP = col(LIGHTS.skyTop), HOR = col(LIGHTS.fog);
function skyRad(d, o) {
  const h = Math.max(0, Math.min(1, d[1])), k = Math.pow(h, 0.6);
  const s = Math.max(0, d[0] * SUN[0] + d[1] * SUN[1] + d[2] * SUN[2]);
  const a = Math.pow(s, 12), b = Math.pow(s, 900);
  for (let i = 0; i < 3; i++) o[i] = HOR[i] + (TOP[i] - HOR[i]) * k + [0.35, 0.28, 0.18][i] * a + [1.6, 1.4, 1.1][i] * b;
}
// otoczenie do odbić: niebo, ziemia, sylwetka miasta na horyzoncie, tarcza słońca
const GROUND_ENV = col(LIGHTS.envGround);
const sil = [];
for (let i = 0; i < 90; i++) {
  const a = (i / 90) * Math.PI * 2 + Math.sin(i * 7.1) * 0.02, h = 30 + ((i * 37) % 11) * 9, w = 40 + ((i * 13) % 7) * 6;
  const c = new THREE.Color().setHSL(0.08 + ((i * 17) % 10) * 0.012, 0.18, 0.32 + ((i * 7) % 5) * 0.05);
  sil.push({ a, half: w / 2 / 320, top: Math.atan2(h - 20, 320), c: [c.r, c.g, c.b] });
}
const env = new Env((d, o) => {
  if (d[1] < -0.0134) { o[0] = GROUND_ENV[0]; o[1] = GROUND_ENV[1]; o[2] = GROUND_ENV[2]; return; }
  const az = Math.atan2(d[2], d[0]), el = Math.asin(Math.max(-1, Math.min(1, d[1])));
  for (const s of sil) {
    let da = Math.abs(az - s.a); if (da > Math.PI) da = 2 * Math.PI - da;
    if (da < s.half && el < s.top) { o[0] = s.c[0]; o[1] = s.c[1]; o[2] = s.c[2]; return; }
  }
  skyRad(d, o);
  if (d[0] * SUN[0] + d[1] * SUN[1] + d[2] * SUN[2] > Math.cos(0.033)) { o[0] = 6; o[1] = 5.2; o[2] = 4; }
}, 256);
const FOG_SRGB = [((LIGHTS.fog >> 16) & 255) / 255, ((LIGHTS.fog >> 8) & 255) / 255, (LIGHTS.fog & 255) / 255];
function baseScene(meshes, shadow, { fog = true } = {}) {
  return {
    meshes, mats, env, shadow,
    sun: { dir: SUN, color: col(LIGHTS.sun, LIGHTS.sunIntensity) },
    hemi: { sky: col(LIGHTS.hemiSky, LIGHTS.hemiIntensity), ground: col(LIGHTS.hemiGround, LIGHTS.hemiIntensity) },
    envIntensity: LIGHTS.envIntensity, exposure: LIGHTS.exposure,
    fog: fog ? { color: FOG_SRGB, density: LIGHTS.fogDensity } : null,
    sky: skyRad,
  };
}
void srgbToLin;

const NO_CAST = new Set(['cobble', 'slab', 'curb', 'light']);
const meshesOf = (out, cast = true, receive = true) => Object.entries(out.mats).map(([mat, m]) => ({ mat, ...m, cast: cast && !NO_CAST.has(mat), receive }));

function savePNG(img, file) {
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(img.data);
  ctx.putImageData(id, 0, 0);
  fs.writeFileSync(file, c.toBuffer('image/png'));
}

const SIZE = FAST ? [640, 360] : [1280, 720];
const SS = FAST ? 1 : 2;

// ─────────────────────────────────────────────────────────────────────────────
//  MIASTO
// ─────────────────────────────────────────────────────────────────────────────
let city = null;
const detailCache = new Map(), lodCache = new Map();
let staticMeshes = null;
function cityMeshes(camPos) {
  const T = city.terrain;
  if (!staticMeshes) {
    staticMeshes = [];
    staticMeshes.push(...meshesOf(buildRiver(city)));
    for (let x = 0; x < GROUND_TILES; x++) for (let z = 0; z < GROUND_TILES; z++) staticMeshes.push(...meshesOf(buildGroundTile(city, x, z)));
    // morze i rzeka (jak w main.js)
    const S = 3000;
    staticMeshes.push({ mat: 'water', p: new Float32Array([-S, T.seaY - 0.02, -S, S, T.seaY - 0.02, -S, S, T.seaY - 0.02, S, -S, T.seaY - 0.02, S]), n: new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0]), uv: new Float32Array([0, 6000, 6000, 6000, 6000, 0, 0, 0]), c: new Uint8Array(12).fill(255), i: new Uint32Array([0, 2, 1, 0, 3, 2]), cast: false, receive: true });
    const wv = [], wi = [], wuv = [], wn = [];
    for (let i = 0; i < T.left.length; i++) {
      wv.push(T.left[i][0], T.waterY, T.left[i][1], T.right[i][0], T.waterY, T.right[i][1]);
      wuv.push(T.left[i][0], T.left[i][1], T.right[i][0], T.right[i][1]);
      wn.push(0, 127, 0, 0, 127, 0);
      if (i > 0) { const a = (i - 1) * 2; wi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    // nawinięcie w górę
    const p = wv, e1 = [p[3] - p[0], p[5] - p[2]], e2 = [p[6] - p[0], p[8] - p[2]];
    if (e1[1] * e2[0] - e1[0] * e2[1] < 0) wi.reverse();
    staticMeshes.push({ mat: 'water', p: new Float32Array(wv), n: new Int8Array(wn), uv: new Float32Array(wuv), c: new Uint8Array(wv.length).fill(255), i: new Uint32Array(wi), cast: false, receive: true });
  }
  const out = [...staticMeshes];
  for (const ch of city.chunks) {
    const d = Math.hypot(ch.center[0] - camPos[0], ch.center[1] - camPos[2]) - ch.radius;
    if (d < DETAIL_IN) {
      if (!detailCache.has(ch.id)) detailCache.set(ch.id, meshesOf(buildChunk(city, ch.id)));
      out.push(...detailCache.get(ch.id));
    } else {
      if (!lodCache.has(ch.id)) lodCache.set(ch.id, meshesOf(buildChunkLOD(city, ch.id), false, false));
      out.push(...lodCache.get(ch.id));
    }
  }
  return out;
}

function moduleAt(name, W, H, D, p, pos, yaw, y = 0) {
  const b = new Builder();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (x, z) => [pos[0] + c * x - s * z, pos[2] + s * x + c * z];
  b.cell(Cage.quad(P(-W / 2, -D / 2), P(W / 2, -D / 2), P(-W / 2, D / 2), P(W / 2, D / 2), y, y + H), W, H, D);
  MOD[name](b, W, H, D, p);
  return meshesOf(b.finish());
}

function cityShot(name, camPos, target, { fov = 72, extra = [], shadowHalf = 80, title } = {}) {
  if (ONLY && !ONLY.includes(name)) return;
  const t0 = performance.now();
  const meshes = [...cityMeshes(camPos), ...extra];
  // cień jak w grze: 160 × 160 m wokół kamery, 2048 tekseli
  const shadow = { center: [camPos[0], city.terrain.height(camPos[0], camPos[2]), camPos[2]], half: shadowHalf, res: Math.round((2048 * shadowHalf) / 80), bias: 0.1 };
  const img = render(baseScene(meshes, shadow), { pos: camPos, target, fov }, { width: SIZE[0], height: SIZE[1], ss: SS });
  savePNG(img, path.join(OUT, `${name}.png`));
  console.log(`${name}: ${(img.triCount / 1e6).toFixed(2)} M tri w kadrze, ${((performance.now() - t0) / 1000).toFixed(1)} s${title ? ' — ' + title : ''}`);
}

const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// ulica z kamienicami po obu stronach (najwięcej pięter wzdłuż)
function findStreet(zone, minLen = 34) {
  const g = city.grid;
  let best = null, bs = -1;
  for (const s of city.streets) {
    if (!s.town || s.bridge) continue;
    const L = dist2(s.a, s.b);
    if (L < minLen) continue;
    const u = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L], n = [-u[1], u[0]];
    const side = [0, 0];
    for (let t = 4; t <= L - 4; t += 4)
      for (const [k, sg] of [[0, -1], [1, 1]]) {
        const px = s.a[0] + u[0] * t + n[0] * sg * (s.rw + 7), pz = s.a[1] + u[1] * t + n[1] * sg * (s.rw + 7);
        let hmax = 0;
        for (const v of g.vAt(px, pz)) if (g.TY[v] === grid.T_BLD && g.ZN[v] === zone && Math.hypot(g.X[v] - px, g.Z[v] - pz) < 5) hmax = Math.max(hmax, g.H[v]);
        side[k] += hmax;
      }
    const sc = Math.min(side[0], side[1]) * Math.min(L, 80);
    if (sc > bs) { bs = sc; best = { s, L, u, n }; }
  }
  return best;
}

function cityShots() {
  city = generateCity(SEED);
  const T = city.terrain, H = (x, z) => T.height(x, z);

  // 1. Start gry: taksówka przy moście, kamera zza auta (jak w main.js)
  {
    const sp = city.spawn, hd = Math.atan2(-Math.cos(sp.yaw), -Math.sin(sp.yaw));
    const car = [sp.x, H(sp.x, sp.z) + 0.07, sp.z];
    const fwd = [Math.cos(hd), Math.sin(hd)], pitch = -0.12;
    const cam = [car[0] - fwd[0] * 7.5 * Math.cos(pitch), car[1] + 1.6 + Math.sin(-pitch) * 7.5, car[2] - fwd[1] * 7.5 * Math.cos(pitch)];
    const taxi = moduleAt('oldcar', 3.6, 2.2, 1.7, { color: [0.95, 0.76, 0.12], seat: [0.3, 0.12, 0.08], taxi: true }, car, hd, car[1]);
    cityShot('01_start_taksowka', cam, [car[0], car[1] + 1.3, car[2]], { extra: taxi, title: 'widok na starcie gry' });
  }
  // 2–3. Ulica z kamienicami: na wysokości oczu i fasada z naprzeciwka
  const st = findStreet(grid.Z_TENEMENT);
  if (st) {
    const { s, L, u, n } = st;
    const P = (t, side, y) => { const x = s.a[0] + u[0] * t + n[0] * side, z = s.a[1] + u[1] * t + n[1] * side; return [x, H(x, z) + y, z]; };
    const cam = P(L * 0.08, -s.rw * 0.45, 1.7), tgt = P(L * 0.75, s.rw * 0.3, 4.5);
    cityShot('02_ulica_kamienice', cam, tgt, { title: 'ulica z kamienicami, wysokość oczu' });
    const c2 = P(L * 0.5, -s.rw + 0.6, 1.8), t2 = P(L * 0.5 + 1, s.rw + 6, 7.5);
    cityShot('03_fasada_kamienicy', c2, t2, { fov: 70, title: 'fasada z drugiej strony ulicy' });
    const c3 = P(-14, 0, 40), t3 = P(L * 0.7, 0, 6);
    cityShot('04_kamienice_z_gory', c3, t3, { title: 'kamienice i dachy z góry' });
  }
  // 5. Rynek z ratuszem
  {
    // kierunek, z którego widać ratusz bez zasłaniających kamienic
    const g = city.grid, pz = T.plaza;
    let best = 0, bs = -1;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      let free = 0;
      for (let r = 14; r <= 48; r += 2) {
        const x = pz.x + Math.cos(a) * r, z = pz.z + Math.sin(a) * r;
        if (g.vAt(x, z).some((v) => g.TY[v] === grid.T_BLD && g.ZN[v] !== grid.Z_MINISTRY && Math.hypot(g.X[v] - x, g.Z[v] - z) < 6)) break;
        free = r;
      }
      if (free > bs) { bs = free; best = a; }
    }
    const R = Math.min(46, bs), c = [pz.x + Math.cos(best) * R, H(pz.x + Math.cos(best) * R, pz.z + Math.sin(best) * R) + 1.8, pz.z + Math.sin(best) * R], t = [pz.x, pz.y + 10, pz.z];
    cityShot('05_rynek_ratusz', c, t, { title: 'rynek i ratusz' });
  }
  // 6. Rzeka i most
  if (city.bridges.length) {
    const br = city.bridges[0];
    const c = [br.p[0] + br.perp[0] * 30 + br.axis[0] * (br.L * 0.9 + 4), T.bankY + 1.8, br.p[1] + br.perp[1] * 30 + br.axis[1] * (br.L * 0.9 + 4)];
    cityShot('06_rzeka_most', c, [br.p[0], T.waterY + 2, br.p[1]], { title: 'nabrzeże i most' });
  }
  // 7. Domki
  const sh = findStreet(grid.Z_HOUSES, 28);
  if (sh) {
    const { s, L, u, n } = sh;
    const P = (t, side, y) => { const x = s.a[0] + u[0] * t + n[0] * side, z = s.a[1] + u[1] * t + n[1] * side; return [x, H(x, z) + y, z]; };
    cityShot('07_ulica_domki', P(L * 0.1, -s.rw * 0.4, 1.7), P(L * 0.8, s.rw + 4, 3), { title: 'dzielnica domków' });
  }
  // 8. Park z drzewami
  {
    const t = city.trees.filter((tr) => tr.s > 0.8 && T.inland(tr.p[0], tr.p[1]) > 120);
    const g = city.grid;
    let best = null, bn = 0;
    for (const tr of t.slice(0, 400)) { const k = t.filter((o) => dist2(o.p, tr.p) < 25).length; if (k > bn) { bn = k; best = tr; } }
    if (best) {
      const c = [best.p[0] + 18, H(best.p[0] + 18, best.p[1] + 10) + 1.7, best.p[1] + 10];
      cityShot('08_park_drzewa', c, [best.p[0], H(best.p[0], best.p[1]) + 4, best.p[1]], { title: 'park' });
    }
    void g;
  }
  // 9. Widok z lotu ptaka
  {
    const pz = T.plaza;
    cityShot('09_z_lotu_ptaka', [pz.x + 150, pz.y + 110, pz.z + 120], [pz.x, pz.y, pz.z], { shadowHalf: 160, title: 'miasto z lotu ptaka' });
  }
  // 10. Wybrzeże z latarnią morską
  {
    const lh = city.extras.find((e) => e.kind === 'lighthouse');
    if (lh) {
      const a = Math.atan2(lh.p[1], lh.p[0]);
      const c = [lh.p[0] + Math.cos(a) * 70 + Math.sin(a) * 35, T.seaY + 7, lh.p[1] + Math.sin(a) * 70 - Math.cos(a) * 35];
      cityShot('10_latarnia_morska', c, [lh.p[0], T.seaY + 12, lh.p[1]], { title: 'latarnia morska' });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  STUDIO: każdy element osobno na płycie chodnika
// ─────────────────────────────────────────────────────────────────────────────
function floor(mat, half, y = 0) {
  const b = new Builder();
  for (let x = -half; x < half; x += 2) for (let z = -half; z < half; z += 2) b.wpoly(mat, [[x, y, z], [x + 2, y, z], [x + 2, y, z + 2], [x, y, z + 2]], [0, 1, 0], { flat: 1 });
  return meshesOf(b.finish());
}
function bbox(meshes) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.p[i + k]); mx[k] = Math.max(mx[k], m.p[i + k]); }
  return { mn, mx, c: mn.map((v, k) => (v + mx[k]) / 2), r: Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 };
}
function studioShot(meshes, { az = -2.2, el = 0.32, zoom = 1, ground = 'slab', size = [560, 420], fov = 40, target } = {}) {
  const bb = bbox(meshes);
  const r = bb.r * 1.05 / zoom, d = r / Math.sin((fov * Math.PI) / 360);
  const c = target || bb.c;
  const cam = [c[0] + Math.cos(az) * Math.cos(el) * d, c[1] + Math.sin(el) * d, c[2] + Math.sin(az) * Math.cos(el) * d];
  const half = Math.max(8, Math.ceil(bb.r * 1.6));
  const all = [...meshes, ...floor(ground, half, -0.001)];
  const shadow = { center: [c[0], 0, c[2]], half: half, res: 3072, bias: 0.03 };
  return render(baseScene(all, shadow, { fog: false }), { pos: cam, target: c, fov }, { width: size[0], height: size[1], ss: SS, vignette: false });
}
function sheet(file, tiles, cols, title) {
  const tw = tiles[0].img.width, th = tiles[0].img.height, lh = 30, rows = Math.ceil(tiles.length / cols);
  const c = createCanvas(cols * tw, rows * (th + lh) + 44), ctx = c.getContext('2d');
  ctx.fillStyle = '#16202a'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#f2c200'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(title, 14, 31);
  tiles.forEach((t, i) => {
    const x = (i % cols) * tw, y = 44 + Math.floor(i / cols) * (th + lh);
    const id = ctx.createImageData(tw, th); id.data.set(t.img.data); ctx.putImageData(id, x, y);
    ctx.fillStyle = '#e9e2cf'; ctx.font = '19px sans-serif'; ctx.fillText(t.label, x + 10, y + th + 21);
  });
  fs.writeFileSync(path.join(OUT, file), c.toBuffer('image/png'));
  console.log(file, tiles.length, 'kadrów');
}
const at = (name, W, H, D, p, yaw = 0, y = 0) => moduleAt(name, W, H, D, p, [0, 0, 0], yaw, y);

// fasada kamienicy złożona z modułów: parter + 3 piętra, gzymsy, dach
function facadeBoard(style, wallMat, tint, opts = {}) {
  const b = new Builder();
  const info = { tint, style, wallMat, groundMat: opts.groundMat || wallMat };
  b.setTint('plaster', tint);
  b.setTint('brick', style === 'brick' ? [0.98, 0.92, 0.88] : [0.8, 0.7, 0.64]);
  b.setTint('stone', opts.trim || [0.86, 0.83, 0.76]);
  const bays = opts.bays || 5, Wb = 3.3, D = 9, floors = opts.floors || 4;
  const p0 = {
    style, wallMat, groundMat: info.groundMat, frameTint: opts.frame || [0.94, 0.92, 0.86], doorTint: [0.36, 0.2, 0.14], metalTint: [0.2, 0.22, 0.21],
    signTint: [0.36, 0.2, 0.14], shopGlass: [0.3, 0.32, 0.33], variant: 0, bars: false, glassTint: [0.52, 0.58, 0.64], shutters: !!opts.shutters,
    shutterTint: [0.25, 0.4, 0.3], flowers: null, simple: false, sign: 'bread', winW: 0.42, winH: 0.55, curtain: [0.55, 0.18, 0.15], awning: [0.6, 0.18, 0.15],
  };
  const ground = opts.ground || ['shop', 'door', 'gate', 'rustic', 'window'];
  const upper = opts.upper || ['window', 'ornate', 'balcony', 'ornate', 'window'];
  const levelY = grid.levelY;
  for (let L = 0; L < floors; L++) {
    const y0 = levelY(L), y1 = levelY(L + 1);
    for (let i = 0; i < bays; i++) {
      const x0 = (i - bays / 2) * Wb, x1 = x0 + Wb;
      const cage = Cage.quad([x0, 0], [x1, 0], [x0, D], [x1, D], y0, y1);
      const p = { ...p0, variant: i % 2, glassTint: [[0.52, 0.58, 0.64], [0.48, 0.55, 0.62], [0.56, 0.6, 0.62], [0.44, 0.42, 0.38]][(i + L) % 4], flowers: L > 0 && i === 1 && opts.flowers ? opts.flowers : null };
      let mod = L === 0 ? ground[i % ground.length] : upper[i % upper.length];
      if (L === 0) p.ground = true;
      if (style === 'modern' && L > 0) mod = 'modern';
      if (style === 'house' && L > 0) mod = 'window';
      b.cell(cage, Wb, y1 - y0, D);
      MOD[mod](b, Wb, y1 - y0, D, p);
      if (L === 1 && style !== 'house') { b.cell(Cage.quad([x0, 0], [x1, 0], [x0, D], [x1, D], y0, y0 + 0.32), Wb, 0.32, D); MOD.string(b, Wb, 0.32, D, p); }
      if (L === floors - 1) {
        b.cell(Cage.quad([x0, 0], [x1, 0], [x0, D], [x1, D], y1, y1 + 0.5), Wb, 0.5, D);
        if (style === 'house') MOD.eave(b, Wb, 0.5, D, { roofTint: opts.roofTint || [0.66, 0.3, 0.2] });
        else MOD.cornice(b, Wb, 0.5, D, { style, consoles: style === 'ornate' });
      }
    }
    // ściany boczne
    for (const [xa, dir] of [[-bays / 2 * Wb, -1], [bays / 2 * Wb, 1]]) {
      const cage = dir < 0 ? Cage.quad([xa, D], [xa, 0], [xa + 1, D], [xa + 1, 0], y0, y1) : Cage.quad([xa, 0], [xa, D], [xa - 1, 0], [xa - 1, D], y0, y1);
      b.cell(cage, D, y1 - y0, 1);
      MOD.wall(b, D, y1 - y0, 1, { ...p0, ground: L === 0 });
    }
  }
  // dach dwuspadowy jak w mieście (wpoly)
  const top = levelY(floors) + 0.5, X0 = -bays / 2 * Wb, X1 = bays / 2 * Wb, ridge = opts.ridge ?? 3;
  const roofMat = opts.roofMat || 'roof';
  const rt = { tint: opts.roofTint || [0.36, 0.42, 0.52] };
  b.wpoly(roofMat, [[X0, top, 0], [X1, top, 0], [X1, top + ridge, D / 2], [X0, top + ridge, D / 2]], [0, 1, -1], rt);
  b.wpoly(roofMat, [[X1, top, D], [X0, top, D], [X0, top + ridge, D / 2], [X1, top + ridge, D / 2]], [0, 1, 1], rt);
  b.wpoly(wallMat, [[X0, top - 0.5, 0], [X0, top - 0.5, D], [X0, top + ridge, D / 2]], [-1, 0, 0]);
  b.wpoly(wallMat, [[X1, top - 0.5, 0], [X1, top - 0.5, D], [X1, top + ridge, D / 2]], [1, 0, 0]);
  b.cell(Cage.quad([X0 + 3, D / 2 - 0.5], [X0 + 4, D / 2 - 0.5], [X0 + 3, D / 2 + 0.5], [X0 + 4, D / 2 + 0.5], top, top + 1), 1, 1, 1);
  MOD.chimney(b, 0.5, 0.5, ridge - 1.2, ridge + 1.3, { chimneyTint: [0.6, 0.45, 0.4] });
  return meshesOf(b.finish());
}

function studioShots() {
  const tiles = [];
  const add = (label, meshes, o) => { tiles.push({ label, img: studioShot(meshes, o) }); };
  const want = (n) => !ONLY || ONLY.includes(n);
  if (want('kamienice')) {
    const T1 = [];
    const addT = (label, meshes, o) => T1.push({ label, img: studioShot(meshes, { size: [800, 600], fov: 38, az: -1.95, el: 0.12, zoom: 1.1, ...o }) });
    addT('kamienica klasyczna (tynk)', facadeBoard('classic', 'plaster', [0.88, 0.8, 0.62], { groundMat: 'stone', trim: [0.93, 0.9, 0.82] }));
    addT('kamienica ozdobna', facadeBoard('ornate', 'plaster', [0.72, 0.8, 0.84], { groundMat: 'stone', upper: ['ornate', 'balcony', 'ornate'], flowers: [0.9, 0.3, 0.3] }));
    addT('kamienica ceglana', facadeBoard('brick', 'brick', [0.8, 0.6, 0.5], { upper: ['window'], ground: ['shop', 'window', 'door', 'window', 'shop'], roofMat: 'tile', roofTint: [0.66, 0.3, 0.2] }));
    addT('modernizm', facadeBoard('modern', 'plaster', [0.86, 0.86, 0.84], { ground: ['shop', 'shop', 'door', 'shop', 'shop'], ridge: 0.01 }));
    addT('dom', facadeBoard('house', 'plaster', [0.95, 0.88, 0.7], { bays: 3, floors: 2, ground: ['window', 'door', 'window'], shutters: true, flowers: [0.9, 0.3, 0.5], roofMat: 'tile', roofTint: [0.66, 0.3, 0.2], ridge: 3.6 }));
    addT('fasada z bliska (parter)', facadeBoard('classic', 'plaster', [0.84, 0.72, 0.6], { groundMat: 'stone' }), { zoom: 2.6, el: 0.05, target: [-3, 3.5, 0] });
    sheet('20_kamienice_studio.png', T1, 2, 'Kamienice i domy — moduły fasad');
  }
  if (want('elementy')) {
    add('latarnia', at('lamp', 1, 6, 1, { metalTint: [0.17, 0.22, 0.19] }));
    add('ławka', at('bench', 1.8, 1, 0.6, {}), { zoom: 1 });
    add('kosz', at('bin', 0.7, 1, 0.7, {}));
    add('budka telefoniczna', at('booth', 1, 2.5, 1, {}));
    add('kiosk', at('kiosk', 2.4, 3.2, 2.0, { sign: 'gin', color: [0.3, 0.45, 0.35] }));
    add('przystanek', at('busstop', 3.2, 3.1, 1.4, {}));
    add('fontanna', at('fountain', 9, 4, 9, {}));
    add('pomnik', at('monument', 4, 13, 4, { poster: 'bb4' }));
    add('billboard', at('billboard', 6, 6.2, 0.6, { name: 'bb5', posts: true }));
    add('taksówka', at('oldcar', 3.6, 2.2, 1.7, { color: [0.95, 0.76, 0.12], seat: [0.3, 0.12, 0.08], taxi: true }), { az: -2.5, el: 0.25 });
    add('auto', at('oldcar', 3.6, 2.2, 1.7, { color: [0.55, 0.12, 0.1], seat: [0.4, 0.12, 0.1] }), { az: 0.6, el: 0.25 });
    add('wieża ratusza', at('townhall', 7, 17, 7, { hide: 0.01 }), { zoom: 1.2, el: 0.12 });
    add('pasażer', at('person', 0.6, 1.9, 0.4, { pants: [0.2, 0.2, 0.25], shirt: [0.6, 0.3, 0.2], skin: [0.85, 0.65, 0.5], hat: [0.15, 0.12, 0.1] }));
    sheet('21_elementy_miasta.png', tiles.splice(0), 4, 'Elementy miasta');
  }
  if (want('przyroda')) {
    const tree = (sp, seed, leaf, Wd, Hd) => at('tree', Wd, Hd, Wd, { species: sp, seed, leaf });
    add('dąb', tree('oak', 11, [0.34, 0.48, 0.22], 7, 9), { ground: 'grass' });
    add('brzoza', tree('birch', 12, [0.5, 0.62, 0.3], 7, 9), { ground: 'grass' });
    add('topola', tree('poplar', 13, [0.3, 0.44, 0.24], 4, 14), { ground: 'grass' });
    add('sosna', tree('pine', 14, [0.16, 0.3, 0.18], 5, 12), { ground: 'grass' });
    add('krzak', at('bush', 2.2, 1.7, 2.2, { leaf: [0.34, 0.48, 0.22], flowers: [0.9, 0.2, 0.3] }), { ground: 'grass' });
    add('latarnia morska', at('lighthouse', 8, 31, 8, {}), { ground: 'sand' });
    add('molo', at('pier', 16, 2.2, 4, {}), { ground: 'sand' });
    add('tory', at('rail', 12, 1, 5, {}), { ground: 'grass' });
    sheet('22_przyroda_i_trasy.png', tiles.splice(0), 4, 'Drzewa, wybrzeże, tory');
  }
  if (ONLY && ONLY.includes('wieza')) {
    const tw = at('townhall', 7, 17, 7, { hide: 0.01 });
    for (const [l, o] of [['wieża z przodu', { az: -1.57, el: 0.05, zoom: 1.3 }], ['latarnia dzwonna z bliska', { az: -1.2, el: 0.25, zoom: 3.2, target: [0, 12.2, 0] }]]) add(l, tw, { size: [800, 700], ...o });
    sheet('24_wieza.png', tiles.splice(0), 2, 'Wieża ratusza');
  }
  if (want('nawierzchnie')) {
    const pave = (mat, o = {}) => { const b = new Builder(); b.ground = () => 0; for (let x = -4; x < 4; x += 2) for (let z = -4; z < 4; z += 2) b.wpoly(mat, [[x, 0.01, z], [x + 2, 0.01, z], [x + 2, 0.01, z + 2], [x, 0.01, z + 2]], [0, 1, 0], { flat: 1, ...o }); return meshesOf(b.finish()); };
    const wallBoard = (mat, tint) => { const b = new Builder(); b.setTint(mat, tint); b.cell(Cage.quad([-3, 0], [3, 0], [-3, 1], [3, 1], 0, 4), 6, 4, 1); b.grid(mat, 0, 0, 6, 4, 0, 3, 2); return meshesOf(b.finish()); };
    add('bruk', pave('cobble', { tint: [0.9, 0.88, 0.85] }), { el: 0.6, ground: 'grass' });
    add('płyty chodnika', pave('slab'), { el: 0.6, ground: 'grass' });
    add('asfalt', pave('asphalt'), { el: 0.6, ground: 'grass' });
    add('trawa', pave('grass'), { el: 0.6, ground: 'sand' });
    add('tynk', wallBoard('plaster', [0.88, 0.8, 0.62]), { az: -1.75, el: 0.1 });
    add('cegła', wallBoard('brick', [0.98, 0.92, 0.88]), { az: -1.75, el: 0.1 });
    add('kamień', wallBoard('stone', [0.86, 0.83, 0.76]), { az: -1.75, el: 0.1 });
    add('dachówka', wallBoard('tile', [0.66, 0.3, 0.2]), { az: -1.75, el: 0.1 });
    sheet('23_tekstury.png', tiles.splice(0), 4, 'Tekstury');
  }
}

// wolne ujęcie: --cam x,y,z --look x,y,z [--name plik] [--fov 60]; y kamery względem terenu
if (arg('--cam', '')) {
  city = generateCity(SEED);
  const c = arg('--cam').split(',').map(Number), l = arg('--look').split(',').map(Number), T = city.terrain;
  const cam = [c[0], T.height(c[0], c[2]) + c[1], c[2]], tgt = [l[0], T.height(l[0], l[2]) + l[1], l[2]];
  cityShot(arg('--name', '99_wolne'), cam, tgt, { fov: Number(arg('--fov', 60)), shadowHalf: 60 });
  process.exit(0);
}

const t0 = performance.now();
if (!ONLY || ONLY.some((n) => /^\d\d_/.test(n))) cityShots();
studioShots();
console.log('gotowe w', ((performance.now() - t0) / 1000).toFixed(0), 's →', OUT);
