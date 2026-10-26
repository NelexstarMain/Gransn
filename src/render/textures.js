// Proceduralne tekstury (kolor + normal map) rysowane na canvasie.
// Zero plików — wszystko generowane szumem i Voronoi, bezszwowo kafelkowane.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

function tileNoise(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(256), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const h = (i, j, Pu, Pv) => {
    const a = ((i % Pu) + Pu) % Pu, b = ((j % Pv) + Pv) % Pv;
    return val[perm[(perm[a & 255] + b) & 255]];
  };
  const n = (x, y, Pu, Pv) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi, Pu, Pv), b = h(xi + 1, yi, Pu, Pv), c = h(xi, yi + 1, Pu, Pv), d = h(xi + 1, yi + 1, Pu, Pv);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  // u,v ∈ [0,1) — bezszwowe fbm; P to okres pierwszej oktawy (liczba albo [Pu, Pv])
  return (u, v, P, oct = 4) => {
    const Pu = Array.isArray(P) ? P[0] : P, Pv = Array.isArray(P) ? P[1] : P;
    let s = 0, amp = 0.5, fu = Pu, fv = Pv, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * n(u * fu, v * fv, fu, fv);
      norm += amp;
      amp *= 0.5;
      fu *= 2; fv *= 2;
    }
    return s / norm;
  };
}

// szybki, dobrze rozrzucony hasz całkowity → [0,1) (zamiast sin(...)·43758, który daje ukośne pasy)
function ihash(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
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
      const len = Math.hypot(nx, ny, nz);
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
        const d = Math.hypot(px - x, py - y);
        if (d < d1) { d2 = d1; d1 = d; id = ids[k]; cx = px - x; cy = py - y; }
        else if (d < d2) d2 = d;
      }
    return { d1, d2, id, cx, cy };
  };
}

export function createTextures() {
  const T = {};
  const nA = tileNoise(11), nB = tileNoise(23), nC = tileNoise(37);

  // — tynk: drobne ziarno, łagodne plamy, zacieki spod parapetów i włosowate pęknięcia
  //   (bez wyrazistych łat — na ścianie powtarzałyby się co kafel)
  T.plaster = bake(512, 512, (u, v) => {
    const n = nA(u, v, 6, 5), f = nB(u, v, 64, 2), g = nC(u, v, 192, 1);
    const streak = nC(u, v, [20, 2], 3);
    const damp = smooth(0.55, 0.82, nB(u, v, [3, 2], 4));
    const cr = Math.abs(nA(u + 0.21, v + 0.63, 5, 3) - 0.5);
    const crack = cr < 0.005 ? 1 - cr / 0.005 : 0;
    let c = 0.9 + (n - 0.5) * 0.13 + (f - 0.5) * 0.07 + (g - 0.5) * 0.07 - Math.max(0, streak - 0.56) * 0.32 - damp * 0.07 - crack * 0.14;
    const h = 0.5 + (f - 0.5) * 0.45 + (n - 0.5) * 0.3 + (g - 0.5) * 0.25 - crack * 0.35;
    return [c, c * 0.985, c * 0.95, h];
  }, 3);

  // — cegła (4 cegły × 12 warstw na kafel 1.04 × 0.9 m): wypalane nierówno, jasna zaprawa
  T.brick = bake(512, 512, (u, v) => {
    const rows = 12, row = Math.floor(v * rows), off = (row % 2) * 0.5;
    const bxF = u * 4 + off, bi = Math.floor(bxF), bx = bxF - bi, by = v * rows - row;
    const mortar = bx < 0.035 || bx > 0.985 || by < 0.13;
    const id = ihash(((bi % 4) + 4) % 4, row), id2 = ihash(((bi % 4) + 4) % 4 + 17, row + 5);
    const n = nA(u, v, 32, 3), grain = nB(u, v, 256, 1);
    if (mortar) {
      const m = 0.66 + (n - 0.5) * 0.12 + (grain - 0.5) * 0.08;
      return [m, m * 0.97, m * 0.9, 0.08];
    }
    // paleta: zwykła czerwień, pomarańcz, brąz, rzadkie ciemne klinkierowe i jasne niedopały
    let base;
    if (id < 0.08) base = [0.36, 0.2, 0.17];
    else if (id < 0.22) base = [0.72, 0.5, 0.36];
    else if (id < 0.42) base = [0.68, 0.34, 0.24];
    else base = [0.6 + id2 * 0.12, 0.3 + id2 * 0.06, 0.22 + id2 * 0.03];
    const k = 0.9 + (n - 0.5) * 0.3 + (grain - 0.5) * 0.12 + (id2 - 0.5) * 0.12;
    const edge = Math.min(bx - 0.035, 0.985 - bx, (by - 0.13) * 0.35, (1 - by) * 0.35);
    return [base[0] * k, base[1] * k, base[2] * k, 0.55 + Math.min(0.3, edge * 4) + (n - 0.5) * 0.2];
  }, 4);

  // — piaskowiec / beton —
  T.stone = bake(512, 512, (u, v) => {
    const n = nA(u, v, 8, 5), f = nC(u, v, 64, 2), g = nB(u, v, 256, 1), bed = nA(u, v, [2, 18], 2);
    const pore = g > 0.9 ? 0.78 : 1;
    const c = (0.84 + (n - 0.5) * 0.18 + (f - 0.5) * 0.08 + (g - 0.5) * 0.08 + (bed - 0.5) * 0.08) * pore;
    return [c, c * 0.97, c * 0.91, n * 0.5 + f * 0.3 + g * 0.2];
  }, 2);

  // — bruk: kamienie ~12 cm z własnym odcieniem, kopułkami oświetlonymi z lewej góry,
  //   ciemną fugą z mchem i brudem, plamami zabrudzeń (bez równych, powtarzalnych oczek)
  const vor = voronoi(10, 77, 0.8);
  T.cobble = bake(512, 512, (u, v) => {
    const { d1, d2, id, cx, cy } = vor(u, v);
    const edge = d2 - d1;
    const n = nB(u, v, 64, 3), g = nC(u, v, 256, 1), patch = nA(u + 0.21, v + 0.6, 4, 3), moss = nC(u + 0.5, v, 12, 3);
    const stone = smooth(0.025, 0.14, edge);
    const dome = Math.max(0, 1 - d1 * 1.15);
    const fam = id < 0.4 ? [0.55, 0.53, 0.5] : id < 0.75 ? [0.58, 0.53, 0.46] : [0.48, 0.49, 0.5];
    const vary = 0.85 + 0.32 * ((id * 17.37) % 1);
    const light = 0.86 + 0.34 * dome + 0.22 * (cx + cy);
    const soil = 1 - 0.28 * smooth(0.5, 0.8, patch);
    const k = vary * light * soil * (0.92 + (g - 0.5) * 0.2 + (n - 0.5) * 0.18);
    const greenJoint = smooth(0.55, 0.78, moss);
    const jc = [0.12 + greenJoint * 0.04, 0.115 + greenJoint * 0.07, 0.1 + greenJoint * 0.0];
    const h = stone * (0.35 + dome * 0.65) + (n - 0.5) * 0.06 + (g - 0.5) * 0.05;
    return [
      jc[0] + (fam[0] * k - jc[0]) * stone,
      jc[1] + (fam[1] * k - jc[1]) * stone,
      jc[2] + (fam[2] * k - jc[2]) * stone,
      h,
    ];
  }, 6);

  // — płyty chodnikowe 50×50 cm: każda z innym odcieniem, ziarno, plamy, pęknięcia, mech w szczelinach
  const crack = tileNoise(91);
  T.slab = bake(512, 512, (u, v) => {
    const tx = u * 4, ty = v * 4, ix = Math.floor(tx), iy = Math.floor(ty);
    const fx = tx - ix, fy = ty - iy;
    const gap = Math.min(fx, 1 - fx, fy, 1 - fy);
    const sid = ihash(ix + 40, iy + 70), sid2 = ihash(ix + 9, iy + 301);
    const n = nA(u, v, 16, 4), fine = nB(u, v, 160, 1), stain = nC(u, v, 6, 3), moss = nA(u + 0.4, v + 0.1, 20, 2);
    const cr = Math.abs(crack(u, v, 6, 3) - 0.5);
    const isCrack = sid > 0.72 && cr < 0.0035;
    let c = 0.66 + (sid - 0.5) * 0.12 + (n - 0.5) * 0.12 + (fine - 0.5) * 0.09 - Math.max(0, stain - 0.6) * 0.25;
    let h = 0.7 + (fine - 0.5) * 0.15 + (fx - 0.5) * (sid2 - 0.5) * 0.2;
    let r = c * (1 + (sid2 - 0.5) * 0.06), g = c * (0.975 + (sid - 0.5) * 0.02), b = c * (0.93 - (sid2 - 0.5) * 0.04);
    if (gap < 0.014) { const gm = smooth(0.55, 0.8, moss); r = 0.22 + gm * 0.0; g = 0.21 + gm * 0.08; b = 0.17; h = 0.1; }
    else if (gap < 0.034) { h -= (0.034 - gap) * 7; const e = 1 - (gap - 0.014) / 0.02; r *= 1 - e * 0.18; g *= 1 - e * 0.18; b *= 1 - e * 0.18; }
    if (isCrack) { r *= 0.6; g *= 0.6; b *= 0.6; h -= 0.25; }
    return [r, g, b, h];
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

  // — trawa: drobne źdźbła, delikatne zmiany odcienia, rzadkie stokrotki i mniszki
  T.grass = bake(512, 512, (u, v) => {
    const n = nA(u, v, 8, 4), f = nB(u, v, 256, 1), bl = nC(u, v, 128, 2), m = nC(u, v, 4, 3);
    const dry = smooth(0.6, 0.85, m) * 0.5;
    const g = 0.8 + (f - 0.5) * 0.45 + (bl - 0.5) * 0.3 + (n - 0.5) * 0.2;
    const fl = nB(u + 0.31, v + 0.57, 96, 1);
    if (fl > 0.955) return [0.95 * g, 0.94 * g, 0.82 * g, f * 0.7 + 0.2];
    if (fl > 0.94) return [0.9, 0.72 * g, 0.12, f * 0.7 + 0.2];
    return [(0.3 + dry * 0.14) * g, (0.46 + dry * 0.05) * g, 0.2 * g, f * 0.6 + bl * 0.25 + n * 0.15];
  }, 3);

  // — dachówka karpiówka: rzędy łusek z przesunięciem, własny odcień każdej dachówki,
  //   cieniowane krawędzie, zacieki, nalot mchu i brud
  T.tile = bake(512, 512, (u, v) => {
    const rows = 6, row = Math.floor(v * rows), off = (row % 2) * 0.5;
    const cols = 8, xx = u * cols + off, ci = Math.floor(xx), fx = xx - ci, fy = v * rows - row;
    const dx = fx - 0.5, curve = 0.75 + Math.sqrt(Math.max(0, 0.25 - dx * dx)) * 0.5;
    const inTile = fy < curve;
    const id = ihash(ci, row), id2 = ihash(ci + 13, row + 29);
    const n = nA(u, v, 16, 3), grain = nB(u, v, 192, 1), moss = nC(u, v, 5, 4), streak = nC(u, v, [24, 3], 2);
    const shade = inTile ? 0.78 + fy * 0.32 : 0.4;
    // kolor dachu przychodzi z wierzchołków (tint) — tekstura niesie jasność i lekki odcień
    const base = id < 0.12 ? [0.78, 0.7, 0.66] : id < 0.3 ? [1.0, 0.94, 0.9] : [0.9 + id2 * 0.1, 0.86 + id2 * 0.08, 0.82 + id2 * 0.06];
    const k = shade * (0.92 + (n - 0.5) * 0.2 + (grain - 0.5) * 0.12 - Math.max(0, streak - 0.6) * 0.25);
    const m = smooth(0.62, 0.82, moss) * 0.5;
    return [
      (base[0] * (1 - m) + 0.55 * m) * k,
      (base[1] * (1 - m) + 0.8 * m) * k,
      (base[2] * (1 - m) + 0.4 * m) * k,
      inTile ? 0.3 + fy * 0.6 + (grain - 0.5) * 0.1 : 0.05,
    ];
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
  // — asfalt z pasami (u = wzdłuż drogi, okres 12 m; v = w poprzek): kruszywo, koleiny, łaty,
  //   pęknięcia, plamy oleju, wyblakłe i wytarte pasy
  T.asphalt = bake(256, 512, (u, v) => {
    const n = nA(u, v, 16, 4), f = nB(u, v, 128, 1), agg = nC(u, v, 200, 1), wear = nA(u, v, [3, 2], 3), cr = Math.abs(nB(u + 0.3, v + 0.2, [6, 3], 3) - 0.5);
    const patch = ihash(Math.floor(u * 3) + 5, Math.floor(v * 6) + 11) > 0.84 ? 1 : 0;
    const ruts = Math.exp(-Math.pow((v - 0.36) / 0.05, 2)) + Math.exp(-Math.pow((v - 0.64) / 0.05, 2));
    let c = 0.23 + (n - 0.5) * 0.05 + (f - 0.5) * 0.045 + (agg > 0.82 ? 0.07 : agg < 0.12 ? -0.04 : 0) + ruts * 0.025 + patch * (-0.03 + (f - 0.5) * 0.02);
    if (cr < 0.004) c -= 0.07;
    const line = (x, w) => Math.abs(v - x) < w;
    const worn = 0.55 + 0.45 * smooth(0.25, 0.7, wear);
    if (line(0.04, 0.008) || line(0.96, 0.008)) c = c + (0.85 - c) * worn;
    else if (line(0.5, 0.012) && !line(0.5, 0.004)) c = c + (0.8 - c) * worn;
    else if ((line(0.27, 0.007) || line(0.73, 0.007)) && (u % 1) < 0.35) c = c + (0.82 - c) * worn;
    return [c, c, c * 1.02, 0.5 + (f - 0.5) * 0.2 + (agg - 0.5) * 0.15 - (cr < 0.004 ? 0.2 : 0)];
  }, 1, { aniso: 8 });

  // — drewno: neutralne w kolorze (ramy, drzwi i okiennice mają kolor z wierzchołków),
  //   słoje biegną wzdłuż v, czyli pionowo na ścianach
  T.wood = bake(256, 256, (u, v) => {
    const warp = nA(u, v, [4, 2], 3);
    const ring = 0.5 + 0.5 * Math.sin((u * 14 + warp * 3.2) * Math.PI * 2);
    const fine = nB(u, v, [64, 4], 2), knot = nC(u, v, [3, 2], 2);
    const c = 0.9 - ring * ring * 0.13 + (fine - 0.5) * 0.14 - Math.max(0, knot - 0.7) * 0.25;
    return [c, c, c, 0.55 + (fine - 0.5) * 0.35 - ring * 0.2];
  }, 3);

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
