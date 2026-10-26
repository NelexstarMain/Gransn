// ─────────────────────────────────────────────────────────────────────────────
//  MOSTY Z SEGMENTÓW 5 m
//  Każdy most (miejski i autostrady) to prosty łańcuch segmentów po 5 m, które
//  stykają się dokładnie krawędź w krawędź, leżą na jednej prostej i stoją
//  prostopadle do rzeki. Szerokość to całkowita liczba segmentów (2 × 5 = 10 m
//  ulica, 3 × 5 = 15 m autostrada). Nic się nie wygina ani nie skręca na moście.
// ─────────────────────────────────────────────────────────────────────────────
export const SEG = 5;
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

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
