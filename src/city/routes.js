// Trasy przez wyspę: kolej (przy gruncie, przez miasto, most nad rzeką)
// i autostrada na poziomie gruntu. Krzywe Catmull-Rom przez losowe punkty na łuku.
import { Rng, hash } from '../core/rng.js';
import { noise3 } from '../core/noise.js';

function catmull(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function arc(T, a0, a1, k, ext, rng) {
  const ctrl = [];
  const n = Math.ceil(Math.abs(a1 - a0) / 0.32);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const r = T.coastR(a) * k * (1 + 0.1 * noise3(a * 2, rng.float(0, 9), 0.3));
    ctrl.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // końce wyprowadzone do brzegu
  const endOut = (a, dir) => {
    const r = T.coastR(a) + ext;
    return [Math.cos(a + dir * 0.05) * r, Math.sin(a + dir * 0.05) * r];
  };
  return [endOut(a0, -1), ...ctrl, endOut(a1, 1)];
}

function smoothY(ys, w) {
  return ys.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < ys.length) { s += ys[j]; n++; } }
    return s / n;
  });
}

export function makeRoutes(seed, T) {
  const rng = new Rng(hash(seed, 2024));
  const a0 = rng.float(0, Math.PI * 2);
  // autostrada: szeroki łuk po jednej stronie wyspy, na estakadzie
  const hw = catmull(arc(T, a0, a0 + 2.4, 0.66, 30, rng), 8);
  const highway = { pts: hw, width: 11 }; // na ziemi (nie estakada)
  // kolej: łuk po drugiej stronie, przy ziemi; kończy się na plażach
  const rw = catmull(arc(T, a0 + Math.PI - 0.2, a0 + Math.PI + 2.0, 0.48, -25, rng), 6);
  const ry = smoothY(rw.map(([x, z]) => Math.max(T.height(x, z), T.seaY + 1)), 4);
  const rail = { pts: rw, y: ry, width: 5 };
  rail.station = Math.floor(rw.length * 0.5);
  return { highway, rail };
}

export function polyDist(route, x, z) {
  let best = 1e9;
  const P = route.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}
