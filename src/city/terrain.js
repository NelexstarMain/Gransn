// Teren: łagodne wzgórza (szum) + dolina rzeki wijącej się przez miasto.
// Wszystko w mieście stoi na tej funkcji wysokości — każdy narożnik komórki
// ma inną wysokość, więc kostki modułów odkształcają się także w pionie.
import { noise3 } from '../core/noise.js';
import { Rng, hash } from '../core/rng.js';

const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Terrain {
  constructor(seed, half) {
    const r = new Rng(hash(seed, 4242));
    this.hw = 17;          // połowa szerokości koryta
    this.bankY = 0;        // poziom bulwarów
    this.waterY = -3.2;    // lustro wody
    this.half = half;
    this.plaza = null;
    // ── wyspa: promień brzegu R(θ) z losowymi półwyspami i zatokami; cztery odmiany sylwety:
    //  blob (jak dawniej), oval (wydłużona), bay (z głęboką zatoką — port), lobes (trójkątna)
    this.seaY = this.waterY;
    const kind = r.weighted([['blob', 3], ['oval', 3], ['bay', 2.2], ['lobes', 1.6]]);
    this.isl = { r0: half * 0.84, ph: [r.float(0, 6), r.float(0, 6), r.float(0, 6)], o: r.float(0, 100), kind, e: 0, te: 0, bay: null, tri: 0, tt: 0 };
    if (kind === 'oval') { this.isl.e = r.float(0.14, 0.24); this.isl.te = r.float(0, Math.PI); }
    if (kind === 'bay') this.isl.bay = { a: r.float(0, 2 * Math.PI), w: r.float(0.3, 0.45), d: r.float(0.26, 0.4) };
    if (kind === 'lobes') { this.isl.tri = r.float(0.1, 0.16); this.isl.tt = r.float(0, 2 * Math.PI); this.isl.e = r.float(0, 0.1); this.isl.te = r.float(0, Math.PI); }
    // sylweta nie może wyjść poza mapę (najdalszy punkt ≤ 0,93 połowy boku)
    let maxR = 0;
    for (let i = 0; i < 360; i++) maxR = Math.max(maxR, this.coastR((i / 360) * Math.PI * 2));
    if (maxR > 0.93 * half) this.isl.r0 *= (0.93 * half) / maxR;

    // ── rzeka: położenie względem miasta jest jedną z trzech odmian, kierunek dowolny ──
    //  przez miasto (rynek 80–110 m od osi, mosty tuż obok), obok miasta (150–235 m, przedmieście
    //  za rzeką) albo w dużym zakolu (rzeka okrąża miasto z jednej strony). Rzeka musi przecinać
    //  wyspę na długim odcinku lądu (inaczej nie byłoby gdzie postawić mostów): do 14 prób.
    let best = null;
    for (let attempt = 0; attempt < 14; attempt++) {
      const mode = r.weighted([['through', 3.4], ['edge', 4.2], ['bend', 1.8]]);
      const phi = r.float(0, Math.PI), side = r.chance(0.5) ? 1 : -1;
      let off, amp, lam;
      if (mode === 'through') { off = r.float(-45, 45); amp = r.float(22, 46); lam = r.float(520, 820); }
      else if (mode === 'edge') { off = side * r.float(150, 235); amp = r.float(26, 58); lam = r.float(560, 900); }
      else { off = side * r.float(70, 125); amp = r.float(85, 125); lam = r.float(960, 1250); }
      amp = Math.min(amp, 0.085 * lam); // nachylenie ≤ ~30°: brzegi i mosty znoszą takie zakręty
      const n = 24, ph = r.float(0, 6.28), L = half * 1.5 + 100, pts = [];
      for (let i = 0; i <= n; i++) {
        const u = -L + (2 * L * i) / n;
        const v = off + amp * Math.sin((2 * Math.PI * u) / lam + ph) + (i > 0 && i < n ? r.float(-10, 10) : 0);
        pts.push([u * Math.cos(phi) - v * Math.sin(phi), u * Math.sin(phi) + v * Math.cos(phi)]);
      }
      // ile rzeki leży na lądzie z dala od brzegu i krawędzi mapy (próbkowanie co 10 m)
      let land = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.ceil(l / 10);
        for (let j = 0; j < k; j++) {
          const x = a[0] + ((b[0] - a[0]) * j) / k, z = a[1] + ((b[1] - a[1]) * j) / k;
          if (Math.abs(x) < half - 90 && Math.abs(z) < half - 90 && this.inland(x, z) > 85) land += l / k;
        }
      }
      if (!best || land > best.land) best = { mode, pts, land };
      if (land >= 340) break;
    }
    this.riverMode = best.mode;
    this.pts = best.pts;
    // brzegi — przesunięcie łamanej z cięciem pod kątem
    this.left = [];
    this.right = [];
    const P = this.pts;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz);
      tx /= tl; tz /= tl;
      const s0 = P[Math.min(i, P.length - 2)], s1 = P[Math.min(i, P.length - 2) + 1];
      const sl = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
      const cos = (-tz * -(s1[1] - s0[1]) / sl) + (tx * (s1[0] - s0[0]) / sl);
      const m = this.hw / Math.max(0.6, Math.abs(cos));
      this.left.push([P[i][0] - tz * m, P[i][1] + tx * m]);
      this.right.push([P[i][0] + tz * m, P[i][1] - tx * m]);
    }
    // nabrzeża = DOKŁADNIE linia w odległości hw od osi: na wewnętrznej stronie zakrętu
    // narożnik, na zewnętrznej łuk. Dzięki temu mur nabrzeża, ziemia (clampToBank)
    // i kolizje mają tę samą krawędź — nic nie wisi nad wodą i nie ma szczelin.
    this.bankL = this.offsetBank(1);
    this.bankR = this.offsetBank(-1);

    // ── środek miasta (rynek): przy rzece przez miasto o 80–110 m od jej osi, inaczej blisko
    //  środka wyspy, ale nie bliżej rzeki niż 130 m
    const c0 = [r.float(-35, 35), r.float(-35, 35)];
    if (this.riverMode === 'through') {
      const rv = this.river(c0[0], c0[1]), tl = Math.hypot(rv.tx, rv.tz) || 1;
      const s = r.chance(0.5) ? 1 : -1, d = r.float(82, 112);
      this.center = [rv.px - (rv.tz / tl) * s * d, rv.pz + (rv.tx / tl) * s * d];
    } else {
      const rv = this.river(c0[0], c0[1]);
      this.center = c0;
      if (rv.d < 130) this.center = [c0[0] + rv.nx * (130 - rv.d), c0[1] + rv.nz * (130 - rv.d)];
    }
  }

  offsetBank(sd) {
    const P = this.pts, hw = this.hw, out = [];
    const nrm = (i) => {
      const a = P[i], b = P[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [(-(b[1] - a[1]) / l) * sd, ((b[0] - a[0]) / l) * sd];
    };
    out.push([P[0][0] + nrm(0)[0] * hw, P[0][1] + nrm(0)[1] * hw]);
    for (let i = 1; i < P.length - 1; i++) {
      const na = nrm(i - 1), nb = nrm(i), p = P[i];
      const tb = [P[i + 1][0] - p[0], P[i + 1][1] - p[1]];
      if (na[0] * tb[0] + na[1] * tb[1] >= 0) {
        // wewnętrzna strona zakrętu: przecięcie przesuniętych odcinków
        const m = [(na[0] + nb[0]) / 2, (na[1] + nb[1]) / 2], m2 = m[0] * m[0] + m[1] * m[1];
        out.push([p[0] + (m[0] * hw) / m2, p[1] + (m[1] * hw) / m2]);
      } else {
        // zewnętrzna: łuk wokół wierzchołka osi
        let a0 = Math.atan2(na[1], na[0]), a1 = Math.atan2(nb[1], nb[0]);
        while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
        while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
        const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.12));
        for (let k = 0; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n;
          out.push([p[0] + Math.cos(a) * hw, p[1] + Math.sin(a) * hw]);
        }
      }
    }
    const e = P.length - 1, ne = nrm(e - 1);
    out.push([P[e][0] + ne[0] * hw, P[e][1] + ne[1] * hw]);
    return out;
  }

  coastR(theta) {
    const { r0, ph, o, e, te, bay, tri, tt } = this.isl;
    const c = Math.cos(theta), s = Math.sin(theta);
    let k = 0.86 + 0.09 * Math.sin(2 * theta + ph[0]) + 0.06 * Math.sin(3 * theta + ph[1]) + 0.04 * Math.sin(5 * theta + ph[2]);
    k += 0.16 * noise3(c * 1.6 + o, s * 1.6, 0.5) + 0.06 * noise3(c * 5 + o, s * 5, 2.5);
    k = Math.min(1.12, k);
    if (e) k *= 1 + e * Math.cos(2 * (theta - te));
    if (tri) k *= 1 + tri * Math.cos(3 * (theta - tt));
    if (bay) {
      let d = Math.abs(theta - bay.a) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      k -= bay.d * Math.exp(-((d / bay.w) ** 2));
    }
    return r0 * k;
  }

  // odległość od brzegu (dodatnia na lądzie)
  inland(x, z) {
    return this.coastR(Math.atan2(z, x)) - Math.hypot(x, z);
  }

  // najbliższy punkt na osi rzeki
  river(x, z) {
    // pętla bez alokacji: obiekt wyniku powstaje raz, na końcu
    let bd = 1e9, bi = 0, bt = 0, bpx = 0, bpz = 0;
    const P = this.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      const px = a[0] + dx * t, pz = a[1] + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; bi = i; bt = t; bpx = px; bpz = pz; }
    }
    const a = P[bi], b = P[bi + 1], l = bd || 1;
    return { d: bd, px: bpx, pz: bpz, seg: bi, t: bt, tx: b[0] - a[0], tz: b[1] - a[1], nx: (x - bpx) / l, nz: (z - bpz) / l };
  }

  // sama odległość od osi rzeki — tańsza od river() (bez obiektu wyniku, a pierwiastek
  // tylko raz: odcinki porównujemy po kwadratach odległości)
  riverDist(x, z) {
    let bd = 1e18, bx = 0, bz = 0;
    const P = this.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      const ex = x - (a[0] + dx * t), ez = z - (a[1] + dz * t);
      const d2 = ex * ex + ez * ez;
      if (d2 < bd) { bd = d2; bx = ex; bz = ez; }
    }
    return Math.hypot(bx, bz);
  }

  hills(x, z) {
    let h = 6.5 + 5 * noise3(x / 430 + 11.3, 0.37, z / 430 - 4.1) + 1.8 * noise3(x / 150, 2.1, z / 150);
    // obrzeża wyspy falują mocniej niż centrum: grzbiety i doliny (lasy, wydmy, przedmieścia)
    const dc = Math.hypot(x - this.center[0], z - this.center[1]);
    const rise = sstep(130, 360, dc);
    if (rise > 0) h += rise * (10.5 * Math.max(0, noise3(x / 210 + 31.7, 1.1, z / 210 + 8.3) + 0.2) + 2.4 * noise3(x / 75 + 5.5, 3.3, z / 75));
    return h;
  }

  height(x, z) {
    let h = this.hills(x, z);
    const c = this.inland(x, z);
    const land = sstep(-25, 75, c);
    const d = this.riverDist(x, z);
    // rynek spłaszczony NAJPIERW, potem dolina rzeki: brzeg zawsze leży dokładnie
    // na wysokości nabrzeża i mostów (wcześniej rynek podnosił ziemię przy rzece
    // o 1–3 m i powstawał uskok nad murem nabrzeża)
    const p = this.plaza;
    let keep = 0;
    if (p) {
      const pd = Math.hypot(x - p.x, z - p.z);
      h = p.y + (h - p.y) * sstep(p.r, p.r + 130, pd);
      keep = 1 - sstep(p.r, p.r + 50, pd);
    }
    h = this.bankY + (h - this.bankY) * Math.max(keep, sstep(this.hw + 6, this.hw + 120, d));
    // dojazdy do mostów leżą na poziomie pokładu (bankY): bez tego miasto przy moście było
    // do ~1 m wyżej niż jezdnia, a chodniki (+0,15 m) tworzyły przy niej mur
    if (this.bridgeZones) {
      for (const bz of this.bridgeZones) {
        const dx = x - bz.p[0], dz = z - bz.p[1];
        const al = Math.abs(dx * bz.axis[0] + dz * bz.axis[1]), ac = Math.abs(dx * bz.perp[0] + dz * bz.perp[1]);
        if (al > bz.L + 50 || ac > bz.hw + 26) continue;
        h += (this.bankY - h) * (1 - sstep(bz.L + 6, bz.L + 46, al)) * (1 - sstep(bz.hw + 5, bz.hw + 24, ac));
      }
    }
    // plaża i dno morza
    h = this.seaY - 4 + (h - this.seaY + 4) * land;
    // ląd nigdy nie schodzi pod wodę: od ~40 m od brzegu co najmniej 1 m nad morzem
    h = Math.max(h, this.seaY - 6 + 7 * sstep(12, 40, c));
    return h;
  }

  isSand(x, z, y) {
    return y < this.seaY + 2.4 && this.inland(x, z) < 140;
  }

  inRiver(x, z, margin = 0) {
    return this.riverDist(x, z) < this.hw + margin;
  }

  // punkt w korycie → rzut na najbliższy brzeg
  // (want = 1/-1: zawsze na brzeg TEJ strony, nawet gdy punkt leży za osią rzeki)
  clampToBank(x, z, want = 0) {
    const r = this.river(x, z);
    if (r.d >= this.hw) return null;
    // strona rzeki: znak iloczynu wektorowego (styczna × kierunek do punktu)
    const side = r.tx * (z - r.pz) - r.tz * (x - r.px) >= 0 ? 1 : -1;
    if (want && want !== side) return [r.px - r.nx * this.hw, r.pz - r.nz * this.hw, want];
    if (r.d < 1e-6) return [r.px, r.pz, side];
    return [r.px + r.nx * this.hw, r.pz + r.nz * this.hw, side];
  }

  // strona rzeki punktu na lądzie (1/-1)
  bankSide(x, z) {
    const r = this.river(x, z);
    return r.tx * (z - r.pz) - r.tz * (x - r.px) >= 0 ? 1 : -1;
  }
}
