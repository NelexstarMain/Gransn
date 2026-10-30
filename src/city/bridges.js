// ─────────────────────────────────────────────────────────────────────────────
//  MOSTY Z SEGMENTÓW 5 m
//  Każdy most (miejski i autostrady) to prosty łańcuch segmentów po 5 m, które
//  stykają się dokładnie krawędź w krawędź, leżą na jednej prostej i stoją
//  prostopadle do rzeki. Szerokość to całkowita liczba segmentów (2 × 5 = 10 m
//  ulica, 3 × 5 = 15 m autostrada). Nic się nie wygina ani nie skręca na moście.
// ─────────────────────────────────────────────────────────────────────────────
export const SEG = 5;
const MARGIN = 26; // tyle metrów osi rzeki przed i za mostem leży na jednym prostym odcinku

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Punkt na osi rzeki o danym x, przesunięty tak, żeby (L + MARGIN) w obie strony
// zmieściło się na jednym prostym odcinku łamanej (na wierzchołku brzegi się łamią).
export function riverSite(T, x) {
  const P = T.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (x < a[0] || x > b[0]) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = ((x - a[0]) / (b[0] - a[0])) * len;
    const lo = Math.min(MARGIN, len / 2), hi = Math.max(len - MARGIN, len / 2);
    s = Math.max(lo, Math.min(hi, s));
    return { p: lerp2(a, b, s / len), tangent: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], seg: i };
  }
  return null;
}

// długość łamanej osi rzeki
export function riverLength(T) {
  const P = T.pts;
  let s = 0;
  for (let i = 0; i < P.length - 1; i++) s += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
  return s;
}

// Punkt osi rzeki w odległości s wzdłuż łuku (rzeka może płynąć w dowolnym kierunku);
// jak riverSite: odsunięty od wierzchołków łamanej, żeby most leżał na prostym odcinku.
export function riverSiteAt(T, s) {
  const P = T.pts;
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= acc + len || i === P.length - 2) {
      const lo = Math.min(MARGIN, len / 2), hi = Math.max(len - MARGIN, len / 2);
      const t = Math.max(lo, Math.min(hi, s - acc));
      return { p: lerp2(a, b, t / len), tangent: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], seg: i, s: acc + t };
    }
    acc += len;
  }
  return null;
}

// Most prostopadły do rzeki w punkcie site; cols = szerokość w segmentach.
export function makeBridge(T, site, { cols = 2, highway = false, rail = false, hint = null } = {}) {
  const n = Math.ceil((2 * T.hw) / SEG) + 2; // koryto + po jednym segmencie oparcia na każdym brzegu
  const N = n % 2 ? n : n + 1;               // nieparzyście: środkowy segment leży na osi rzeki
  let A = [-site.tangent[1], site.tangent[0]];
  if (hint && A[0] * hint[0] + A[1] * hint[1] < 0) A = [-A[0], -A[1]]; // zwrot zgodny z kierunkiem trasy
  const L = (N * SEG) / 2, width = cols * SEG;
  const p = site.p;
  return { p, axis: A, perp: [-A[1], A[0]], L, n: N, cols, width, highway, rail, e0: [p[0] - A[0] * L, p[1] - A[1] * L], e1: [p[0] + A[0] * L, p[1] + A[1] * L] };
}

// Segmenty mostu w kolejności od e0 do e1: { a, c, k, first, last, solid } — a, c to środki
// krawędzi segmentu na osi (segment k+1 zaczyna się dokładnie tam, gdzie kończy się k).
export function bridgeSegments(br) {
  const out = [];
  for (let k = 0; k < br.n; k++) {
    const a = [br.e0[0] + br.axis[0] * SEG * k, br.e0[1] + br.axis[1] * SEG * k];
    const c = [br.e0[0] + br.axis[0] * SEG * (k + 1), br.e0[1] + br.axis[1] * SEG * (k + 1)];
    out.push({ a, c, k, first: k === 0, last: k === br.n - 1, solid: k === 0 || k === br.n - 1 });
  }
  return out;
}

// współrzędne punktu względem mostu: wzdłuż osi (od środka) i w poprzek
export function bridgeLocal(br, x, z) {
  const dx = x - br.p[0], dz = z - br.p[1];
  return { along: dx * br.axis[0] + dz * br.axis[1], across: dx * br.perp[0] + dz * br.perp[1] };
}

export function onBridge(br, x, z, pad = 0) {
  const { along, across } = bridgeLocal(br, x, z);
  return Math.abs(along) <= br.L + pad && Math.abs(across) <= br.width / 2 + pad;
}

// ── trasy (autostrada, tory): jedno przecięcie rzeki, pod kątem prostym ──────
const side = (T, x, z) => { const r = T.river(x, z); return r.tx * (z - r.pz) - r.tz * (x - r.px); };

// Wszystkie przecięcia łamanej z osią rzeki: { i, t, p, angle } (kąt ostry między trasą a rzeką).
export function crossings(T, pts) {
  const out = [];
  let prev = side(T, pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const s1 = side(T, pts[i + 1][0], pts[i + 1][1]);
    if (prev * s1 < 0 && T.inland(pts[i][0], pts[i][1]) > 0) {
      const t = Math.abs(prev) / (Math.abs(prev) + Math.abs(s1));
      const p = lerp2(pts[i], pts[i + 1], t), r = T.river(p[0], p[1]);
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1;
      out.push({ i, t, p, angle: Math.asin(Math.min(1, Math.abs((dx * r.tz - dz * r.tx) / (l * Math.hypot(r.tx, r.tz))))) });
    }
    prev = s1;
  }
  return out;
}

// Ile próbek trasy leży bliżej rzeki niż hw + pad (poza przecięciem to „jazda po wodzie”).
export function riverProximity(T, pts, pad = 22) {
  let n = 0;
  for (const p of pts) if (T.river(p[0], p[1]).d < T.hw + pad && T.inland(p[0], p[1]) > 0) n++;
  return n;
}

// Zamienia fragment trasy wokół przecięcia na prostą prostopadłą do rzeki (half m w każdą stronę,
// co 20 m punkt kontrolny, więc krzywa Catmulla-Roma jest tam dokładnie prosta), a resztę
// zostawia. `resample` odtwarza gładką krzywą z nowych punktów kontrolnych.
export function straightenCrossing(T, pts, cross, resample, { half = 60, blend = 150 } = {}) {
  const r0 = T.river(cross.p[0], cross.p[1]);
  const tl = Math.hypot(r0.tx, r0.tz), tan = [r0.tx / tl, r0.tz / tl];
  // przesuń przecięcie od wierzchołka łamanej rzeki (tam brzegi się łamią)
  const P = T.pts, a = P[r0.seg], b = P[r0.seg + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let s = r0.t * len;
  s = len > 2 * MARGIN ? Math.max(MARGIN, Math.min(len - MARGIN, s)) : len / 2;
  const C = lerp2(a, b, s / len);
  let A = [-tan[1], tan[0]];
  // zwrot zgodny z kierunkiem jazdy trasy
  const dx = pts[cross.i + 1][0] - pts[cross.i][0], dz = pts[cross.i + 1][1] - pts[cross.i][1];
  if (A[0] * dx + A[1] * dz < 0) A = [-A[0], -A[1]];
  // długość łuku do przecięcia
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const sC = cum[cross.i] + cross.t * (cum[cross.i + 1] - cum[cross.i]);
  const ctrl = [];
  let lastKept = -1e9;
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] < sC - blend) { if (cum[i] - lastKept >= 28 || i === 0) { ctrl.push(pts[i]); lastKept = cum[i]; } }
  }
  for (let k = -half; k <= half; k += 20) ctrl.push([C[0] + A[0] * k, C[1] + A[1] * k]);
  lastKept = -1e9;
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > sC + blend) { if (cum[i] - lastKept >= 28 || i === pts.length - 1) { ctrl.push(pts[i]); lastKept = cum[i]; } }
  }
  if (cum[pts.length - 1] - lastKept > 1 && ctrl[ctrl.length - 1] !== pts[pts.length - 1]) ctrl.push(pts[pts.length - 1]);
  return { pts: resample(ctrl), site: { p: C, tangent: tan }, dir: A };
}
