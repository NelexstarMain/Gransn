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
    const z0 = r.float(250, 320) * (r.chance(0.5) ? 1 : -1);
    const n = 9, ph = r.float(0, 6);
    this.pts = [];
    for (let i = 0; i <= n; i++) {
      const x = -half - 90 + ((2 * half + 180) * i) / n;
      this.pts.push([x, z0 + 60 * Math.sin(i * 0.85 + ph) + r.float(-20, 20)]);
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
    return 4 + 7 * noise3(x / 430 + 11.3, 0.37, z / 430 - 4.1) + 2.2 * noise3(x / 150, 2.1, z / 150);
  }

  height(x, z) {
    let h = this.hills(x, z);
    const d = this.river(x, z).d;
    h = this.bankY + (h - this.bankY) * sstep(this.hw + 6, this.hw + 120, d);
    const p = this.plaza;
    if (p) {
      const pd = Math.hypot(x - p.x, z - p.z);
      h = p.y + (h - p.y) * sstep(p.r, p.r + 130, pd);
    }
    return h;
  }

  inRiver(x, z, margin = 0) {
    return this.river(x, z).d < this.hw + margin;
  }

  // punkt w korycie → rzut na najbliższy brzeg
  clampToBank(x, z) {
    const r = this.river(x, z);
    if (r.d >= this.hw) return null;
    // strona rzeki: znak iloczynu wektorowego (styczna × kierunek do punktu)
    const side = r.tx * (z - r.pz) - r.tz * (x - r.px) >= 0 ? 1 : -1;
    if (r.d < 1e-6) return [r.px, r.pz, side];
    return [r.px + r.nx * this.hw, r.pz + r.nz * this.hw, side];
  }
}
