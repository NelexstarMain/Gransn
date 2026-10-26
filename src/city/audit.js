// ─────────────────────────────────────────────────────────────────────────────
//  AUDYT SIECI ULIC — mierzy błędy, które widać z góry i na jezdni.
//  Używany w dwóch miejscach:
//   • generator ulic (roads.js) puszcza kilka wariantów L-systemu i wybiera ten
//     z najlepszym wynikiem (`score`),
//   • scripts/audit-roads.mjs drukuje liczby dla wielu ziaren.
//  Wszystko czyste i deterministyczne (bez RNG).
// ─────────────────────────────────────────────────────────────────────────────
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function projSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return { t, d: Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t), q: [a[0] + dx * t, a[1] + dz * t] };
}

// przecięcie wnętrz dwóch odcinków (bez wspólnych końców)
export function crossPoint(a, b, c, d, eps = 1e-3) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { t, u, p: [a[0] + r[0] * t, a[1] + r[1] * t] };
}

// indeks przestrzenny odcinków (kratka)
export function segIndex(segs, cell = 30, pad = 2) {
  const map = new Map();
  segs.forEach((s, i) => {
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - pad) / cell), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + pad) / cell);
    const z0 = Math.floor((Math.min(s.a[1], s.b[1]) - pad) / cell), z1 = Math.floor((Math.max(s.a[1], s.b[1]) + pad) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx * 100003 + gz; if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
  });
  return {
    near(p, r = 0) {
      const out = new Set();
      for (let gx = Math.floor((p[0] - r) / cell); gx <= Math.floor((p[0] + r) / cell); gx++)
        for (let gz = Math.floor((p[1] - r) / cell); gz <= Math.floor((p[1] + r) / cell); gz++) for (const i of map.get(gx * 100003 + gz) || []) out.add(i);
      return out;
    },
  };
}

const angleBetween = (u, v) => {
  const d = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
  return d;
};

// Wynik: liczniki błędów + `score` (mniej = lepiej). T — teren (inland), opcjonalnie.
export function auditStreets(streets, T = null) {
  const segs = streets, n = segs.length, idx = segIndex(segs);
  const m = { where: { gaps: [], close: [], sharp: [] }, segs: n, crossings: 0, unlinkedT: 0, gaps: 0, deadEnds: 0, shortDead: 0, islands: 0, islandSegs: 0, sharp: 0, close: 0, short: 0 };
  let tot = 0;
  segs.forEach((s) => { tot += dist(s.a, s.b); });
  m.km = tot / 1000;

  // przecięcia bez wspólnego węzła, T-skrzyżowania bez podziału, szczeliny
  segs.forEach((s, i) => {
    for (const j of idx.near([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], dist(s.a, s.b) / 2 + 4)) {
      if (j <= i) continue;
      const o = segs[j];
      if (s.bridge && o.bridge) continue;
      if (crossPoint(s.a, s.b, o.a, o.b)) m.crossings++;
    }
    for (const p of [s.a, s.b]) {
      let linked = false, nearest = 1e9;
      for (const j of idx.near(p, 8)) {
        if (j === i) continue;
        const o = segs[j];
        if (dist(p, o.a) < 1.2 || dist(p, o.b) < 1.2) { linked = true; continue; }
        const pr = projSeg(p, o.a, o.b);
        if (pr.d < 1.2) { m.unlinkedT++; linked = true; }
        else if (dist(o.a, s.a) > 1.2 && dist(o.a, s.b) > 1.2 && dist(o.b, s.a) > 1.2 && dist(o.b, s.b) > 1.2) nearest = Math.min(nearest, pr.d);
      }
      if (!linked && nearest < 9) { m.gaps++; m.where.gaps.push(p.map(Math.round)); }
    }
    if (dist(s.a, s.b) < 5 && !s.bridge) m.short++;
  });

  // stopnie węzłów (spawanie końców po 1,2 m) i ślepe uliczki
  const nodes = [], grid = new Map();
  const nodeAt = (p) => {
    const gx = Math.floor(p[0] / 2), gz = Math.floor(p[1] / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const id of grid.get((gx + i) * 100003 + gz + j) || []) if (dist(nodes[id].p, p) < 1.2) return id;
    const id = nodes.length; nodes.push({ p, e: [] });
    const k = gx * 100003 + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
    return id;
  };
  const ends = segs.map((s) => [nodeAt(s.a), nodeAt(s.b)]);
  ends.forEach(([a, b], i) => { nodes[a].e.push(i); nodes[b].e.push(i); });
  // T-skrzyżowanie „przechodzące” przez węzeł też liczy się jako połączenie
  nodes.forEach((nd, id) => {
    for (const j of idx.near(nd.p, 3)) { const o = segs[j]; if (ends[j][0] === id || ends[j][1] === id) continue; if (projSeg(nd.p, o.a, o.b).d < 1.2) nd.e.push(j, j); }
  });
  nodes.forEach((nd) => {
    const coast = T ? T.inland(nd.p[0], nd.p[1]) < 30 || T.river(nd.p[0], nd.p[1]).d < T.hw + 4 : false;
    if (nd.e.length === 1 && !coast) {
      const s = segs[nd.e[0]];
      if (s.bridge) return;
      m.deadEnds++;
      if (dist(s.a, s.b) < 40) m.shortDead++;
    }
    // ostre kąty
    if (nd.e.length >= 2) {
      const dirs = [];
      for (const i of nd.e) {
        const s = segs[i], far = dist(s.a, nd.p) < 1.2 ? s.b : dist(s.b, nd.p) < 1.2 ? s.a : null;
        if (far) dirs.push([far[0] - nd.p[0], far[1] - nd.p[1]]);
      }
      for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) if (angleBetween(dirs[i], dirs[j]) < 0.4) { m.sharp++; m.where.sharp.push(nd.p.map(Math.round)); i = dirs.length; break; }
    }
  });

  // spójność: wyspy poza największą składową
  const comp = new Int32Array(nodes.length).fill(-1), size = [];
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] >= 0) continue;
    const st = [i]; comp[i] = size.length; let c = 0;
    while (st.length) {
      const v = st.pop(); c++;
      for (const si of nodes[v].e) for (const w of ends[si]) if (comp[w] < 0) { comp[w] = size.length; st.push(w); }
    }
    size.push(c);
  }
  const big = size.indexOf(Math.max(...size, 0));
  m.islands = size.length - 1;
  segs.forEach((_, i) => { if (comp[ends[i][0]] !== big) m.islandSegs++; });

  // równoległe ulice zbyt blisko siebie (nie sąsiadujące w węźle)
  segs.forEach((s, i) => {
    if (s.bridge || s.type === 'H') return;
    const L = dist(s.a, s.b);
    if (L < 20) return;
    const ang = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
    let bad = 0, samples = 0;
    for (let t = 0.2; t <= 0.81; t += 0.3) {
      const p = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      samples++;
      for (const j of idx.near(p, 22)) {
        if (j === i) continue;
        const o = segs[j];
        if (o.bridge) continue;
        const pr = projSeg(p, o.a, o.b);
        if (pr.t <= 0.02 || pr.t >= 0.98) continue;
        const a2 = Math.atan2(o.b[1] - o.a[1], o.b[0] - o.a[0]);
        let da = Math.abs(ang - a2) % Math.PI; if (da > Math.PI / 2) da = Math.PI - da;
        if (da < 0.35 && pr.d < s.rw + o.rw + 12 && pr.d > 0.5) { bad++; break; }
      }
    }
    if (bad >= 2 && samples) { m.close++; m.where.close.push([Math.round((s.a[0] + s.b[0]) / 2), Math.round((s.a[1] + s.b[1]) / 2)]); }
  });

  m.score = m.crossings * 6 + m.unlinkedT * 3 + m.gaps * 5 + m.shortDead * 4 + m.deadEnds * 1.2 + m.islandSegs * 4 + m.sharp * 2 + m.close * 1.5 + m.short * 1;
  return m;
}
