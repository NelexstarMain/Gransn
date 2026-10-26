// Trasy przez wyspę: autostrada na poziomie gruntu (kolei już nie ma). Krzywe Catmull-Rom przez losowe punkty na łuku.
import { Rng, hash } from '../core/rng.js';
import { noise3 } from '../core/noise.js';
import { crossings, riverProximity, straightenCrossing, makeBridge } from './bridges.js';

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

// Wybiera z kilkunastu łuków ten, który przecina rzekę dokładnie raz (najlepiej pod dużym kątem)
// i nie biegnie wzdłuż koryta; potem prostuje przecięcie: prosty odcinek prostopadły do rzeki.
function bestRoute(T, bridges, tries, build, wantCross) {
  let best = null;
  for (let k = 0; k < tries; k++) {
    const pts = build(k);
    const cr = crossings(T, pts);
    let score = riverProximity(T, pts) * 2;
    if (cr.length === 0) score += wantCross ? 260 : 0;
    else {
      score += (cr.length - 1) * 400 + (1 - Math.sin(cr[0].angle)) * 60 + (wantCross ? 0 : 260);
      if (bridges.some((b) => Math.hypot(b.p[0] - cr[0].p[0], b.p[1] - cr[0].p[1]) < 100)) score += 80;
    }
    if (!best || score < best.score) best = { score, pts, cr };
  }
  return best;
}

export function makeRoutes(seed, T, bridges = []) {
  const rng = new Rng(hash(seed, 2024));
  const a0 = rng.float(0, Math.PI * 2);
  // czy trasa ma przechodzić przez rzekę (losowo wg ziarna: raz tak, raz nie)
  const hwCross = rng.chance(0.6);
  const resample = (step) => (ctrl) => catmull(ctrl, step);
  // autostrada: szeroki łuk po jednej stronie wyspy, na poziomie gruntu
  const H = bestRoute(T, bridges, 24, (k) => catmull(arc(T, a0 + (k / 24) * Math.PI * 2, a0 + (k / 24) * Math.PI * 2 + 2.4, 0.66, 30, new Rng(hash(seed, 2024, k))), 8), hwCross);
  let hw = H.pts, hwBridge = null;
  if (H.cr.length) {
    const st = straightenCrossing(T, hw, H.cr[0], resample(8));
    hw = st.pts;
    hwBridge = makeBridge(T, st.site, { cols: 3, highway: true, hint: st.dir });
  }
  const highway = { pts: hw, width: 11, bridge: hwBridge };
  // torów nie ma (użytkownik ich nie chciał); pusta trasa zostaje, żeby reszta kodu miała co czytać
  const rail = { pts: [], y: [], width: 0, bridge: null };
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
