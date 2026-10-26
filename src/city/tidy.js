// ─────────────────────────────────────────────────────────────────────────────
//  PORZĄDKOWANIE SIECI ULIC
//  Surowa sieć (Voronoi + L-system) składa się z wielu krótkich, prawie
//  współliniowych odcinków i ślepych zaułków po kilka metrów. Tu:
//   1. współliniowe łańcuchy bez rozgałęzień łączą się w jeden prosty odcinek,
//   2. krótkie ślepe uliczki z L-systemu znikają,
//   3. odcinki prawie równoległe i bardzo blisko siebie (dublowane ulice) znikają.
//  Mosty, autostrada i ulice na mostach nigdy nie są ruszane.
// ─────────────────────────────────────────────────────────────────────────────
const EPS = 0.6;

const keyOf = (p) => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`;

function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return { d: Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t), t };
}

// stopień węzła: ile odcinków kończy się w punkcie lub przechodzi przez niego (T-skrzyżowanie)
function nodeDegrees(segs) {
  const cell = 24, grid = new Map();
  const put = (s, i) => {
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - 2) / cell), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + 2) / cell);
    const z0 = Math.floor((Math.min(s.a[1], s.b[1]) - 2) / cell), z1 = Math.floor((Math.max(s.a[1], s.b[1]) + 2) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx * 100003 + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  };
  segs.forEach(put);
  const at = (p) => grid.get(Math.floor(p[0] / cell) * 100003 + Math.floor(p[1] / cell)) || [];
  return (p, ignore = -1) => {
    let deg = 0;
    const seen = new Set();
    for (const i of at(p)) {
      if (i === ignore || seen.has(i)) continue;
      seen.add(i);
      const s = segs[i];
      if (!s) continue;
      const da = Math.hypot(s.a[0] - p[0], s.a[1] - p[1]), db = Math.hypot(s.b[0] - p[0], s.b[1] - p[1]);
      if (da < 1.2 || db < 1.2) deg++;
      else if (distToSeg(p, s.a, s.b).d < 1.2) deg += 2; // przechodzi środkiem: węzeł jest skrzyżowaniem
    }
    return deg;
  };
}

const free = (s) => s.bridge || s.type === 'H';
const angleOf = (s) => Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);

export function tidyStreets(streets, { minStub = 30, merge = true } = {}) {
  let segs = streets.map((s) => ({ ...s }));

  // 1. ślepe uliczki z L-systemu poniżej minStub (iteracyjnie: po usunięciu może powstać nowa)
  for (let pass = 0; pass < 3; pass++) {
    const deg = nodeDegrees(segs);
    let removed = 0;
    const out = [];
    segs.forEach((s, i) => {
      if (free(s) || !s.gen) { out.push(s); return; }
      const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const da = deg(s.a, i), db = deg(s.b, i);
      if (L < minStub && (da === 0 || db === 0)) { removed++; segs[i] = null; return; }
      out.push(s);
    });
    segs = out;
    if (!removed) break;
  }

  // 2. łączenie współliniowych łańcuchów (węzeł stopnia 2, kąt < 7°, środek blisko cięciwy)
  if (merge) {
    for (let pass = 0; pass < 4; pass++) {
      const deg = nodeDegrees(segs);
      const ends = new Map();
      segs.forEach((s, i) => {
        for (const [p, e] of [[s.a, 'a'], [s.b, 'b']]) { const k = keyOf(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push([i, e]); }
      });
      const used = new Set();
      const next = [];
      let merged = 0;
      for (let i = 0; i < segs.length; i++) {
        if (used.has(i)) continue;
        used.add(i);
        const s = segs[i];
        if (free(s)) { next.push(s); continue; }
        let cur = { ...s };
        for (let it = 0; it < 12; it++) {
          // szukamy sąsiada na końcu b węzła stopnia 2
          const list = (ends.get(keyOf(cur.b)) || []).filter(([j]) => j !== i && !used.has(j));
          if (list.length !== 1 || deg(cur.b, -1) !== 2) break;
          const [j, e] = list[0], o = segs[j];
          if (free(o) || o.rw !== cur.rw || o.type !== cur.type) break;
          const far = e === 'a' ? o.b : o.a;
          const a1 = angleOf(cur), a2 = Math.atan2(far[1] - cur.b[1], far[0] - cur.b[0]);
          let d = Math.abs(a1 - a2) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
          if (d > 0.12) break;
          const dev = distToSeg(cur.b, cur.a, far).d;
          if (dev > 1.6) break;
          cur = { ...cur, b: far };
          used.add(j); merged++;
        }
        next.push(cur);
      }
      segs = next;
      if (!merged) break;
    }
  }
  return segs;
}
