// Siatka kolizji 0.5 m — rasteryzowana z tych samych danych co geometria.
// Typ komórki koduje też wysokość nawierzchni (jezdnia, chodnik, podwórze...).
import { pointInPoly, MINISTRY } from '../city/layout.js';

export const ROAD = 0, WALK = 1, COURT = 2, PLAZA = 3, GATE = 4, SOLID = 255;
const HEIGHT = { [ROAD]: 0, [WALK]: 0.15, [COURT]: 0.05, [PLAZA]: 0.15, [GATE]: 0.1 };

export class CollisionGrid {
  constructor(city, cell = 0.5) {
    this.cell = cell;
    this.origin = -city.half - 40;
    this.n = Math.ceil((city.size + 80) / cell);
    this.data = new Uint8Array(this.n * this.n);
    for (const blk of city.blocks) {
      this.fill(blk.curb, blk.kind === 'plaza' ? PLAZA : WALK);
      if (blk.kind === 'plaza') {
        const h = MINISTRY.tiers[0] + 0.25, [cx, cz] = blk.center;
        this.fill([[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]], SOLID);
      } else {
        this.fill(blk.bline, SOLID);
        this.fill(blk.court, COURT);
        for (const g of blk.gates) this.fill(g, GATE);
      }
      for (const l of blk.lamps) this.disc(l.p[0], l.p[1], 0.2);
    }
  }

  idx(x, z) {
    const i = Math.floor((x - this.origin) / this.cell), j = Math.floor((z - this.origin) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  fill(poly, v) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const c = this.cell;
    for (let z = Math.floor(z0 / c) * c + c / 2; z <= z1; z += c)
      for (let x = Math.floor(x0 / c) * c + c / 2; x <= x1; x += c) {
        if (!pointInPoly(poly, x, z)) continue;
        const i = this.idx(x, z);
        if (i >= 0) this.data[i] = v;
      }
  }

  disc(x, z, r) {
    for (let dz = -r; dz <= r; dz += this.cell / 2)
      for (let dx = -r; dx <= r; dx += this.cell / 2) {
        const i = this.idx(x + dx, z + dz);
        if (i >= 0) this.data[i] = SOLID;
      }
  }

  type(x, z) {
    const i = this.idx(x, z);
    return i < 0 ? SOLID : this.data[i];
  }

  solid(x, z) {
    return this.type(x, z) === SOLID;
  }

  height(x, z) {
    return HEIGHT[this.type(x, z)] ?? 0;
  }
}
