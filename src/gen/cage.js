// ─────────────────────────────────────────────────────────────────────────────
//  CAGE DEFORMATION (Free-Form Deformation, Sederberg & Parry 1986) —
//  ta sama metoda, której Oskar Stålberg używa w Townscaperze / Bad North:
//  moduł jest modelowany w IDEALNEJ kostce jednostkowej (u,v,w ∈ [0,1]),
//  a potem każdy wierzchołek jest mapowany interpolacją trójliniową na
//  8 dowolnych narożników komórki. Kostka "dopasowuje się" do trapezów,
//  skośnych działek, narożników bloków itd. — jeden asset, nieskończenie
//  wiele kształtów. Wartości poza [0,1] (gzymsy, balkony) ekstrapolują się
//  liniowo, co na narożnikach daje automatyczne cięcie pod kątem (miter).
// ─────────────────────────────────────────────────────────────────────────────

export class Cage {
  // corners: 8 × [x,y,z], indeks = u + 2v + 4w
  constructor(corners) {
    const c = (this.c = new Float64Array(24));
    for (let i = 0; i < 8; i++) {
      c[i * 3] = corners[i][0];
      c[i * 3 + 1] = corners[i][1];
      c[i * 3 + 2] = corners[i][2];
    }
    const a = [0, 0, 0], b = [0, 0, 0], d = [0, 0, 0];
    this.jac(0.5, 0.5, 0.5, a, b, d);
    const det =
      a[0] * (b[1] * d[2] - b[2] * d[1]) -
      a[1] * (b[0] * d[2] - b[2] * d[0]) +
      a[2] * (b[0] * d[1] - b[1] * d[0]);
    this.sign = det < 0 ? -1 : 1;
  }

  // Komórka "pryzmatyczna": czworokąt w rzucie XZ (front f0→f1, tył b0→b1)
  // wyciągnięty od y0 do y1. f/b to [x,z].
  static quad(f0, f1, b0, b1, y0, y1) {
    return new Cage([
      [f0[0], y0, f0[1]], [f1[0], y0, f1[1]], [f0[0], y1, f0[1]], [f1[0], y1, f1[1]],
      [b0[0], y0, b0[1]], [b1[0], y0, b1[1]], [b0[0], y1, b0[1]], [b1[0], y1, b1[1]],
    ]);
  }

  // Zorientowane pudełko wokół punktu p: e = kierunek "u" (jednostkowy), n = kierunek "w".
  static oriented(p, e, n, W, D, y0, y1) {
    const hx = W / 2, hz = D / 2;
    const P = (su, sw) => [p[0] + e[0] * hx * su + n[0] * hz * sw, p[1] + e[1] * hx * su + n[1] * hz * sw];
    return Cage.quad(P(-1, -1), P(1, -1), P(-1, 1), P(1, 1), y0, y1);
  }

  map(u, v, w, o) {
    const c = this.c, iu = 1 - u, iv = 1 - v, iw = 1 - w;
    const w0 = iu * iv * iw, w1 = u * iv * iw, w2 = iu * v * iw, w3 = u * v * iw;
    const w4 = iu * iv * w, w5 = u * iv * w, w6 = iu * v * w, w7 = u * v * w;
    for (let k = 0; k < 3; k++) {
      o[k] =
        w0 * c[k] + w1 * c[3 + k] + w2 * c[6 + k] + w3 * c[9 + k] +
        w4 * c[12 + k] + w5 * c[15 + k] + w6 * c[18 + k] + w7 * c[21 + k];
    }
    return o;
  }

  // Pochodne cząstkowe dP/du, dP/dv, dP/dw — potrzebne do poprawnego
  // przekształcenia normalnych (macierz dopełnień algebraicznych).
  jac(u, v, w, a, b, d) {
    const c = this.c, iu = 1 - u, iv = 1 - v, iw = 1 - w;
    for (let k = 0; k < 3; k++) {
      const c0 = c[k], c1 = c[3 + k], c2 = c[6 + k], c3 = c[9 + k];
      const c4 = c[12 + k], c5 = c[15 + k], c6 = c[18 + k], c7 = c[21 + k];
      a[k] = iv * iw * (c1 - c0) + v * iw * (c3 - c2) + iv * w * (c5 - c4) + v * w * (c7 - c6);
      b[k] = iu * iw * (c2 - c0) + u * iw * (c3 - c1) + iu * w * (c6 - c4) + u * w * (c7 - c5);
      d[k] = iu * iv * (c4 - c0) + u * iv * (c5 - c1) + iu * v * (c6 - c2) + u * v * (c7 - c3);
    }
  }
}
