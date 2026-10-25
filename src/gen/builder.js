// MeshBuilder — moduły piszą geometrię w lokalnych metrach komórki
// (x: szerokość 0..W, y: wysokość 0..H, z: głębokość, 0 = lico fasady,
// z<0 = na zewnątrz). Builder przelicza to na (u,v,w) kostki, przepuszcza
// przez Cage, dokłada szum (krzywe ściany, "pływające" kamienice, nierówny
// bruk), liczy normalne, UV w metrach świata i kolor wierzchołka (AO + brud).
// Nie importuje three.js — działa w Web Workerze.
import { noise3 } from '../core/noise.js';

// Parametry szumu i cieniowania per materiał.
//  wob   — amplituda drobnego szumu 3D (m), fala ~2 m: nierówny tynk
//  bump  — pionowy szum nawierzchni (m)
//  ao    — przyciemnienie przy ziemi
//  dirt  — plamy brudu w skali kilku metrów
//  ground — nawierzchnia: bez "pochylenia" budynków
// Wszystkie materiały budynków dostają TEN SAM szum (W) — plakat, rama okna
// i tynk przesuwają się identycznie, więc nic nie "wchodzi" w ścianę.
const W = 0.032;
export const MATDEF = {
  plaster: { wob: W, ao: 1, dirt: 1 },
  brick: { wob: W, ao: 1, dirt: 1 },
  stone: { wob: W, ao: 1, dirt: 1 },
  roof: { wob: W, dirt: 1 },
  tile: { wob: W, dirt: 1 },
  wood: { wob: W, ao: 1 },
  metal: { wob: W, ao: 1 },
  glass: { wob: W },
  dark: { wob: W },
  light: { wob: W },
  screen: { wob: W },
  poster: { wob: W, ao: 1, dirt: 0.5 },
  paint: { ao: 1 },
  bark: { ao: 1, dirt: 1 },
  cobble: { bump: 0.04, dirt: 1.8, ground: 1 },
  grass: { bump: 0.05, dirt: 2.2, ground: 1 },
  sand: { bump: 0.06, dirt: 1.2, ground: 1 },
  gravel: { dirt: 1.5 },
  asphalt: { dirt: 1 },
  leaf: { wob: 0.5, dirt: 2.5 },
  slab: { bump: 0.008, dirt: 1.2, ground: 1 },
  curb: { dirt: 1, ground: 1 },
  lod: { wob: W, ao: 1, dirt: 1 },
  lodroof: { wob: W, dirt: 1 },
};

const LEAN = 0.018; // m bocznego "pływania" na metr wysokości (stare kamienice)
const EMPTY = {};
const WHITE = [1, 1, 1];
export const NX = [-1, 0, 0], PX = [1, 0, 0], NY = [0, -1, 0], PY = [0, 1, 0], NZ = [0, 0, -1], PZ = [0, 0, 1];

const lin = (c) => Math.pow(c, 2.2);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Builder {
  constructor() {
    this.buckets = new Map();
    this.cage = null;
    this.W = this.H = this.D = 1;
    this.tints = Object.create(null);
    this.ground = () => 0; // wysokość terenu (x,z) — pochylenie i AO liczone względem gruntu
    this._Q = new Float64Array(12);
    this._N = new Float64Array(12);
    this._t = [0, 0, 0];
    this._a = [0, 0, 0];
    this._b = [0, 0, 0];
    this._c = [0, 0, 0];
  }

  cell(cage, W, H, D) {
    this.cage = cage;
    this.W = W || 1;
    this.H = H || 1;
    this.D = D || 1;
    return this;
  }

  setTint(mat, rgb) {
    this.tints[mat] = rgb;
  }

  _bucket(mat) {
    let bk = this.buckets.get(mat);
    if (!bk) {
      bk = { p: [], n: [], uv: [], c: [], i: [], count: 0 };
      this.buckets.set(mat, bk);
    }
    return bk;
  }

  // Wielokąt (3 lub 4 punkty) w lokalnych metrach komórki.
  poly(mat, pts, hint, o = EMPTY) {
    const cnt = pts.length;
    let nx, ny, nz;
    if (cnt === 4) {
      const ax = pts[2][0] - pts[0][0], ay = pts[2][1] - pts[0][1], az = pts[2][2] - pts[0][2];
      const bx = pts[3][0] - pts[1][0], by = pts[3][1] - pts[1][1], bz = pts[3][2] - pts[1][2];
      nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
    } else {
      const ax = pts[1][0] - pts[0][0], ay = pts[1][1] - pts[0][1], az = pts[1][2] - pts[0][2];
      const bx = pts[2][0] - pts[0][0], by = pts[2][1] - pts[0][1], bz = pts[2][2] - pts[0][2];
      nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
    }
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-12 && !o.nrm) return;
    nx /= nl; ny /= nl; nz /= nl;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }

    const { cage, W, H, D } = this;
    const Q = this._Q, N = this._N, t = this._t, A = this._a, B = this._b, C = this._c;
    for (let v = 0; v < cnt; v++) {
      const p = pts[v];
      const u = p[0] / W, vv = p[1] / H, w = p[2] / D;
      cage.map(u, vv, w, t);
      Q[v * 3] = t[0]; Q[v * 3 + 1] = t[1]; Q[v * 3 + 2] = t[2];
      cage.jac(u, vv, w, A, B, C);
      let lx = nx, ly = ny, lz = nz;
      if (o.nrm) { lx = o.nrm[v][0]; ly = o.nrm[v][1]; lz = o.nrm[v][2]; }
      // (J·S)^-T · n = Σ n_i · (kolumny dopełnień), S = diag(1/W,1/H,1/D)
      lx *= W; ly *= H; lz *= D;
      let ox = lx * (B[1] * C[2] - B[2] * C[1]) + ly * (C[1] * A[2] - C[2] * A[1]) + lz * (A[1] * B[2] - A[2] * B[1]);
      let oy = lx * (B[2] * C[0] - B[0] * C[2]) + ly * (C[2] * A[0] - C[0] * A[2]) + lz * (A[2] * B[0] - A[0] * B[2]);
      let oz = lx * (B[0] * C[1] - B[1] * C[0]) + ly * (C[0] * A[1] - C[1] * A[0]) + lz * (A[0] * B[1] - A[1] * B[0]);
      const s = cage.sign / (Math.hypot(ox, oy, oz) || 1);
      N[v * 3] = ox * s; N[v * 3 + 1] = oy * s; N[v * 3 + 2] = oz * s;
    }
    this._emit(mat, cnt, o);
  }

  // Wielokąt bezpośrednio we współrzędnych świata (LOD, nawierzchnie).
  wpoly(mat, pts, hint, o = EMPTY) {
    const cnt = pts.length, Q = this._Q, N = this._N;
    for (let v = 0; v < cnt; v++) { Q[v * 3] = pts[v][0]; Q[v * 3 + 1] = pts[v][1]; Q[v * 3 + 2] = pts[v][2]; }
    const i2 = cnt === 4 ? 2 : 1, i3 = cnt === 4 ? 3 : 2, j0 = cnt === 4 ? 1 : 0;
    const ax = Q[i2 * 3] - Q[0], ay = Q[i2 * 3 + 1] - Q[1], az = Q[i2 * 3 + 2] - Q[2];
    const bx = Q[i3 * 3] - Q[j0 * 3], by = Q[i3 * 3 + 1] - Q[j0 * 3 + 1], bz = Q[i3 * 3 + 2] - Q[j0 * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (let v = 0; v < cnt; v++) { N[v * 3] = nx; N[v * 3 + 1] = ny; N[v * 3 + 2] = nz; }
    this._emit(mat, cnt, o);
  }

  _emit(mat, cnt, o) {
    const Q = this._Q, N = this._N;
    const def = MATDEF[mat] || EMPTY;
    // normalna ściany ze świata (bez szumu) — do nawijania i rzutu UV
    let fx, fy, fz;
    {
      const i2 = cnt === 4 ? 2 : 1, i3 = cnt === 4 ? 3 : 2, j0 = cnt === 4 ? 1 : 0;
      const ax = Q[i2 * 3] - Q[0], ay = Q[i2 * 3 + 1] - Q[1], az = Q[i2 * 3 + 2] - Q[2];
      const bx = Q[i3 * 3] - Q[j0 * 3], by = Q[i3 * 3 + 1] - Q[j0 * 3 + 1], bz = Q[i3 * 3 + 2] - Q[j0 * 3 + 2];
      fx = ay * bz - az * by; fy = az * bx - ax * bz; fz = ax * by - ay * bx;
    }
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-10) return;
    let sx = 0, sy = 0, sz = 0;
    for (let v = 0; v < cnt; v++) { sx += N[v * 3]; sy += N[v * 3 + 1]; sz += N[v * 3 + 2]; }
    const rev = fx * sx + fy * sy + fz * sz < 0;
    const k = rev ? -1 / fl : 1 / fl;
    fx *= k; fy *= k; fz *= k;

    // klin zbiegający się w punkt ma zerowy jakobian w wierzchołku — wtedy normalna ściany
    for (let v = 0; v < cnt; v++) {
      if (N[v * 3] * N[v * 3] + N[v * 3 + 1] * N[v * 3 + 1] + N[v * 3 + 2] * N[v * 3 + 2] < 0.25) {
        N[v * 3] = rev ? -fx : fx; N[v * 3 + 1] = rev ? -fy : fy; N[v * 3 + 2] = rev ? -fz : fz;
      }
    }
    const horiz = Math.abs(fy) > 0.7;
    let tx = fz, tz = -fx;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;

    const bk = this._bucket(mat);
    const base = bk.count;
    const tint = o.tint || this.tints[mat] || WHITE;
    const shade0 = o.shade ?? 1;
    const uvs = o.uvScale || 1;

    for (let v = 0; v < cnt; v++) {
      const qx = Q[v * 3], qy = Q[v * 3 + 1], qz = Q[v * 3 + 2];
      let x = qx, y = qy, z = qz;
      const gy = def.ground && o.drape === undefined ? 0 : this.ground(qx, qz);
      const rel = qy - gy;
      if (o.drape !== undefined) y = gy + o.drape;
      if (!def.ground && !o.noLean) {
        const s = 0.012;
        const h = Math.max(0, rel) * LEAN;
        x += noise3(qx * s, 3.7, qz * s) * h;
        z += noise3(qx * s, 9.1, qz * s) * h;
      }
      if (def.wob) {
        const f = 0.45;
        x += def.wob * noise3(qx * f, qy * f, qz * f);
        y += def.wob * noise3(qx * f + 31.4, qy * f, qz * f);
        z += def.wob * noise3(qx * f, qy * f + 17.7, qz * f);
      }
      if (def.bump && !o.flat) {
        y += def.bump * (noise3(qx * 0.17, 0.5, qz * 0.17) * 0.7 + noise3(qx * 0.9, 1.5, qz * 0.9) * 0.3);
      }
      bk.p.push(x, y, z);
      bk.n.push(Math.round(N[v * 3] * 127), Math.round(N[v * 3 + 1] * 127), Math.round(N[v * 3 + 2] * 127));

      if (o.uv) bk.uv.push(o.uv[v][0], o.uv[v][1]);
      else if (horiz) bk.uv.push(qx * uvs, qz * uvs);
      else bk.uv.push((qx * tx + qz * tz) * uvs, qy * uvs);

      let s = shade0;
      if (def.ao) s *= 0.55 + 0.45 * smooth(rel / 3.4);
      if (def.dirt) {
        const d = noise3(qx * 0.11, qy * 0.23, qz * 0.11) + 0.5 * noise3(qx * 0.5, qy * 0.5, qz * 0.5);
        s *= 1 + 0.13 * def.dirt * d;
      }
      bk.c.push(
        Math.min(255, Math.max(0, Math.round(lin(tint[0]) * s * 255))),
        Math.min(255, Math.max(0, Math.round(lin(tint[1]) * s * 255))),
        Math.min(255, Math.max(0, Math.round(lin(tint[2]) * s * 255))),
      );
    }
    if (cnt === 4) {
      if (rev) bk.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else bk.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else if (rev) bk.i.push(base, base + 2, base + 1);
    else bk.i.push(base, base + 1, base + 2);
    bk.count += cnt;
  }

  // ── prymitywy w lokalnych metrach ─────────────────────────────────────────
  rect(mat, x0, y0, x1, y1, z, o) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
    this.poly(mat, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], NZ, o);
  }
  rectBack(mat, x0, y0, x1, y1, z, o) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
    this.poly(mat, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], PZ, o);
  }
  rectX(mat, x, z0, y0, z1, y1, dir, o) {
    if (Math.abs(z1 - z0) < 1e-4 || y1 - y0 < 1e-4) return;
    this.poly(mat, [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], dir > 0 ? PX : NX, o);
  }
  rectY(mat, y, x0, z0, x1, z1, dir, o) {
    if (x1 - x0 < 1e-4 || Math.abs(z1 - z0) < 1e-4) return;
    this.poly(mat, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], dir > 0 ? PY : NY, o);
  }
  grid(mat, x0, y0, x1, y1, z, nx, ny, o) {
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        this.rect(mat, x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny, x0 + ((x1 - x0) * (i + 1)) / nx, y0 + ((y1 - y0) * (j + 1)) / ny, z, o);
  }
  gridY(mat, y, x0, z0, x1, z1, nx, nz, o) {
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        this.rectY(mat, y, x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz, x0 + ((x1 - x0) * (i + 1)) / nx, z0 + ((z1 - z0) * (j + 1)) / nz, 1, o);
  }
  gridX(mat, x, z0, y0, z1, y1, nz, ny, dir, o) {
    for (let i = 0; i < nz; i++)
      for (let j = 0; j < ny; j++)
        this.rectX(mat, x, z0 + ((z1 - z0) * i) / nz, y0 + ((y1 - y0) * j) / ny, z0 + ((z1 - z0) * (i + 1)) / nz, y0 + ((y1 - y0) * (j + 1)) / ny, dir, o);
  }
  // faces: x/X = -x/+x, y/Y, z/Z  (domyślnie bez tylnej +z — schowana w murze)
  box(mat, x0, y0, z0, x1, y1, z1, faces = 'xXyYz', o) {
    if (faces.includes('x')) this.rectX(mat, x0, z0, y0, z1, y1, -1, o);
    if (faces.includes('X')) this.rectX(mat, x1, z0, y0, z1, y1, 1, o);
    if (faces.includes('y')) this.rectY(mat, y0, x0, z0, x1, z1, -1, o);
    if (faces.includes('Y')) this.rectY(mat, y1, x0, z0, x1, z1, 1, o);
    if (faces.includes('z')) this.rect(mat, x0, y0, x1, y1, z0, o);
    if (faces.includes('Z')) this.rectBack(mat, x0, y0, x1, y1, z1, o);
  }
  // pionowy walec/stożek z gładkimi normalnymi
  cyl(mat, cx, cz, y0, y1, r0, r1, seg = 8, o = EMPTY, caps = '') {
    const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = [c0, slope, s0], n1 = [c1, slope, s1];
      this.poly(mat, [
        [cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0],
        [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1],
      ], null, { ...o, nrm: [n0, n1, n1, n0] });
      if (caps.includes('Y') && r1 > 0) this.poly(mat, [[cx, y1, cz], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1]], PY, o);
      if (caps.includes('y') && r0 > 0) this.poly(mat, [[cx, y0, cz], [cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0]], NY, o);
    }
  }
  // rura/gałąź między dowolnymi punktami (lokalne metry), gładkie normalne
  tube(mat, p0, p1, r0, r1, seg = 6, o = EMPTY) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], L = Math.hypot(ax, ay, az) || 1;
    const d = [ax / L, ay / L, az / L];
    const t = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [d[1] * t[2] - d[2] * t[1], d[2] * t[0] - d[0] * t[2], d[0] * t[1] - d[1] * t[0]];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    const ring = (c, r, a) => [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r];
    const nr = (a) => [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.poly(mat, [ring(p0, r0, a0), ring(p0, r0, a1), ring(p1, r1, a1), ring(p1, r1, a0)], null, { ...o, nrm: [nr(a0), nr(a1), nr(a1), nr(a0)] });
      if (o.caps) {
        this.poly(mat, [p0, ring(p0, r0, a1), ring(p0, r0, a0)], [-d[0], -d[1], -d[2]], o);
        this.poly(mat, [p1, ring(p1, r1, a0), ring(p1, r1, a1)], d, o);
      }
    }
  }
  // ściana z prostokątnym otworem + ościeża (głębokość "rev")
  wallHole(mat, W, H, x0, y0, x1, y1, rev, o) {
    const ny = Math.max(1, Math.round(H / 2));
    this.grid(mat, 0, 0, x0, H, 0, 1, ny, o);
    this.grid(mat, x1, 0, W, H, 0, 1, ny, o);
    if (y0 > 1e-3) this.rect(mat, x0, 0, x1, y0, 0, o);
    this.rect(mat, x0, y1, x1, H, 0, o);
    const ro = o ? { ...o, shade: (o.shade ?? 1) * 0.8 } : { shade: 0.8 };
    this.rectX(mat, x0, 0, y0, rev, y1, 1, ro);
    this.rectX(mat, x1, 0, y0, rev, y1, -1, ro);
    if (y0 > 1e-3) this.rectY(mat, y0, x0, 0, x1, rev, 1, ro);
    this.rectY(mat, y1, x0, 0, x1, rev, -1, { ...ro, shade: ro.shade * 0.75 });
  }

  finish() {
    const mats = {}, transfer = [];
    for (const [mat, bk] of this.buckets) {
      if (!bk.count) continue;
      const m = {
        p: new Float32Array(bk.p),
        n: new Int8Array(bk.n),
        uv: new Float32Array(bk.uv),
        c: new Uint8Array(bk.c),
        i: new Uint32Array(bk.i),
      };
      mats[mat] = m;
      transfer.push(m.p.buffer, m.n.buffer, m.uv.buffer, m.c.buffer, m.i.buffer);
    }
    return { mats, transfer };
  }
}
