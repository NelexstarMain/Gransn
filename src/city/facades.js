// ─────────────────────────────────────────────────────────────────────────────
//  FASADY: odcinki ścian (środek krawędzi → środek czworokąta) łączone w ciągi.
//  Jedna fasada = prosty fragment obrysu jednego budynku na jednym piętrze.
//  Dzięki temu układ okien i drzwi można liczyć dla całej fasady, a nie
//  losować osobno dla każdego odcinka ~2,5 m.
//
//  Odcinek ma klucz (a, nb, q, side) — ten sam na każdym piętrze, więc kolumny
//  okien i balkonów leżą dokładnie jedna nad drugą.
// ─────────────────────────────────────────────────────────────────────────────
import { quadGeom, filled, T_BLD, T_STREET, T_PLAZA, T_COURT } from './grid.js';

const CORNER = (40 * Math.PI) / 180; // zagięcie obrysu większe niż 40° = narożnik
const wrap = (d) => (d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d);
const keyP = (p, L) => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100) + ',' + L;

export const segKey = (a, nb, q, side, L) => (((a * 8191 + nb) * 65537 + q) * 2 + side) * 16 + L;

// Zbiera odcinki ścian całego miasta i łączy je w fasady. Wynik liczy się raz na
// miasto (każdy worker robi to sam i deterministycznie).
//  cornerA/cornerB: co dzieje się na końcach ciągu (kierunek: wypełnienie po prawej)
//  'through' = fasada biegnie dalej, 'convex'/'concave' = narożnik, 'party' = styk
//  z sąsiednim budynkiem, 'open' = koniec obrysu.
export function buildFacades(city) {
  const g = city.grid, nq = g.quads.length / 4;
  const segs = [];
  for (let q = 0; q < nq; q++) {
    const G = quadGeom(g, q), V = G.v;
    for (let i = 0; i < 4; i++) {
      const a = V[i];
      if (g.TY[a] !== T_BLD) continue;
      for (let L = 0; L < g.H[a]; L++) {
        if (!filled(g, a, L)) continue;
        for (const side of [0, 1]) {
          const nb = side === 0 ? V[(i + 1) % 4] : V[(i + 3) % 4];
          if (filled(g, nb, L)) continue;
          const f0 = side === 0 ? G.m[i] : G.m[(i + 3) % 4], f1 = G.c;
          const dx = f1[0] - f0[0], dz = f1[1] - f0[1];
          const flip = dx * (G.p[i][1] - f0[1]) - dz * (G.p[i][0] - f0[0]) > 0; // wypełnione po lewej → odwróć
          segs.push({
            a, nb, q, side, L, flip, bid: g.BID[a], w: Math.hypot(dx, dz),
            street: g.TY[nb] === T_STREET || g.TY[nb] === T_PLAZA || (g.TY[nb] === T_BLD && L === 0),
            court: g.TY[nb] === T_COURT,
            A: flip ? f1 : f0, B: flip ? f0 : f1, cornerA: 'through', cornerB: 'through',
            fid: -1, idx: 0, n: 1, s0: 0, len: 0,
          });
        }
      }
    }
  }
  const startAt = new Map(), endAt = new Map();
  const put = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  segs.forEach((s, i) => { put(startAt, keyP(s.A, s.L), i); put(endAt, keyP(s.B, s.L), i); });
  const heading = (s) => Math.atan2(s.B[1] - s.A[1], s.B[0] - s.A[0]);
  const closest = (s, list) => {
    let best = -1, bd = 1e9;
    for (const j of list) { const d = Math.abs(wrap(heading(segs[j]) - heading(s))); if (d < bd) { bd = d; best = j; } }
    return best;
  };
  const prevOf = (s) => closest({ ...s, B: s.A, A: s.B }, (endAt.get(keyP(s.A, s.L)) || []).filter((j) => segs[j].bid === s.bid));
  const used = new Uint8Array(segs.length);
  const facades = [];
  const walk = (start) => {
    const chain = [start];
    used[start] = 1;
    for (let cur = start; ;) {
      const s = segs[cur];
      const cand = (startAt.get(keyP(s.B, s.L)) || []).filter((j) => !used[j] && segs[j].bid === s.bid);
      if (!cand.length) break;
      const next = closest(s, cand);
      used[next] = 1;
      chain.push(next);
      cur = next;
    }
    return chain;
  };
  const cut = (chain, closed) => {
    // ciąg → fasady: nowa fasada za każdym narożnikiem
    const turns = chain.map((j, k) => (k === 0 ? (closed ? wrap(heading(segs[j]) - heading(segs[chain[chain.length - 1]])) : 0) : wrap(heading(segs[j]) - heading(segs[chain[k - 1]]))));
    const breaks = [];
    turns.forEach((t, k) => { if ((k > 0 || closed) && Math.abs(t) > CORNER) breaks.push(k); });
    if (!closed && breaks[0] !== 0) breaks.unshift(0);
    if (!breaks.length) breaks.push(0);
    breaks.forEach((from, bi) => {
      const to = bi + 1 < breaks.length ? breaks[bi + 1] : closed ? breaks[0] + chain.length : chain.length;
      const part = [];
      for (let k = from; k < to; k++) part.push(chain[k % chain.length]);
      if (!part.length) return;
      const f = { id: facades.length, bid: segs[part[0]].bid, L: segs[part[0]].L, segs: part, len: 0, street: false };
      let s0 = 0;
      part.forEach((j, idx) => {
        const s = segs[j];
        s.fid = f.id; s.idx = idx; s.n = part.length; s.s0 = s0; s0 += s.w;
        if (s.street) f.street = true;
      });
      f.len = s0;
      for (const j of part) segs[j].len = s0;
      const first = segs[part[0]], last = segs[part[part.length - 1]];
      const kind = (t) => (t < 0 ? 'convex' : 'concave');
      if (from > 0 || closed) first.cornerA = Math.abs(turns[from]) > CORNER ? kind(turns[from]) : 'through';
      else first.cornerA = (endAt.get(keyP(first.A, f.L)) || []).some((j) => segs[j].bid !== f.bid) ? 'party' : 'open';
      const nk = to % chain.length;
      if (to < chain.length || closed) last.cornerB = Math.abs(turns[nk]) > CORNER ? kind(turns[nk]) : 'through';
      else last.cornerB = (startAt.get(keyP(last.B, f.L)) || []).some((j) => segs[j].bid !== f.bid) ? 'party' : 'open';
      facades.push(f);
    });
  };
  for (let s = 0; s < segs.length; s++) {
    if (used[s] || prevOf(segs[s]) >= 0) continue; // najpierw początki otwartych ciągów
    cut(walk(s), false);
  }
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue; // reszta to zamknięte pętle obrysu
    cut(walk(s), true);
  }
  const byKey = new Map(segs.map((s) => [segKey(s.a, s.nb, s.q, s.side, s.L), s]));
  // odcinki pogrupowane per budynek; ground = parter od strony ulicy (wejścia, sklepy)
  const byBid = new Map(), ground = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const s of segs) {
    push(byBid, s.bid, s);
    if (s.L === 0 && s.street) push(ground, s.bid, s);
  }
  return { segs, facades, byBid, ground, at: (a, nb, q, side, L) => byKey.get(segKey(a, nb, q, side, L)) || null };
}

// Narożniki na końcach lokalnego x odcinka: x=0 to środek krawędzi (m), x=W to środek
// czworokąta (c). Kierunek ciągu może być odwrócony względem lokalnego x.
export function panelEnds(s) {
  return { m: s.flip ? s.cornerB : s.cornerA, c: s.flip ? s.cornerA : s.cornerB };
}

export function facadesOf(city) {
  return city.facades || (city.facades = buildFacades(city));
}
