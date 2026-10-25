// Sieć jezdni jako zbiór "kapsuł": odcinek + promień jezdni (rw), końce
// zaokrąglone. Suma kapsuł to cała przejezdna nawierzchnia — skrzyżowania
// i zakręty wychodzą same, bez dziur. Z tej jednej struktury korzystają:
// klasyfikacja siatki (budynki nie wchodzą na drogę), geometria jezdni,
// chodniki (docinane do krawędzi), rekwizyty (zawsze poza jezdnią) i kolizje.

export class RoadNet {
  constructor(segs, cell = 24) {
    this.segs = segs;
    this.cell = cell;
    this.map = new Map();
    segs.forEach((s, i) => {
      s.id = i;
      const m = s.rw + 14;
      const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - m) / cell), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + m) / cell);
      const z0 = Math.floor((Math.min(s.a[1], s.b[1]) - m) / cell), z1 = Math.floor((Math.max(s.a[1], s.b[1]) + m) / cell);
      for (let gx = x0; gx <= x1; gx++)
        for (let gz = z0; gz <= z1; gz++) {
          const k = gx * 100003 + gz;
          if (!this.map.has(k)) this.map.set(k, []);
          this.map.get(k).push(s);
        }
    });
  }

  near(x, z) {
    return this.map.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell)) || [];
  }

  static proj(s, x, z) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const qx = s.a[0] + dx * t, qz = s.a[1] + dz * t;
    return { t, qx, qz, d: Math.hypot(x - qx, z - qz) };
  }

  // odległość od krawędzi najbliższej jezdni (ujemna = na jezdni)
  clearance(x, z, skip = null) {
    let c = 1e9;
    for (const s of this.near(x, z)) {
      if (s === skip) continue;
      c = Math.min(c, RoadNet.proj(s, x, z).d - s.rw);
    }
    return c;
  }

  nearest(x, z) {
    let best = null;
    for (const s of this.near(x, z)) {
      const p = RoadNet.proj(s, x, z);
      const c = p.d - s.rw;
      if (!best || c < best.c) best = { s, c, ...p };
    }
    return best;
  }

  // wypchnij punkt poza wszystkie jezdnie (z marginesem) — docinanie chodników
  clamp(p, margin = 0.3) {
    let x = p[0], z = p[1];
    for (let it = 0; it < 4; it++) {
      let worst = null, depth = 0;
      for (const s of this.near(x, z)) {
        const pr = RoadNet.proj(s, x, z);
        const pen = s.rw + margin - pr.d;
        if (pen > depth) { depth = pen; worst = { s, pr }; }
      }
      if (!worst) break;
      const { s, pr } = worst;
      let nx = x - pr.qx, nz = z - pr.qz, l = Math.hypot(nx, nz);
      if (l < 1e-6) {
        const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], dl = Math.hypot(dx, dz) || 1;
        nx = -dz / dl; nz = dx / dl; l = 1;
      }
      x = pr.qx + (nx / l) * (s.rw + margin + 1e-3);
      z = pr.qz + (nz / l) * (s.rw + margin + 1e-3);
    }
    return [x, z];
  }
}

// wielokąt kapsuły (do kolizji i minimapy)
export function capsulePoly(s, extra = 0, seg = 6) {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l = Math.hypot(dx, dz) || 1;
  const ux = dx / l, uz = dz / l, r = s.rw + extra;
  const base = Math.atan2(uz, ux);
  const out = [];
  for (let i = 0; i <= seg; i++) {
    const a = base - Math.PI / 2 + (i / seg) * Math.PI;
    out.push([s.b[0] + Math.cos(a) * r, s.b[1] + Math.sin(a) * r]);
  }
  for (let i = 0; i <= seg; i++) {
    const a = base + Math.PI / 2 + (i / seg) * Math.PI;
    out.push([s.a[0] + Math.cos(a) * r, s.a[1] + Math.sin(a) * r]);
  }
  return out;
}
