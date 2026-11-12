// Emulacja CPU przebiegu blasku z ink.js: obraz z jasnymi punktami → łańcuch mipmap → blurMip → obraz
import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';
const W = 1024, H = 640;
const mips = [];
let lvl = { w: W, h: H, d: new Float32Array(W * H) };
// scena: ciemno + kilka lamp (jasne dyski r=5 px, wartość 6) + okna (prostokąty 4x6 px, wartość 3)
const put = (x, y, r, v) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) lvl.d[(y + j) * W + x + i] += v; };
for (const [x, y] of [[200, 300], [330, 280], [700, 350], [820, 310]]) put(x, y, 5, 6);
for (let k = 0; k < 40; k++) { const x = 480 + (k % 8) * 14, y = 200 + Math.floor(k / 8) * 20; for (let j = 0; j < 8; j++) for (let i = 0; i < 5; i++) lvl.d[(y + j) * W + x + i] += 3; }
mips.push(lvl);
while (lvl.w > 1) {
  const w = Math.max(1, lvl.w >> 1), h = Math.max(1, lvl.h >> 1), d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += lvl.d[Math.min(lvl.h - 1, y * 2 + b) * lvl.w + Math.min(lvl.w - 1, x * 2 + a)]; d[y * w + x] = s / 4; }
  lvl = { w, h, d }; mips.push(lvl);
}
const bil = (L, u, v) => { const m = mips[L]; const x = u * m.w - 0.5, y = v * m.h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0; const g = (i, j) => m.d[Math.max(0, Math.min(m.h - 1, j)) * m.w + Math.max(0, Math.min(m.w - 1, i))]; return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; };
const lod = (l, u, v) => { const a = Math.floor(l), f = l - a; return bil(Math.min(a, mips.length - 1), u, v) * (1 - f) + bil(Math.min(a + 1, mips.length - 1), u, v) * f; };
const blurMip = (u, v, l, sp) => { let s = 0; const st = (Math.pow(2, l) * sp); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += lod(l, u + (i * st) / W, v + (j * st) / H) * (2 - Math.abs(i)) * (2 - Math.abs(j)); return s / 16; };
const vogel = (u, v, l, R, n) => { let s = 0; const st = Math.pow(2, l) * R; for (let i = 0; i < n; i++) { const a = i * 2.399963, r = Math.sqrt((i + 0.5) / n); s += lod(l, u + Math.cos(a) * r * st / W, v + Math.sin(a) * r * st / H); } return s / n; };
// kwartalna i 1/16 kopia (pudełko), disk Vogela 2D na tych kopiach
const box = (src, f) => { const w = Math.max(1, src.w / f | 0), h = Math.max(1, src.h / f | 0), d = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += Math.min(6, src.d[(y * f + j) * src.w + x * f + i]); d[y * w + x] = s / (f * f); } return { w, h, d }; };
const Q1 = box(mips[0], 4), Q2 = box(Q1, 4);
const bl2 = (m, u, v) => { const x = u * m.w - 0.5, y = v * m.h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0; const g = (i, j) => m.d[Math.max(0, Math.min(m.h - 1, j)) * m.w + Math.max(0, Math.min(m.w - 1, i))]; return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; };
const disk = (m, u, v, R, n) => { let s = 0; for (let i = 0; i < n; i++) { const a = i * 2.399963, r = Math.sqrt((i + 0.5) / n) * R; const w = 1 - (r / R) * (r / R) * 0.6; s += bl2(m, u + Math.cos(a) * r / m.w, v + Math.sin(a) * r / m.h) * w; } return s / n / 0.7; };
const gaussPass = (m, dx, dy) => { const d = new Float32Array(m.w * m.h); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const u = (x + 0.5) / m.w, v = (y + 0.5) / m.h; const t = (k) => bl2(m, u + dx * k / m.w, v + dy * k / m.h); d[y * m.w + x] = t(0) * 0.2270270270 + (t(1.3846153846) + t(-1.3846153846)) * 0.3162162162 + (t(3.2307692308) + t(-3.2307692308)) * 0.0702702703; } return { w: m.w, h: m.h, d }; };
const G1 = gaussPass(gaussPass(Q1, 1.4, 0), 0, 1.4), G2 = gaussPass(gaussPass(Q2, 1.8, 0), 0, 1.8);
const it2 = (m) => gaussPass(gaussPass(gaussPass(gaussPass(m, 1, 0), 0, 1), 1, 0), 0, 1);
const Q3 = box(Q2, 2);
const H1 = it2(Q1), H2 = it2(Q2), H3 = it2(Q3);
const MODE = process.argv[2] || 'now';
const cv = createCanvas(W, H), ctx = cv.getContext('2d'), im = ctx.createImageData(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const u = (x + 0.5) / W, v = (y + 0.5) / H;
  let g;
  if (MODE === 'now') g = Math.min(blurMip(u, v, 2.5, 1.3), 4) * 0.3 + Math.min(blurMip(u, v, 4, 1.4), 3) * 0.4 + Math.min(blurMip(u, v, 5.5, 1.4), 2) * 0.45;
  else if (MODE === 'old') g = Math.min(lod(2.5, u, v), 4) * 0.25 + Math.min(lod(4, u, v), 3) * 0.35 + Math.min(lod(5.5, u, v), 2) * 0.4 + Math.min(lod(7, u, v), 1.5) * 0.3;
  else if (MODE === 'vogel') g = Math.min(vogel(u, v, 2.5, 2.4, 14), 4) * 0.3 + Math.min(vogel(u, v, 4, 2.4, 14), 3) * 0.4 + Math.min(vogel(u, v, 5.5, 2.4, 14), 2) * 0.45;
  else if (MODE === 'disk') g = Math.min(disk(Q1, u, v, 11, 28), 4) * 0.5 + Math.min(disk(Q2, u, v, 7, 20), 3) * 0.6;
  else if (MODE === 'gauss') g = Math.min(bl2(G1, u, v), 4) * 0.5 + Math.min(bl2(G2, u, v), 3) * 0.6;
  else if (MODE === 'gauss2') g = Math.min(bl2(H1, u, v), 4) * 0.45 + Math.min(bl2(H2, u, v), 3) * 0.6 + Math.min(bl2(H3, u, v), 2) * 0.6;
  else { // wzorzec: prawdziwy gaussian rozmyty (σ = 12, 40, 110 px) policzony wprost
    g = 0;
  }
  const c = Math.min(255, Math.pow(Math.min(1, g * 0.6 * 3), 0.6) * 255), i = (y * W + x) * 4;
  im.data[i] = im.data[i + 1] = im.data[i + 2] = c; im.data[i + 3] = 255;
}
ctx.putImageData(im, 0, 0);
fs.writeFileSync(`zdjecia/glow_${MODE}.png`, cv.toBuffer('image/png'));
console.log('ok', MODE);
