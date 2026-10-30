// ─────────────────────────────────────────────────────────────────────────────
//  PROJEKT BUDYNKU: najlepsza z N prób, etapami (bryła → styl).
//
//  Każda próba to pełny opis budynku z gramatyki (sample(k)). Zamiast brać
//  pierwszy los, ocena sprawdza dwie rzeczy osobno:
//    1. BRYŁA — smukłość względem działki, czy kształt mieści się w działce,
//       ciągłość wysokości z sąsiadami (0–2 piętra różnicy jest naturalne);
//    2. STYL — kontrast dachu, ściany i opaski oraz odległość odcieni od sąsiadów,
//       żeby kolejne kamienice w rzędzie nie powtarzały koloru ani stylu.
//  Etapowy wybór kosztuje 5 + 4 próby zamiast 5 × 4 (podobnie jak ocena
//  modeli częściowych w Sequential Monte Carlo, Ritchie i in. 2015).
//  Sąsiedzi to budynki już zaprojektowane (kolejność działek jest stała),
//  więc wynik jest deterministyczny i taki sam w każdym workerze.
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const MASS_TRIES = 5, STYLE_TRIES = 4, NEAR = 16;
const NEED = { stepped: 5, tower: 4, crenel: 5, arcade: 5, villa: 4, L: 5 }; // ile punktów działki wymaga bryła
// pola opisujące bryłę (reszta to styl)
const MASS = ['levels', 'shape', 'stepDir', 'towerExtra', 'ang', 'garden', 'variant'];

// wymiary działki: liczba punktów, osie główne, powierzchnia (pole ≈ n × 27 m²).
// touch = ile punktów sąsiednich budynków przylega do działki: kamienica w szeregu jest
// "szersza" niż jej własne punkty, a samotny słupek 5 × 5 m nie może mieć sześciu pięter.
export function lotStats(vs, X, Z, CL, touch = 0) {
  const n = vs.length;
  let cx = 0, cz = 0, minCL = 1e9;
  for (const v of vs) { cx += X[v] / n; cz += Z[v] / n; minCL = Math.min(minCL, CL[v]); }
  let sxx = 0, szz = 0, sxz = 0;
  for (const v of vs) { const dx = X[v] - cx, dz = Z[v] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), e = [Math.cos(ang), Math.sin(ang)];
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const v of vs) {
    const u = (X[v] - cx) * e[0] + (Z[v] - cz) * e[1], w = -(X[v] - cx) * e[1] + (Z[v] - cz) * e[0];
    a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, w); b1 = Math.max(b1, w);
  }
  return { n, touch, cx, cz, minCL, area: (n + 0.5 * touch) * 27, along: a1 - a0 + 5.2, across: b1 - b0 + 5.2 };
}

function scoreMass(info, hs, st, nbrs) {
  const hmax = Math.max(...hs), side = Math.sqrt(st.area);
  const aspect = (hmax * 3.3) / side;
  let s = 2.6 * (1 - clamp((aspect - (info.shape === 'tower' ? 1.9 : 1.45)) / 1.2, 0, 1));
  if (st.touch === 0 && st.n <= 2 && hmax > 3) s -= 1.5; // samotny słupek to domek, nie wieża
  s += st.n >= (NEED[info.shape] || 0) ? 0.6 : -0.8;
  for (const o of nbrs) {
    const d = Math.abs(hmax - o.hmax);
    s += (d <= 2 ? 0.4 : -0.35 * (d - 2)) / nbrs.length;
    if (o.info.shape === info.shape && o.hmax === hmax) s -= 0.25 / nbrs.length;
  }
  return s;
}

function scoreStyle(info, nbrs) {
  let s = 0.8 * clamp(Math.abs(lum(info.roofTint) - lum(info.tint)) / 0.35, 0, 1);
  s += 0.6 * clamp(Math.abs(lum(info.trim) - lum(info.tint)) / 0.2, 0, 1);
  for (const o of nbrs) {
    s += (1.2 * Math.min(1, hueDist(info.hue, o.info.hue) / 60) - (o.info.style === info.style ? 0.25 : 0)) / nbrs.length;
    if (o.info.roofTint.every((c, i) => Math.abs(c - info.roofTint[i]) < 0.06)) s -= 0.2 / nbrs.length;
  }
  return s;
}

// sample(k) → info z gramatyki, heightsOf(info) → wysokości punktów działki,
// decided = lista { x, z, hmax, info } już zaprojektowanych budynków
export function chooseDesign(sample, heightsOf, st, decided) {
  const first = sample(0);
  if (first.garden) return { info: first, hmax: 0, gain: { mass: 0, style: 0 } };
  const nbrs = decided.filter((o) => Math.hypot(o.x - st.cx, o.z - st.cz) < NEAR + st.along * 0.5);
  let mass = first, ms = -1e9, m0 = null;
  for (let k = 0; k < MASS_TRIES; k++) {
    const c = sample(k);
    if (c.garden) continue;
    const sc = scoreMass(c, heightsOf(c), st, nbrs);
    if (m0 === null) m0 = sc;
    if (sc > ms) { ms = sc; mass = c; }
  }
  let best = mass, bs = -1e9, s0 = null;
  for (let k = 0; k < STYLE_TRIES; k++) {
    const c = { ...sample(MASS_TRIES + k) };
    for (const f of MASS) c[f] = mass[f];
    const sc = scoreStyle(c, nbrs);
    if (s0 === null) s0 = sc;
    if (sc > bs) { bs = sc; best = c; }
  }
  // gain = o ile najlepsza próba przebija pierwszą (do raportów w scripts/check-design.mjs)
  return { info: best, hmax: Math.max(...heightsOf(best)), gain: { mass: ms - m0, style: bs - s0 } };
}
