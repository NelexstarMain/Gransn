// Składanie kwartału z modułów. Dla każdej komórki (przęsło × kondygnacja)
// wybieramy moduł regułami sąsiedztwa (lekka wersja Wave Function Collapse:
// brama ≠ obok drzwi, witryny w ciągu, balkony w osi, okna w pionie zgodne),
// budujemy Cage z czterech narożników komórki i odpalamy moduł.
import { Builder } from './builder.js';
import { Cage } from './cage.js';
import { M } from './modules.js';
import { SHOP_SIGNS, BIG_BROTHER } from './atlas.js';
import { Rng, hash } from '../core/rng.js';
import { HALF, MINISTRY } from '../city/layout.js';

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function place(b, name, cage, W, H, D, p) {
  b.cell(cage, W, H, D);
  M[name](b, W, H, D, p);
}

const STONE_TINTS = [[0.78, 0.75, 0.68], [0.7, 0.68, 0.63], [0.82, 0.8, 0.74]];
const FRAME_TINTS = [[0.34, 0.24, 0.17], [0.85, 0.83, 0.78], [0.26, 0.28, 0.24], [0.42, 0.3, 0.2]];
const DOOR_TINTS = [[0.3, 0.2, 0.13], [0.22, 0.26, 0.2], [0.36, 0.24, 0.14]];
const SIGN_TINTS = [[0.25, 0.3, 0.24], [0.38, 0.14, 0.12], [0.15, 0.17, 0.2]];
const ROOF_TINTS = [[0.42, 0.42, 0.42], [0.5, 0.36, 0.3], [0.36, 0.38, 0.4], [0.46, 0.44, 0.4]];

function glassTint(r) {
  return r.weighted([
    [[0.32, 0.36, 0.4], 6],
    [[0.78, 0.74, 0.64], 2], // firanki
    [[0.55, 0.44, 0.3], 1],  // zasłony
    [[0.16, 0.17, 0.18], 1], // ciemne
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
export function buildBlock(city, id) {
  const blk = city.blocks[id];
  const b = new Builder();
  if (blk.kind === 'plaza') buildPlaza(b, blk);
  else {
    buildStreetEdge(b, blk, 'slab');
    blk.lots.forEach((lot, i) => buildLot(b, blk, lot, i));
    // podwórze-studnia
    const C = blk.court;
    place(b, 'cobble', Cage.quad(C[0], C[1], C[3], C[2], 0.05, 1.05), dist(C[0], C[1]), 1, dist(C[0], C[3]), { step: 3 });
    for (const l of blk.lamps) placeLamp(b, l);
  }
  return b.finish();
}

function placeLamp(b, l) {
  place(b, 'lamp', Cage.oriented(l.p, l.e, l.n, 1, 1, 0.15, 6.15), 1, 6, 1, { metalTint: [0.17, 0.22, 0.19] });
}

function buildStreetEdge(b, blk, mat) {
  const K = blk.curb, Ki = blk.curbIn, B = blk.bline;
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    const L = dist(K[k], K[k1]);
    const n = Math.max(1, Math.round(L / 9));
    for (let i = 0; i < n; i++) {
      const ta = i / n, tb = (i + 1) / n;
      const ka = lerp2(K[k], K[k1], ta), kb = lerp2(K[k], K[k1], tb);
      const ia = lerp2(Ki[k], Ki[k1], ta), ib = lerp2(Ki[k], Ki[k1], tb);
      const ba = lerp2(B[k], B[k1], ta), bb = lerp2(B[k], B[k1], tb);
      place(b, 'curb', Cage.quad(ka, kb, ia, ib, 0, 0.16), dist(ka, kb), 0.16, 0.3, {});
      const D = (dist(ia, ba) + dist(ib, bb)) / 2;
      place(b, 'sidewalk', Cage.quad(ia, ib, ba, bb, 0, 0.15), dist(ia, ib), 0.15, D, { mat });
    }
  }
}

// ── jedna kamienica ─────────────────────────────────────────────────────────
function buildLot(b, blk, lot, li) {
  const r = new Rng(lot.seed);
  const lots = blk.lots;
  const prev = lots[(li + lots.length - 1) % lots.length], next = lots[(li + 1) % lots.length];
  const n = lot.bays;
  const style = lot.style;
  const levels = [0, lot.gH];
  for (let k = 1; k <= lot.upper; k++) levels.push(lot.gH + k * lot.fH);
  const top = levels[levels.length - 1];
  const eave = top + 0.7;

  b.setTint('plaster', lot.tint);
  b.setTint('brick', style === 'brick' ? [0.78, 0.6, 0.52] : [0.68, 0.52, 0.46]);
  b.setTint('stone', style === 'brick' ? [0.8, 0.77, 0.7] : STONE_TINTS[r.int(0, 2)]);
  const groundMat = style === 'brick' ? 'brick' : r.chance(0.5) ? 'stone' : 'plaster';
  const P = {
    style,
    wallMat: lot.wallMat,
    groundMat,
    frameTint: r.pick(FRAME_TINTS),
    doorTint: r.pick(DOOR_TINTS),
    metalTint: [0.2, 0.22, 0.21],
    signTint: r.pick(SIGN_TINTS),
    shopGlass: [0.3, 0.32, 0.33],
    variant: r.int(0, 1),
    bars: r.chance(0.35),
  };

  // — plan parteru —
  const ground = new Array(n).fill(null);
  if (lot.gateBay >= 0) ground[lot.gateBay] = 'gate';
  if (lot.doorBay >= 0) ground[lot.doorBay] = 'door';
  let shopRun = lot.shops;
  for (let i = 0; i < n; i++) {
    if (ground[i]) continue;
    if (i === lot.screenBay) { ground[i] = 'rustic'; continue; }
    if (shopRun && r.chance(0.85)) ground[i] = 'shop';
    else ground[i] = r.chance(0.55) ? 'window' : 'rustic';
  }
  // — plan pięter: symetryczny układ osi okiennych —
  const upperMod = style === 'ornate' ? 'ornate' : style === 'modern' ? 'modern' : 'window';
  const axis = new Array(n).fill(true);
  if (n >= 5 && style !== 'modern' && r.chance(0.4)) { axis[0] = false; axis[n - 1] = false; }
  const balc = lot.balcony && style !== 'modern' ? new Set(n % 2 ? [(n - 1) / 2] : [n / 2 - 1, n / 2]) : new Set();
  const glass = Array.from({ length: n * (lot.upper + 1) }, () => glassTint(r));
  const sign = r.pick(SHOP_SIGNS);

  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const Fa = lerp2(lot.f0, lot.f1, t0), Fb = lerp2(lot.f0, lot.f1, t1);
    const Ba = lerp2(lot.b0, lot.b1, t0), Bb = lerp2(lot.b0, lot.b1, t1);
    const W = dist(Fa, Fb), Wb = dist(Ba, Bb);
    const D = (dist(Fa, Ba) + dist(Fb, Bb)) / 2;

    for (let k = 0; k < levels.length - 1; k++) {
      const y0 = levels[k], y1 = levels[k + 1], H = y1 - y0;
      const p = { ...P, glassTint: glass[k * n + i] };
      const cage = Cage.quad(Fa, Fb, Ba, Bb, y0, y1);
      // front (ulica)
      let mod;
      if (k === 0) {
        mod = ground[i];
        p.ground = true;
        if (mod === 'shop') p.sign = i === 0 || ground[i - 1] !== 'shop' ? sign : null;
      } else if (!axis[i]) mod = 'wall';
      else if (balc.has(i) && k <= 2) mod = 'balcony';
      else mod = upperMod;
      place(b, mod, cage, W, H, D, p);
      if (k === 0 && i === lot.screenBay) place(b, 'telescreen', cage, W, H, D, p);
      else if (k === 0 && mod === 'rustic' && r.chance(0.35)) place(b, 'poster', cage, W, H, D, { name: r.pick(BIG_BROTHER), y: 0.9 });

      // tył (podwórze) — prostsze moduły, odwrócona orientacja kostki
      if (!(k === 0 && ground[i] === 'gate')) {
        const cb = Cage.quad(Bb, Ba, Fb, Fa, y0, y1);
        const pb = { ...p, simple: true, ground: false, groundMat: 'plaster', wallMat: style === 'brick' ? 'brick' : 'plaster', glassTint: glass[(k * n + i + 7) % glass.length] };
        let bm = 'window';
        if (k === 0 && i === lot.doorBay) bm = 'door';
        else if (Wb < 1.6) bm = 'wall';
        if (bm === 'door') pb.groundMat = pb.wallMat;
        place(b, bm, cb, Wb, H, D, pb);
      }
    }
    // gzymsy
    if (style !== 'modern') place(b, 'string', Cage.quad(Fa, Fb, Ba, Bb, lot.gH, lot.gH + 0.32), W, 0.32, D, P);
    place(b, 'cornice', Cage.quad(Fa, Fb, Ba, Bb, top, eave), W, 0.7, D, { style, consoles: style === 'ornate' });
    place(b, 'cornice', Cage.quad(Bb, Ba, Fb, Fa, top, eave), Wb, 0.7, D, { style: 'modern', mat: lot.wallMat });
    // lizeny na granicach kamienic
    if ((style === 'classic' || style === 'ornate') && (i === 0 || i === n - 1)) {
      const cg = Cage.quad(Fa, Fb, Ba, Bb, lot.gH + 0.32, top);
      if (i === 0) place(b, 'pilaster', cg, W, top - lot.gH - 0.32, D, { side: 'L', wallMat: lot.wallMat });
      if (i === n - 1) place(b, 'pilaster', cg, W, top - lot.gH - 0.32, D, { side: 'R', wallMat: lot.wallMat });
    }
  }

  // dach
  const depth = (dist(lot.f0, lot.b0) + dist(lot.f1, lot.b1)) / 2;
  const chimneys = lot.roof === 'flat' ? null : [[0.04, 0.42], [0.96, 0.6]].filter(() => r.chance(0.7));
  place(b, 'roof', Cage.quad(lot.f0, lot.f1, lot.b0, lot.b1, eave, eave + lot.roofH), lot.width, lot.roofH, depth, {
    type: lot.roof, wallMat: lot.wallMat, roofTint: r.pick(ROOF_TINTS), chimneys,
    chimneyTint: [0.6, 0.45, 0.4], glassTint: [0.3, 0.33, 0.36], frameTint: P.frameTint,
  });

  // ściany ogniowe nad niższymi sąsiadami
  const fwTint = [0.62 + r.float(-0.05, 0.05), 0.47, 0.41];
  for (const [nb, side] of [[prev, 'L'], [next, 'R']]) {
    const nbEave = nb.top + 0.7;
    if (nbEave >= eave - 0.05) continue;
    const cg = Cage.quad(lot.f0, lot.f1, lot.b0, lot.b1, nbEave, eave);
    place(b, 'firewall', cg, lot.width, eave - nbEave, depth, { side, tint: fwTint, poster: r.chance(0.45), posterName: r.pick(BIG_BROTHER) });
  }
}

// ── plac + Ministerstwo Prawdy ──────────────────────────────────────────────
function buildPlaza(b, blk) {
  const K = blk.curb, Ki = blk.curbIn;
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4, L = dist(K[k], K[k1]), n = Math.max(1, Math.round(L / 9));
    for (let i = 0; i < n; i++) {
      const ta = i / n, tb = (i + 1) / n;
      const ka = lerp2(K[k], K[k1], ta), kb = lerp2(K[k], K[k1], tb);
      const ia = lerp2(Ki[k], Ki[k1], ta), ib = lerp2(Ki[k], Ki[k1], tb);
      place(b, 'curb', Cage.quad(ka, kb, ia, ib, 0, 0.16), dist(ka, kb), 0.16, 0.3, {});
    }
  }
  // posadzka placu — siatka komórek 12×12 (każda to moduł "sidewalk")
  const G = 12;
  for (let i = 0; i < G; i++)
    for (let j = 0; j < G; j++) {
      const P = (u, v) => lerp2(lerp2(Ki[0], Ki[1], u), lerp2(Ki[3], Ki[2], u), v);
      const a = P(i / G, j / G), c = P((i + 1) / G, j / G), d = P(i / G, (j + 1) / G), e = P((i + 1) / G, (j + 1) / G);
      place(b, 'sidewalk', Cage.quad(a, c, d, e, 0, 0.15), dist(a, c), 0.15, dist(a, d), { mat: 'slab' });
    }
  for (const l of blk.lamps) placeLamp(b, l);
  buildMinistry(b, blk.center);
}

function buildMinistry(b, c) {
  const [cx, cz] = c;
  const { tiers, tierH } = MINISTRY;
  const white = [0.9, 0.9, 0.87];
  b.setTint('stone', white);
  const P = { wallMat: 'stone', groundMat: 'stone', metalTint: [0.25, 0.26, 0.27], frameTint: [0.2, 0.2, 0.2], doorTint: [0.2, 0.2, 0.22], glassTint: [0.25, 0.28, 0.3], simple: true };
  const slogans = ['war', 'freedom', 'ignorance', null];
  tiers.forEach((hs, t) => {
    const y0 = 0.15 + t * tierH, y1 = y0 + tierH;
    const sq = [[cx - hs, cz - hs], [cx + hs, cz - hs], [cx + hs, cz + hs], [cx - hs, cz + hs]];
    const inset = 7;
    const sqIn = sq.map(([x, z]) => [x + Math.sign(cx - x) * inset, z + Math.sign(cz - z) * inset]);
    const bays = Math.round((2 * hs) / 4.2);
    const floors = t === 0 ? [0, 6, ...Array.from({ length: 6 }, (_, i) => 6 + ((i + 1) * (tierH - 6)) / 6)] : Array.from({ length: 8 }, (_, i) => (i * tierH) / 7);
    for (let s = 0; s < 4; s++) {
      const A = sq[s], Bq = sq[(s + 1) % 4], Ai = sqIn[s], Bi = sqIn[(s + 1) % 4];
      for (let i = 0; i < bays; i++) {
        const Fa = lerp2(A, Bq, i / bays), Fb = lerp2(A, Bq, (i + 1) / bays);
        const Ba = lerp2(Ai, Bi, i / bays), Bb = lerp2(Ai, Bi, (i + 1) / bays);
        const W = dist(Fa, Fb);
        for (let k = 0; k < floors.length - 1; k++) {
          const ya = y0 + floors[k], yb = y0 + floors[k + 1];
          const cage = Cage.quad(Fa, Fb, Ba, Bb, ya, yb);
          const centre = Math.abs(i - (bays - 1) / 2) < 1.6;
          const mod = t === 0 && k === 0 ? (centre ? 'door' : 'wall') : 'modern';
          place(b, mod, cage, W, yb - ya, inset, { ...P, ground: k === 0 });
          if (t === 0 && k === 0 && Math.abs(i - (bays - 1) / 2 - 2.5) < 0.6) {
            place(b, 'telescreen', cage, W, yb - ya, inset, { y: 3.9 });
          }
        }
        place(b, 'cornice', Cage.quad(Fa, Fb, Ba, Bb, y1, y1 + 0.6), W, 0.6, inset, { style: 'modern', mat: 'stone' });
      }
      // hasła Partii na najwyższym tarasie, Wielki Brat na czwartej ścianie
      if (t === tiers.length - 1) {
        const ua = 0.12, ub = 0.88;
        const Fa = lerp2(A, Bq, ua), Fb = lerp2(A, Bq, ub), Ba = lerp2(Ai, Bi, ua), Bb = lerp2(Ai, Bi, ub);
        const W = dist(Fa, Fb), cage = Cage.quad(Fa, Fb, Ba, Bb, y0, y1);
        if (slogans[s]) place(b, 'poster', cage, W, tierH, inset, { name: slogans[s], w: W * 0.95, h: W * 0.95 * (200 / 512), y: tierH * 0.42, z: -0.4 });
        else place(b, 'poster', cage, W, tierH, inset, { name: 'bb0', w: 11, h: 22, y: 2, z: -0.4 });
      }
    }
    place(b, 'roof', Cage.quad(sq[0], sq[1], sq[3], sq[2], y1 + 0.6, y1 + 1.5), 2 * hs, 0.9, 2 * hs, { type: 'flat', wallMat: 'stone', roofTint: [0.5, 0.5, 0.5] });
  });
  // antena na szczycie
  const yt = 0.15 + tiers.length * tierH + 1.5;
  b.cell(Cage.quad([cx - 1, cz - 1], [cx + 1, cz - 1], [cx - 1, cz + 1], [cx + 1, cz + 1], yt, yt + 1), 2, 1, 2);
  b.cyl('metal', 1, 1, 0, 18, 0.5, 0.12, 8, { tint: [0.3, 0.3, 0.3] });
  b.cyl('light', 1, 1, 18, 18.6, 0.25, 0.0, 8);
}

// ── LOD: prosta bryła na dalekie odległości ─────────────────────────────────
export function buildBlockLOD(city, id) {
  const blk = city.blocks[id];
  const b = new Builder();
  const sw = blk.kind === 'plaza' ? [blk.curb] : null;
  // chodnik jako 4 trapezy
  const K = blk.curbIn, B = blk.kind === 'plaza' ? null : blk.bline;
  if (B) {
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      b.wpoly('slab', [[K[k][0], 0.15, K[k][1]], [K[k1][0], 0.15, K[k1][1]], [B[k1][0], 0.15, B[k1][1]], [B[k][0], 0.15, B[k][1]]], [0, 1, 0]);
    }
    const C = blk.court;
    b.wpoly('cobble', C.map((p) => [p[0], 0.05, p[1]]), [0, 1, 0], { flat: 1 });
    for (const lot of blk.lots) lodLot(b, lot);
  } else if (sw) {
    b.wpoly('slab', K.map((p) => [p[0], 0.15, p[1]]), [0, 1, 0]);
    const [cx, cz] = blk.center;
    MINISTRY.tiers.forEach((hs, t) => {
      const y0 = 0.15 + t * MINISTRY.tierH, y1 = y0 + MINISTRY.tierH + 0.6;
      const sq = [[cx - hs, cz - hs], [cx + hs, cz - hs], [cx + hs, cz + hs], [cx - hs, cz + hs]];
      for (let s = 0; s < 4; s++) lodWall(b, sq[s], sq[(s + 1) % 4], y0, y1, 4.2, 3.7, [0.92, 0.92, 0.9], [cx, cz]);
      b.wpoly('lodroof', sq.map((p) => [p[0], y1, p[1]]), [0, 1, 0], { tint: [0.5, 0.5, 0.5] });
    });
  }
  return b.finish();
}

function lodWall(b, a, c, y0, y1, bayW, floorH, tint, inside) {
  const L = dist(a, c);
  const nb = Math.max(1, Math.round(L / bayW));
  const v0 = 0, v1 = (y1 - y0) / floorH;
  const hint = [-(c[1] - a[1]), 0, c[0] - a[0]];
  const mx = (a[0] + c[0]) / 2 - inside[0], mz = (a[1] + c[1]) / 2 - inside[1];
  if (hint[0] * mx + hint[2] * mz < 0) { hint[0] = -hint[0]; hint[2] = -hint[2]; }
  b.wpoly('lod', [[a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]]], hint, {
    tint, uv: [[0, v0], [nb, v0], [nb, v1], [0, v1]],
  });
}

function lodLot(b, lot) {
  const eave = lot.top + 0.7;
  const mid = [(lot.f0[0] + lot.f1[0] + lot.b0[0] + lot.b1[0]) / 4, (lot.f0[1] + lot.f1[1] + lot.b0[1] + lot.b1[1]) / 4];
  const tint = lot.wallMat === 'brick' ? [0.62, 0.45, 0.38] : lot.tint;
  lodWall(b, lot.f0, lot.f1, 0, eave, lot.width / lot.bays, lot.fH, tint, mid);
  lodWall(b, lot.b1, lot.b0, 0, eave, dist(lot.b0, lot.b1) / lot.bays, lot.fH, tint, mid);
  const rt = [0.4, 0.38, 0.36];
  const side = (a, c) => b.wpoly('lod', [[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], eave, c[1]], [a[0], eave, a[1]]], null, { tint: [0.55, 0.42, 0.36], uv: [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]] });
  side(lot.f0, lot.b0);
  side(lot.b1, lot.f1);
  if (lot.roof === 'flat') {
    b.wpoly('lodroof', [lot.f0, lot.f1, lot.b1, lot.b0].map((p) => [p[0], eave + 0.9, p[1]]), [0, 1, 0], { tint: rt });
    return;
  }
  const rH = eave + lot.roofH;
  const r0 = lerp2(lot.f0, lot.b0, 0.5), r1 = lerp2(lot.f1, lot.b1, 0.5);
  b.wpoly('lodroof', [[lot.f0[0], eave, lot.f0[1]], [lot.f1[0], eave, lot.f1[1]], [r1[0], rH, r1[1]], [r0[0], rH, r0[1]]], [0, 1, 0], { tint: rt });
  b.wpoly('lodroof', [[lot.b1[0], eave, lot.b1[1]], [lot.b0[0], eave, lot.b0[1]], [r0[0], rH, r0[1]], [r1[0], rH, r1[1]]], [0, 1, 0], { tint: rt });
  b.wpoly('lod', [[lot.f0[0], eave, lot.f0[1]], [r0[0], rH, r0[1]], [lot.b0[0], eave, lot.b0[1]]], null, { tint, uv: [[0, 0], [0.1, 0], [0.1, 0.1]] });
  b.wpoly('lod', [[lot.f1[0], eave, lot.f1[1]], [r1[0], rH, r1[1]], [lot.b1[0], eave, lot.b1[1]]], null, { tint, uv: [[0, 0], [0.1, 0], [0.1, 0.1]] });
}

// ── nawierzchnia jezdni (bruk) w kafelkach ──────────────────────────────────
export const GROUND_TILES = 7;
export function buildGroundTile(city, tx, tz) {
  const b = new Builder();
  const size = (2 * HALF) / GROUND_TILES;
  const x0 = -HALF + tx * size, z0 = -HALF + tz * size;
  const pad = tx === 0 || tz === 0 || tx === GROUND_TILES - 1 || tz === GROUND_TILES - 1 ? 30 : 0;
  const ax = x0 - (tx === 0 ? pad : 0), bx = x0 + size + (tx === GROUND_TILES - 1 ? pad : 0);
  const az = z0 - (tz === 0 ? pad : 0), bz = z0 + size + (tz === GROUND_TILES - 1 ? pad : 0);
  const cage = Cage.quad([ax, az], [bx, az], [ax, bz], [bx, bz], 0, 1);
  place(b, 'cobble', cage, bx - ax, 1, bz - az, { step: 3 });
  return b.finish();
}

export function jobSeed(...a) {
  return hash(...a);
}
