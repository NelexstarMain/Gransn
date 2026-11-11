// ─────────────────────────────────────────────────────────────────────────────
//  PODZIAŁ KWARTAŁÓW — po zbudowaniu sieci ulic (Voronoi + L-system + netfix + łuki).
//
//  Kwartał = ściana grafu planarnego ulic (obchód półkrawędzi: w każdym węźle skręt
//  w najbliższą krawędź zgodnie z ruchem wskazówek zegara). Za duże kwartały w zabudowie
//  miejskiej dostają uliczkę w poprzek dłuższego wymiaru: przez środek ciężkości,
//  prostopadle do osi głównej, od ulicy do ulicy. Uliczka jest przyjmowana tylko wtedy,
//  gdy wchodzi w obie ulice pod rozsądnym kątem, nie blisko istniejącego skrzyżowania,
//  nie biegnie wzdłuż innej jezdni i omija wodę, tory, rynek, kościół. Trafione ulice są
//  dzielone w miejscu styku (powstaje prawdziwe skrzyżowanie). Dwa przebiegi: połówki
//  bardzo dużych kwartałów dzielą się jeszcze raz.
// ─────────────────────────────────────────────────────────────────────────────
import { hash } from '../core/rng.js';
import { RoadNet } from './roadnet.js';
import { polyDist } from './routes.js';

const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);

function faces(streets) {
  const nodes = new Map(), half = [];
  const node = (p) => { const k = key(p); let n = nodes.get(k); if (!n) nodes.set(k, (n = { p, out: [] })); return n; };
  streets.forEach((s, si) => {
    const A = node(s.a), B = node(s.b);
    if (A === B) return;
    const h0 = { si, from: A, to: B, ang: Math.atan2(B.p[1] - A.p[1], B.p[0] - A.p[0]), used: false }, h1 = { si, from: B, to: A, ang: Math.atan2(A.p[1] - B.p[1], A.p[0] - B.p[0]), used: false };
    h0.twin = h1; h1.twin = h0;
    A.out.push(h0); B.out.push(h1); half.push(h0, h1);
  });
  for (const n of nodes.values()) { n.out.sort((a, b) => a.ang - b.ang); n.out.forEach((h, i) => { h.idx = i; }); }
  const out = [];
  for (const h of half) {
    if (h.used) continue;
    const loop = [];
    let c = h, guard = 0;
    while (!c.used && guard++ < 4000) {
      c.used = true; loop.push(c);
      const o = c.to.out; // następna: poprzednia (zgodnie z zegarem) względem krawędzi powrotnej
      c = o[(c.twin.idx + o.length - 1) % o.length];
    }
    let ar = 0;
    for (const e of loop) ar += e.from.p[0] * e.to.p[1] - e.to.p[0] * e.from.p[1];
    if (ar > 0) out.push({ loop, area: ar / 2 });
  }
  return { faces: out, nodes };
}

export function subdivideBlocks(city0) {
  const { streets, terrain: T, seed, kindAt, plan, extras, rail } = city0;
  let added = 0;
  for (let pass = 0; pass < 2; pass++) {
    const net = new RoadNet(streets), { faces: F, nodes } = faces(streets);
    const nodeList = [...nodes.values()].map((n) => n.p);
    const nearNode = (p) => { let d = 1e9; for (const q of nodeList) d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1])); return d; };
    for (const f of F) {
      if (f.area < 6200 || f.area > 60000) continue;
      const P = f.loop.map((e) => e.from.p);
      let per = 0, cx = 0, cz = 0, wsum = 0;
      for (const e of f.loop) { const l = Math.hypot(e.to.p[0] - e.from.p[0], e.to.p[1] - e.from.p[1]); per += l; cx += ((e.from.p[0] + e.to.p[0]) / 2) * l; cz += ((e.from.p[1] + e.to.p[1]) / 2) * l; wsum += l; }
      if ((4 * f.area) / per < 58) continue;
      cx /= wsum; cz /= wsum;
      const kind = kindAt(cx, cz);
      if (kind !== 'old' && kind !== 'tenement' && kind !== 'houses') continue;
      let sxx = 0, szz = 0, sxz = 0;
      for (const q of P) { const dx = q[0] - cx, dz = q[1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
      const hb = hash(seed, Math.round(cx), Math.round(cz), 4401 + pass);
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz) + ((hb & 255) / 255 - 0.5) * 0.2, ax = [Math.cos(ang), Math.sin(ang)], d = [-ax[1], ax[0]];
      let lo = 1e9, hi = -1e9;
      for (const q of P) { const t = (q[0] - cx) * ax[0] + (q[1] - cz) * ax[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
      for (const off of [0, 0.1, -0.1, 0.2, -0.2]) {
        const o = [cx + ax[0] * off * (hi - lo), cz + ax[1] * off * (hi - lo)];
        let t0 = -1e9, t1 = 1e9, e0 = null, e1 = null;
        for (const e of f.loop) {
          const a = e.from.p, b = e.to.p, ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den, u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
          if (u < 0 || u > 1) continue;
          if (t < 0) { if (t > t0) { t0 = t; e0 = e; } } else if (t < t1) { t1 = t; e1 = e; }
        }
        if (!e0 || !e1 || e0.si === e1.si) continue;
        const L = t1 - t0;
        if (L < 36 || L > 170) continue;
        const a = [o[0] + d[0] * t0, o[1] + d[1] * t0], b = [o[0] + d[0] * t1, o[1] + d[1] * t1];
        let ok = nearNode(a) > 13 && nearNode(b) > 13;
        for (const e of [e0, e1]) {
          const s = streets[e.si], l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
          if (s.bridge || s.type === 'H' || !s.town || Math.abs(((s.b[0] - s.a[0]) * d[0] + (s.b[1] - s.a[1]) * d[1]) / l) > 0.62) ok = false;
        }
        for (let t = 0; ok && t <= L; t += 5) {
          const x = a[0] + d[0] * t, z = a[1] + d[1] * t;
          if (T.inland(x, z) < 45 || T.river(x, z).d < T.hw + 10 || polyDist(rail, x, z) < 10) ok = false;
          else if (plan && plan.overrideKind(x, z)) ok = false;
          else if (extras.some((ex) => Math.hypot(ex.p[0] - x, ex.p[1] - z) < ex.clear + 8)) ok = false;
          else if (t > 14 && t < L - 14 && net.clearance(x, z) < 15) ok = false;
        }
        if (!ok) continue;
        // skrzyżowania: trafione ulice dzielą się w punkcie styku
        for (const [e, p] of [[e0, a], [e1, b]]) { const s = streets[e.si], tail = { ...s, a: p, b: s.b }; s.b = p; streets.push(tail); }
        const n = Math.max(2, Math.round(L / 10));
        for (let i = 0; i < n; i++) streets.push({ a: i === 0 ? a : [a[0] + (d[0] * L * i) / n, a[1] + (d[1] * L * i) / n], b: i === n - 1 ? b : [a[0] + (d[0] * L * (i + 1)) / n, a[1] + (d[1] * L * (i + 1)) / n], rw: 3.0, type: 's', mat: 'cobble', town: true, lane: true });
        added++;
        break;
      }
    }
  }
  return added;
}
