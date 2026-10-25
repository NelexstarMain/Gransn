// Siatka kolizji 0.5 m — rasteryzowana z tych samych danych co geometria:
// pełne ćwiartki parteru = mur, ćwiartki chodnika = +0.15 m itd.
import { pointInPoly } from '../city/layout.js';
import { filled, quadGeom, quadMixed0, T_PLAZA, T_PARK, T_GARDEN, T_COURT, T_BLD } from '../city/grid.js';

export const ROAD = 0, WALK = 1, COURT = 2, PLAZA = 3, GATE = 4, BRIDGE = 5, SOLID = 255;
const OFFSET = { [ROAD]: 0, [WALK]: 0.15, [COURT]: 0.05, [PLAZA]: 0.15, [GATE]: 0 };

export class CollisionGrid {
  constructor(city, cell = 0.5) {
    this.city = city;
    this.T = city.terrain;
    this.cell = cell;
    this.origin = -city.half - 40;
    this.n = Math.ceil((city.size + 80) / cell);
    this.data = new Uint8Array(this.n * this.n);
    const T = this.T, g = city.grid;
    for (let i = 0; i < T.left.length - 1; i++) this.fill([T.left[i], T.left[i + 1], T.right[i + 1], T.right[i]], SOLID);
    for (let q = 0; q < g.quads.length / 4; q++) {
      const G = quadGeom(g, q), mixed = quadMixed0(g, q);
      for (let i = 0; i < 4; i++) {
        const a = G.v[i], ty = g.TY[a];
        const poly = [G.p[i], G.m[i], G.c, G.m[(i + 3) % 4]];
        if (filled(g, a, 0)) this.fill(poly, SOLID);
        else if (ty === T_BLD) this.fill(poly, GATE);
        else if (mixed || ty === T_PLAZA) this.fill(poly, ty === T_PLAZA && !mixed ? PLAZA : WALK);
        else if (ty === T_PARK || ty === T_GARDEN || ty === T_COURT) this.fill(poly, COURT);
      }
    }
    for (const l of city.lamps) this.disc(l.p[0], l.p[1], 0.2);
    for (const t of city.trees) this.disc(t.p[0], t.p[1], 0.35 * t.s);
    const SZ = { car: [1.8, 0.85], kiosk: [1.2, 1.0], booth: [0.5, 0.5], busstop: [1.6, 0.7], bin: [0.3, 0.3] };
    for (const pr of city.props) {
      const sz = SZ[pr.kind];
      if (!sz) continue;
      const [a, c] = sz, e = pr.e, n = pr.n, P = (u, w) => [pr.p[0] + e[0] * u + n[0] * w, pr.p[1] + e[1] * u + n[1] * w];
      this.fill([P(-a, -c), P(a, -c), P(a, c), P(-a, c)], SOLID);
    }
    for (const { p: [x, z] } of city.monuments) this.fill([[x - 2.2, z - 2.2], [x + 2.2, z - 2.2], [x + 2.2, z + 2.2], [x - 2.2, z + 2.2]], SOLID);
    for (const br of city.bridges) {
      const hw = br.width / 2 - 0.5, e = 0.5;
      const P = (pt, s) => [pt[0] + br.perp[0] * s, pt[1] + br.perp[1] * s];
      const e0 = [br.e0[0] - br.axis[0] * e, br.e0[1] - br.axis[1] * e], e1 = [br.e1[0] + br.axis[0] * e, br.e1[1] + br.axis[1] * e];
      this.fill([P(e0, -hw), P(e1, -hw), P(e1, hw), P(e0, hw)], BRIDGE);
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
    const t = this.type(x, z);
    if (t === BRIDGE) return this.T.bankY + 0.15;
    return this.T.height(x, z) + (OFFSET[t] ?? 0);
  }
}
