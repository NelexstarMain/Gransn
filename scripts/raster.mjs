// Programowy rasteryzator (bez przeglądarki i bez GPU): geometria z Buildera → PNG.
// Z-bufor, korekcja perspektywy, światło: słońce + półkula. Albedo materiałów to tylko
// przybliżenie tekstur, więc kolory są poglądowe — służy do oceny brył i fasad.
import zlib from 'node:zlib';
import fs from 'node:fs';

const BASE = { // liniowe albedo (mnoży kolor wierzchołka)
  plaster: [0.86, 0.85, 0.82], brick: [1.0, 0.82, 0.74], stone: [0.92, 0.9, 0.86], roof: [0.8, 0.75, 0.72], tile: [1.0, 0.75, 0.65],
  cobble: [0.55, 0.53, 0.5], slab: [0.7, 0.69, 0.66], curb: [0.7, 0.7, 0.7], grass: [0.5, 0.7, 0.35], leaf: [0.6, 0.8, 0.4], bark: [0.5, 0.4, 0.32],
  sand: [0.9, 0.82, 0.6], gravel: [0.6, 0.58, 0.55], asphalt: [0.3, 0.3, 0.32], paint: [1, 1, 1], wood: [0.9, 0.85, 0.8], metal: [0.6, 0.62, 0.63],
  glass: [0.22, 0.3, 0.38], dark: [0.1, 0.09, 0.08], light: [1, 0.9, 0.7], screen: [0.2, 0.3, 0.25], poster: [0.9, 0.8, 0.7], lod: [0.8, 0.78, 0.74], lodroof: [0.7, 0.4, 0.3],
};
const SUN = (() => { const v = [-0.55, 0.5, 0.42]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

export function renderMeshes(meshes, opt) {
  const { W = 1200, H = 800, eye, target, fov = 50, ortho = 0, up = [0, 1, 0] } = opt;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const f = norm(sub(target, eye)), r = norm(cross(f, up)), u = cross(r, f);
  const tanF = Math.tan((fov * Math.PI) / 360), aspect = W / H;
  const depth = new Float32Array(W * H).fill(Infinity);
  const img = new Float32Array(W * H * 3);
  // niebo: gradient
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; img[i] = 0.55 - 0.25 * (1 - t); img[i + 1] = 0.68 - 0.2 * (1 - t); img[i + 2] = 0.8 - 0.1 * (1 - t); }
  }
  const proj = (p, out) => {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2], y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2], z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    out[2] = z;
    if (ortho) { out[0] = (x / (ortho * aspect)) * 0.5 * W + W / 2; out[1] = H / 2 - (y / ortho) * 0.5 * H; } else { out[0] = (x / (z * tanF * aspect)) * 0.5 * W + W / 2; out[1] = H / 2 - (y / (z * tanF)) * 0.5 * H; }
  };
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  let tris = 0;
  for (const m of meshes) {
    const base = BASE[m.mat] || [0.7, 0.7, 0.7];
    const P = m.p, N = m.n, C = m.c, I = m.i;
    const glass = m.mat === 'glass';
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
      const p0 = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]], p1 = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]], p2 = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];
      const fn = cross(sub(p1, p0), sub(p2, p0));
      if (!opt.noCull && fn[0] * (eye[0] - p0[0]) + fn[1] * (eye[1] - p0[1]) + fn[2] * (eye[2] - p0[2]) <= 0) continue;
      proj(p0, a); proj(p1, b); proj(p2, c);
      if (a[2] < 0.3 || b[2] < 0.3 || c[2] < 0.3) continue;
      const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      if (minx > maxx || miny > maxy) continue;
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-9) continue;
      tris++;
      const iz0 = 1 / a[2], iz1 = 1 / b[2], iz2 = 1 / c[2];
      const col = (i) => [Math.pow(C[i * 3] / 255, 1), Math.pow(C[i * 3 + 1] / 255, 1), Math.pow(C[i * 3 + 2] / 255, 1)];
      const c0 = col(i0), c1 = col(i1), c2 = col(i2);
      const n0 = [N[i0 * 3] / 127, N[i0 * 3 + 1] / 127, N[i0 * 3 + 2] / 127], n1 = [N[i1 * 3] / 127, N[i1 * 3 + 1] / 127, N[i1 * 3 + 2] / 127], n2 = [N[i2 * 3] / 127, N[i2 * 3 + 1] / 127, N[i2 * 3 + 2] / 127];
      for (let y = miny; y <= maxy; y++) {
        for (let x = minx; x <= maxx; x++) {
          const px = x + 0.5, py = y + 0.5;
          const l0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
          const l1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
          const l2 = 1 - l0 - l1;
          if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;
          const iz = l0 * iz0 + l1 * iz1 + l2 * iz2, z = 1 / iz;
          const di = y * W + x;
          if (z >= depth[di]) continue;
          depth[di] = z;
          const w0 = l0 * iz0 * z, w1 = l1 * iz1 * z, w2 = l2 * iz2 * z;
          let nx = w0 * n0[0] + w1 * n1[0] + w2 * n2[0], ny = w0 * n0[1] + w1 * n1[1] + w2 * n2[1], nz = w0 * n0[2] + w1 * n1[2] + w2 * n2[2];
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          const lam = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
          const hemi = 0.55 + 0.35 * ny; // niebo z góry, ziemia z dołu
          let lr, lg, lb;
          if (glass) {
            // szkło: odbicie nieba — jaśniejsze, gdy patrzymy pod kątem
            const refl = 0.35 + 0.35 * Math.max(0, ny + 0.4);
            lr = 0.18 + refl * 0.35; lg = 0.24 + refl * 0.42; lb = 0.32 + refl * 0.5;
          } else {
            const cr = w0 * c0[0] + w1 * c1[0] + w2 * c2[0], cg = w0 * c0[1] + w1 * c1[1] + w2 * c2[1], cb = w0 * c0[2] + w1 * c1[2] + w2 * c2[2];
            const L = hemi * 0.85 + lam * 1.55;
            lr = cr * base[0] * L * 1.1; lg = cg * base[1] * L * 1.0; lb = cb * base[2] * L * 0.92;
          }
          const o = di * 3; img[o] = lr; img[o + 1] = lg; img[o + 2] = lb;
        }
      }
    }
  }
  // ton + gamma -> PNG
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let k = 0; k < 3; k++) {
      let v = img[i * 3 + k];
      v = v / (1 + v * 0.35); // łagodna kompresja
      v = Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
      out[i * 4 + k] = Math.round(v * 255);
    }
    out[i * 4 + 3] = 255;
  }
  return { W, H, rgba: out, tris };
}

const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function writePNG(file, { W, H, rgba }) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}
