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
    const z0 = r.float(0.3, 0.42) * half * (r.chance(0.5) ? 1 : -1);
    const n = 9, ph = r.float(0, 6);
    this.pts = [];
    for (let i = 0; i <= n; i++) {
      const x = -half - 90 + ((2 * half + 180) * i) / n;
      this.pts.push([x, z0 + 40 * Math.sin(i * 0.85 + ph) + r.float(-14, 14)]);
    }
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
    this.plaza = null;
    this.half = half;
    // wyspa: promień brzegu R(θ) z losowymi półwyspami i zatokami
    this.seaY = this.waterY;
    this.isl = { r0: half * 0.84, ph: [r.float(0, 6), r.float(0, 6), r.float(0, 6)], o: r.float(0, 100) };
  }

  coastR(theta) {
    const { r0, ph, o } = this.isl;
    const c = Math.cos(theta), s = Math.sin(theta);
    let k = 0.86 + 0.09 * Math.sin(2 * theta + ph[0]) + 0.06 * Math.sin(3 * theta + ph[1]) + 0.04 * Math.sin(5 * theta + ph[2]);
    k += 0.16 * noise3(c * 1.6 + o, s * 1.6, 0.5) + 0.06 * noise3(c * 5 + o, s * 5, 2.5);
    return r0 * Math.min(1.12, k);
  }

  // odległość od brzegu (dodatnia na lądzie)
  inland(x, z) {
    return this.coastR(Math.atan2(z, x)) - Math.hypot(x, z);
  }

  // najbliższy punkt na osi rzeki
  river(x, z) {
    let best = { d: 1e9 };
    const P = this.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      const px = a[0] + dx * t, pz = a[1] + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, px, pz, seg: i, t, tx: dx, tz: dz };
    }
    const l = best.d || 1;
    best.nx = (x - best.px) / l;
    best.nz = (z - best.pz) / l;
    return best;
  }

  hills(x, z) {
    return 6.5 + 5 * noise3(x / 430 + 11.3, 0.37, z / 430 - 4.1) + 1.8 * noise3(x / 150, 2.1, z / 150);
  }

  height(x, z) {
    let h = this.hills(x, z);
    const c = this.inland(x, z);
    const land = sstep(-25, 75, c);
    const d = this.river(x, z).d;
    h = this.bankY + (h - this.bankY) * sstep(this.hw + 6, this.hw + 120, d);
    // plaża i dno morza
    h = this.seaY - 4 + (h - this.seaY + 4) * land;
    // ląd nigdy nie schodzi pod wodę: od ~40 m od brzegu co najmniej 1 m nad morzem
    h = Math.max(h, this.seaY - 6 + 7 * sstep(12, 40, c));
    const p = this.plaza;
    if (p) {
      const pd = Math.hypot(x - p.x, z - p.z);
      h = p.y + (h - p.y) * sstep(p.r, p.r + 130, pd);
    }
    return h;
  }

  isSand(x, z, y) {
    return y < this.seaY + 2.4 && this.inland(x, z) < 140;
  }

  inRiver(x, z, margin = 0) {
    return this.river(x, z).d < this.hw + margin;
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
