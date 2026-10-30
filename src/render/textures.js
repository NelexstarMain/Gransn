// Proceduralne tekstury (kolor + normal map) rysowane na canvasie.
// Zero plików — wszystko generowane szumem i Voronoi, bezszwowo kafelkowane.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

export function tileNoise(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(256), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const wrap = (i, P) => { const a = i % P; return a < 0 ? a + P : a; };
  const n = (x, y, Pu, Pv) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    // siatka okresowa: każdy węzeł liczony raz (wrap + permutacja), bez zagnieżdżonych domknięć
    const x0 = wrap(xi, Pu), x1 = wrap(xi + 1, Pu), y0 = wrap(yi, Pv), y1 = wrap(yi + 1, Pv);
    const p0 = perm[x0 & 255], p1 = perm[x1 & 255];
    const a = val[perm[(p0 + y0) & 255]], b = val[perm[(p1 + y0) & 255]];
    const c = val[perm[(p0 + y1) & 255]], d = val[perm[(p1 + y1) & 255]];
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
export function voronoi(G, seed, jitter = 0.85) {
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
  const LEAVES = [[0.74, 0.46, 0.12], [0.62, 0.33, 0.1], [0.8, 0.64, 0.18], [0.55, 0.4, 0.14]]; // jesienne liście

  // — tynk: drobne ziarno, łagodne plamy, zacieki spod parapetów i włosowate pęknięcia
  //   (bez wyrazistych łat — na ścianie powtarzałyby się co kafel)
  T.plaster = bake(512, 512, (u, v) => {
    // tylko drobne ziarno: łaty, zacieki i pęknięcia dokłada shader (render/wear.js), unikalnie dla każdego budynku
    const n = nA(u, v, 6, 5), f = nB(u, v, 64, 2), g = nC(u, v, 192, 1);
    const c = 0.9 + (n - 0.5) * 0.1 + (f - 0.5) * 0.07 + (g - 0.5) * 0.07;
    const h = 0.5 + (f - 0.5) * 0.45 + (n - 0.5) * 0.3 + (g - 0.5) * 0.25;
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

  // — bruk: kostki granitowe ~10 cm ułożone w wachlarze, jak na ulicach starych miast:
  //   jasnoszare, niebieskawe i ciepłe kamienie z własnym odcieniem, ciemna fuga z ziemią
  //   i mchem, grubsza fuga na granicy wachlarzy, rzadkie jesienne liście. Kafel 3,2 m (4 wachlarze).
  const fan = voronoi(2, 77, 0.5);
  const SETTS = [[0.7, 0.71, 0.72], [0.62, 0.65, 0.7], [0.73, 0.71, 0.66], [0.57, 0.59, 0.63], [0.78, 0.77, 0.75], [0.48, 0.5, 0.54]];
  T.cobble = bake(1024, 1024, (u, v) => {
    const { d1, d2, id, cx, cy } = fan(u, v);
    const TILE = 3.2, RHO = 0.1 / TILE, cell = Math.floor(id * 997);
    const r = d1 / 2, ring = Math.floor(r / RHO), fr = r / RHO - ring;
    const n = Math.max(4, Math.round(Math.PI * 2 * (ring + 0.5)));
    const a = (Math.atan2(-cy, -cx) / (Math.PI * 2) + 0.5) * n + ihash(ring + 5, cell) * n;
    const j0 = Math.floor(a), fa = a - j0, j = ((j0 % n) + n) % n;
    const sid = ihash(ring * 64 + j, cell + 31), sid2 = ihash(ring * 64 + j, cell + 77);
    const jw = 0.005 + 0.004 * sid2;                               // połowa szerokości fugi, m
    let dm = Math.min(Math.min(fr, 1 - fr) * RHO, Math.min(fa, 1 - fa) * ((Math.PI * 2 * r) / n)) * TILE;
    dm = Math.min(dm, (d2 - d1) * 0.5 * (TILE / 2) + 0.004);       // granica wachlarzy = grubsza fuga
    const g = nC(u, v, 256, 1), g2 = nB(u + 0.3, v + 0.1, 96, 2), patch = nA(u + 0.21, v + 0.6, 4, 3), moss = nC(u + 0.5, v, 12, 3);
    const pick = sid < 0.2 ? 0 : sid < 0.4 ? 1 : sid < 0.6 ? 2 : sid < 0.78 ? 3 : sid < 0.92 ? 4 : 5;
    const stone = smooth(jw, jw + 0.006, dm), dome = smooth(jw, jw + 0.05, dm);
    const vary = 0.86 + 0.26 * sid2 + (g - 0.5) * 0.14 + (g2 - 0.5) * 0.1;
    const ao = 0.8 + 0.2 * smooth(jw, jw + 0.03, dm);
    const soil = 1 - 0.24 * smooth(0.55, 0.8, patch);
    const col = SETTS[pick].map((c) => c * vary * ao * soil);
    const gj = smooth(0.55, 0.78, moss);
    const joint = [0.25 - gj * 0.03, 0.23 + gj * 0.02, 0.2 - gj * 0.02].map((c) => c * (0.8 + 0.4 * g));
    let rgb = [0, 1, 2].map((k) => joint[k] + (col[k] - joint[k]) * stone);
    const lf = nB(u + 0.17, v + 0.43, 190, 1);
    if (lf > 0.972) { const lc = LEAVES[Math.floor(ihash(Math.floor(u * 190), Math.floor(v * 190)) * 4)]; rgb = rgb.map((c, k) => c * 0.25 + lc[k] * 0.75); }
    return [rgb[0], rgb[1], rgb[2], stone * (0.45 + dome * 0.55) + (g - 0.5) * 0.05];
  }, 5);

  // — mała kostka (ok. 5 cm) w pasie przy krawężniku: jasny granit, spoiny z ziemią
  T.sett = bake(512, 512, (u, v) => {
    const N = 18, ty = v * N, iy = Math.floor(ty), fy = ty - iy;
    const tx = u * N + Math.floor(ihash(iy, 3) * N), ix = Math.floor(tx), fx = tx - ix;
    const sid = ihash(ix % N, iy + 11), sid2 = ihash(ix % N, iy + 97);
    const g = nB(u, v, 128, 1), patch = nA(u + 0.4, v + 0.2, 4, 3);
    const gap = Math.min(fx, 1 - fx, fy, 1 - fy);
    const pal = sid < 0.4 ? [0.76, 0.76, 0.74] : sid < 0.7 ? [0.82, 0.8, 0.77] : sid < 0.9 ? [0.7, 0.7, 0.69] : [0.78, 0.74, 0.69];
    const k = (0.88 + 0.22 * sid2 + (g - 0.5) * 0.12) * (1 - 0.15 * smooth(0.55, 0.8, patch));
    const stone = smooth(0.05, 0.14, gap);
    const j = [0.24, 0.22, 0.19];
    return [j[0] + (pal[0] * k - j[0]) * stone, j[1] + (pal[1] * k - j[1]) * stone, j[2] + (pal[2] * k - j[2]) * stone, stone * (0.5 + 0.5 * smooth(0.1, 0.4, gap)) + (g - 0.5) * 0.05];
  }, 4);

  // — fryz: kafel 0,6 × 0,8 m z dwoma pasami po 0,4 m. Góra: sztukateria (pnącze, rozety i liście
  //   między listwami z koralikami). Dół: pas cegły z ciemnymi krzyżami (neogotyk).
  //   Barwiony kolorem wierzchołków (opaska albo cegła), wysokość daje relief w normal mapie.
  T.frieze = bake(512, 512, (u, v) => {
    const g = nB(u, v, 200, 1);
    if (v < 0.5) {
      const yb = v * 2, X = (u - 0.5) * 0.6, Y = (yb - 0.5) * 0.4;
      const bead = 0.5 + 0.18 * Math.cos(u * Math.PI * 2 * 12);
      let h = 0.3;
      if (yb < 0.075 || yb > 0.925) h = Math.max(h, bead);
      const yc = 0.17 * Math.sin(u * Math.PI * 2) * 0.4;
      h = Math.max(h, smooth(0.014, 0.006, Math.abs(Y - yc)) * 0.7);
      for (const cx of [0.5, 0, 1]) {
        const dx = (u - cx) * 0.6, r = Math.hypot(dx, Y), th = Math.atan2(Y, dx);
        const petal = 0.55 + 0.45 * Math.cos(8 * th);
        h = Math.max(h, smooth(0.1, 0.06, r) * (0.55 + 0.35 * petal), smooth(0.03, 0.0, r) * 0.9);
      }
      for (const [lu, sg] of [[0.25, 1], [0.75, -1]]) {
        const lx = (u - lu) * 0.6 / 0.085, ly = (Y - sg * 0.07) / 0.032;
        h = Math.max(h, Math.max(0, 1 - lx * lx - ly * ly) * 0.75);
      }
      const c = 0.74 + 0.26 * h + (g - 0.5) * 0.05;
      return [c, c * 0.985, c * 0.95, h];
    }
    const yb = (v - 0.5) * 2, ty = yb * 6, iy = Math.floor(ty), fy = ty - iy;
    const tx = u * 2 + (iy % 2) * 0.5, fx = tx - Math.floor(tx);
    const X = (u - 0.25) * 0.6, X2 = (u - 0.75) * 0.6, Y = (yb - 0.5) * 0.4;
    const cross = [X, X2].some((x) => (Math.abs(x) < 0.1 && Math.abs(Y) < 0.033) || (Math.abs(x) < 0.033 && Math.abs(Y) < 0.12));
    const mort = Math.min(fy, 1 - fy) < 0.06 || Math.min(fx, 1 - fx) < 0.025;
    const bv = 0.85 + (ihash(Math.floor(tx), iy + 5) - 0.5) * 0.2 + (g - 0.5) * 0.06;
    if (mort) return [0.66, 0.64, 0.6, 0.1];
    return cross ? [0.36 * bv, 0.2 * bv, 0.17 * bv, 0.55] : [0.66 * bv, 0.36 * bv, 0.26 * bv, 0.5];
  }, 4);

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
    const lf = nA(u + 0.27, v + 0.52, 140, 1);
    if (lf > 0.972 && gap > 0.04) { const lc = LEAVES[Math.floor(ihash(Math.floor(u * 140), Math.floor(v * 140)) * 4)]; r = r * 0.3 + lc[0] * 0.7; g = g * 0.3 + lc[1] * 0.7; b = b * 0.3 + lc[2] * 0.7; }
    return [r, g, b, h];
  }, 5);

  // — krawężnik z piaskowca (beżowy, jak na zdjęciach), drobne ziarno i ciemniejsze plamy —
  T.curb = bake(256, 256, (u, v) => {
    const n = nA(u, v, 8, 3), sp = nB(u, v, 128, 1);
    const c = 0.74 + (n - 0.5) * 0.12 + (sp > 0.7 ? -0.16 : sp < 0.25 ? 0.08 : 0);
    return [c, c * 0.92, c * 0.76, n * 0.3 + sp * 0.2];
  }, 2);

  // — blacha na rąbek stojący —
  T.roof = bake(512, 512, (u, v) => {
    const sx = (u * 4) % 1;
    const seam = Math.exp(-Math.pow((sx - 0.5) / 0.03, 2));
    const n = nA(u, v, 6, 4); // rdza i mech: shader (render/wear.js)
    const base = 0.5 + (n - 0.5) * 0.12;
    return [base, base - 0.02, base - 0.04, 0.3 + seam * 0.7 + (n - 0.5) * 0.1];
  }, 4);

  // — trawa: drobne źdźbła, delikatne zmiany odcienia, rzadkie stokrotki i mniszki
  T.grass = bake(512, 512, (u, v) => {
    const n = nA(u, v, 8, 4), f = nB(u, v, 256, 1), bl = nC(u, v, 128, 2), m = nC(u, v, 4, 3);
    const dry = smooth(0.6, 0.85, m) * 0.5;
    const g = 0.8 + (f - 0.5) * 0.45 + (bl - 0.5) * 0.3 + (n - 0.5) * 0.2;
    const fl = nB(u + 0.31, v + 0.57, 96, 1);
    if (fl > 0.955) return [0.95 * g, 0.94 * g, 0.82 * g, f * 0.7 + 0.2];
    if (fl > 0.94) return [0.9, 0.72 * g, 0.12, f * 0.7 + 0.2];
    // opadłe liście w trawie: rzadkie żółte, pomarańczowe i brązowe plamki
    const lf = nB(u + 0.13, v + 0.81, 150, 1);
    if (lf > 0.955) { const lc = LEAVES[Math.floor(ihash(Math.floor(u * 150), Math.floor(v * 150)) * 4)]; return [lc[0] * g, lc[1] * g, lc[2] * g, f * 0.6 + 0.2]; }
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
  // — asfalt bez pasów (u = wzdłuż drogi, okres 12 m; v = w poprzek): kruszywo, koleiny, łaty, pęknięcia
  T.asphalt = bake(256, 512, (u, v) => {
    const n = nA(u, v, 16, 4), f = nB(u, v, 128, 1), agg = nC(u, v, 200, 1), cr = Math.abs(nB(u + 0.3, v + 0.2, [6, 3], 3) - 0.5);
    const patch = ihash(Math.floor(u * 3) + 5, Math.floor(v * 6) + 11) > 0.84 ? 1 : 0;
    const ruts = Math.exp(-Math.pow((v - 0.36) / 0.05, 2)) + Math.exp(-Math.pow((v - 0.64) / 0.05, 2));
    let c = 0.23 + (n - 0.5) * 0.05 + (f - 0.5) * 0.045 + (agg > 0.82 ? 0.07 : agg < 0.12 ? -0.04 : 0) + ruts * 0.025 + patch * (-0.03 + (f - 0.5) * 0.02);
    if (cr < 0.004) c -= 0.07;
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
