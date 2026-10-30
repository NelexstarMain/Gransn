// ─────────────────────────────────────────────────────────────────────────────
//  UKŁAD FASAD: z jakich fragmentów i w jakich miejscach składa się ściana.
//
//  1. PROGRAM BUDYNKU — wymiary okien, opaski, balkony, wejście, sklepy. Losowany
//     N razy i oceniany (najlepsza z N): okna mają mieścić się w odcinkach ścian,
//     wejście ma stać blisko środka fasady od ulicy, ozdobność ma pasować do stylu.
//  2. PLAN PANELU — z programu, klasy piętra i szerokości odcinka powstaje lista
//     fragmentów w metrach (gen/fragments.js je rysuje). Okna mają stałą szerokość
//     w metrach w całym budynku, a kolumny okien i balkonów leżą jedna nad drugą.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hash } from '../core/rng.js';
import { facadesOf, panelEnds, segKey } from '../city/facades.js';
import { Z_HOUSES, Z_TENEMENT } from '../city/grid.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TRIES = 6;

// Klasy pięter: g = parter, n = piano nobile, m = środkowe, t = ostatnie (attyka)
export function levelClass(L, top, zone) {
  if (L === 0) return 'g';
  if (zone !== Z_TENEMENT) return L === top - 1 && top >= 3 ? 't' : 'm';
  if (L === 1) return 'n';
  return top >= 4 && L === top - 1 ? 't' : 'm';
}

// Tokeny stylów: szerokość okna [m], wysokości okien wg klasy piętra, opaski,
// szanse na balkon / boniowanie narożne / lizeny / łuki i docelowa ozdobność.
const ST = {
  classic: { w: [1.05, 1.25], h: { g: [1.5, 1.8], n: [1.95, 2.15], m: [1.75, 1.95], t: [1.4, 1.6] },
    fr: { g: ['band'], n: ['ped', 'segm', 'cornice'], m: ['lintel', 'band'], t: ['plain', 'lintel'] },
    balc: 0.7, rail: ['bars', 'balust'], quoin: 0.6, lizena: 0.5, arch: 0, orn: 0.55, bay: 0.3, portal: 0.35,
    frieze: 0.5, sillb: 0.45, cons: 0.35, rust: 0.5, archG: 0.3, stripe: 0 },
  ornate: { w: [1.1, 1.3], h: { g: [1.5, 1.8], n: [2.0, 2.2], m: [1.8, 2.0], t: [1.5, 1.7] },
    fr: { g: ['band', 'lintel'], n: ['ped', 'cornice', 'segm'], m: ['segm', 'cornice', 'lintel'], t: ['lintel', 'band'] },
    balc: 0.9, rail: ['balust', 'bars'], quoin: 0.8, lizena: 0.7, arch: 0.15, orn: 0.85, bay: 0.55, portal: 0.5,
    frieze: 0.85, sillb: 0.75, cons: 0.6, rust: 0.7, archG: 0.5, stripe: 0 },
  plain: { w: [1.0, 1.2], h: { g: [1.4, 1.7], n: [1.7, 1.9], m: [1.6, 1.85], t: [1.35, 1.55] },
    fr: { g: ['plain', 'lintel'], n: ['lintel', 'band'], m: ['plain', 'lintel'], t: ['plain'] },
    balc: 0.3, rail: ['bars'], quoin: 0, lizena: 0.15, arch: 0, orn: 0.2, bay: 0.1, portal: 0.1,
    frieze: 0.1, sillb: 0.1, cons: 0.1, rust: 0.2, archG: 0.1, stripe: 0 },
  brick: { w: [0.95, 1.15], h: { g: [1.5, 1.8], n: [1.8, 2.05], m: [1.7, 1.9], t: [1.4, 1.6] },
    fr: { g: ['band', 'lintel'], n: ['band', 'lintel'], m: ['band', 'plain'], t: ['plain', 'lintel'] },
    balc: 0.35, rail: ['bars'], quoin: 0, lizena: 0.3, arch: 0.45, orn: 0.4, bay: 0.25, portal: 0.6,
    frieze: 0.7, sillb: 0, cons: 0, rust: 0, archG: 0, stripe: 0.9 },
  house: { w: [0.8, 1.0], h: { g: [1.2, 1.4], n: [1.2, 1.45], m: [1.2, 1.45], t: [1.0, 1.25] },
    fr: { g: ['band', 'lintel', 'plain'], n: ['band', 'lintel', 'plain'], m: ['band', 'lintel', 'plain'], t: ['plain', 'band'] },
    balc: 0.05, rail: ['bars'], quoin: 0.1, lizena: 0, arch: 0.1, orn: 0.3, bay: 0, portal: 0.15,
    frieze: 0.05, sillb: 0, cons: 0.05, rust: 0, archG: 0.05, stripe: 0 },
};
const SILL = { g: 1.1, n: 0.85, m: 0.85, t: 1.0 };
const FR_ORN = { plain: 0, lintel: 0.3, band: 0.5, segm: 0.8, cornice: 0.9, ped: 1 };

const baseKey = (s) => segKey(s.a, s.nb, s.q, s.side, 0);

function tokens(info) {
  if (info.zone === Z_HOUSES) return info.style === 'brick' ? { ...ST.house, arch: 0.35, stripe: 0.8, frieze: 0.5 } : ST.house;
  return ST[info.style] || ST.classic;
}

// ── 1. program budynku ──────────────────────────────────────────────────────
function sampleProgram(rng, info, st) {
  const h = {}, fr = {};
  for (const c of ['g', 'n', 'm', 't']) { h[c] = rng.float(st.h[c][0], st.h[c][1]); fr[c] = rng.pick(st.fr[c]); }
  return {
    w: rng.float(st.w[0], st.w[1]), h, fr, frAlt: rng.pick(st.fr.n),
    // oś nad wejściem jest bogatsza niż pozostałe kolumny
    frAxis: { n: st.orn > 0.5 ? 'ped' : 'band', m: st.orn > 0.5 ? rng.pick(['cornice', 'segm']) : 'lintel', t: 'lintel' },
    portal: rng.chance(st.portal), bay: null, wantBay: rng.chance(st.bay),
    arch: { n: rng.chance(st.arch), m: rng.chance(st.arch * 0.8) },
    balc: rng.chance(st.balc), rail: rng.pick(st.rail),
    quoin: rng.chance(st.quoin), lizena: rng.chance(st.lizena),
    frieze: rng.chance(st.frieze), sillb: rng.chance(st.sillb), cons: rng.chance(st.cons), stripe: rng.chance(st.stripe),
    rust: rng.chance(st.rust), archG: rng.chance(st.archG),
    band: info.zone === Z_TENEMENT && rng.chance(0.85),
    bands2: info.style === 'ornate' || rng.chance(0.3),
    shut: !!info.shutters, ent: new Set(), shops: new Set(), cols: new Set(),
  };
}

// wejście stoi blisko środka fasady od ulicy, nie przy narożniku
function entranceWeight(s) {
  const e = panelEnds(s), mid = (s.s0 + s.w / 2) / Math.max(s.len, 0.1);
  let w = 1 - Math.abs(mid - 0.5) * 1.2;
  if (s.n >= 3 && (e.m === 'convex' || e.c === 'convex')) w -= 0.3;
  return clamp(w, 0.05, 1) * (0.6 + 0.4 * clamp((s.len - 3) / 8, 0, 1));
}

function planGround(rng, prog, info, ground, upper) {
  prog.ent.clear(); prog.shops.clear(); prog.cols.clear(); prog.bay = null;
  const cands = ground.filter((s) => s.w >= 2.0);
  if (!cands.length) return 0;
  // jedno wejście na najdłuższą fasadę, drugie na każdą kolejną ≥ 8 m
  const byF = new Map();
  for (const s of cands) { if (!byF.has(s.fid)) byF.set(s.fid, []); byF.get(s.fid).push(s); }
  const facs = [...byF.values()].sort((a, b) => b[0].len - a[0].len);
  let score = 0, n = 0;
  facs.forEach((list, i) => {
    if (i > 0 && list[0].len < 8) return;
    let best = null, bw = -1;
    for (const s of list) { const w = entranceWeight(s) * rng.float(0.7, 1); if (w > bw) { bw = w; best = s; } }
    prog.ent.add(baseKey(best));
    score += entranceWeight(best); n++;
  });
  if (info.shops) for (const s of ground) if (s.w >= 2.4 && !prog.ent.has(baseKey(s)) && rng.chance(0.7)) prog.shops.add(baseKey(s));
  // balkony: nad wejściem oraz (czasem) na środku kolejnej fasady od ulicy
  if (prog.balc) {
    for (const k of prog.ent) prog.cols.add(k);
    for (const list of facs) if (list[0].len >= 6 && rng.chance(0.4)) prog.cols.add(baseKey(list[Math.floor(list.length / 2)]));
  }
  // wykusz: jedna kolumna na fasadzie od ulicy, nie przy wejściu i nie przy narożniku wklęsłym
  if (prog.wantBay) {
    let best = null, bw = -1;
    for (const s of upper) {
      const e = panelEnds(s);
      if (s.w < 2.6 || e.m === 'concave' || e.c === 'concave' || prog.ent.has(baseKey(s))) continue;
      const w = entranceWeight(s) * rng.float(0.7, 1);
      if (w > bw) { bw = w; best = s; }
    }
    if (best) { prog.bay = { key: baseKey(best), to: 1 + rng.int(1, 2) }; prog.cols.delete(prog.bay.key); }
  }
  return n ? score / n : 0;
}

// ocena programu: okna mieszczą się w odcinkach, ozdobność pasuje do stylu, wejście wygląda dobrze
function scoreProgram(prog, segs, st, ent) {
  let fit = 0, nf = 0;
  for (const s of segs) {
    if (s.L === 0) continue;
    const w = Math.min(prog.w, s.w - 0.5), f = (s.w - w) / s.w;
    fit += 1 - Math.min(1, Math.abs(f - 0.46) * 2.4 + (s.w - prog.w < 0.5 ? 0.6 : 0));
    nf++;
  }
  fit = nf ? fit / nf : 0.7;
  const orn = (FR_ORN[prog.fr.n] * 0.5 + FR_ORN[prog.fr.m] * 0.35 + FR_ORN[prog.fr.t] * 0.15) * 0.7 +
    (prog.balc ? 0.12 : 0) + (prog.bay ? 0.1 : 0) + (prog.frieze ? 0.05 : 0) + (prog.sillb ? 0.04 : 0) + (prog.rust ? 0.04 : 0) + (prog.quoin ? 0.08 : 0) + (prog.arch.n ? 0.06 : 0) + (prog.lizena ? 0.04 : 0);
  return 2.2 * ent + 2 * fit + 1.4 * (1 - Math.min(1, Math.abs(orn - st.orn) * 1.8)) + (prog.cols.size ? 0.4 : 0);
}

export function programOf(city, bid, info) {
  const cache = city.programs || (city.programs = new Map());
  let prog = cache.get(bid);
  if (prog) return prog;
  const F = facadesOf(city), segs = F.byBid.get(bid) || [], ground = F.ground.get(bid) || [];
  const upper = segs.filter((s) => s.L === 1 && s.street);
  const st = tokens(info);
  let best = null, bs = -1e9, first = 0;
  for (let k = 0; k < TRIES; k++) {
    const rng = new Rng(hash(city.seed, bid, 4141, k));
    const p = sampleProgram(rng, info, st);
    const ent = planGround(rng, p, info, ground, upper);
    const sc = scoreProgram(p, segs, st, ent);
    if (k === 0) first = sc;
    if (sc > bs) { bs = sc; best = p; }
  }
  best.score = bs; best.gain = bs - first;
  cache.set(bid, best);
  return best;
}

// ── 2. plan panelu ──────────────────────────────────────────────────────────
function windowFrag(prog, info, s, cls, W, H, ends, simple, axis, maxTop = H - 0.38) {
  const w = Math.min(prog.w + (axis ? 0.08 : 0), W - 0.5);
  if (w < 0.6) return null;
  // parter z boniowaniem ma wysokie okna łukowe (jak w kamienicach z arkadowym parterem)
  const tall = cls === 'g' && prog.rust && prog.archG && !simple && s.street && H - 0.95 >= w / 2 + 1.4;
  const y = tall ? 0.55 : SILL[cls], y1 = Math.min(tall ? Math.min(0.55 + 2.55, H - 0.95) : y + prog.h[cls], maxTop), h = y1 - y;
  if (h < 1.0) return null;
  // okno odsunięte od narożnika: przy narożniku zostaje szerszy filar
  const room = (W - w) / 2 - 0.25;
  const shift = clamp((ends.m === 'convex' || ends.m === 'party' ? 0.12 : 0) - (ends.c === 'convex' || ends.c === 'party' ? 0.12 : 0), -room, room);
  const arch = tall || ((cls === 'n' || cls === 'm') && prog.arch[cls] && h >= w / 2 + 0.85);
  const frame = simple ? 'plain' : axis && prog.frAxis[cls] ? prog.frAxis[cls] : cls === 'n' && prog.frAlt !== prog.fr.n && s.idx % 2 ? prog.frAlt : prog.fr[cls];
  return {
    k: 'win', x: W / 2 + shift, w, y, h, frame, arch,
    shut: prog.shut && W - w >= w + 0.15, flow: cls === 'g' ? null : info.flowers, bars: cls === 'g' && info.bars,
    cons: prog.cons && !simple && (cls === 'n' || cls === 'm') && frame !== 'cornice',
    under: !simple && cls === 'm' && (frame === 'plain' || frame === 'lintel') && info.style === 'ornate',
  };
}

// Plan jednego panelu (odcinka ściany na piętrze L). Zwraca { mod, spec, string, poster }.
export function panelPlan(city, info, prog, s, L, top, W, H, simple, hh) {
  const cls = levelClass(L, top, info.zone), ends = panelEnds(s), key = baseKey(s);
  const house = info.zone === Z_HOUSES;
  const spec = [];
  const out = { mod: 'panel', spec, string: false, poster: false };
  const street = s.street && !simple;
  // fryz pod gzymsem na ostatnim piętrze: okno niższe, żeby zmieściła się taśma
  const topFrieze = prog.frieze && street && L === top - 1 && L > 0;
  const u0 = s.flip ? s.s0 + W : s.s0, u1 = s.flip ? s.s0 : s.s0 + W;
  if (cls === 'g') {
    if (s.street && prog.ent.has(key)) {
      spec.push({ k: 'door', x: W / 2, w: Math.min(house ? 1.2 : 1.5, W - 0.9), arch: prog.portal });
    } else if (s.street && prog.shops.has(key)) {
      out.mod = 'shop';
      return out;
    } else if (!house && s.street && hh > 0.86) {
      out.mod = 'rustic'; out.poster = hh > 0.93;
      return out;
    } else {
      const f = windowFrag(prog, info, s, 'g', W, H, ends, simple, false);
      if (!f) { out.mod = 'wall'; return out; }
      spec.push(f);
    }
    if (prog.rust && street && out.mod === 'panel') {
      const holes = spec.map((f) => (f.k === 'door' ? [f.x - f.w / 2 - 0.55, f.x + f.w / 2 + 0.55, 3.7] : [f.x - f.w / 2 - 0.3, f.x + f.w / 2 + 0.3, f.y + f.h + 0.4]));
      spec.push({ k: 'rust', holes });
    }
  } else if (s.street && prog.bay && prog.bay.key === key && L <= prog.bay.to && L <= top - 1 && W >= 2.6) {
    const last = Math.min(prog.bay.to, top - 1);
    spec.push({ k: 'bay', x: W / 2, w: clamp(W - 0.8, 1.5, 1.9), out: 0.62, from: L === 1, to: L === last });
  } else if (s.street && prog.cols.has(key) && cls === 'n' && W >= 2.0) {
    spec.push({ k: 'balc', x: W / 2, w: clamp(W * 0.42, 1.0, 1.3), h: Math.min(H - 0.35, 2.55), rail: prog.rail, slab: 0.75 });
  } else if (s.street && prog.cols.has(key) && cls === 'm' && info.style === 'ornate' && L <= 3 && W >= 2.0) {
    spec.push({ k: 'jul', x: W / 2, w: clamp(W * 0.4, 0.95, 1.2), h: 2.3 });
  } else {
    const axis = s.street && (prog.ent.has(key) || prog.cols.has(key));
    const f = windowFrag(prog, info, s, cls, W, H, ends, simple, axis, topFrieze ? H - 0.58 : H - 0.38);
    if (!f) { out.mod = 'wall'; return out; }
    spec.push(f);
    // pas podokienny z reliefem pod oknami piano nobile
    if (prog.sillb && street && cls === 'n') spec.push({ k: 'frieze', kind: 'stucco', y: f.y - 0.56, h: 0.4, u0, u1 });
  }
  if (topFrieze) spec.push({ k: 'frieze', kind: info.wallMat === 'brick' ? 'brick' : 'stucco', y: H - 0.5, h: 0.4, u0, u1 });
  if (prog.stripe && street && info.wallMat === 'brick') spec.push({ k: 'stripe', ys: L === 0 ? [0.5, H - 0.6] : [0.02, 0.62] });
  if (!simple) {
    // narożniki wypukłe (boniowanie) i styk kamienic (lizena) — ta sama decyzja dla obu ścian narożnika
    if (prog.quoin && s.street) for (const at of ['m', 'c']) if (ends[at] === 'convex') spec.push({ k: 'quoin', at, w: 0.42 });
    if (prog.lizena) for (const at of ['m', 'c']) if (ends[at] === 'party') spec.push({ k: 'lizena', at });
  }
  // gzymsy kordonowe: nad parterem, a w bogatych kamienicach także pod attyką
  out.string = prog.band && (L === 1 || (prog.bands2 && top >= 4 && L === top - 1));
  return out;
}
