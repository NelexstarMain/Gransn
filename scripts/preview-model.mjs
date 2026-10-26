// Podgląd modeli BEZ przeglądarki: programowy rasteryzator (z-bufor, odrzucanie tylnych
// ścianek jak w three.js, światło słońca + półsfera) zapisujący PNG.
//   node scripts/preview-model.mjs <model> <wyjście.png> [klucz=wartość …]
// Modele: car (kind=tourer|sedan|taxi|van|truck|roadster, color=r,g,b), wheel, person (seed=N), rifle
import fs from 'fs';
import zlib from 'zlib';
import * as THREE from 'three';
import { Builder } from '../src/gen/builder.js';
import { Cage } from '../src/gen/cage.js';
import { M } from '../src/gen/modules.js';
import { CAR_KINDS } from '../src/gen/vehicles.js';

const [, , name = 'car', out = 'preview.png', ...rest] = process.argv;
const opt = Object.fromEntries(rest.map((s) => s.split('=')));

// ── budowa modelu (jak moduleMesh w grze) ────────────────────────────────────
function build(fn, W, H, D, p) {
  const b = new Builder();
  b.cell(Cage.quad([-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], 0, H), W, H, D);
  fn(b, W, H, D, p);
  return b.finish().mats;
}
const parts = [];
const color = opt.color ? opt.color.split(',').map(Number) : null;
let focus = [0, 1, 0], radius = 3.2;
const LOADERS = {
  async car() {
    const kind = opt.kind || 'taxi';
    const { L, Wd } = CAR_KINDS[kind];
    parts.push(build(M.oldcar, L, 2.4, Wd, { kind, color: color || [0.95, 0.76, 0.12], seat: [0.3, 0.12, 0.08], taxi: kind === 'taxi', seed: Number(opt.seed) || 3 }));
    focus = [0, 0.85, 0]; radius = L / 2;
  },
  async wheel() {
    const m = await import('../src/gen/vehicles.js');
    parts.push(build(m.vehicleModules.carwheel, 1, 1, 1, { r: 0.46 }));
    focus = [0, 0.4, 0]; radius = 0.55;
  },
  async person() {
    const rig = await import('../src/game/rig.js');
    const { Rng } = await import('../src/core/rng.js');
    const geo = rig.buildPartGeometries({ cloth: {} });
    for (const g of rig.previewFigure(Number(opt.seed) || 1, opt.pose || 'stand', Rng, geo)) parts.push(g);
    focus = [0, opt.pose && opt.pose.includes('sit') ? 1.0 : 0.95, 0]; radius = 1.0;
  },
  async rifle() {
    const m = await import('../src/gen/weapons.js');
    const abs = (fn, p = {}) => {
      const bb = new Builder();
      bb.cell(new Cage([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]), 1, 1, 1);
      fn(bb, 1, 1, 1, p);
      return bb.finish().mats;
    };
    parts.push(abs(m.weaponModules.rifle), abs(m.weaponModules.bolt));
    if (opt.arms) parts.push(abs(m.weaponModules.arms));
    focus = [0.1, 0.0, 0]; radius = 0.62;
  },
};
await LOADERS[name]();

// ── materiały: kolor bazowy i połysk (przybliżenie tego, co robi three.js) ─────
const MAT = {
  glass: { k: [0.55, 0.68, 0.78], spec: 0.9, env: 0.6 }, metal: { k: [0.9, 0.9, 0.9], spec: 0.55, env: 0.25 },
  body: { k: [1, 1, 1], spec: 0.4, env: 0.18 }, paint: { k: [1, 1, 1], spec: 0.35, env: 0.15 },
  dark: { k: [0.1, 0.095, 0.09], spec: 0, env: 0 }, light: { k: [1, 0.95, 0.8], emit: 1.0, spec: 0, env: 0 },
  tail: { k: [1, 0.2, 0.15], emit: 0.5, spec: 0, env: 0 }, wood: { k: [1, 1, 1], spec: 0.1, env: 0 },
  cloth: { k: [1, 1, 1], spec: 0.02, env: 0 }, skin: { k: [1, 1, 1], spec: 0.08, env: 0 }, leather: { k: [1, 1, 1], spec: 0.2, env: 0 },
};
const SUN = new THREE.Vector3(-0.55, 0.5, 0.42).normalize();

// ── rasteryzator ─────────────────────────────────────────────────────────────
const SS = 2, VW = 560, VH = 380;
function render(eye, target, topView = false, fov = 34) {
  const W = VW * SS, H = VH * SS;
  const col = new Float32Array(W * H * 3), zb = new Float32Array(W * H).fill(Infinity);
  const sky = [0.62, 0.74, 0.84];
  const cam = new THREE.PerspectiveCamera(fov, VW / VH, 0.05, 100);
  cam.position.copy(eye); cam.up.set(topView ? 1 : 0, topView ? 0 : 1, 0); cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  // tło: niebo, a pod horyzontem podłoga (promień → płaszczyzna y = 0, siatka co 1 m)
  {
    const inv = new THREE.Matrix4().copy(cam.projectionMatrixInverse), mw = cam.matrixWorld, d = new THREE.Vector3();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        d.set((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2, 0.5).applyMatrix4(inv).applyMatrix4(mw).sub(cam.position).normalize();
        const i = (y * W + x) * 3;
        if (d.y < -0.002) {
          const t = -cam.position.y / d.y, gx = cam.position.x + d.x * t, gz = cam.position.z + d.z * t;
          const grid = Math.abs(gx - Math.round(gx)) < 0.012 * t * 0.35 || Math.abs(gz - Math.round(gz)) < 0.012 * t * 0.35 ? 0.05 : 0;
          const fade = Math.min(1, t / 40), base = 0.26 + grid;
          col[i] = base * (1 - fade) + sky[0] * 0.8 * fade; col[i + 1] = base * (1 - fade) + sky[1] * 0.8 * fade; col[i + 2] = base * (1 - fade) + sky[2] * 0.8 * fade;
        } else {
          const t = Math.max(0, d.y) * 3;
          col[i] = sky[0] * (0.9 + 0.1 * Math.min(1, t)); col[i + 1] = sky[1] * (0.9 + 0.1 * Math.min(1, t)); col[i + 2] = sky[2];
        }
      }
  }
  const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const e = VP.elements;
  const proj = (x, y, z) => {
    const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    return [(e[0] * x + e[4] * y + e[8] * z + e[12]) / cw, (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw, (e[2] * x + e[6] * y + e[10] * z + e[14]) / cw, cw];
  };
  const tri = (P, N, C, m) => {
    const S = P.map((p) => [(p[0] * 0.5 + 0.5) * W, (1 - (p[1] * 0.5 + 0.5)) * H, p[2], p[3]]);
    const area = (S[1][0] - S[0][0]) * (S[2][1] - S[0][1]) - (S[2][0] - S[0][0]) * (S[1][1] - S[0][1]);
    if (area >= 0) return; // ekran ma oś y w dół: front (CCW w NDC) ma ujemne pole
    const x0 = Math.max(0, Math.floor(Math.min(S[0][0], S[1][0], S[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(S[0][0], S[1][0], S[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(S[0][1], S[1][1], S[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(S[0][1], S[1][1], S[2][1])));
    const inv = 1 / area, st = MAT[m] || MAT.paint;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((S[1][0] - px) * (S[2][1] - py) - (S[2][0] - px) * (S[1][1] - py)) * inv;
        const w1 = ((S[2][0] - px) * (S[0][1] - py) - (S[0][0] - px) * (S[2][1] - py)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * S[0][2] + w1 * S[1][2] + w2 * S[2][2], idx = y * W + x;
        if (z >= zb[idx]) continue;
        zb[idx] = z;
        let nx = 0, ny = 0, nz = 0, r = 0, g = 0, b = 0;
        for (let k = 0; k < 3; k++) { const w = k === 0 ? w0 : k === 1 ? w1 : w2; nx += N[k][0] * w; ny += N[k][1] * w; nz += N[k][2] * w; r += C[k][0] * w; g += C[k][1] * w; b += C[k][2] * w; }
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const lam = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
        const hemi = 0.55 + 0.45 * ny; // niebo z góry, ziemia z dołu
        let L = 0.42 * hemi + 1.15 * lam;
        // przybliżony połysk: odbicie nieba w stronę kamery (fresnel)
        const vx = eye.x - 0, vy = eye.y, vz = eye.z; const vl = Math.hypot(vx, vy, vz) || 1;
        const fres = Math.pow(1 - Math.max(0, (nx * vx + ny * vy + nz * vz) / vl), 3);
        const spec = st.spec * (0.15 + 0.85 * fres) * (0.4 + 0.6 * Math.max(0, ny));
        const em = st.emit || 0;
        col[idx * 3] = r * st.k[0] * (L + em) + spec * sky[0] + st.env * 0.3;
        col[idx * 3 + 1] = g * st.k[1] * (L + em) + spec * sky[1] + st.env * 0.3;
        col[idx * 3 + 2] = b * st.k[2] * (L + em) + spec * sky[2] + st.env * 0.3;
      }
  };
  let N;
  for (const mats of parts) {
    for (const [mname, m] of Object.entries(mats)) {
      const mk = mname === 'tile' ? 'paint' : mname;
      for (let i = 0; i < m.i.length; i += 3) {
        const ids = [m.i[i], m.i[i + 1], m.i[i + 2]];
        const Pv = ids.map((v) => proj(m.p[v * 3], m.p[v * 3 + 1], m.p[v * 3 + 2]));
        if (Pv.some((p) => p[3] <= 0.05)) continue;
        N = ids.map((v) => [m.n[v * 3] / 127, m.n[v * 3 + 1] / 127, m.n[v * 3 + 2] / 127]);
        const C = ids.map((v) => [m.c[v * 3] / 255, m.c[v * 3 + 1] / 255, m.c[v * 3 + 2] / 255]);
        tri(Pv, N, C, mk);
      }
    }
  }
  // zmniejszenie SS×SS + gamma
  const img = Buffer.alloc(VW * VH * 3);
  for (let y = 0; y < VH; y++)
    for (let x = 0; x < VW; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += col[((y * SS + j) * W + x * SS + i) * 3 + c];
        s /= SS * SS;
        const t = s / (1 + s * 0.35); // łagodna kompresja
        img[(y * VW + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, t), 1 / 2.2) * 255)));
      }
  return img;
}

// ── układ arkusza: widoki ─────────────────────────────────────────────────────
const f = new THREE.Vector3(...focus);
const DIRS = { side: [0, 0.16, 1], front: [0.85, 0.32, 0.8], rear: [-0.85, 0.32, -0.8], top: [0.001, 1, 0.001], front2: [1, 0.12, 0], back: [-1, 0.12, 0], rside: [0, 0.16, -1] };
const views = (opt.views || 'side,front,rear,top').split(',').map((v) => {
  const dir = new THREE.Vector3(...DIRS[v]).normalize();
  return render(f.clone().add(dir.multiplyScalar(radius * 2.7 * (opt.zoom ? Number(opt.zoom) : 1))), f, v === 'top');
});
const cols = Math.min(2, views.length), rows = Math.ceil(views.length / cols);
const SW = VW * cols, SH = VH * rows, sheet = Buffer.alloc(SW * SH * 3);
views.forEach((img, k) => {
  const ox = (k % cols) * VW, oy = Math.floor(k / cols) * VH;
  for (let y = 0; y < VH; y++) img.copy(sheet, ((oy + y) * SW + ox) * 3, y * VW * 3, (y + 1) * VW * 3);
});

// ── PNG (bez zależności) ─────────────────────────────────────────────────────
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((SW * 3 + 1) * SH);
for (let y = 0; y < SH; y++) { raw[y * (SW * 3 + 1)] = 0; sheet.copy(raw, y * (SW * 3 + 1) + 1, y * SW * 3, (y + 1) * SW * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
console.log('zapisano', out, SW + '×' + SH);
