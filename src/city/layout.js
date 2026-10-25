// Organiczny układ miasta — czyste dane (bez geometrii), deterministyczne z seeda.
//
//  1. Teren + rzeka (terrain.js), plac Ministerstwa w środku.
//  2. Mosty: dla każdego mostu pary "lustrzanych" ziaren po obu stronach osi,
//     więc dwusieczna Voronoi = ulica, która przechodzi płynnie w most.
//  3. Poisson-disc + 2× relaksacja Lloyda → nieregularne, ale "zdrowe" komórki.
//  4. Diagram Voronoi, przycięcie komórek brzegami rzeki, zgrzanie wierzchołków
//     i zwinięcie krótkich krawędzi (ulice = wspólne krawędzie komórek).
//  5. Komórki Voronoi wyznaczają ulice i strefy (kamienice / domki / park /
//     plac). Same budynki powstają na nieregularnej siatce czworokątów (grid.js).
import { Rng, hash } from '../core/rng.js';
import { makeQuadGrid, classifyGrid, decorate, makeChunks } from './grid.js';
import { makeRoutes } from './routes.js';
import { growRoads } from './roads.js';
import { RoadNet } from './roadnet.js';
import { Terrain } from './terrain.js';

export const HALF = 520; // wyspa ~0,45 km² lądu (było 460)

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polyCentroid(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length];
    const c = x0 * z1 - x1 * z0;
    a += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c;
  }
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

// zachowuje punkty z nx*x + nz*z <= c (Sutherland–Hodgman)
function clipPoly(poly, nx, nz, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    if (da <= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Odsunięcie wielokąta do środka o różne odległości na każdej krawędzi.
export function offsetPoly(q, d) {
  const n = q.length, c = polyCentroid(q);
  const lines = [];
  for (let k = 0; k < n; k++) {
    const a = q[k], b = q[(k + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    let nx = -dz / l, nz = dx / l;
    if ((c[0] - (a[0] + b[0]) / 2) * nx + (c[1] - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
    lines.push({ p: [a[0] + nx * d[k], a[1] + nz * d[k]], d: [dx / l, dz / l], n: [nx, nz] });
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const L1 = lines[(k + n - 1) % n], L2 = lines[k];
    const den = L1.d[0] * L2.d[1] - L1.d[1] * L2.d[0];
    if (Math.abs(den) < 1e-6) { out.push(L2.p); continue; }
    const t = ((L2.p[0] - L1.p[0]) * L2.d[1] - (L2.p[1] - L1.p[1]) * L2.d[0]) / den;
    out.push([L1.p[0] + L1.d[0] * t, L1.p[1] + L1.d[1] * t]);
  }
  out.normals = lines.map((l) => l.n);
  return out;
}

// krawędzie nie mogą się "przewrócić" ani zniknąć
function offsetValid(orig, off, minLen = 3) {
  const n = orig.length;
  for (let k = 0; k < n; k++) {
    const a = orig[k], b = orig[(k + 1) % n], c = off[k], d = off[(k + 1) % n];
    const dot = (b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]);
    if (dot <= 0 || dist(c, d) < minLen) return false;
  }
  return polyArea(off) > 50;
}

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function inradius(poly, c) {
  let r = 1e9;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    r = Math.min(r, Math.abs((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / l);
  }
  return r;
}

// ── mosty ───────────────────────────────────────────────────────────────────
function makeBridges(terrain, rng) {
  const out = [];
  const P = terrain.pts, cand = [];
  for (let x = -HALF; x <= HALF; x += 10) {
    for (let i = 0; i < P.length - 1; i++) {
      if (x < P[i][0] || x > P[i + 1][0]) continue;
      const p = lerp2(P[i], P[i + 1], (x - P[i][0]) / (P[i + 1][0] - P[i][0]));
      if (terrain.inland(p[0], p[1]) > 70) cand.push(x);
    }
  }
  const xs = cand.length ? [0.2, 0.8].map((f) => cand[Math.floor(f * (cand.length - 1))]) : [];
  for (const x0 of xs) {
    const x = x0 + rng.float(-15, 15);
    const r = terrain.river(x, terrain.pts[0][1]);
    // punkt na osi rzeki o danym x
    let best = null;
    const P = terrain.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (x >= a[0] && x <= b[0]) {
        const t = (x - a[0]) / (b[0] - a[0]);
        best = { p: lerp2(a, b, t), tx: b[0] - a[0], tz: b[1] - a[1] };
      }
    }
    if (!best) continue;
    void r;
    const tl = Math.hypot(best.tx, best.tz);
    const T = [best.tx / tl, best.tz / tl], Nn = [-T[1], T[0]];
    const skew = rng.float(-0.22, 0.22), c = Math.cos(skew), s = Math.sin(skew);
    const A = [Nn[0] * c - Nn[1] * s, Nn[0] * s + Nn[1] * c];
    const perp = [-A[1], A[0]];
    const L = terrain.hw / Math.abs(A[0] * Nn[0] + A[1] * Nn[1]) + 0.2;
    out.push({ p: best.p, axis: A, perp, L, width: 12, e0: [best.p[0] - A[0] * L, best.p[1] - A[1] * L], e1: [best.p[0] + A[0] * L, best.p[1] + A[1] * L] });
  }
  return out;
}

// most autostrady: odcinki nad korytem dostają flagę bridge, a w miejscu
// przecięcia z osią rzeki powstaje prosty most (jak mosty ulic)
function highwayBridge(terrain, streets) {
  // przejazd nad korytem: od pierwszego do ostatniego punktu autostrady nad wodą
  let first = null, last = null, rw = 5.5;
  for (const st of streets) {
    if (st.type !== 'H') continue;
    let over = false;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = st.a[0] + (st.b[0] - st.a[0]) * t, z = st.a[1] + (st.b[1] - st.a[1]) * t;
      if (terrain.river(x, z).d >= terrain.hw) continue;
      over = true;
      const k = (st.s0 || 0) + t * Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]);
      if (!first || k < first.k) first = { k, p: [x, z] };
      if (!last || k > last.k) last = { k, p: [x, z] };
    }
    if (over || terrain.river((st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2).d < terrain.hw + 2) { st.bridge = true; rw = st.rw; }
  }
  if (!first || terrain.inland(first.p[0], first.p[1]) < 24) return null;
  const d = [last.p[0] - first.p[0], last.p[1] - first.p[1]], l = Math.hypot(d[0], d[1]) || 1;
  const A = [d[0] / l, d[1] / l], L = l / 2 + 1.5;
  const p = [(first.p[0] + last.p[0]) / 2, (first.p[1] + last.p[1]) / 2];
  return { p, axis: A, perp: [-A[1], A[0]], L, width: 2 * rw + 5, highway: true, e0: [p[0] - A[0] * L, p[1] - A[1] * L], e1: [p[0] + A[0] * L, p[1] + A[1] * L] };
}

// ── ziarna Voronoi ──────────────────────────────────────────────────────────
function seedAllowed(x, z, terrain, bridges, center) {
  if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8) return false;
  if (terrain.inland(x, z) < 45) return false;
  if (terrain.river(x, z).d < terrain.hw + 24) return false;
  if (Math.hypot(x - center[0], z - center[1]) < 95) return false;
  for (const b of bridges) {
    const dx = x - b.p[0], dz = z - b.p[1];
    const along = dx * b.axis[0] + dz * b.axis[1], across = dx * b.perp[0] + dz * b.perp[1];
    if (Math.abs(along) < b.L + 90 && Math.abs(across) < 46) return false;
  }
  return true;
}

function placeSeeds(terrain, bridges, center, rng) {
  const seeds = [{ x: center[0], z: center[1], fixed: true, plaza: true }];
  for (const b of bridges)
    for (const s of [-1, 1])
      for (const d of [30, 85])
        for (const q of [-1, 1]) {
          const along = s * (b.L + d);
          seeds.push({ x: b.p[0] + b.axis[0] * along + b.perp[0] * 36 * q, z: b.p[1] + b.axis[1] * along + b.perp[1] * 36 * q, fixed: true });
        }
  const minD = 66; // rzadsze ulice główne (Voronoi)
  for (let i = 0; i < 9000; i++) {
    const x = rng.float(-HALF + 10, HALF - 10), z = rng.float(-HALF + 10, HALF - 10);
    if (!seedAllowed(x, z, terrain, bridges, center)) continue;
    let ok = true;
    for (const s of seeds) if ((s.x - x) ** 2 + (s.z - z) ** 2 < minD * minD) { ok = false; break; }
    if (ok) seeds.push({ x, z, fixed: false });
  }
  return seeds;
}

function voronoi(seeds) {
  const box = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
  return seeds.map((s, i) => {
    let poly = box;
    const near = [];
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const d2 = (seeds[j].x - s.x) ** 2 + (seeds[j].z - s.z) ** 2;
      if (d2 < 360 * 360) near.push([d2, seeds[j]]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, o] of near) {
      // |p-s|² <= |p-o|²  ⇔  2(o-s)·p <= |o|² - |s|²
      poly = clipPoly(poly, 2 * (o.x - s.x), 2 * (o.z - s.z), o.x * o.x + o.z * o.z - s.x * s.x - s.z * s.z);
      if (poly.length < 3) break;
    }
    return poly;
  });
}

function clipRiver(poly, seed, terrain) {
  const P = terrain.pts;
  for (let i = 0; i < P.length - 1 && poly.length >= 3; i++) {
    const a = P[i], b = P[i + 1];
    let near = false;
    for (const v of poly) {
      const r = terrain.river(v[0], v[1]);
      if (r.seg === i && r.d < terrain.hw + 0.5) { near = true; break; }
    }
    if (!near) {
      const segLen = dist(a, b);
      for (let s = 0; s <= segLen && !near; s += 8) if (pointInPoly(poly, ...lerp2(a, b, s / segLen))) near = true;
    }
    if (!near) continue;
    const side = (b[0] - a[0]) * (seed.z - a[1]) - (b[1] - a[1]) * (seed.x - a[0]) > 0 ? 1 : -1;
    // brzeg po stronie ziarna
    const bank = side > 0 ? terrain.left : terrain.right;
    const p0 = bank[i], p1 = bank[i + 1];
    let nx = -(p1[1] - p0[1]), nz = p1[0] - p0[0];
    // n ma wskazywać w stronę rzeki (to, co odcinamy)
    const mid = lerp2(a, b, 0.5);
    if ((mid[0] - p0[0]) * nx + (mid[1] - p0[1]) * nz < 0) { nx = -nx; nz = -nz; }
    poly = clipPoly(poly, nx, nz, nx * p0[0] + nz * p0[1]);
  }
  return poly;
}

function weld(cells, seeds, terrain) {
  const V = [], grid = new Map();
  const find = (x, z) => {
    const gx = Math.floor(x / 0.5), gz = Math.floor(z / 0.5);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${gx + dx},${gz + dz}`);
        if (list) for (const id of list) if (Math.abs(V[id].x - x) < 0.05 && Math.abs(V[id].z - z) < 0.05) return id;
      }
    const id = V.length;
    V.push({ x, z });
    const k = `${gx},${gz}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(id);
    return id;
  };
  const out = [];
  cells.forEach((poly, i) => {
    if (poly.length < 3 || polyArea(poly) < 300) return;
    const ids = [];
    for (const p of poly) {
      const id = find(p[0], p[1]);
      if (ids[ids.length - 1] !== id) ids.push(id);
    }
    if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    if (ids.length >= 3) out.push({ ids, seed: seeds[i] });
  });
  for (const v of V) {
    v.bank = Math.abs(terrain.river(v.x, v.z).d - terrain.hw) < 0.8;
    v.border = Math.abs(v.x) > HALF - 0.01 || Math.abs(v.z) > HALF - 0.01;
  }
  return { V, cells: out };
}

// zwijanie krótkich krawędzi — skrzyżowania zamiast "ząbków"
function collapse(g, minLen) {
  const { V } = g;
  for (let iter = 0; iter < 3000; iter++) {
    let best = null, bl = minLen;
    for (const c of g.cells)
      for (let k = 0; k < c.ids.length; k++) {
        const a = c.ids[k], b = c.ids[(k + 1) % c.ids.length];
        const l = Math.hypot(V[a].x - V[b].x, V[a].z - V[b].z);
        if (l < bl) { bl = l; best = [a, b]; }
      }
    if (!best) break;
    const [a, b] = best, A = V[a], B = V[b];
    const pri = (v) => (v.border ? 2 : v.bank ? 1 : 0);
    if (pri(B) > pri(A)) { A.x = B.x; A.z = B.z; A.bank = B.bank; A.border = B.border; }
    else if (pri(A) === pri(B)) { A.x = (A.x + B.x) / 2; A.z = (A.z + B.z) / 2; }
    for (const c of g.cells) {
      c.ids = c.ids.map((id) => (id === b ? a : id)).filter((id, k, arr) => id !== arr[(k + 1) % arr.length]);
    }
    g.cells = g.cells.filter((c) => c.ids.length >= 3);
  }
}

// ── ulice ───────────────────────────────────────────────────────────────────
const SPEC = {
  bank: { road: 0.35, walk: 4.5, bank: true },
  border: { road: 3, walk: 2.5 },
  bridge: { road: 3.5, walk: 2.5, avenue: true },
  lane: { road: 2.3, walk: 1.8 },
  street: { road: 3.3, walk: 2.6 },
  avenue: { road: 5.5, walk: 4.2, avenue: true },
};

// ─────────────────────────────────────────────────────────────────────────────
export function generateCity(seed = 1984) {
  const rng = new Rng(seed);
  const terrain = new Terrain(seed, HALF);
  const center = [0, 0];
  terrain.plaza = { x: center[0], z: center[1], r: 70, y: terrain.hills(center[0], center[1]) };
  const bridges = makeBridges(terrain, rng);
  const seeds = placeSeeds(terrain, bridges, center, rng);

  let cells = voronoi(seeds);
  for (let it = 0; it < 2; it++) {
    cells.forEach((c, i) => {
      const s = seeds[i];
      if (s.fixed || c.length < 3) return;
      const cc = polyCentroid(c);
      if (seedAllowed(cc[0], cc[1], terrain, bridges, center)) { s.x = cc[0]; s.z = cc[1]; }
    });
    cells = voronoi(seeds);
  }
  cells = cells.map((c, i) => (c.length >= 3 ? clipRiver(c, seeds[i], terrain) : c));
  const g = weld(cells, seeds, terrain);
  collapse(g, 15);

  const onAxis = (v) => bridges.some((b) => {
    const dx = v.x - b.p[0], dz = v.z - b.p[1];
    return Math.abs(dx * b.perp[0] + dz * b.perp[1]) < 2 && Math.abs(dx * b.axis[0] + dz * b.axis[1]) < 400;
  });
  const specs = new Map();
  const edgeSpec = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let s = specs.get(key);
    if (!s) {
      const va = g.V[a], vb = g.V[b];
      const r = new Rng(hash(seed, a, b, 5));
      if (va.bank && vb.bank) s = SPEC.bank;
      else if (va.border && vb.border) s = SPEC.border;
      else if (onAxis(va) && onAxis(vb)) s = SPEC.bridge;
      else s = r.weighted([[SPEC.lane, 2], [SPEC.street, 6], [SPEC.avenue, 1.3]]);
      specs.set(key, s);
    }
    return s;
  };

  const blocks = [];
  const seen = new Set();
  const vEdges = [], vSeen = new Set();
  for (const cell of g.cells) {
    const poly = cell.ids.map((id) => [g.V[id].x, g.V[id].z]);
    const n = poly.length;
    const sp = cell.ids.map((id, k) => edgeSpec(id, cell.ids[(k + 1) % n]));
    // krawędzie Voronoi = główne ulice (szkielet dla L-systemu Parish & Müller)
    cell.ids.forEach((id, k) => {
      const nx = cell.ids[(k + 1) % n], key = id < nx ? `${id}_${nx}` : `${nx}_${id}`;
      if (vSeen.has(key) || sp[k].bank || sp[k].border) return;
      vSeen.add(key);
      const a = poly[k], b = poly[(k + 1) % n];
      if (terrain.inland(a[0], a[1]) < 30 || terrain.inland(b[0], b[1]) < 30) return;
      vEdges.push({ a, b, rw: sp[k].road >= 5 ? 4.2 : 3.4 });
    });
    cell.ids.forEach((id, k) => {
      const nx = cell.ids[(k + 1) % n], key = id < nx ? `${id}_${nx}` : `${nx}_${id}`;
      if (seen.has(key) || sp[k].bank) return;
      seen.add(key);
    });
    const curb = offsetPoly(poly, sp.map((s) => s.road));
    const bline = offsetPoly(poly, sp.map((s) => s.road + s.walk));
    const ok = offsetValid(poly, curb) && offsetValid(curb, bline);
    const c = polyCentroid(poly);
    const blk = { id: blocks.length, poly, specs: sp, curb: ok ? curb : poly, bline: ok ? bline : poly, center: c, bc: polyCentroid(ok ? bline : poly) };
    const br = new Rng(hash(seed, Math.round(c[0] * 10), Math.round(c[1] * 10)));
    const rIn = inradius(blk.bline, blk.bc);
    const dC = Math.hypot(c[0] - center[0], c[1] - center[1]);
    if (cell.seed.plaza) blk.kind = 'plaza';
    else if (!ok || rIn < 13 || polyArea(blk.bline) < 1400 || br.chance(0.1)) blk.kind = 'park';
    else if (br.chance(Math.max(0.12, Math.min(0.92, 1.3 - dC / 430))) && rIn > 22) blk.kind = 'tenement';
    else blk.kind = 'houses';
    // dzika przyroda przy brzegu wyspy
    if (blk.kind !== 'plaza' && terrain.inland(c[0], c[1]) < 150 && br.chance(0.75)) blk.kind = 'nature';
    cell.seed.kind = blk.kind;
    if (blk.kind === 'plaza') fillPlaza(blk, terrain);
    blocks.push(blk);
  }
  for (const s of seeds) if (!s.kind) s.kind = 'houses';

  const monuments = blocks
    .filter((b) => b.kind === 'park' && polyArea(b.bline) > 2500 && terrain.inland(b.bc[0], b.bc[1]) > 40)
    .map((b, i) => ({ p: b.bc, kind: i % 2 ? 'fountain' : 'monument' }));
  const plaza = blocks.find((b) => b.kind === 'plaza');
  // billboardy z hasłami Partii wokół Ministerstwa + portret na szczycie
  // słupy reklamowe wokół rynku
  const billboards = [];
  const hs0 = plaza.ministry.tiers[0], pc = [terrain.plaza.x, terrain.plaza.z];
  ['war', 'freedom', 'ignorance', 'bb4'].forEach((name, i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, d = [Math.cos(a), Math.sin(a)];
    const r0 = hs0 * 0.55 + 12;
    billboards.push({ p: [pc[0] + d[0] * r0, pc[1] + d[1] * r0], n: [-d[0], -d[1]], e: [-d[1], d[0]], name, y: 0, size: name.startsWith('bb') ? [5, 10] : [12, 3] });
  });

  // start: na środku mostu najbliżej centrum, twarzą w stronę placu
  const b0 = bridges.reduce((a, b) => (Math.abs(b.p[0]) < Math.abs(a.p[0]) ? b : a), bridges[0]);
  const toP = [plaza.center[0] - b0.p[0], plaza.center[1] - b0.p[1]];
  const sgn = toP[0] * b0.axis[0] + toP[1] * b0.axis[1] > 0 ? 1 : -1;
  const spawn = { x: b0.p[0] + b0.perp[0] * 2, z: b0.p[1] + b0.perp[1] * 2, yaw: Math.atan2(-b0.axis[0] * sgn, -b0.axis[1] * sgn) };

  const routes = makeRoutes(seed, terrain);
  // autostrada (na ziemi) wchodzi do sieci jako szeroka droga — L-system łączy się z nią
  const hwEdges = [];
  let s0 = 0;
  const HP = routes.highway.pts;
  for (let i = 0; i < HP.length - 1; i++) {
    const a = HP[i], b = HP[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (terrain.inland(a[0], a[1]) > 24 && terrain.inland(b[0], b[1]) > 24) hwEdges.push({ a, b, rw: 5.5, type: 'H', s0 });
    s0 += L;
  }
  const streets = growRoads(seed, terrain, bridges, center, [...hwEdges, ...vEdges]);
  // nawierzchnia: bruk w mieście, ubita droga w lesie, asfalt na autostradzie
  const kindAt = (x, z) => {
    let best = null, bd = 1e18;
    for (const sd of seeds) { const d = (sd.x - x) ** 2 + (sd.z - z) ** 2; if (d < bd) { bd = d; best = sd; } }
    return best ? best.kind : 'houses';
  };
  for (const st of streets) {
    const mx = (st.a[0] + st.b[0]) / 2, mz = (st.a[1] + st.b[1]) / 2;
    st.mat = kindAt(mx, mz) === 'nature' || terrain.inland(mx, mz) < 40 ? 'dirt' : 'cobble';
    if (st.type === 'H' || st.bridge) st.mat = 'cobble';
    st.town = st.mat === 'cobble' && st.type !== 'H';
  }
  // autostrada nad rzeką: most zamiast jezdni położonej na wodzie
  const hwBridge = highwayBridge(terrain, streets);
  if (hwBridge) bridges.push(hwBridge);
  const roads = new RoadNet(streets);
  const extras = makeExtras(terrain, routes, rng);
  const city = { seed, blocks, terrain, bridges, spawn, streets, roads, seedList: seeds, monuments, billboards, routes, extras, size: 2 * HALF, half: HALF };
  city.grid = makeQuadGrid(seed, HALF);
  classifyGrid(city);
  decorate(city);
  city.chunks = makeChunks(city);
  return city;
}

// ── plac Ministerstwa ───────────────────────────────────────────────────────
function fillPlaza(blk, terrain) {
  const r = inradius(blk.curb, [terrain.plaza.x, terrain.plaza.z]);
  const hs = Math.max(22, Math.min(46, r * 0.55));
  blk.ministry = { tiers: [1, 0.79, 0.6, 0.42].map((k) => hs * k), tierH: 22, y: terrain.plaza.y };
}

// ── latarnia morska, molo, dworzec z pociągiem ──────────────────────────────
function makeExtras(T, routes, rng) {
  const out = [];
  const coastPt = (a, inset) => { const r = T.coastR(a) - inset; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const far = (p, d) => routes.highway.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > d) && routes.rail.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > d) && T.river(p[0], p[1]).d > 60;
  let la = rng.float(0, Math.PI * 2);
  for (let i = 0; i < 24 && !far(coastPt(la, 6), 80); i++) la += 0.27;
  out.push({ kind: 'lighthouse', p: coastPt(la, 6), clear: 12 });
  for (let k = 0; k < 2; k++) {
    let a = la + 1.6 + k * 2.2;
    for (let i = 0; i < 24 && !far(coastPt(a, 30), 60); i++) a += 0.2;
    const p = coastPt(a, 30), o = coastPt(a, -60);
    const L = Math.hypot(o[0] - p[0], o[1] - p[1]);
    const e = [(o[0] - p[0]) / L, (o[1] - p[1]) / L];
    out.push({ kind: 'pier', p, e, len: L, clear: 6 });
  }
  const R = routes.rail, i = R.station;
  const a = R.pts[i - 5], b = R.pts[i + 5];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-e[1], e[0]];
  out.push({ kind: 'station', p: R.pts[i], e, n, y: R.y[i], clear: 34 });
  return out;
}
