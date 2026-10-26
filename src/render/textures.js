// Proceduralne tekstury (kolor + normal map) rysowane na canvasie.
// Zero plików — wszystko generowane szumem i Voronoi, bezszwowo kafelkowane.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

function tileNoise(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(256), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const wrap = (i, P) => { const a = i % P; return a < 0 ? a + P : a; };
  const n = (x, y, P) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    // siatka okresowa: każdy węzeł liczony raz (wrap + permutacja), bez zagnieżdżonych domknięć
    const x0 = wrap(xi, P), x1 = wrap(xi + 1, P), y0 = wrap(yi, P), y1 = wrap(yi + 1, P);
    const p0 = perm[x0 & 255], p1 = perm[x1 & 255];
    const a = val[perm[(p0 + y0) & 255]], b = val[perm[(p1 + y0) & 255]];
    const c = val[perm[(p0 + y1) & 255]], d = val[perm[(p1 + y1) & 255]];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  // u,v ∈ [0,1) — bezszwowe fbm z okresem P na pierwszej oktawie
  return (u, v, P, oct = 4) => {
    let s = 0, amp = 0.5, f = P, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * n(u * f, v * f, f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / norm;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// fn(u, v) → [r,g,b (0..1, sRGB), height 0..1]
function bake(w, h, fn, strength = 2, opts = {}) {
  const col = makeCanvas(w, h), ctx = col.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = fn(x / w, y / h, x, y);
      const i = (y * w + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r[0] * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, r[1] * 255));
      img.data[i + 2] = Math.max(0, Math.min(255, r[2] * 255));
      img.data[i + 3] = 255;
      H[y * w + x] = r[3];
    }
  ctx.putImageData(img, 0, 0);
  const nc = makeCanvas(w, h), nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + ((x + 1) % w)];
      const u = H[((y - 1 + h) % h) * w + x], d = H[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      nimg.data[i] = (nx * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  nctx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nc);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = opts.aniso ?? 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return { map, normalMap };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Voronoi bezszwowy (komórki G×G)
function voronoi(G, seed, jitter = 0.85) {
  const r = mulberry32(seed);
  const pts = new Float32Array(G * G * 2), ids = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) { pts[i * 2] = 0.5 + (r() - 0.5) * jitter; pts[i * 2 + 1] = 0.5 + (r() - 0.5) * jitter; ids[i] = r(); }
  return (u, v) => {
    const x = u * G, y = v * G, xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0, cx = 0, cy = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const gx = xi + i, gy = yi + j;
        const k = (((gy % G) + G) % G) * G + (((gx % G) + G) % G);
        const px = gx + pts[k * 2], py = gy + pts[k * 2 + 1];
        const d = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
        if (d < d1) { d2 = d1; d1 = d; id = ids[k]; cx = px - x; cy = py - y; }
        else if (d < d2) d2 = d;
      }
    return { d1, d2, id, cx, cy };
  };
}

export function createTextures() {
  const T = {};
  const nA = tileNoise(11), nB = tileNoise(23), nC = tileNoise(37);

  // — tynk z odpadającymi łatami (spod spodu cegła) —
  T.plaster = bake(512, 512, (u, v) => {
    const n = nA(u, v, 6, 5), f = nB(u, v, 48, 2);
    const streak = nC(u, v * 0.25 + 0.3, 24, 3);
    const patch = nB(u + 0.37, v + 0.11, 3, 4);
    let c = 0.86 + (n - 0.5) * 0.18 + (f - 0.5) * 0.06 - Math.max(0, streak - 0.55) * 0.35;
    let h = 0.5 + (f - 0.5) * 0.5 + (n - 0.5) * 0.4;
    const pm = smooth(0.71, 0.73, patch) * 0.85;
    const rim = smooth(0.68, 0.71, patch) - smooth(0.71, 0.73, patch);
    c -= rim * 0.08;
    if (pm > 0) {
      const row = Math.floor(v * 40), bx = (u * 11.5 + (row % 2) * 0.5) % 1, by = (v * 40) % 1;
      const mortar = bx < 0.06 || by < 0.15;
      const br = mortar ? [0.62, 0.6, 0.56] : [0.6 + (nB(u, v, 96, 1) - 0.5) * 0.12, 0.45, 0.39];
      const cc = [c, c * 0.98, c * 0.93];
      const m = pm;
      return [cc[0] * (1 - m) + br[0] * m, cc[1] * (1 - m) + br[1] * m, cc[2] * (1 - m) + br[2] * m, h * (1 - m) + (mortar ? 0.0 : 0.25) * m];
    }
    return [c, c * 0.98, c * 0.93, h];
  }, 3);

  // — cegła (4 cegły × 12 warstw na kafel 1.04 × 0.9 m) —
  T.brick = bake(512, 512, (u, v) => {
    const rows = 12, row = Math.floor(v * rows), off = (row % 2) * 0.5;
    const bxF = u * 4 + off, bi = Math.floor(bxF), bx = bxF - bi, by = v * rows - row;
    const mortar = bx < 0.04 || by < 0.13;
    const id = (Math.sin((bi % 4) * 12.9898 + row * 78.233) * 43758.5453) % 1;
    const rr = Math.abs(id);
    const n = nA(u, v, 32, 3);
    if (mortar) {
      const m = 0.58 + (n - 0.5) * 0.1;
      return [m, m * 0.97, m * 0.92, 0.1];
    }
    const base = rr < 0.15 ? [0.38, 0.22, 0.18] : rr < 0.3 ? [0.62, 0.38, 0.28] : [0.56 + rr * 0.1, 0.3 + rr * 0.05, 0.23];
    const k = 0.85 + (n - 0.5) * 0.35;
    const edge = Math.min(bx - 0.04, 0.96 - bx + 0.04, (by - 0.13) * 0.3, (1 - by) * 0.3);
    return [base[0] * k, base[1] * k, base[2] * k, 0.6 + Math.min(0.3, edge * 4) + (n - 0.5) * 0.2];
  }, 4);

  // — piaskowiec / beton —
  T.stone = bake(512, 512, (u, v) => {
    const n = nA(u, v, 8, 5), f = nC(u, v, 64, 2);
    const c = 0.82 + (n - 0.5) * 0.2 + (f - 0.5) * 0.08;
    return [c, c * 0.97, c * 0.9, n * 0.6 + f * 0.4];
  }, 2);

  // — bruk: kocie łby (Voronoi z kopułkami i ciemną fugą) —
  const vor = voronoi(9, 77);
  T.cobble = bake(512, 512, (u, v) => {
    const { d1, d2, id } = vor(u, v);
    const edge = d2 - d1;
    const n = nB(u, v, 64, 3);
    const stoneM = smooth(0.04, 0.12, edge);
    const dome = Math.max(0, 1 - d1 * 1.25);
    const h = stoneM * (0.45 + dome * 0.55) + (n - 0.5) * 0.08;
    const g = 0.38 + id * 0.26 + (n - 0.5) * 0.12;
    const tintR = id > 0.75 ? 1.06 : id < 0.2 ? 0.95 : 1.0;
    const sc = [g * tintR, g * 0.99, g * (id > 0.6 ? 0.92 : 1.02)];
    const mc = [0.17, 0.16, 0.14];
    const top = dome * 0.08;
    return [
      mc[0] + (sc[0] + top - mc[0]) * stoneM,
      mc[1] + (sc[1] + top - mc[1]) * stoneM,
      mc[2] + (sc[2] + top - mc[2]) * stoneM,
      h,
    ];
  }, 6);

  // — płyty chodnikowe 50×50 cm z pęknięciami —
  const crack = tileNoise(91);
  T.slab = bake(512, 512, (u, v) => {
    const tx = u * 4, ty = v * 4, ix = Math.floor(tx), iy = Math.floor(ty);
    const fx = tx - ix, fy = ty - iy;
    const gap = Math.min(fx, 1 - fx, fy, 1 - fy);
    const sid = Math.abs(Math.sin(ix * 91.7 + iy * 47.3) * 43758.5453) % 1;
    const n = nA(u, v, 16, 4), fine = nB(u, v, 128, 1);
    const cr = Math.abs(crack(u, v, 6, 3) - 0.5);
    const isCrack = sid > 0.7 && cr < 0.004;
    let c = 0.62 + (sid - 0.5) * 0.1 + (n - 0.5) * 0.14 + (fine - 0.5) * 0.05;
    let h = 0.7 + (fine - 0.5) * 0.15 + (fx - 0.5) * (sid - 0.5) * 0.15;
    if (gap < 0.012) { c *= 0.45; h = 0.1; }
    else if (gap < 0.03) { h -= (0.03 - gap) * 8; }
    if (isCrack) { c *= 0.8; h -= 0.2; }
    return [c, c * 0.985, c * 0.95, h];
  }, 5);

  // — granit krawężnika —
  T.curb = bake(256, 256, (u, v) => {
    const n = nA(u, v, 8, 3), sp = nB(u, v, 128, 1);
    const c = 0.55 + (n - 0.5) * 0.1 + (sp > 0.7 ? -0.2 : sp < 0.25 ? 0.12 : 0);
    return [c, c, c * 1.02, n * 0.3 + sp * 0.2];
  }, 2);

  // — blacha na rąbek stojący —
  T.roof = bake(512, 512, (u, v) => {
    const sx = (u * 4) % 1;
    const seam = Math.exp(-Math.pow((sx - 0.5) / 0.03, 2));
    const n = nA(u, v, 6, 4), rust = nC(u * 1.0, v * 0.3, 8, 4);
    const r = smooth(0.55, 0.75, rust);
    const base = 0.48 + (n - 0.5) * 0.12;
    return [base + r * 0.12, base - r * 0.06, base - r * 0.12, 0.3 + seam * 0.7 + (n - 0.5) * 0.1];
  }, 4);

  // — trawa: źdźbła z szumu, plamy suchej trawy i koniczyny —
  T.grass = bake(512, 512, (u, v) => {
    const n = nA(u, v, 8, 4), f = nB(u, v, 256, 1), m = nC(u, v, 4, 3);
    const dry = smooth(0.55, 0.75, m);
    const g = 0.75 + (f - 0.5) * 0.5 + (n - 0.5) * 0.25;
    return [(0.3 + dry * 0.22) * g, (0.45 + dry * 0.05) * g, (0.2 + dry * 0.02) * g, f * 0.7 + n * 0.3];
  }, 3);

  // — dachówka karpiówka: rzędy łusek z przesunięciem, cieniowane krawędzie —
  T.tile = bake(512, 512, (u, v) => {
    const rows = 6, row = Math.floor(v * rows), off = (row % 2) * 0.5;
    const cols = 8, xx = u * cols + off, ci = Math.floor(xx), fx = xx - ci, fy = v * rows - row;
    // zaokrąglony dół łuski
    const dx = fx - 0.5, curve = 0.75 + Math.sqrt(Math.max(0, 0.25 - dx * dx)) * 0.5;
    const inTile = fy < curve;
    const id = Math.abs(Math.sin(ci * 12.9898 + row * 78.233) * 43758.5453) % 1;
    const n = nA(u, v, 16, 3);
    const shade = inTile ? 0.75 + fy * 0.35 : 0.45;
    const c = (0.85 + (id - 0.5) * 0.22 + (n - 0.5) * 0.15) * shade;
    return [c, c * 0.92, c * 0.86, inTile ? 0.3 + fy * 0.6 : 0.05];
  }, 5);

  // — kora: pionowe bruzdy + szum —
  T.bark = bake(256, 256, (u, v) => {
    const f = nA(u * 1.0, v * 0.25, 12, 4), g = nB(u, v, 64, 2);
    const groove = Math.pow(Math.abs(Math.sin((u * 10 + f * 2.5) * Math.PI)), 0.6);
    const c = 0.45 + groove * 0.35 + (g - 0.5) * 0.15;
    return [c, c * 0.92, c * 0.85, groove * 0.8 + g * 0.2];
  }, 4);
  // — liście: kępki ciemniejszych i jaśniejszych listków (Voronoi) —
  const lv = voronoi(14, 333);
  T.leaf = bake(256, 256, (u, v) => {
    const { d1, d2, id } = lv(u, v);
    const e = smooth(0.0, 0.08, d2 - d1);
    const c = 0.55 + id * 0.45 - (1 - e) * 0.35 + (1 - d1) * 0.1;
    return [c * 0.95, c, c * 0.85, e * (1 - d1 * 0.8)];
  }, 3);
  // — piasek —
  T.sand = bake(256, 256, (u, v) => {
    const n = nA(u, v, 8, 4), f = nB(u, v, 128, 1), r = Math.sin((u * 6 + n * 2) * Math.PI * 2) * 0.5 + 0.5;
    const c = 0.84 + (n - 0.5) * 0.12 + (f - 0.5) * 0.08;
    return [c, c * 0.93, c * 0.78, r * 0.4 + f * 0.6];
  }, 2);
  // — żwir torowy —
  const gv = voronoi(40, 911, 1);
  T.gravel = bake(256, 256, (u, v) => {
    const { d1, d2, id } = gv(u, v);
    const e = smooth(0, 0.12, d2 - d1);
    const c = (0.35 + id * 0.35) * (0.5 + 0.5 * e);
    return [c, c * 0.95, c * 0.9, e * (1 - d1)];
  }, 4);
  // — asfalt z pasami (u = wzdłuż drogi, okres 12 m; v = w poprzek) —
  T.asphalt = bake(256, 512, (u, v) => {
    const n = nA(u, v, 16, 4), f = nB(u, v, 128, 1);
    let c = 0.22 + (n - 0.5) * 0.06 + (f - 0.5) * 0.05;
    const line = (x, w) => Math.abs(v - x) < w;
    if (line(0.04, 0.008) || line(0.96, 0.008)) c = 0.85;
    else if (line(0.5, 0.012) && !line(0.5, 0.004)) c = 0.8;
    else if ((line(0.27, 0.007) || line(0.73, 0.007)) && (u % 1) < 0.35) c = 0.82;
    return [c, c, c * 1.02, 0.5 + (f - 0.5) * 0.2];
  }, 1, { aniso: 8 });

  // — falki na wodzie (tylko normal map) —
  T.water = bake(256, 256, (u, v) => {
    const h = nA(u, v, 8, 4) * 0.6 + nB(u, v, 16, 3) * 0.4;
    return [0.5, 0.5, 0.5, h];
  }, 3);

  // — fasada LOD: jedno okno na kafel (przęsło × kondygnacja) —
  T.lod = bake(128, 128, (u, v) => {
    const win = u > 0.32 && u < 0.68 && v > 0.22 && v < 0.72;
    const frame = win && (Math.abs(u - 0.5) < 0.015 || Math.abs(v - 0.37) < 0.015 || u < 0.34 || u > 0.66 || v < 0.24 || v > 0.7);
    const sill = u > 0.3 && u < 0.7 && v > 0.72 && v < 0.75;
    if (frame) return [0.7, 0.68, 0.63, 0.5];
    if (win) return [0.18, 0.2, 0.22, 0.2];
    if (sill) return [0.95, 0.93, 0.88, 0.7];
    const n = nA(u, v, 4, 3);
    const c = 0.9 + (n - 0.5) * 0.1;
    return [c, c, c * 0.96, 0.5];
  }, 1, { aniso: 4 });

  return T;
}
