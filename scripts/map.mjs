// Plan miasta z góry (PNG): jezdnie, budynki, rzeka, mosty, autostrada, tory, rekwizyty.
//   node scripts/map.mjs [ziarno] [--out plik.png] [--size 1400] [--props]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { generateCity } from '../src/city/layout.js';
import { quadGeom, filled, T_BLD, T_WATER, T_BEACH, T_PARK, T_PLAZA, T_COURT, T_GARDEN } from '../src/city/grid.js';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seed = Number(args.find((a) => /^\d+$/.test(a))) || 1984;
const SIZE = Number(arg('--size', 1400));
const OUT = path.resolve(arg('--out', `zdjecia/plan_${seed}.png`));
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const c = generateCity(seed), g = c.grid, T = c.terrain, H = c.half;
const cv = createCanvas(SIZE, SIZE), x = cv.getContext('2d');
const k = SIZE / (2 * H + 40);
const X = (v) => (v + H + 20) * k, Z = (v) => (v + H + 20) * k;
x.fillStyle = '#2f5d7a'; x.fillRect(0, 0, SIZE, SIZE);

// ląd
x.fillStyle = '#9fb36a';
x.beginPath();
for (let i = 0; i <= 360; i++) { const a = (i / 360) * Math.PI * 2, r = T.coastR(a); const px = X(Math.cos(a) * r), pz = Z(Math.sin(a) * r); i ? x.lineTo(px, pz) : x.moveTo(px, pz); }
x.closePath(); x.fill();
// plaża
x.strokeStyle = '#e3d9a8'; x.lineWidth = 34 * k; x.stroke();
x.save();
x.beginPath();
for (let i = 0; i <= 360; i++) { const a = (i / 360) * Math.PI * 2, r = T.coastR(a); const px = X(Math.cos(a) * r), pz = Z(Math.sin(a) * r); i ? x.lineTo(px, pz) : x.moveTo(px, pz); }
x.closePath(); x.clip();
// rzeka
x.fillStyle = '#2f5d7a';
x.beginPath();
T.left.forEach((p, i) => (i ? x.lineTo(X(p[0]), Z(p[1])) : x.moveTo(X(p[0]), Z(p[1]))));
[...T.right].reverse().forEach((p) => x.lineTo(X(p[0]), Z(p[1])));
x.closePath(); x.fill();
x.restore();

// podłoże miejskie wg typu punktu
const fillQ = (poly, col) => { x.fillStyle = col; x.beginPath(); poly.forEach((p, i) => (i ? x.lineTo(X(p[0]), Z(p[1])) : x.moveTo(X(p[0]), Z(p[1])))); x.closePath(); x.fill(); };
for (let q = 0; q < g.quads.length / 4; q++) {
  const G = quadGeom(g, q);
  for (let i = 0; i < 4; i++) {
    const a = G.v[i], ty = g.TY[a];
    if (ty === T_WATER || ty === T_BEACH) continue;
    const poly = [G.p[i], G.m[i], G.c, G.m[(i + 3) % 4]];
    if (ty === T_BLD) fillQ(poly, g.ZN[a] === 2 ? '#e0b86a' : g.H[a] >= 5 ? '#c4553d' : g.H[a] >= 3 ? '#d8805a' : '#e3a98a');
    else if (ty === T_PARK || ty === T_GARDEN) fillQ(poly, '#6f9a4a');
    else if (ty === T_PLAZA || ty === T_COURT) fillQ(poly, '#b9ab94');
    else fillQ(poly, '#cfc7b8');
  }
}
// jezdnie
const col = { cobble: '#4a4a4a', dirt: '#8a6a44', asphalt: '#222222' };
for (const s of c.streets) {
  x.strokeStyle = s.bridge ? '#f2c200' : col[s.mat] || '#4a4a4a';
  x.lineWidth = Math.max(1, 2 * s.rw * k); x.lineCap = 'round';
  x.beginPath(); x.moveTo(X(s.a[0]), Z(s.a[1])); x.lineTo(X(s.b[0]), Z(s.b[1])); x.stroke();
}
// tory
x.strokeStyle = '#7a3b8c'; x.lineWidth = 2; x.setLineDash([6, 4]);
x.beginPath(); c.routes.rail.pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Z(p[1])) : x.moveTo(X(p[0]), Z(p[1])))); x.stroke(); x.setLineDash([]);
// mosty
for (const b of c.bridges) {
  x.strokeStyle = b.highway ? '#ff7a00' : '#ffe14d'; x.lineWidth = b.width * k; x.lineCap = 'butt';
  x.beginPath(); x.moveTo(X(b.e0[0]), Z(b.e0[1])); x.lineTo(X(b.e1[0]), Z(b.e1[1])); x.stroke();
}
// rekwizyty
if (args.includes('--props')) {
  const dot = (p, r, cc) => { x.fillStyle = cc; x.beginPath(); x.arc(X(p[0]), Z(p[1]), Math.max(1.2, r * k), 0, 7); x.fill(); };
  for (const t of c.trees) dot(t.p, 1.6, '#1f5a1f');
  for (const l of c.lamps) dot(l.p, 0.6, '#ffee66');
  for (const b of c.benches) dot(b.p, 0.8, '#7a4a1a');
  for (const p of c.props) dot(p.p, 1, '#ff3399');
}
// plan miasteczka (--plan): obrys jądra, pierścień plant, rynek, ziarna Voronoi
if (args.includes('--plan') && c.plan) {
  const P = c.plan, path = (pts, close = true) => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Z(p[1])) : x.moveTo(X(p[0]), Z(p[1])))); if (close) x.closePath(); };
  x.lineWidth = 2; x.strokeStyle = '#00e5ff'; x.setLineDash([8, 5]); path(P.outline.pts); x.stroke(); x.setLineDash([]);
  if (P.ring) { x.strokeStyle = '#7CFC00'; path(P.ring.outer); x.stroke(); }
  x.strokeStyle = '#ff00ff'; x.lineWidth = 3; path(P.rynek.poly); x.stroke();
  for (const s of c.seedList) { x.fillStyle = s.dead ? '#ff00ff' : s.fixed ? '#ffffff' : '#000000'; x.beginPath(); x.arc(X(s.x), Z(s.z), 2.2, 0, 7); x.fill(); }
}
x.fillStyle = '#fff'; x.font = '20px sans-serif';
x.fillText(`ziarno ${seed} · ${c.plan ? c.plan.type + ' · ' : ''}${c.terrain.riverMode} · ${c.streets.length} odcinków dróg · ${c.bridges.length} mostów`, 16, 28);
fs.writeFileSync(OUT, cv.toBuffer('image/png'));
console.log('plan →', OUT);
void filled;
