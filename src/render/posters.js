// Atlas plakatów (Wielki Brat, hasła Partii, szyldy) i animowany teleekran.
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

// Twarz Wielkiego Brata — rysowana proceduralnie (fikcyjna postać).
function drawFace(ctx, cx, cy, o = {}) {
  const skin = o.skin || '#b08a6a';
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 55, cy + 90, 110, 90);
  ctx.beginPath();
  ctx.ellipse(cx, cy, 128, 165, 0, 0, Math.PI * 2);
  ctx.fill();
  const sh = ctx.createLinearGradient(cx - 130, 0, cx + 130, 0);
  sh.addColorStop(0, 'rgba(40,25,15,0.45)');
  sh.addColorStop(0.45, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(40,25,15,0.3)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 128, 165, 0, 0, Math.PI * 2);
  ctx.fill();
  const hair = o.grey ? '#3a3632' : '#16120f';
  if (o.cap) {
    // czapka oficerska
    ctx.fillStyle = '#2b3326';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 128, 175, 62, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 175, cy - 130, 350, 26);
    ctx.fillStyle = '#7d1a14';
    ctx.fillRect(cx - 140, cy - 108, 280, 22);
    ctx.fillStyle = '#0d0d0b';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 82, 150, 26, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#c9a43a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11 : 26;
      ctx.lineTo(cx + Math.cos(a) * r, cy - 150 + Math.sin(a) * r);
    }
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 132, cy - 78, 18, 60);
    ctx.fillRect(cx + 114, cy - 78, 18, 60);
  } else {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 105, 138, 80, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 138, cy - 110, 22, 90);
    ctx.fillRect(cx + 116, cy - 110, 22, 90);
  }
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.strokeStyle = o.grey ? '#2a2724' : '#120e0b';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 22, cy - 42 + (o.stern ? 6 : 0));
    ctx.lineTo(cx + s * 88, cy - 50 - (o.stern ? 4 : 0));
    ctx.stroke();
  }
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#e8e0d0';
    ctx.beginPath();
    ctx.ellipse(cx + s * 55, cy - 16, 26, o.stern ? 10 : 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.arc(cx + s * 55, cy - 16, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(cx + s * 55 + 4, cy - 19, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.grey) {
    ctx.strokeStyle = 'rgba(60,35,20,0.35)';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 40, cy + 30); ctx.quadraticCurveTo(cx + s * 70, cy + 70, cx + s * 62, cy + 110);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(60,35,20,0.6)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx + 6, cy - 10); ctx.lineTo(cx + 14, cy + 40); ctx.lineTo(cx - 10, cy + 46);
  ctx.stroke();
  ctx.fillStyle = o.grey ? '#2e2a26' : '#100c0a';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 52);
  ctx.bezierCurveTo(cx + 40, cy + 40, cx + 95, cy + 55, cx + 100, cy + 92);
  ctx.bezierCurveTo(cx + 70, cy + 80, cx + 30, cy + 82, cx, cy + 76);
  ctx.bezierCurveTo(cx - 30, cy + 82, cx - 70, cy + 80, cx - 100, cy + 92);
  ctx.bezierCurveTo(cx - 95, cy + 55, cx - 40, cy + 40, cx, cy + 52);
  ctx.fill();
  ctx.fillStyle = 'rgba(70,30,20,0.7)';
  ctx.fillRect(cx - 30, cy + 98, 60, 6);
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

function uniform(ctx, w, h, cx, cy, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(40, h - 160); ctx.quadraticCurveTo(cx, cy + 120, w - 40, h - 160); ctx.lineTo(w - 16, h - 160); ctx.lineTo(16, h - 160);
  ctx.fill();
  ctx.fillRect(16, h - 200, w - 32, 40);
}

const BB_VARIANTS = {
  // klasyczny: "WIELKI BRAT PATRZY NA CIEBIE"
  bb0(ctx, w, h) {
    posterFrame(ctx, w, h, '#d8ccb0', '#1c1c1c');
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h * 0.42, w * 0.7);
    g.addColorStop(0, '#5a4b3c');
    g.addColorStop(1, '#141210');
    ctx.fillStyle = g;
    ctx.fillRect(16, 140, w - 32, h - 300);
    const cx = w / 2, cy = h * 0.46;
    uniform(ctx, w, h, cx, cy, '#2d3128');
    drawFace(ctx, cx, cy);
    posterText(ctx, w, h, 'WIELKI BRAT', 'PATRZY NA CIEBIE', '#b8261d');
  },
  // w czapce oficerskiej, posiwiały — "CZUWA NAD TOBĄ"
  bb1(ctx, w, h) {
    posterFrame(ctx, w, h, '#cfc6ad', '#26302a');
    const g = ctx.createLinearGradient(0, 140, 0, h - 160);
    g.addColorStop(0, '#4f5f52');
    g.addColorStop(1, '#1b221d');
    ctx.fillStyle = g;
    ctx.fillRect(16, 140, w - 32, h - 300);
    const cx = w / 2, cy = h * 0.5;
    uniform(ctx, w, h, cx, cy, '#3a4232');
    ctx.fillStyle = '#c9a43a';
    for (const s of [-1, 1]) ctx.fillRect(cx + s * 150 - 30, h - 215, 60, 14);
    drawFace(ctx, cx, cy, { cap: true, grey: true, stern: true, skin: '#a8846a' });
    posterText(ctx, w, h, 'WIELKI BRAT', 'CZUWA NAD TOBĄ', '#1a1a1a', '#d9c27a');
  },
  // wszechwidzące oko z promieniami — "WIDZI WSZYSTKO"
  bb2(ctx, w, h) {
    posterFrame(ctx, w, h, '#d6cdb5', '#111');
    const cx = w / 2, cy = h * 0.47;
    ctx.save();
    ctx.beginPath();
    ctx.rect(16, 140, w - 32, h - 300);
    ctx.clip();
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 0.5) / 24) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#8e1d16' : '#b8261d';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * 900, cy + Math.sin(a0) * 900);
      ctx.lineTo(cx + Math.cos(a1) * 900, cy + Math.sin(a1) * 900);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#ece4d0';
    ctx.beginPath();
    ctx.moveTo(cx - 210, cy);
    ctx.quadraticCurveTo(cx, cy - 190, cx + 210, cy);
    ctx.quadraticCurveTo(cx, cy + 190, cx - 210, cy);
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.fillStyle = '#3b4a3f';
    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx + 22, cy - 24, 12, 0, Math.PI * 2);
    ctx.fill();
    posterText(ctx, w, h, 'WIELKI BRAT', 'WIDZI WSZYSTKO', '#111');
  },
  // konstruktywistyczny profil — "PROWADZI NAS"
  bb3(ctx, w, h) {
    posterFrame(ctx, w, h, '#ddd2b6', '#b8261d');
    ctx.fillStyle = '#e9e1cc';
    ctx.beginPath();
    ctx.moveTo(16, h * 0.62); ctx.lineTo(w - 16, h * 0.34); ctx.lineTo(w - 16, h * 0.44); ctx.lineTo(16, h * 0.72);
    ctx.fill();
    const cx = w * 0.46, cy = h * 0.45;
    ctx.fillStyle = '#121110';
    ctx.beginPath();
    ctx.moveTo(cx - 120, cy + 260);
    ctx.lineTo(cx - 140, cy - 60);
    ctx.bezierCurveTo(cx - 150, cy - 200, cx + 40, cy - 230, cx + 95, cy - 120);
    ctx.lineTo(cx + 110, cy - 40);
    ctx.lineTo(cx + 150, cy + 10);
    ctx.lineTo(cx + 118, cy + 22);
    ctx.lineTo(cx + 128, cy + 48);
    // wąs
    ctx.lineTo(cx + 150, cy + 58);
    ctx.lineTo(cx + 132, cy + 80);
    ctx.lineTo(cx + 104, cy + 76);
    ctx.lineTo(cx + 112, cy + 104);
    ctx.lineTo(cx + 92, cy + 140);
    ctx.lineTo(cx + 40, cy + 150);
    ctx.lineTo(cx + 30, cy + 260);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(16, cy + 240, w - 32, h - cy - 256 - 150);
    ctx.fillStyle = '#b8261d';
    ctx.beginPath();
    ctx.arc(cx + 70, cy - 70, 9, 0, Math.PI * 2);
    ctx.fill();
    posterText(ctx, w, h, 'WIELKI BRAT', 'PROWADZI NAS', '#121110');
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
function drawPhotoPoster(ctx, [x, y, w, h], img, bottom, seed) {
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
  posterText(ctx, w, h, 'WIELKI BRAT', bottom, '#b8261d');
  weather(ctx, 0, 0, w, h, seed, 1.0);
  ctx.restore();
}

export async function createPosterAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS_SIZE;
  const ctx = c.getContext('2d');
  ['bb0', 'bb1', 'bb2', 'bb3'].forEach((v, i) => drawBigBrother(ctx, ATLAS[v], v, 5 + i * 17));
  const base = import.meta.env?.BASE_URL ?? '/';
  for (const [k, ph] of Object.entries(PHOTOS)) drawPhotoPoster(ctx, ATLAS[k], await loadImage(base + ph.src), ph.text, k.length * 31);
  drawSlogan(ctx, ATLAS.war, SLOGANS.war, '#1b1b1b', '#e8e2d2');
  drawSlogan(ctx, ATLAS.freedom, SLOGANS.freedom, '#a3221a', '#f0e9d6');
  drawSlogan(ctx, ATLAS.ignorance, SLOGANS.ignorance, '#1b1b1b', '#e8e2d2');
  for (const k of ['milk', 'bread', 'gin', 'tobacco']) drawSlogan(ctx, ATLAS[k], SLOGANS[k], '#20231f', '#d9d2bc');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── teleekran ───────────────────────────────────────────────────────────────
const NEWS = [
  'MINIOBFITU: PRZYDZIAŁ CZEKOLADY ZWIĘKSZONY DO 20 GRAMÓW TYGODNIOWO',
  'OCEANIA ZAWSZE BYŁA W STANIE WOJNY Z EURAZJĄ',
  'PLAN TRZYLETNI WYKONANY W 117%',
  'O GODZINIE 11:00 — DWIE MINUTY NIENAWIŚCI',
  'MYŚLOZBRODNIA NIE POCIĄGA ZA SOBĄ ŚMIERCI. MYŚLOZBRODNIA JEST ŚMIERCIĄ',
];

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
