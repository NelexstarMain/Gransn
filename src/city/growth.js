// ─────────────────────────────────────────────────────────────────────────────
//  SYMULACJA WZROSTU MIASTA — od dzikiego terenu do miasta ok. 1900 roku.
//
//  Zamiast z góry rozdać dzielnice, miasto „zasiedla się” epoka po epoce (8 epok).
//  Teren jest pokrojony na pola 10 m; każde pole ma:
//   • DOSTĘPNOŚĆ  — drogę do rynku PO ULICACH (Dijkstra po grafie jezdni, mosty wliczone:
//                   drugi brzeg rzeki rozwija się później i najpierw przy przyczółkach),
//   • PRZYDATNOŚĆ TERENU — spadek stoku (strome = drogie w budowie) i zagrożenie powodzią
//                   (nisko i blisko rzeki),
//   • SĄSIEDZTWO  — miasto rośnie od tego, co już stoi (zabudowa wstęgowa wzdłuż dróg
//                   z bram wybiega przed resztę),
//   • KANALIZACJĘ — od epoki 5 powstaje kolektor: od rynku ulicami w dół terenu do zrzutu
//                   poniżej miasta na rzece (trasa unika prowadzenia rur pod górę). Sieć co
//                   epokę sięga dalej od kolektora. Skanalizowane ulice przyciągają zabudowę
//                   i tylko przy nich powstają wielopiętrowe kamienice.
//  W każdej epoce przybywa tyle pól, ile wynosi popyt (rośnie wykładniczo), wybieranych
//  spośród pól przy istniejącej zabudowie wg użyteczności. Z historii pola wynika dzielnica:
//  najstarsze jądro → Stare Miasto, skanalizowana rozbudowa → śródmieście kamienic, późne
//  i dalekie → domy; wille i fabryki tam, gdzie wskazuje plan (wzgórza / płaski teren).
//  Pola nigdy nie zasiedlone zostają łąką — ulice są wytyczone, ale niezabudowane.
//  Deterministyczne z ziarna; bez Math.random.
// ─────────────────────────────────────────────────────────────────────────────
import { hash } from '../core/rng.js';

const CELL = 10, EPOCHS = 8, SEWER_FROM = 5, SEWER_REACH = 80;
const BUILT = { old: 1, tenement: 1, houses: 1, villa: 1, industrial: 1 };
const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);

function dijkstra(nodes, sources, cost) {
  const d = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
  for (const s of sources) d[s] = 0;
  for (;;) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && d[i] < bd) { bd = d[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const e of nodes[u].adj) { const nd = bd + cost(u, e.to, e.len); if (nd < d[e.to]) { d[e.to] = nd; prev[e.to] = u; } }
  }
  return { d, prev };
}

export function simulateGrowth({ streets, roads, terrain: T, seed, half, center, planKind }) {
  // ── graf ulic ──
  const ids = new Map(), nodes = [];
  const nid = (p) => { const k = key(p); let i = ids.get(k); if (i === undefined) { i = nodes.length; ids.set(k, i); nodes.push({ p, adj: [], h: T.height(p[0], p[1]) }); } return i; };
  for (const s of streets) {
    const a = nid(s.a), b = nid(s.b), len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    s.na = a; s.nb = b;
    nodes[a].adj.push({ to: b, len }); nodes[b].adj.push({ to: a, len });
  }
  let c0 = 0, cd = 1e18;
  nodes.forEach((n, i) => { const d = Math.hypot(n.p[0] - center[0], n.p[1] - center[1]); if (d < cd) { cd = d; c0 = i; } });
  const acc = dijkstra(nodes, [c0], (u, v, len) => len).d;

  // ── kanalizacja: zrzut poniżej miasta, kolektor z rynku, zasięg rosnący z epokami ──
  let outfall = -1, best = -1e9;
  const cseg = T.river(center[0], center[1]);
  nodes.forEach((n, i) => {
    const r = T.river(n.p[0], n.p[1]);
    if (r.d > T.hw + 45 || acc[i] === Infinity || acc[i] > 520) return;
    const down = r.seg + r.t - (cseg.seg + cseg.t); // dalej z biegiem rzeki = lepiej
    if (down > best) { best = down; outfall = i; }
  });
  const served = new Float32Array(nodes.length).fill(Infinity);
  const trunk = new Uint8Array(nodes.length);
  if (outfall >= 0) {
    // rura od węzła v do u (u bliżej zrzutu) powinna opadać: prowadzenie pod górę kosztuje
    const sw = dijkstra(nodes, [outfall], (u, v, len) => len * (1 + 10 * Math.max(0, (nodes[u].h - nodes[v].h) / Math.max(1, len))));
    for (let n = c0; n >= 0; n = sw.prev[n]) trunk[n] = 1;
    const src = [];
    trunk.forEach((t, i) => { if (t) src.push(i); });
    const dt = dijkstra(nodes, src, (u, v, len) => len).d;
    for (let i = 0; i < nodes.length; i++) { const e = SEWER_FROM + Math.floor(dt[i] / SEWER_REACH); if (e <= EPOCHS) served[i] = e; }
  }
  for (const s of streets) { s.sewer = s.town && served[s.na] <= EPOCHS && served[s.nb] <= EPOCHS; s.trunk = !!(trunk[s.na] && trunk[s.nb]); }

  // ── pola ──
  const n = Math.ceil((2 * half) / CELL), N = n * n;
  const ok = new Uint8Array(N), access = new Float32Array(N).fill(1e9), suit = new Float32Array(N), sewerAt = new Float32Array(N).fill(Infinity), main = new Uint8Array(N), pk = new Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = j * n + i, x = -half + (i + 0.5) * CELL, z = -half + (j + 0.5) * CELL;
    const k = planKind(x, z);
    pk[c] = k;
    if (!BUILT[k] || T.inland(x, z) < 36) continue;
    const nr = roads.nearest(x, z);
    if (!nr || nr.c > 30 || !nr.s.town) continue;
    const s = nr.s, da = Math.hypot(x - s.a[0], z - s.a[1]), db = Math.hypot(x - s.b[0], z - s.b[1]);
    access[c] = Math.min(acc[s.na] + da, acc[s.nb] + db);
    if (access[c] > 1e8) continue;
    sewerAt[c] = Math.min(served[s.na], served[s.nb]);
    main[c] = s.main ? 1 : 0;
    const slope = Math.hypot(T.height(x + 6, z) - T.height(x - 6, z), T.height(x, z + 6) - T.height(x, z - 6)) / 12;
    const flood = T.river(x, z).d < T.hw + 70 && T.height(x, z) - T.waterY < 2.2 ? 0.6 : 0;
    suit[c] = 1 - Math.min(1, slope / 0.2) - flood;
    ok[c] = 1;
  }
  let M = 0;
  for (let c = 0; c < N; c++) M += ok[c];
  const epoch = new Uint8Array(N);
  let built = 0;
  for (let c = 0; c < N; c++) if (ok[c] && access[c] < 75) { epoch[c] = 1; built++; }
  const nbCount = (c, r) => { let k = 0; const ci = c % n, cj = (c / n) | 0; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < n && j < n && epoch[j * n + i]) k++; } return k; };
  const SUB = 5;
  for (let e = 1; e <= EPOCHS; e++) {
    const target = Math.round(0.93 * M * Math.pow(e / EPOCHS, 1.7));
    for (let sub = 0; sub < SUB && built < target; sub++) {
      const quota = Math.ceil((target - built) / (SUB - sub)), cand = [];
      for (let c = 0; c < N; c++) {
        if (!ok[c] || epoch[c]) continue;
        const k1 = nbCount(c, 1);
        if (!k1 && !(main[c] && nbCount(c, 3))) continue; // przy zabudowie albo wstęgowo wzdłuż drogi głównej
        const u = -access[c] / 240 + 0.9 * suit[c] + 0.25 * (k1 / 8) + (sewerAt[c] <= e ? 0.7 : 0) + (main[c] ? 0.3 : 0) + 0.3 * (hash(seed, c, e, 7001) / 4294967296);
        cand.push([u, c]);
      }
      cand.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      for (let k = 0; k < Math.min(quota, cand.length); k++) { epoch[cand[k][1]] = e; built++; }
    }
  }
  // ── dzielnica z historii pola ──
  const KN = ['', 'old', 'tenement', 'houses', 'villa', 'industrial'], raw = new Uint8Array(N), kind = new Uint8Array(N);
  for (let c = 0; c < N; c++) {
    const e = epoch[c];
    if (!e) continue;
    raw[c] = pk[c] === 'industrial' ? (e >= 5 ? 5 : 3) : pk[c] === 'villa' ? (e >= 5 ? 4 : 3) : e <= 4 ? 1 : sewerAt[c] <= EPOCHS && e <= 7 && access[c] < 360 ? 2 : 3;
  }
  // wygładzenie: pole przyjmuje rodzaj większości sąsiadów (bez pojedynczych „wysp”)
  for (let c = 0; c < N; c++) {
    if (!raw[c]) continue;
    const cnt = [0, 0, 0, 0, 0, 0], ci = c % n, cj = (c / n) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < n && j < n) cnt[raw[j * n + i]]++; }
    cnt[raw[c]] += 1.5;
    let b = raw[c];
    for (let k = 1; k < 6; k++) if (cnt[k] > cnt[b]) b = k;
    kind[c] = b;
  }
  const cellOf = (x, z) => { const i = Math.floor((x + half) / CELL), j = Math.floor((z + half) / CELL); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  const byKind = {}, byEpoch = new Array(EPOCHS + 1).fill(0);
  for (let c = 0; c < N; c++) if (epoch[c]) { byKind[KN[kind[c]]] = (byKind[KN[kind[c]]] || 0) + 1; byEpoch[epoch[c]]++; }
  return {
    epochs: EPOCHS, cell: CELL, n, epoch, kindId: kind,
    developed: (x, z) => { const c = cellOf(x, z); return c >= 0 && epoch[c] > 0; },
    epochAt: (x, z) => { const c = cellOf(x, z); return c < 0 ? 0 : epoch[c]; },
    // rodzaj dzielnicy: parki, rynek, planty itd. zostają z planu; zabudowa wg historii wzrostu
    kind: (x, z, k) => { if (!BUILT[k]) return k; const c = cellOf(x, z); return c >= 0 && epoch[c] ? KN[kind[c]] : 'houses'; },
    stats: { cells: M, built, byKind, byEpoch, sewered: streets.filter((s) => s.sewer).length, trunk: streets.filter((s) => s.trunk).length, outfall: outfall >= 0 ? nodes[outfall].p : null },
  };
}
