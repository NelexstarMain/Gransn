// Atlas plakatów, reklam i szyldów.
import * as THREE from 'three';
import { ATLAS, ATLAS_SIZE, SLOGANS, PHOTOS } from '../gen/atlas.js';
import { mulberry32 } from '../core/rng.js';

function weather(ctx, x, y, w, h, seed, amount = 1) {
  const r = mulberry32(seed);
  for (let i = 0; i < 260 * amount; i++) {
    const px = x + r() * w, py = y + r() * h, s = 1 + r() * 6;
    ctx.fillStyle = `rgba(${r() < 0.5 ? '40,30,20' : '230,220,200'},${0.05 + r() * 0.12})`;
    ctx.beginPath();
    ctx.arc(px, py, s, 0, Math.PI * 2);
    ctx.fill();
  }
  // zacieki
  for (let i = 0; i < 14 * amount; i++) {
    const px = x + r() * w;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(60,50,30,0.0)');
    g.addColorStop(1, 'rgba(60,50,30,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(px, y + r() * h * 0.5, 2 + r() * 5, h);
  }
}

function fitText(ctx, text, maxW, size, font = 'Impact, "Arial Black", sans-serif') {
  let s = size;
  do {
    ctx.font = `bold ${s}px ${font}`;
    s -= 2;
  } while (ctx.measureText(text).width > maxW && s > 8);
}

function posterFrame(ctx, w, h, paper, inner) {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = inner;
  ctx.fillRect(16, 16, w - 32, h - 32);
}

function posterText(ctx, w, h, top, bottom, band, fg = '#efe8d4') {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e9e2cf';
  fitText(ctx, top, w - 70, 96);
  ctx.fillText(top, w / 2, 82);
  ctx.fillStyle = band;
  ctx.fillRect(16, h - 150, w - 32, 134);
  ctx.fillStyle = fg;
  fitText(ctx, bottom, w - 70, 70);
  ctx.fillText(bottom, w / 2, h - 83);
}

// Plakaty miasteczka: kino, lemoniada, wakacje nad morzem, port
const BB_VARIANTS = {
  bb0(ctx, w, h) {
    posterFrame(ctx, w, h, '#e8dcc0', '#1e2440');
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(255,220,140,${0.05 + (i % 3) * 0.03})`;
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.75); ctx.lineTo((i / 13) * w, 140); ctx.lineTo(((i + 0.5) / 13) * w, 140); ctx.fill();
    }
    ctx.fillStyle = '#e8c35a';
    ctx.beginPath(); ctx.arc(w / 2, h * 0.45, 120, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e2440';
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 70, h * 0.45 + Math.sin(a) * 70, 26, 0, Math.PI * 2); ctx.fill(); }
    posterText(ctx, w, h, 'KINO ODEON', 'DZIŚ PREMIERA', '#b83a2a');
  },
  bb1(ctx, w, h) {
    posterFrame(ctx, w, h, '#f1e7c8', '#f7d84a');
    for (let k = 0; k < 5; k++) {
      const x = 90 + (k % 3) * 160, y = 260 + Math.floor(k / 3) * 230 + (k % 2) * 40;
      ctx.fillStyle = '#e8b31a'; ctx.beginPath(); ctx.ellipse(x, y, 85, 62, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.ellipse(x - 15, y - 12, 40, 26, 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#3f8a3a';
    ctx.beginPath(); ctx.ellipse(w * 0.7, 200, 60, 22, -0.6, 0, Math.PI * 2); ctx.fill();
    posterText(ctx, w, h, 'LEMONIADA', 'ZIMNA · 2 ZŁ', '#2e6b2a');
  },
  bb2(ctx, w, h) {
    posterFrame(ctx, w, h, '#e9e2cf', '#7cc0d8');
    ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(w * 0.7, 260, 90, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#2d7fa8' : '#3a95c0';
      ctx.beginPath(); ctx.moveTo(16, 520 + i * 60);
      for (let x = 16; x <= w - 16; x += 20) ctx.lineTo(x, 520 + i * 60 + Math.sin(x / 30 + i) * 12);
      ctx.lineTo(w - 16, h - 160); ctx.lineTo(16, h - 160); ctx.fill();
    }
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.moveTo(150, 500); ctx.lineTo(200, 330); ctx.lineTo(220, 500); ctx.fill();
    posterText(ctx, w, h, 'WYSPA GRANSN', 'PLAŻA · MOLO', '#1f5f80');
  },
  bb3(ctx, w, h) {
    posterFrame(ctx, w, h, '#ddd2b6', '#c94f2b');
    ctx.fillStyle = '#f2e6c8';
    ctx.fillRect(w / 2 - 50, 300, 100, 420);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#c94f2b' : '#f2e6c8'; ctx.fillRect(w / 2 - 50 + i * 3, 380 + i * 80, 100 - i * 6, 40); }
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath(); ctx.moveTo(w / 2, 250); ctx.lineTo(w - 30, 170); ctx.lineTo(w - 30, 330); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(w / 2 - 60, 260, 120, 40);
    posterText(ctx, w, h, 'LATARNIA', 'ZWIEDZANIE 10–18', '#222');
  },
};

function drawBigBrother(ctx, [x, y, w, h], variant, seed) {
  ctx.save();
  ctx.translate(x, y);
  BB_VARIANTS[variant](ctx, w, h);
  weather(ctx, 0, 0, w, h, seed, 1.4);
  ctx.restore();
}

function drawSlogan(ctx, [x, y, w, h], text, bg, fg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, text, w - 80, h * 0.55);
  ctx.fillText(text, x + w / 2, y + h / 2 + 4);
  weather(ctx, x, y, w, h, x + y, 0.5);
}

function loadImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// Plakat ze zdjęciem: kadr "cover", lekka sepia i ziarno, napisy Partii.
function drawPhotoPoster(ctx, [x, y, w, h], img, top, bottom, seed) {
  ctx.save();
  ctx.translate(x, y);
  posterFrame(ctx, w, h, '#d8ccb0', '#1c1c1c');
  const fx = 16, fy = 140, fw = w - 32, fh = h - 300;
  if (img) {
    const s = Math.max(fw / img.width, fh / img.height);
    const sw = fw / s, sh = fh / s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    ctx.filter = 'grayscale(0.55) sepia(0.35) contrast(1.15)';
    ctx.drawImage(img, (img.width - sw) / 2, Math.max(0, (img.height - sh) * 0.2), sw, sh, fx, fy, fw, fh);
    ctx.filter = 'none';
    const g = ctx.createRadialGradient(w / 2, h * 0.45, fw * 0.3, w / 2, h * 0.45, fw * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.restore();
  }
  posterText(ctx, w, h, top, bottom, '#e0a800', '#1a1a1a');
  weather(ctx, 0, 0, w, h, seed, 0.6);
  ctx.restore();
}

export async function createPosterAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS_SIZE;
  const ctx = c.getContext('2d');
  ['bb0', 'bb1', 'bb2', 'bb3'].forEach((v, i) => drawBigBrother(ctx, ATLAS[v], v, 5 + i * 17));
  const base = import.meta.env?.BASE_URL ?? '/';
  for (const [k, ph] of Object.entries(PHOTOS)) drawPhotoPoster(ctx, ATLAS[k], await loadImage(base + ph.src), ph.top, ph.text, k.length * 31);
  drawSlogan(ctx, ATLAS.war, SLOGANS.war, '#f2c200', '#1a1a1a');
  drawSlogan(ctx, ATLAS.freedom, SLOGANS.freedom, '#1e2440', '#e8c35a');
  drawSlogan(ctx, ATLAS.ignorance, SLOGANS.ignorance, '#5a3a24', '#f1e4cc');
  for (const k of ['milk', 'bread', 'gin', 'tobacco']) drawSlogan(ctx, ATLAS[k], SLOGANS[k], '#20231f', '#d9d2bc');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── teleekran ───────────────────────────────────────────────────────────────
const NEWS = ['GRANSN TAXI · 919', 'PROM NA STAŁY LĄD O 17:00', 'KINO ODEON: PREMIERA W SOBOTĘ', 'POGODA: SŁONECZNIE, 21°C'];

export class Telescreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 320;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.t = 0;
    this.acc = 1;
    this.draw();
  }

  update(dt) {
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    this.draw();
    this.texture.needsUpdate = true;
  }

  draw() {
    const { ctx, t } = this;
    const W = 512, H = 320;
    const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, '#5f7a6c');
    g.addColorStop(1, '#0d1612');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // oko
    const cx = W / 2, cy = H * 0.42, look = Math.sin(t * 0.7) * 18;
    ctx.fillStyle = '#d9e6dc';
    ctx.beginPath();
    ctx.moveTo(cx - 150, cy);
    ctx.quadraticCurveTo(cx, cy - 115, cx + 150, cy);
    ctx.quadraticCurveTo(cx, cy + 115, cx - 150, cy);
    ctx.fill();
    ctx.fillStyle = '#2e4a3c';
    ctx.beginPath();
    ctx.arc(cx + look, cy, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#050807';
    ctx.beginPath();
    ctx.arc(cx + look, cy, 24 + Math.sin(t * 3) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx + look + 14, cy - 16, 8, 0, Math.PI * 2);
    ctx.fill();
    // pasek wiadomości
    ctx.fillStyle = '#0a0f0c';
    ctx.fillRect(0, H - 70, W, 70);
    ctx.fillStyle = '#c9e2d0';
    ctx.font = 'bold 34px "Arial Narrow", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const msg = NEWS.join('   ///   ') + '   ///   ';
    const mw = ctx.measureText(msg).width;
    const off = (t * 120) % mw;
    ctx.fillText(msg, -off, H - 35);
    ctx.fillText(msg, -off + mw, H - 35);
    // linie i szum
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = (t * 40) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
    const band = (t * 90) % (H + 80) - 40;
    ctx.fillStyle = 'rgba(200,255,220,0.06)';
    ctx.fillRect(0, band, W, 40);
  }
}
