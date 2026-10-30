// Programowy renderer (CPU) — „aparat fotograficzny” świata bez przeglądarki.
// Rasteryzuje te same bufory, które w grze trafiają do three.js (pozycje,
// normalne, UV, kolory wierzchołków), i cieniuje je w przybliżeniu jak
// MeshStandardMaterial: słońce z cieniem (shadow map), światło półsfery,
// odbicia otoczenia, tekstury kolorów i normalnych z mipmapami, mgła, ACES.
// Nie jest to kopia GPU co do piksela, ale pokazuje to samo: kształty, dziury,
// nakładanie się, kolory, tekstury, światło i cień.

const SRGB2LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; SRGB2LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// ── tekstura z mipmapami (RGB float), zawijanie "repeat", próbkowanie trójliniowe ─
export class Tex {
  constructor(w, h, rgba, { srgb = true, flipY = true } = {}) {
    this.flipY = flipY;
    const d = new Float32Array(w * h * 3);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      if (srgb) { d[i * 3] = SRGB2LIN[rgba[j]]; d[i * 3 + 1] = SRGB2LIN[rgba[j + 1]]; d[i * 3 + 2] = SRGB2LIN[rgba[j + 2]]; }
      else { d[i * 3] = rgba[j] / 255; d[i * 3 + 1] = rgba[j + 1] / 255; d[i * 3 + 2] = rgba[j + 2] / 255; }
    }
    this.w = w; this.h = h;
    this.size = Math.sqrt(w * h);
    this.levels = [{ w, h, d }];
    while (w > 1 || h > 1) {
      const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), src = this.levels[this.levels.length - 1].d;
      const nd = new Float32Array(nw * nh * 3);
      for (let y = 0; y < nh; y++)
        for (let x = 0; x < nw; x++) {
          const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1), y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
          for (let k = 0; k < 3; k++) nd[(y * nw + x) * 3 + k] = (src[(y0 * w + x0) * 3 + k] + src[(y0 * w + x1) * 3 + k] + src[(y1 * w + x0) * 3 + k] + src[(y1 * w + x1) * 3 + k]) / 4;
        }
      this.levels.push({ w: nw, h: nh, d: nd });
      w = nw; h = nh;
    }
  }

  _bil(L, u, v, k, o) {
    const { w, h, d } = this.levels[L];
    const x = u * w - 0.5, y = (this.flipY ? -v : v) * h - 0.5;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const xa = ((xi % w) + w) % w, xb = xa + 1 === w ? 0 : xa + 1, ya = ((yi % h) + h) % h, yb = ya + 1 === h ? 0 : ya + 1;
    const i00 = (ya * w + xa) * 3, i10 = (ya * w + xb) * 3, i01 = (yb * w + xa) * 3, i11 = (yb * w + xb) * 3;
    const w00 = (1 - fx) * (1 - fy) * k, w10 = fx * (1 - fy) * k, w01 = (1 - fx) * fy * k, w11 = fx * fy * k;
    o[0] += d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
    o[1] += d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
    o[2] += d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
  }

  sample(u, v, lod, o) {
    o[0] = o[1] = o[2] = 0;
    const maxL = this.levels.length - 1;
    if (!(lod > 0)) return this._bil(0, u, v, 1, o);
    if (lod >= maxL) return this._bil(maxL, u, v, 1, o);
    const l0 = Math.floor(lod), f = lod - l0;
    this._bil(l0, u, v, 1 - f, o);
    this._bil(l0 + 1, u, v, f, o);
  }
}

// ── mapa otoczenia (equirect, kilka poziomów rozmycia) ───────────────────────
export class Env {
  // radiance(dir, out) — ostre otoczenie (liniowe HDR)
  constructor(radiance, W = 256) {
    const H = W / 2, d = new Float32Array(W * H * 3), o = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      const th = ((y + 0.5) / H) * Math.PI, sy = Math.cos(th), r = Math.sin(th);
      for (let x = 0; x < W; x++) {
        const ph = ((x + 0.5) / W) * Math.PI * 2;
        radiance([Math.cos(ph) * r, sy, Math.sin(ph) * r], o);
        d[(y * W + x) * 3] = o[0]; d[(y * W + x) * 3 + 1] = o[1]; d[(y * W + x) * 3 + 2] = o[2];
      }
    }
    // poziomy rozmycia: prosty filtr pudełkowy powtarzany (szerokość rośnie 2×)
    this.levels = [{ W, H, d }];
    let cur = d, cw = W, ch = H;
    while (cw > 8) {
      const nw = cw >> 1, nh = ch >> 1, nd = new Float32Array(nw * nh * 3);
      for (let y = 0; y < nh; y++)
        for (let x = 0; x < nw; x++)
          for (let k = 0; k < 3; k++) {
            let s = 0, n = 0;
            for (let dy = -1; dy <= 2; dy++) {
              const yy = Math.min(ch - 1, Math.max(0, y * 2 + dy));
              for (let dx = -1; dx <= 2; dx++) { const xx = (x * 2 + dx + cw) % cw; s += cur[(yy * cw + xx) * 3 + k]; n++; }
            }
            nd[(y * nw + x) * 3 + k] = s / n;
          }
      this.levels.push({ W: nw, H: nh, d: nd });
      cur = nd; cw = nw; ch = nh;
    }
    // irradiancja (splot kosinusowy) z małego poziomu
    const src = this.levels[Math.min(this.levels.length - 1, 3)];
    const IW = 32, IH = 16, ir = new Float32Array(IW * IH * 3);
    const dirs = [];
    for (let y = 0; y < src.H; y++) {
      const th = ((y + 0.5) / src.H) * Math.PI, sy = Math.cos(th), r = Math.sin(th), dA = r;
      for (let x = 0; x < src.W; x++) { const ph = ((x + 0.5) / src.W) * Math.PI * 2; dirs.push([Math.cos(ph) * r, sy, Math.sin(ph) * r, dA, (y * src.W + x) * 3]); }
    }
    for (let y = 0; y < IH; y++) {
      const th = ((y + 0.5) / IH) * Math.PI, sy = Math.cos(th), r = Math.sin(th);
      for (let x = 0; x < IW; x++) {
        const ph = ((x + 0.5) / IW) * Math.PI * 2, n = [Math.cos(ph) * r, sy, Math.sin(ph) * r];
        let a = 0, b = 0, c = 0, wsum = 0;
        for (const q of dirs) {
          const cs = n[0] * q[0] + n[1] * q[1] + n[2] * q[2];
          if (cs <= 0) continue;
          const wt = cs * q[3];
          a += src.d[q[4]] * wt; b += src.d[q[4] + 1] * wt; c += src.d[q[4] + 2] * wt; wsum += wt;
        }
        ir[(y * IW + x) * 3] = a / wsum; ir[(y * IW + x) * 3 + 1] = b / wsum; ir[(y * IW + x) * 3 + 2] = c / wsum;
      }
    }
    this.irrMap = { W: IW, H: IH, d: ir };
  }

  _fetch(lv, dir, o, k = 1) {
    const { W, H, d } = lv;
    const th = Math.acos(Math.max(-1, Math.min(1, dir[1]))), ph = Math.atan2(dir[2], dir[0]);
    const x = ((ph / (Math.PI * 2) + 1) % 1) * W - 0.5, y = (th / Math.PI) * H - 0.5;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const xa = ((xi % W) + W) % W, xb = (xa + 1) % W, ya = Math.max(0, Math.min(H - 1, yi)), yb = Math.max(0, Math.min(H - 1, yi + 1));
    for (let c = 0; c < 3; c++)
      o[c] += k * ((d[(ya * W + xa) * 3 + c] * (1 - fx) + d[(ya * W + xb) * 3 + c] * fx) * (1 - fy) + (d[(yb * W + xa) * 3 + c] * (1 - fx) + d[(yb * W + xb) * 3 + c] * fx) * fy);
  }

  spec(dir, rough, o) {
    o[0] = o[1] = o[2] = 0;
    const lod = Math.min(this.levels.length - 1, Math.max(0, Math.log2(1 + rough * 60)));
    const l0 = Math.floor(lod), f = lod - l0;
    this._fetch(this.levels[l0], dir, o, 1 - f);
    if (f > 0 && l0 + 1 < this.levels.length) this._fetch(this.levels[l0 + 1], dir, o, f);
  }

  irr(n, o) {
    o[0] = o[1] = o[2] = 0;
    this._fetch(this.irrMap, n, o, 1);
  }
}

// ── ACES Filmic (identyczny z three.js) ──────────────────────────────────────
function aces(r, g, b, exposure, o) {
  r *= exposure / 0.6; g *= exposure / 0.6; b *= exposure / 0.6;
  const a0 = 0.59719 * r + 0.35458 * g + 0.04823 * b, a1 = 0.076 * r + 0.90834 * g + 0.01566 * b, a2 = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const f = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const b0 = f(a0), b1 = f(a1), b2 = f(a2);
  o[0] = Math.min(1, Math.max(0, 1.60475 * b0 - 0.53108 * b1 - 0.07367 * b2));
  o[1] = Math.min(1, Math.max(0, -0.10208 * b0 + 1.10813 * b1 - 0.00605 * b2));
  o[2] = Math.min(1, Math.max(0, -0.00327 * b0 - 0.07276 * b1 + 1.07602 * b2));
}

const PI = Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
//  render(scene, cam, { width, height, ss })
//  scene: { meshes: [{mat, p, n, uv, c, i, cast, receive}], mats, sun, hemi,
//           env, envIntensity, fog, sky(dir,out), exposure, shadow }
//  cam:   { pos, target, fov, near, far }
// ─────────────────────────────────────────────────────────────────────────────
export function render(scene, cam, opt = {}) {
  const SS = opt.ss ?? 2, OW = opt.width ?? 1280, OH = opt.height ?? 720;
  const W = OW * SS, H = OH * SS, N = W * H;
  const near = cam.near ?? 0.1, far = cam.far ?? 2200;
  const C = cam.pos;
  let fx = cam.target[0] - C[0], fy = cam.target[1] - C[1], fz = cam.target[2] - C[2];
  let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
  let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0; // f × up
  l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const focal = H / 2 / Math.tan(((cam.fov ?? 72) * PI) / 360);
  const cx0 = W / 2, cy0 = H / 2;

  const depth = new Float32Array(N), tri = new Int32Array(N).fill(-1), mid = new Uint16Array(N);
  const BB = new Float32Array(N), BC = new Float32Array(N);
  const meshes = scene.meshes;

  // ── rasteryzacja trójkąta (współrzędne ekranu, 1/z, barycentryczne oryginału) ─
  const ID = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  function raster(x0, y0, z0, x1, y1, z1, x2, y2, z2, Bv, mi, ti, bias) {
    let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;
    let B0 = Bv[0], B1 = Bv[1], B2 = Bv[2];
    if (area < 0) {
      let t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; t = z1; z1 = z2; z2 = t;
      const tb = B1; B1 = B2; B2 = tb; area = -area;
    }
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;
    const ia = 1 / area;
    const a0x = -(y2 - y1) * ia, a0y = (x2 - x1) * ia, a1x = -(y0 - y2) * ia, a1y = (x0 - x2) * ia;
    const kb = 1 + bias;
    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5, cx = minX + 0.5;
      let w0 = ((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)) * ia;
      let w1 = ((x0 - x2) * (cy - y2) - (y0 - y2) * (cx - x2)) * ia;
      let row = py * W + minX;
      for (let px = minX; px <= maxX; px++, row++, w0 += a0x, w1 += a1x) {
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
        const iz = w0 * z0 + w1 * z1 + w2 * z2;
        const zz = iz * kb;
        if (zz <= depth[row]) continue;
        depth[row] = zz;
        tri[row] = ti; mid[row] = mi;
        const q0 = (w0 * z0) / iz, q1 = (w1 * z1) / iz, q2 = 1 - q0 - q1;
        BB[row] = q0 * B0[1] + q1 * B1[1] + q2 * B2[1];
        BC[row] = q0 * B0[2] + q1 * B1[2] + q2 * B2[2];
      }
      void a0y; void a1y;
    }
  }

  let triCount = 0;
  for (let mi = 0; mi < meshes.length; mi++) {
    const m = meshes[mi], P = m.p, I = m.i, mat = scene.mats[m.mat];
    if (!mat) continue;
    const nv = P.length / 3, vx = new Float32Array(nv), vy = new Float32Array(nv), vz = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const dx = P[v * 3] - C[0], dy = P[v * 3 + 1] - C[1], dz = P[v * 3 + 2] - C[2];
      vx[v] = dx * rx + dy * ry + dz * rz; vy[v] = dx * ux + dy * uy + dz * uz; vz[v] = dx * fx + dy * fy + dz * fz;
    }
    const dbl = mat.double, bias = mat.bias || 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const za = vz[a], zb = vz[b], zc = vz[c];
      if (za < near && zb < near && zc < near) continue;
      if (za > far && zb > far && zc > far) continue;
      // szybkie odrzucenie poza bokami kadru
      if (vx[a] > za * W / 2 / focal * 1.02 && vx[b] > zb * W / 2 / focal * 1.02 && vx[c] > zc * W / 2 / focal * 1.02 && za > 0 && zb > 0 && zc > 0) continue;
      if (-vx[a] > za * W / 2 / focal * 1.02 && -vx[b] > zb * W / 2 / focal * 1.02 && -vx[c] > zc * W / 2 / focal * 1.02 && za > 0 && zb > 0 && zc > 0) continue;
      if (!dbl) {
        const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
        const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        if (nx * (C[0] - P[a * 3]) + ny * (C[1] - P[a * 3 + 1]) + nz * (C[2] - P[a * 3 + 2]) <= 0) continue;
      }
      triCount++;
      const ti = t / 3;
      if (za >= near && zb >= near && zc >= near) {
        raster(cx0 + (vx[a] * focal) / za, cy0 - (vy[a] * focal) / za, 1 / za, cx0 + (vx[b] * focal) / zb, cy0 - (vy[b] * focal) / zb, 1 / zb, cx0 + (vx[c] * focal) / zc, cy0 - (vy[c] * focal) / zc, 1 / zc, ID, mi, ti, bias);
        continue;
      }
      // przycięcie do płaszczyzny bliskiej (Sutherland–Hodgman), z barycentrycznymi
      const inV = [[vx[a], vy[a], za, ID[0]], [vx[b], vy[b], zb, ID[1]], [vx[c], vy[c], zc, ID[2]]];
      const out = [];
      for (let k = 0; k < 3; k++) {
        const p = inV[k], q = inV[(k + 1) % 3];
        const pin = p[2] >= near, qin = q[2] >= near;
        if (pin) out.push(p);
        if (pin !== qin) {
          const s = (near - p[2]) / (q[2] - p[2]);
          out.push([p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s, near, [p[3][0] + (q[3][0] - p[3][0]) * s, p[3][1] + (q[3][1] - p[3][1]) * s, p[3][2] + (q[3][2] - p[3][2]) * s]]);
        }
      }
      for (let k = 1; k + 1 < out.length; k++) {
        const A = out[0], Bq = out[k], Cq = out[k + 1];
        raster(cx0 + (A[0] * focal) / A[2], cy0 - (A[1] * focal) / A[2], 1 / A[2], cx0 + (Bq[0] * focal) / Bq[2], cy0 - (Bq[1] * focal) / Bq[2], 1 / Bq[2], cx0 + (Cq[0] * focal) / Cq[2], cy0 - (Cq[1] * focal) / Cq[2], 1 / Cq[2], [A[3], Bq[3], Cq[3]], mi, ti, bias);
      }
    }
  }

  // ── mapa cieni (ortho ze słońca), jak WebGLShadowMap: dla FrontSide tylko ściany tylne ─
  const L = scene.sun.dir;
  let shadow = null;
  if (scene.shadow) {
    const S = scene.shadow, R = S.res, half = S.half, sc = S.center;
    let lrx = L[2], lry = 0, lrz = -L[0];
    l = Math.hypot(lrx, lry, lrz) || 1; lrx /= l; lrz /= l;
    const lux = lry * L[2] - lrz * L[1], luy = lrz * L[0] - lrx * L[2], luz = lrx * L[1] - lry * L[0];
    const sd = new Float32Array(R * R).fill(1e9);
    const k = R / (2 * half);
    for (const m of meshes) {
      if (!m.cast) continue;
      const mat = scene.mats[m.mat];
      if (!mat) continue;
      const P = m.p, I = m.i, nv = P.length / 3;
      const lx = new Float32Array(nv), ly = new Float32Array(nv), lz = new Float32Array(nv);
      for (let v = 0; v < nv; v++) {
        const dx = P[v * 3] - sc[0], dy = P[v * 3 + 1] - sc[1], dz = P[v * 3 + 2] - sc[2];
        lx[v] = (dx * lrx + dy * lry + dz * lrz) * k + R / 2; ly[v] = R / 2 - (dx * lux + dy * luy + dz * luz) * k; lz[v] = -(dx * L[0] + dy * L[1] + dz * L[2]);
      }
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        if (!mat.double) {
          const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
          const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
          const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
          if (nx * L[0] + ny * L[1] + nz * L[2] >= 0) continue;
        }
        let x0 = lx[a], y0 = ly[a], z0 = lz[a], x1 = lx[b], y1 = ly[b], z1 = lz[b], x2 = lx[c], y2 = ly[c], z2 = lz[c];
        const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(R - 1, Math.ceil(Math.max(x0, x1, x2)));
        const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(R - 1, Math.ceil(Math.max(y0, y1, y2)));
        if (minX > maxX || minY > maxY) continue;
        let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        if (Math.abs(area) < 1e-9) continue;
        if (area < 0) { let tt = x1; x1 = x2; x2 = tt; tt = y1; y1 = y2; y2 = tt; tt = z1; z1 = z2; z2 = tt; area = -area; }
        const ia = 1 / area, a0x = -(y2 - y1) * ia, a1x = -(y0 - y2) * ia;
        for (let py = minY; py <= maxY; py++) {
          const cy = py + 0.5, cx = minX + 0.5;
          let w0 = ((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)) * ia, w1 = ((x0 - x2) * (cy - y2) - (y0 - y2) * (cx - x2)) * ia;
          let row = py * R + minX;
          for (let px = minX; px <= maxX; px++, row++, w0 += a0x, w1 += a1x) {
            const w2 = 1 - w0 - w1;
            if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
            const zz = w0 * z0 + w1 * z1 + w2 * z2;
            if (zz < sd[row]) sd[row] = zz;
          }
        }
      }
    }
    shadow = { sd, R, k, sc, lrx, lry, lrz, lux, luy, luz, bias: S.bias ?? 0.08 };
  }
  const shadowAt = (x, y, z) => {
    const s = shadow, dx = x - s.sc[0], dy = y - s.sc[1], dz = z - s.sc[2];
    const px = (dx * s.lrx + dy * s.lry + dz * s.lrz) * s.k + s.R / 2 - 0.5, py = s.R / 2 - (dx * s.lux + dy * s.luy + dz * s.luz) * s.k - 0.5;
    const d = -(dx * L[0] + dy * L[1] + dz * L[2]) - s.bias;
    if (px < 1 || py < 1 || px > s.R - 3 || py > s.R - 3) return 1;
    // PCF 3×3 z interpolacją dwuliniową (jak PCFSoftShadowMap)
    const xi = Math.floor(px), yi = Math.floor(py), fx2 = px - xi, fy2 = py - yi;
    let lit = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const a = s.sd[(yi + j) * s.R + xi + i] >= d ? 1 : 0, b = s.sd[(yi + j) * s.R + xi + i + 1] >= d ? 1 : 0;
        const c = s.sd[(yi + j + 1) * s.R + xi + i] >= d ? 1 : 0, e = s.sd[(yi + j + 1) * s.R + xi + i + 1] >= d ? 1 : 0;
        lit += (a * (1 - fx2) + b * fx2) * (1 - fy2) + (c * (1 - fx2) + e * fx2) * fy2;
      }
    return lit / 9;
  };

  // ── cieniowanie ─────────────────────────────────────────────────────────────
  const rgb = new Float32Array(N * 3);
  const sky = scene.sky, env = scene.env, envI = scene.envIntensity ?? 1, exposure = scene.exposure ?? 1;
  const sun = scene.sun.color, hs = scene.hemi.sky, hg = scene.hemi.ground;
  const fog = scene.fog;
  const tA = [0, 0, 0], tB = [0, 0, 0], tN = [0, 0, 0], tE = [0, 0, 0], dir = [0, 0, 0], tm = [0, 0, 0];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = py * W + px;
      // kierunek promienia
      const sx = (px + 0.5 - cx0) / focal, sy = -(py + 0.5 - cy0) / focal;
      let dX = fx + rx * sx + ux * sy, dY = fy + ry * sx + uy * sy, dZ = fz + rz * sx + uz * sy;
      const dl = Math.hypot(dX, dY, dZ); dX /= dl; dY /= dl; dZ /= dl;
      if (tri[idx] < 0) {
        dir[0] = dX; dir[1] = dY; dir[2] = dZ;
        sky(dir, tm);
        rgb[idx * 3] = linToSrgb(Math.min(1, tm[0])); rgb[idx * 3 + 1] = linToSrgb(Math.min(1, tm[1])); rgb[idx * 3 + 2] = linToSrgb(Math.min(1, tm[2]));
        continue;
      }
      const m = meshes[mid[idx]], mat = scene.mats[m.mat], t = tri[idx] * 3, I = m.i, P = m.p, Nn = m.n, UV = m.uv, CC = m.c;
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const wb = BB[idx], wc = BC[idx], wa = 1 - wb - wc;
      const Px = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc, Py = P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc, Pz = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
      const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
      const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
      let gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
      const area2 = Math.hypot(gx, gy, gz) || 1e-12;
      gx /= area2; gy /= area2; gz /= area2;
      let Vx = C[0] - Px, Vy = C[1] - Py, Vz = C[2] - Pz;
      const dist = Math.hypot(Vx, Vy, Vz) || 1e-6; Vx /= dist; Vy /= dist; Vz /= dist;
      let nx = (Nn[a * 3] * wa + Nn[b * 3] * wb + Nn[c * 3] * wc) / 127, ny = (Nn[a * 3 + 1] * wa + Nn[b * 3 + 1] * wb + Nn[c * 3 + 1] * wc) / 127, nz = (Nn[a * 3 + 2] * wa + Nn[b * 3 + 2] * wb + Nn[c * 3 + 2] * wc) / 127;
      let nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let cosV = gx * Vx + gy * Vy + gz * Vz;
      if (cosV < 0 && mat.double) { gx = -gx; gy = -gy; gz = -gz; nx = -nx; ny = -ny; nz = -nz; cosV = -cosV; }
      cosV = Math.abs(cosV);
      const u = UV[a * 2] * wa + UV[b * 2] * wb + UV[c * 2] * wc, v = UV[a * 2 + 1] * wa + UV[b * 2 + 1] * wb + UV[c * 2 + 1] * wc;
      // ślad piksela (końcowego, nie nadpróbkowanego) w metrach i UV/metr trójkąta
      const zView = (Px - C[0]) * fx + (Py - C[1]) * fy + (Pz - C[2]) * fz;
      const foot = (Math.max(zView, near) * SS) / focal;
      const du1 = UV[b * 2] - UV[a * 2], dv1 = UV[b * 2 + 1] - UV[a * 2 + 1], du2 = UV[c * 2] - UV[a * 2], dv2 = UV[c * 2 + 1] - UV[a * 2 + 1];
      const uvArea = Math.abs(du1 * dv2 - du2 * dv1);
      const uvPerM = Math.sqrt(uvArea / area2);
      const lodOf = (tex, rep) => {
        const minor = foot * uvPerM * rep * tex.size;
        const major = minor / Math.max(cosV, 0.03);
        return Math.log2(Math.max(1e-6, Math.max(minor, major / 8)));
      };
      // albedo
      let ar = mat.color[0], ag = mat.color[1], ab = mat.color[2];
      if (mat.vertexColors) {
        ar *= (CC[a * 3] * wa + CC[b * 3] * wb + CC[c * 3] * wc) / 255;
        ag *= (CC[a * 3 + 1] * wa + CC[b * 3 + 1] * wb + CC[c * 3 + 1] * wc) / 255;
        ab *= (CC[a * 3 + 2] * wa + CC[b * 3 + 2] * wb + CC[c * 3 + 2] * wc) / 255;
      }
      if (mat.map) {
        const rp = mat.mapRep;
        mat.map.sample(u * rp[0] + mat.mapOff[0], v * rp[1] + mat.mapOff[1], lodOf(mat.map, Math.sqrt(rp[0] * rp[1])), tA);
        ar *= tA[0]; ag *= tA[1]; ab *= tA[2];
      }
      // mapa normalnych (TBN z UV trójkąta)
      if (mat.normalMap && uvArea > 1e-14) {
        const rp = mat.nRep;
        mat.normalMap.sample(u * rp[0] + mat.nOff[0], v * rp[1] + mat.nOff[1], lodOf(mat.normalMap, Math.sqrt(rp[0] * rp[1])), tB);
        const r = 1 / (du1 * dv2 - du2 * dv1);
        let Tx = (e1x * dv2 - e2x * dv1) * r, Ty = (e1y * dv2 - e2y * dv1) * r, Tz = (e1z * dv2 - e2z * dv1) * r;
        const Bx0 = (e2x * du1 - e1x * du2) * r, By0 = (e2y * du1 - e1y * du2) * r, Bz0 = (e2z * du1 - e1z * du2) * r;
        const td = Tx * nx + Ty * ny + Tz * nz; Tx -= nx * td; Ty -= ny * td; Tz -= nz * td;
        const tl = Math.hypot(Tx, Ty, Tz);
        if (tl > 1e-12) {
          Tx /= tl; Ty /= tl; Tz /= tl;
          let Bx = ny * Tz - nz * Ty, By = nz * Tx - nx * Tz, Bz = nx * Ty - ny * Tx;
          if (Bx * Bx0 + By * By0 + Bz * Bz0 < 0) { Bx = -Bx; By = -By; Bz = -Bz; }
          const mx = (tB[0] * 2 - 1) * mat.normalScale[0], my = (tB[1] * 2 - 1) * mat.normalScale[1], mz = tB[2] * 2 - 1;
          nx = Tx * mx + Bx * my + nx * mz; ny = Ty * mx + By * my + ny * mz; nz = Tz * mx + Bz * my + nz * mz;
          nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        }
      }
      const metal = mat.metalness, rough = Math.min(1, Math.max(0.0525, mat.roughness));
      const dr = ar * (1 - metal), dg = ag * (1 - metal), db = ab * (1 - metal);
      const f0r = 0.04 + (ar - 0.04) * metal, f0g = 0.04 + (ag - 0.04) * metal, f0b = 0.04 + (ab - 0.04) * metal;
      const NdotV = Math.max(1e-4, nx * Vx + ny * Vy + nz * Vz);
      let or = 0, og = 0, ob = 0;
      // słońce
      const NdotL = nx * L[0] + ny * L[1] + nz * L[2];
      if (NdotL > 0) {
        const sh = shadow && m.receive !== false ? shadowAt(Px + gx * 0.05, Py + gy * 0.05, Pz + gz * 0.05) : 1;
        if (sh > 0) {
          const ir = NdotL * sh;
          or += (ir * sun[0] * dr) / PI; og += (ir * sun[1] * dg) / PI; ob += (ir * sun[2] * db) / PI;
          let hx = L[0] + Vx, hy = L[1] + Vy, hz = L[2] + Vz;
          const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
          const NdotH = Math.max(0, nx * hx + ny * hy + nz * hz), VdotH = Math.max(0, Vx * hx + Vy * hy + Vz * hz);
          const al = rough * rough, a2 = al * al;
          const dd = NdotH * NdotH * (a2 - 1) + 1, D = a2 / (PI * dd * dd);
          const vis = 0.5 / (NdotL * Math.sqrt(a2 + (1 - a2) * NdotV * NdotV) + NdotV * Math.sqrt(a2 + (1 - a2) * NdotL * NdotL) + 1e-7);
          const fw = Math.pow(1 - VdotH, 5), sp = vis * D * ir;
          or += sun[0] * sp * (f0r + (1 - f0r) * fw); og += sun[1] * sp * (f0g + (1 - f0g) * fw); ob += sun[2] * sp * (f0b + (1 - f0b) * fw);
        }
      }
      // półsfera
      const hw = 0.5 * ny + 0.5;
      or += ((hg[0] + (hs[0] - hg[0]) * hw) * dr) / PI; og += ((hg[1] + (hs[1] - hg[1]) * hw) * dg) / PI; ob += ((hg[2] + (hs[2] - hg[2]) * hw) * db) / PI;
      // otoczenie (IBL, split-sum jak three.js)
      const ei = envI * (mat.envInt ?? 1);
      if (ei > 0 && env) {
        env.irr([nx, ny, nz], tN);
        const dot2 = 2 * (nx * Vx + ny * Vy + nz * Vz);
        let Rx = dot2 * nx - Vx, Ry = dot2 * ny - Vy, Rz = dot2 * nz - Vz;
        const rr = rough * rough;
        Rx += (nx - Rx) * rr; Ry += (ny - Ry) * rr; Rz += (nz - Rz) * rr;
        const Rl = Math.hypot(Rx, Ry, Rz) || 1;
        env.spec([Rx / Rl, Ry / Rl, Rz / Rl], rough, tE);
        const c0 = [-1, -0.0275, -0.572, 0.022], c1 = [1, 0.0425, 1.04, -0.04];
        const r0 = rough * c0[0] + c1[0], r1 = rough * c0[1] + c1[1], r2 = rough * c0[2] + c1[2], r3 = rough * c0[3] + c1[3];
        const a004 = Math.min(r0 * r0, Math.pow(2, -9.28 * NdotV)) * r0 + r1;
        const fa = -1.04 * a004 + r2, fb = 1.04 * a004 + r3;
        const Ess = fa + fb, Ems = 1 - Ess;
        const F0 = [f0r, f0g, f0b], D3 = [dr, dg, db], out = [0, 0, 0];
        let mx = 0;
        const ms = [0, 0, 0], ssa = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const fss = F0[k] * fa + fb;
          const favg = F0[k] + (1 - F0[k]) * 0.047619;
          const fms = (fss * favg) / (1 - Ems * favg);
          ssa[k] = fss; ms[k] = fms * Ems;
          mx = Math.max(mx, fss + fms * Ems);
        }
        for (let k = 0; k < 3; k++) out[k] = tE[k] * ei * ssa[k] + ms[k] * tN[k] * ei + D3[k] * (1 - mx) * tN[k] * ei;
        or += out[0]; og += out[1]; ob += out[2];
      }
      // świecenie
      if (mat.emissive) {
        let er = mat.emissive[0], eg = mat.emissive[1], eb = mat.emissive[2];
        if (mat.emissiveMap) { mat.emissiveMap.sample(u, v, lodOf(mat.emissiveMap, 1), tA); er *= tA[0]; eg *= tA[1]; eb *= tA[2]; }
        or += er; og += eg; ob += eb;
      }
      aces(or, og, ob, exposure, tm);
      let sr = linToSrgb(tm[0]), sg = linToSrgb(tm[1]), sb = linToSrgb(tm[2]);
      if (fog) {
        const ff = 1 - Math.exp(-fog.density * fog.density * zView * zView);
        sr += (fog.color[0] - sr) * ff; sg += (fog.color[1] - sg) * ff; sb += (fog.color[2] - sb) * ff;
      }
      rgb[idx * 3] = sr; rgb[idx * 3 + 1] = sg; rgb[idx * 3 + 2] = sb;
    }
  }
  // zmniejszenie SS×SS → kadr końcowy (+ winieta z index.html)
  const outp = new Uint8ClampedArray(OW * OH * 4);
  for (let y = 0; y < OH; y++)
    for (let x = 0; x < OW; x++) {
      let r = 0, g = 0, bb = 0;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const k = ((y * SS + j) * W + x * SS + i) * 3;
          r += rgb[k]; g += rgb[k + 1]; bb += rgb[k + 2];
        }
      const s = 1 / (SS * SS);
      let vg = 1;
      if (opt.vignette !== false) {
        const ex = (x / OW - 0.5) * 2, ey = (y / OH - 0.5) * 2, rr = Math.hypot(ex, ey) / Math.SQRT2;
        vg = 1 - 0.25 * Math.max(0, Math.min(1, (rr - 0.65) / 0.35));
      }
      const o = (y * OW + x) * 4;
      outp[o] = r * s * 255 * vg; outp[o + 1] = g * s * 255 * vg; outp[o + 2] = bb * s * 255 * vg; outp[o + 3] = 255;
    }
  return { width: OW, height: OH, data: outp, triCount };
}
