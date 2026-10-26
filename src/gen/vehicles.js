// ─────────────────────────────────────────────────────────────────────────────
//  POJAZDY — wozy z początku XX wieku: tourer, taksówka, limuzyna, furgon,
//  ciężarówka i roadster. Moduł `oldcar` (x = długość, przód przy x = W, z = szerokość,
//  lewa burta przy z = 0) składa się ze wspólnych części: podwozie, błotniki, maska,
//  chłodnica, lampy, koła + nadwozie zależne od typu.
//
//  Kształty to gładkie "skóry" (loft przez przekroje superelipsy z policzonymi
//  normalnymi), więc maska, błotniki i opony są obłe, a nie z klocków.
//  Koła są też osobnym modułem (`carwheel`): w grze obracają się i skręcają,
//  a zaparkowane auta w mieście mają je wbudowane.
//
//  Materiały: `body` = lakier karoserii (w grze barwiony per egzemplarz przez
//  instanceColor), `tail` = tylne światła, reszta jak w całym mieście.
// ─────────────────────────────────────────────────────────────────────────────
export const TAU = Math.PI * 2;
export const sp = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p); // potęga ze znakiem (superelipsa)

// ── skóra: pierścienie punktów [x,y,z] → gładka siatka z normalnymi ──────────
export function skin(b, mat, rings, o = {}) {
  const K = rings.length, N = rings[0].length, loop = !!o.loop, open = !!o.open; // open = łuk (pierścień niezamknięty)
  const cen = rings.map((r) => {
    let x = 0, y = 0, z = 0;
    for (const p of r) { x += p[0]; y += p[1]; z += p[2]; }
    return [x / N, y / N, z / N];
  });
  const nm = rings.map((r, k) => r.map((p, i) => {
    const a = open ? r[Math.min(N - 1, i + 1)] : r[(i + 1) % N], c = open ? r[Math.max(0, i - 1)] : r[(i + N - 1) % N];
    const t1x = a[0] - c[0], t1y = a[1] - c[1], t1z = a[2] - c[2];
    const kn = loop ? (k + 1) % K : Math.min(K - 1, k + 1), kp = loop ? (k + K - 1) % K : Math.max(0, k - 1);
    const q = rings[kn][i], w = rings[kp][i];
    const t2x = q[0] - w[0], t2y = q[1] - w[1], t2z = q[2] - w[2];
    let nx = t1y * t2z - t1z * t2y, ny = t1z * t2x - t1x * t2z, nz = t1x * t2y - t1y * t2x;
    const rx = p[0] - cen[k][0], ry = p[1] - cen[k][1], rz = p[2] - cen[k][2];
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) { nx = rx; ny = ry; nz = rz; l = Math.hypot(nx, ny, nz) || 1; }
    else if (nx * rx + ny * ry + nz * rz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx / l, ny / l, nz / l];
  }));
  const po = o.tint ? { tint: o.tint, shade: o.shade } : o.shade ? { shade: o.shade } : undefined;
  const last = loop ? K : K - 1;
  for (let k = 0; k < last; k++) {
    const k2 = (k + 1) % K;
    for (let i = 0; i < (open ? N - 1 : N); i++) {
      const i2 = (i + 1) % N;
      b.poly(mat, [rings[k][i], rings[k][i2], rings[k2][i2], rings[k2][i]], null, { ...po, nrm: [nm[k][i], nm[k][i2], nm[k2][i2], nm[k2][i]] });
    }
  }
  if (o.caps && !loop) {
    for (const [k, dir] of [[0, -1], [K - 1, 1]]) {
      const c = cen[k], r = rings[k], q = rings[k === 0 ? 1 : K - 2];
      const hint = [c[0] - cen[k === 0 ? 1 : K - 2][0], c[1] - cen[k === 0 ? 1 : K - 2][1], c[2] - cen[k === 0 ? 1 : K - 2][2]];
      if (Math.hypot(...hint) < 1e-9) hint[0] = dir;
      for (let i = 0; i < N; i++) b.poly(mat, [c, r[i], r[(i + 1) % N]], hint, po);
      void q;
    }
  }
}

// pierścień-superelipsa w płaszczyźnie (z, y) przy danym x
function ringX(x, zc, yc, hw, hh, e = 3, n = 12) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    pts.push([x, yc + hh * sp(Math.sin(t), 2 / e), zc + hw * sp(Math.cos(t), 2 / e)]);
  }
  return pts;
}

// bryła z zaokrąglonymi krawędziami wzdłuż osi x (maska, siedzenia, bagażnik)
export function rbox(b, mat, x0, y0, z0, x1, y1, z1, tint, e = 4, n = 10) {
  const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2, hw = (z1 - z0) / 2, hh = (y1 - y0) / 2;
  skin(b, mat, [ringX(x0, zc, yc, hw, hh, e, n), ringX(x1, zc, yc, hw, hh, e, n)], { tint, caps: true });
}

// jak rbox, ale zaokrągla krawędzie wzdłuż osi z (oparcia: cienkie w x, szerokie w z)
function rboxZ(b, mat, x0, y0, z0, x1, y1, z1, tint, e = 4, n = 10) {
  const xc = (x0 + x1) / 2, yc = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
  const ring = (z) => {
    const pts = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * TAU; pts.push([xc + hx * sp(Math.cos(t), 2 / e), yc + hy * sp(Math.sin(t), 2 / e), z]); }
    return pts;
  };
  skin(b, mat, [ring(z0), ring(z1)], { tint, caps: true });
}

// koło zapasowe zamocowane na tyle: oś wzdłuż x
function spare(b, S, x, y, z, r) {
  const hr = 0.058, hw = 0.07, R0 = r - hr, K = S.q ? 18 : 10, rings = [];
  for (let k = 0; k < K; k++) {
    const a = (k / K) * TAU, ca = Math.cos(a), sa = Math.sin(a), ring = [];
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * TAU, rad = hr * sp(Math.sin(t), 0.77), ax = hw * sp(Math.cos(t), 0.77);
      ring.push([x + ax, y + sa * (R0 + rad), z + ca * (R0 + rad)]);
    }
    rings.push(ring);
  }
  skin(b, 'dark', rings, { loop: true, tint: DARK });
  b.tube('metal', [x - 0.05, y, z], [x + 0.05, y, z], R0 - hr * 0.7, R0 - hr * 0.7, S.q ? 14 : 8, { tint: [0.45, 0.42, 0.36], caps: 1 });
  b.tube('metal', [x - 0.07, y, z], [x + 0.07, y, z], 0.05, 0.05, 8, { tint: BRASS, caps: 1 });
}

// loft po przekrojach: s = [{x, zc, y0, y1, hw, e}]
function lofted(b, mat, secs, tint, n = 12, caps = true) {
  skin(b, mat, secs.map((s) => ringX(s.x, s.zc, (s.y0 + s.y1) / 2, s.hw, (s.y1 - s.y0) / 2, s.e || 3.2, n)), { tint, caps });
}

// ── koło: opona (torus), drewniana obręcz, szprychy, mosiężna piasta ─────────
// oś wzdłuż z, środek w (cx, cy, cz); q: 0 = niski poziom detalu, 1 = średni, 2 = pełny
function wheel(b, cx, cy, cz, r, o = {}) {
  const q = o.q ?? 2, side = o.side ?? 1, hr = o.hr || 0.058, hw = o.hw || 0.066, solid = !!o.solid;
  const K = [12, 20, 28][q], N = [5, 7, 8][q];
  const R0 = r - hr;
  const dark = { tint: [0.07, 0.07, 0.075] };
  const rings = [];
  for (let k = 0; k < K; k++) {
    const a = (k / K) * TAU, ca = Math.cos(a), sa = Math.sin(a), ring = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TAU, rad = hr * sp(Math.sin(t), 2 / 2.6), ax = hw * sp(Math.cos(t), 2 / 2.6);
      ring.push([cx + ca * (R0 + rad), cy + sa * (R0 + rad), cz + ax]);
    }
    rings.push(ring);
  }
  skin(b, 'dark', rings, { loop: true, tint: dark.tint });
  // obręcz (felga): drewno albo blacha
  const wood = o.rim || [0.4, 0.27, 0.15], Rf = R0 - hr * 0.78, hr2 = 0.034, hw2 = 0.04;
  if (q >= 1) {
    const K2 = q === 2 ? 28 : 16, rr = [];
    for (let k = 0; k < K2; k++) {
      const a = (k / K2) * TAU, ca = Math.cos(a), sa = Math.sin(a), ring = [];
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * TAU, rad = hr2 * sp(Math.sin(t), 0.5), ax = hw2 * sp(Math.cos(t), 0.5);
        ring.push([cx + ca * (Rf + rad), cy + sa * (Rf + rad), cz + ax]);
      }
      rr.push(ring);
    }
    skin(b, solid ? 'metal' : 'wood', rr, { loop: true, tint: solid ? [0.55, 0.55, 0.52] : wood });
  }
  const hubR = solid ? 0.09 : 0.055;
  if (solid) {
    // pełna tarcza (ciężarówki, furgony): lekko wklęsła blacha
    const n = q === 0 ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      for (const f of [-1, 1]) {
        const P = (a, rad, z) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, cz + z];
        b.poly('metal', [P(a0, hubR, f * 0.02), P(a1, hubR, f * 0.02), P(a1, Rf, f * 0.03), P(a0, Rf, f * 0.03)], [0, 0, f], { tint: o.rim || [0.5, 0.18, 0.12] });
      }
    }
  } else {
    const ns = [6, 10, 12][q];
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * TAU + 0.2, ca = Math.cos(a), sa = Math.sin(a);
      b.tube('wood', [cx + ca * hubR * 0.8, cy + sa * hubR * 0.8, cz], [cx + ca * (Rf - hr2 * 0.6), cy + sa * (Rf - hr2 * 0.6), cz], 0.019, 0.014, q === 0 ? 3 : 4, { tint: [0.52, 0.36, 0.2] });
    }
  }
  const brass = { tint: [0.85, 0.65, 0.25] };
  b.tube('metal', [cx, cy, cz - 0.075], [cx, cy, cz + 0.075], hubR, hubR, q === 0 ? 6 : 10, { ...brass, caps: 1 });
  // kołpak na zewnętrznej stronie (side = 0: po obu stronach — jedna siatka na lewe i prawe koło)
  if (q >= 1) for (const f of side === 0 ? [-1, 1] : [side]) b.tube('metal', [cx, cy, cz + f * 0.075], [cx, cy, cz + f * 0.115], 0.05, 0.022, 8, { ...brass, caps: 1 });
}

// ── wspólne części ───────────────────────────────────────────────────────────
const DARK = [0.07, 0.07, 0.075], BRASS = [0.86, 0.66, 0.26], LEATHER = [0.32, 0.13, 0.08];

// błotnik: łuk nad kołem (pasek o przekroju spłaszczonej superelipsy)
function fender(b, S, x, r, z, side, tint, mat = 'body') {
  const R = r + 0.065, hw = 0.115, K = S.q ? 14 : 8, rings = [];
  const a0 = -0.42, a1 = Math.PI + 0.42; // rozciągnięty przed i za kołem — spływa w dół
  for (let k = 0; k <= K; k++) {
    const a = a0 + ((a1 - a0) * k) / K, ca = Math.cos(a), sa = Math.sin(a);
    // końce lekko odchylone na zewnątrz (zwinięty rant)
    const flare = Math.pow(Math.abs(Math.cos(((k / K) * 2 - 1) * Math.PI / 2)), 0.3);
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * TAU, rad = 0.014 * sp(Math.sin(t), 0.7), ax = hw * sp(Math.cos(t), 0.55);
      ring.push([x + ca * (R + rad), r + sa * (R + rad), z + side * 0.0 + ax * (0.85 + 0.15 * flare)]);
    }
    rings.push(ring);
  }
  skin(b, mat, rings, { tint, caps: true });
}

function chassis(b, S) {
  const { L, zc } = S, dk = { tint: DARK };
  for (const s of [-1, 1]) {
    b.box('dark', 0.1, 0.34, zc + s * 0.42 - 0.04, L - 0.28, 0.46, zc + s * 0.42 + 0.04, 'xXyYzZ', dk);
    // resor piórowy nad osią (lekko wygięty)
    for (const [x, r] of [[S.xr, S.rr], [S.xf, S.rf]]) b.box('dark', x - 0.38, r + 0.04, zc + s * S.tz * 0.88 - 0.025, x + 0.38, r + 0.075, zc + s * S.tz * 0.88 + 0.025, 'xXyYzZ', dk);
  }
  for (const [x, r] of [[S.xr, S.rr], [S.xf, S.rf]]) b.tube('dark', [x, r, zc - S.tz], [x, r, zc + S.tz], 0.032, 0.032, 6, dk);
  b.box('dark', 0.3, 0.3, zc - 0.5, L - 0.4, 0.42, zc + 0.5, 'xXyYzZ', dk); // misa olejowa, osłona
  if (S.q) {
    // rura wydechowa z tłumikiem po prawej burcie
    const zx = zc + 0.72;
    b.tube('metal', [L - 1.05, 0.38, zx], [S.xr - 0.1, 0.36, zx], 0.026, 0.026, 6, { tint: [0.28, 0.27, 0.26] });
    b.tube('metal', [S.xr + 0.55, 0.38, zx], [S.xr - 0.15, 0.38, zx], 0.07, 0.07, 8, { tint: [0.3, 0.29, 0.28], caps: 1 });
    // korba rozruchowa pod chłodnicą
    b.tube('metal', [L - 0.04, 0.5, zc], [L + 0.1, 0.5, zc], 0.014, 0.014, 4, { tint: [0.35, 0.35, 0.36] });
    b.tube('metal', [L + 0.1, 0.5, zc], [L + 0.1, 0.4, zc + 0.05], 0.014, 0.014, 4, { tint: [0.35, 0.35, 0.36] });
  }
}

function runningBoards(b, S, x0, x1, tint) {
  const { zc } = S;
  for (const s of [-1, 1]) {
    b.box('wood', x0, 0.46, zc + s * 0.62 - (s > 0 ? 0 : 0.3), x1, 0.5, zc + s * 0.62 + (s > 0 ? 0.3 : 0), 'xXyYzZ', { tint: tint || [0.18, 0.13, 0.1] });
    if (S.q) b.box('metal', x0, 0.5, zc + s * 0.62 + (s > 0 ? 0.27 : -0.3), x1, 0.52, zc + s * 0.62 + (s > 0 ? 0.3 : -0.27), 'xXYzZ', { tint: [0.45, 0.45, 0.45] });
  }
}

function bonnet(b, S, hx0, hx1, h = 0.4, top = 1.04) {
  const { L, zc } = S, c = S.color;
  const y0 = top - h, w = S.hoodW || 0.33;
  const secs = [
    { x: hx0, zc, y0: y0 + 0.02, y1: top - 0.02, hw: w * 0.94, e: 3.4 },
    { x: (hx0 + hx1) / 2, zc, y0, y1: top + 0.005, hw: w, e: 3.2 },
    { x: hx1, zc, y0: y0 - 0.02, y1: top + 0.02, hw: w * 1.04, e: 3.2 },
  ];
  lofted(b, 'body', secs, c, S.q ? 12 : 8);
  if (S.q) {
    // otwory wentylacyjne po bokach maski i listwa wzdłuż grzbietu
    for (let i = 0; i < 6; i++) {
      const x = hx0 + 0.16 + i * ((hx1 - hx0 - 0.3) / 6);
      for (const s of [-1, 1]) {
        const zz = zc + s * (w * 1.0 + 0.002);
        b.box('dark', x, y0 + 0.08, zz - (s > 0 ? 0 : 0.012), x + 0.03, top - 0.1, zz + (s > 0 ? 0.012 : 0), 'xXyYzZ', { tint: [0.05, 0.05, 0.05] });
      }
    }
    b.box('metal', hx0 + 0.05, top + 0.012, zc - 0.012, hx1 - 0.03, top + 0.03, zc + 0.012, 'xXyYzZ', { tint: BRASS });
  }
}

function radiator(b, S, x1, ybot = 0.56, ytop = 1.08) {
  const { zc } = S, w = 0.29, brass = { tint: BRASS };
  const xf = x1, xb = x1 - 0.1;
  // mosiężna obudowa: dwie pionowe listwy, górny i dolny zbiornik, ciemny rdzeń
  b.box('metal', xb, ybot, zc - w, xf, ytop, zc - w + 0.045, 'xXyYzZ', brass);
  b.box('metal', xb, ybot, zc + w - 0.045, xf, ytop, zc + w, 'xXyYzZ', brass);
  b.box('metal', xb, ytop - 0.07, zc - w, xf, ytop + 0.01, zc + w, 'xXyYzZ', brass);
  b.box('metal', xb, ybot, zc - w, xf, ybot + 0.06, zc + w, 'xXyYzZ', brass);
  b.box('dark', xf - 0.03, ybot + 0.06, zc - w + 0.045, xf - 0.012, ytop - 0.07, zc + w - 0.045, 'xXyYzZ', { tint: [0.06, 0.06, 0.06] });
  if (S.q) {
    for (let i = 1; i < 9; i++) {
      const z = zc - w + 0.045 + (i * (2 * w - 0.09)) / 9;
      b.box('metal', xf - 0.012, ybot + 0.06, z - 0.004, xf + 0.004, ytop - 0.07, z + 0.004, 'xXyYzZ', { tint: [0.55, 0.42, 0.18] });
    }
    b.cyl('metal', x1 - 0.05, zc, ytop, ytop + 0.1, 0.045, 0.032, 8, brass, 'Y');
    b.cyl('metal', x1 - 0.05, zc, ytop + 0.1, ytop + 0.115, 0.06, 0.06, 8, brass, 'Y');
  }
}

function lamps(b, S, x, y, zoff, big = true) {
  const { zc } = S, brass = { tint: BRASS }, r = big ? 0.115 : 0.07;
  for (const s of [-1, 1]) {
    const z = zc + s * zoff;
    b.tube('metal', [x - 0.16, y, z], [x + 0.02, y, z], r, r * 0.92, S.q ? 12 : 7, { ...brass, caps: 1 });
    b.tube('light', [x + 0.02, y, z], [x + 0.045, y, z], r * 0.82, r * 0.82, S.q ? 12 : 7, { caps: 1 });
    if (S.q) {
      b.tube('metal', [x + 0.02, y, z], [x + 0.05, y, z], r * 0.96, r * 0.96, 12, { ...brass, caps: 0 });
      b.cyl('metal', x - 0.1, z, y + r * 0.9, y + r * 1.4, r * 0.35, r * 0.2, 8, brass, 'Y');
    }
    b.tube('metal', [x - 0.12, y - r, z], [x - 0.12, y - r - 0.22, z * 0.6 + zc * 0.4], 0.016, 0.016, 5, { tint: DARK });
  }
}

function tailAndPlate(b, S, x, y, plateColor = [0.92, 0.9, 0.82]) {
  const { zc } = S;
  for (const s of [-1, 1]) b.box('tail', x - 0.05, y, zc + s * 0.5 - 0.06, x + 0.02, y + 0.12, zc + s * 0.5 + 0.06, 'xXyYzZ');
  b.box('paint', x - 0.02, y - 0.12, zc - 0.27, x + 0.02, y + 0.02, zc + 0.27, 'xXyYzZ', { tint: plateColor });
  b.box('dark', x - 0.025, y - 0.1, zc - 0.22, x - 0.02, y, zc + 0.22, 'xXyYzZ', { tint: [0.08, 0.08, 0.08] });
}

function steering(b, S, x, zside = -1) {
  const { zc } = S, z = zc + zside * 0.3;
  b.tube('metal', [x + 0.22, 0.85, z], [x - 0.02, 1.3, z], 0.022, 0.022, 6, { tint: DARK });
  const cx = x - 0.04, cy = 1.33, K = 14, rr = [];
  for (let k = 0; k < K; k++) {
    const a = (k / K) * TAU, ring = [];
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * TAU, rad = 0.014 * Math.sin(t), ax = 0.014 * Math.cos(t);
      ring.push([cx + 0.09 * Math.cos(a) * 0.5 + rad * 0.3 + Math.cos(a) * 0.0, cy + (0.19 * Math.cos(a)) * 0.5 + rad, z + 0.19 * Math.sin(a) + ax]);
    }
    rr.push(ring);
  }
  skin(b, 'wood', rr, { loop: true, tint: [0.3, 0.2, 0.12] });
  b.tube('metal', [cx, cy, z], [cx + 0.0, cy + 0.09, z + 0.19], 0.008, 0.008, 3, { tint: DARK });
}

// przednia szyba w mosiężnej ramie
function windscreen(b, S, x, ybot, ytop, hw, tilt = 0.12) {
  const { zc } = S, brass = { tint: BRASS };
  for (const s of [-1, 1]) b.tube('metal', [x, ybot, zc + s * hw], [x - tilt, ytop, zc + s * hw], 0.022, 0.02, 6, brass);
  b.tube('metal', [x - tilt, ytop, zc - hw], [x - tilt, ytop, zc + hw], 0.02, 0.02, 6, brass);
  b.tube('metal', [x - tilt * 0.4, ybot + (ytop - ybot) * 0.4, zc - hw], [x - tilt * 0.4, ybot + (ytop - ybot) * 0.4, zc + hw], 0.014, 0.014, 5, brass);
  const gl = { tint: [0.66, 0.74, 0.78] };
  b.poly('glass', [[x - tilt - 0.002, ytop - 0.02, zc - hw + 0.02], [x - tilt - 0.002, ytop - 0.02, zc + hw - 0.02], [x - 0.002, ybot + 0.02, zc + hw - 0.02], [x - 0.002, ybot + 0.02, zc - hw + 0.02]], [1, 0.1, 0], gl);
  b.poly('glass', [[x - tilt - 0.003, ytop - 0.02, zc + hw - 0.02], [x - tilt - 0.003, ytop - 0.02, zc - hw + 0.02], [x - 0.003, ybot + 0.02, zc - hw + 0.02], [x - 0.003, ybot + 0.02, zc + hw - 0.02]], [-1, -0.1, 0], gl);
}

// ławka z oparciem; (x0..x1) siedzisko, oparcie przy x0 (ku tyłowi)
function bench(b, S, x0, x1, y, z0, z1, backH = 0.5, tint = null) {
  const lt = tint || S.seat || LEATHER;
  rbox(b, 'paint', x0, y - 0.13, z0, x1, y, z1, lt, 3.4, 10);
  rboxZ(b, 'paint', x0, y - 0.04, z0, x0 + 0.15, y + backH, z1, lt, 3.2, 10);
}

// ── typy nadwozi ─────────────────────────────────────────────────────────────
function tubFloor(b, S, x0, x1, ytop = 0.72, w = 0.64) {
  const { zc } = S, c = S.color;
  lofted(b, 'body', [
    { x: x0, zc, y0: ytop - 0.34, y1: ytop, hw: w * 0.6, e: 3.4 },
    { x: x0 + 0.28, zc, y0: ytop - 0.3, y1: ytop, hw: w, e: 4 },
    { x: x1 - 0.1, zc, y0: ytop - 0.3, y1: ytop, hw: w, e: 4 },
    { x: x1, zc, y0: ytop - 0.3, y1: ytop, hw: w * 0.98, e: 4 },
  ], c, S.q ? 12 : 8);
}

// burty drzwi: cienkie płyty o zaokrąglonym górnym rancie, wysokość zmienna wzdłuż x
function doorSides(b, S, prof, ybot = 0.5, hw = 0.04) {
  const { zc } = S, c = S.color;
  for (const s of [-1, 1]) {
    const secs = prof.map(([x, y1]) => ({ x, zc: zc + s * 0.665, y0: ybot, y1, hw, e: 3.6 }));
    lofted(b, 'body', secs, c, S.q ? 10 : 6);
  }
}

function tourerBody(b, S) {
  const { L, zc, q } = S, xh = S.cowl;
  tubFloor(b, S, 0.1, xh);
  doorSides(b, S, [[0.1, 0.98], [0.5, 1.0], [1.4, 0.98], [1.95, 0.9], [2.35, 0.92], [xh - 0.02, 1.04]]);
  // przegroda (kokpit) i deska rozdzielcza
  rbox(b, 'body', xh - 0.12, 0.5, zc - 0.64, xh + 0.02, 1.06, zc + 0.64, S.color, 3.4, 10);
  b.box('wood', xh - 0.14, 1.0, zc - 0.55, xh - 0.02, 1.07, zc + 0.55, 'xXyYzZ', { tint: [0.34, 0.22, 0.12] });
  // tylna ścianka (tonneau)
  rbox(b, 'body', 0.04, 0.5, zc - 0.62, 0.2, 1.02, zc + 0.62, S.color, 3.4, 10);
  bench(b, S, xh - 0.62, xh - 0.12, 0.84, zc - 0.58, zc + 0.58, 0.52);
  bench(b, S, 0.28, 1.0, 0.84, zc - 0.6, zc + 0.6, 0.55);
  if (q) {
    // osłona kierowcy: dźwignie przy prawej burcie, mosiężna lampa boczna
    b.tube('metal', [xh - 0.4, 0.78, zc + 0.5], [xh - 0.42, 1.14, zc + 0.5], 0.012, 0.012, 4, { tint: DARK });
    b.tube('metal', [xh - 0.55, 0.78, zc + 0.5], [xh - 0.6, 1.1, zc + 0.5], 0.012, 0.012, 4, { tint: DARK });
    // klamki
    for (const x of [1.35, 2.0]) for (const s of [-1, 1]) b.box('metal', x, 0.88, zc + s * 0.71 - 0.015, x + 0.1, 0.9, zc + s * 0.71 + 0.015, 'xXyYzZ', { tint: BRASS });
    // linie drzwi
    for (const x of [1.15, 1.72, 2.28]) for (const s of [-1, 1]) b.box('dark', x, 0.55, zc + s * 0.7 - 0.006, x + 0.012, 0.98, zc + s * 0.7 + 0.006, 'xXyYzZ', { tint: [0.04, 0.04, 0.04] });
  }
  steering(b, S, xh - 0.28, -1);
  windscreen(b, S, xh + 0.1, 1.04, 1.7, 0.56);
  // bagażnik/zapas na tyle, skrzynia
  spare(b, S, -0.1, 0.82, zc, S.rr * 0.88);
  // klakson z gumową gruszką przy szybie
  if (q) {
    b.tube('metal', [xh + 0.06, 1.1, zc + 0.62], [xh + 0.45, 1.0, zc + 0.78], 0.014, 0.05, 8, { tint: BRASS, caps: 1 });
    b.cyl('metal', xh + 0.06, zc + 0.62, 1.04, 1.12, 0.03, 0.03, 6, { tint: [0.1, 0.1, 0.1] }, 'Y');
  }
}

// składana buda (baldachim) na czterech słupkach — taksówka
function canopy(b, S, x0, x1, ybase, ytop) {
  const { zc, q } = S;
  for (const [x, z] of [[x0 + 0.02, -0.6], [x0 + 0.02, 0.6], [x1 - 0.02, -0.6], [x1 - 0.02, 0.6]]) b.tube('metal', [x, ybase, zc + z], [x, ytop - 0.04, zc + z], 0.018, 0.018, 6, { tint: [0.18, 0.15, 0.12] });
  // dach: wypukły loft z lekkim nawisem
  const secs = [x0 - 0.14, (x0 + x1) / 2, x1 + 0.12].map((x, i) => ({ x, zc, y0: ytop - 0.1 - (i === 1 ? 0.0 : 0.04), y1: ytop + (i === 1 ? 0.06 : 0.0), hw: 0.74 - (i === 1 ? 0 : 0.03), e: 2.6 }));
  lofted(b, 'paint', secs, [0.1, 0.1, 0.1], q ? 12 : 8);
  if (q) {
    // frędzel z przodu
    b.box('paint', x1 + 0.1, ytop - 0.18, zc - 0.7, x1 + 0.125, ytop - 0.1, zc + 0.7, 'xXyYzZ', { tint: [0.45, 0.1, 0.08] });
    b.box('paint', x0 - 0.14, ytop - 0.18, zc - 0.7, x0 - 0.12, ytop - 0.1, zc + 0.7, 'xXyYzZ', { tint: [0.45, 0.1, 0.08] });
  }
}

function taxiExtras(b, S, x0, x1, ytop) {
  const { zc, q } = S;
  // latarnia "TAXI" na dachu: skrzynka z podświetlonymi czołami
  const cx = (x0 + x1) / 2;
  b.box('paint', cx - 0.1, ytop + 0.07, zc - 0.28, cx + 0.1, ytop + 0.26, zc + 0.28, 'xXyYzZ', { tint: [0.95, 0.78, 0.15] });
  b.box('light', cx - 0.102, ytop + 0.1, zc - 0.24, cx - 0.1, ytop + 0.23, zc + 0.24, 'x', { tint: [1, 0.9, 0.5] });
  b.box('light', cx + 0.1, ytop + 0.1, zc - 0.24, cx + 0.102, ytop + 0.23, zc + 0.24, 'X', { tint: [1, 0.9, 0.5] });
  if (q) {
    for (const x of [cx - 0.05, cx + 0.05]) b.box('dark', x - 0.012, ytop + 0.26, zc - 0.02, x + 0.012, ytop + 0.3, zc + 0.02, 'xXyYzZ', { tint: DARK });
  }
  // pas w szachownicę wzdłuż burt
  const n = 14, w = (S.cowl - 0.2) / n;
  for (let i = 0; i < n; i++)
    for (let row = 0; row < 2; row++) {
      if ((i + row) % 2) continue;
      for (const s of [-1, 1]) b.box('dark', 0.15 + i * w, 0.6 + row * 0.07, zc + s * 0.7 - 0.004, 0.15 + (i + 1) * w, 0.667 + row * 0.07, zc + s * 0.7 + 0.004, 'xXyYzZ', { tint: [0.04, 0.04, 0.04] });
    }
}

function sedanBody(b, S) {
  const { L, zc, q } = S, xh = S.cowl, c = S.color;
  // dolna część nadwozia (od progu do linii okien)
  lofted(b, 'body', [
    { x: 0.08, zc, y0: 0.5, y1: 1.08, hw: 0.5, e: 3.6 },
    { x: 0.32, zc, y0: 0.46, y1: 1.1, hw: 0.7, e: 4.2 },
    { x: xh - 0.1, zc, y0: 0.46, y1: 1.1, hw: 0.72, e: 4.2 },
    { x: xh + 0.05, zc, y0: 0.5, y1: 1.08, hw: 0.7, e: 3.8 },
  ], c, q ? 14 : 8);
  // słupki i dach (szklarnia)
  const roofY = 1.92, beltY = 1.1, pw = 0.07;
  const px = [0.28, 0.78, 1.38, 1.98, xh - 0.12];
  for (const x of px) for (const s of [-1, 1]) b.box('body', x, beltY, zc + s * 0.68 - 0.04, x + pw, roofY - 0.02, zc + s * 0.68 + 0.04, 'xXyYzZ', { tint: c });
  // dach: lekko wypukły loft z nawisem
  lofted(b, 'body', [
    { x: 0.14, zc, y0: roofY - 0.08, y1: roofY, hw: 0.7, e: 3 },
    { x: (0.14 + xh + 0.12) / 2, zc, y0: roofY - 0.06, y1: roofY + 0.07, hw: 0.78, e: 2.8 },
    { x: xh + 0.12, zc, y0: roofY - 0.08, y1: roofY, hw: 0.72, e: 3 },
  ], c, q ? 12 : 8);
  // szyby po bokach (między słupkami) i szyba tylna/przednia
  const gl = { tint: [0.58, 0.68, 0.74] };
  for (const s of [-1, 1]) {
    for (let i = 0; i < px.length - 1; i++) {
      const a = px[i] + pw, bx = px[i + 1];
      if (bx - a < 0.1) continue;
      const z = zc + s * 0.672;
      b.poly('glass', [[a, beltY + 0.03, z], [bx, beltY + 0.03, z], [bx, roofY - 0.05, z], [a, roofY - 0.05, z]], [0, 0, s], gl);
    }
  }
  b.poly('glass', [[xh - 0.05, beltY + 0.03, zc - 0.64], [xh - 0.05, beltY + 0.03, zc + 0.64], [xh - 0.11, roofY - 0.05, zc + 0.64], [xh - 0.11, roofY - 0.05, zc - 0.64]], [1, 0.15, 0], gl);
  b.poly('glass', [[0.16, beltY + 0.03, zc + 0.6], [0.16, beltY + 0.03, zc - 0.6], [0.2, roofY - 0.05, zc - 0.6], [0.2, roofY - 0.05, zc + 0.6]], [-1, 0.1, 0], gl);
  // wnętrze: ciemna podłoga, żeby szyby nie "świeciły" na wylot
  b.box('dark', 0.2, 0.94, zc - 0.62, xh - 0.15, 1.0, zc + 0.62, 'xXyYzZ', { tint: [0.08, 0.07, 0.06] });
  // bagażnik z tyłu (kufer na pasach) i zapas na progu
  rbox(b, 'paint', -0.28, 0.72, zc - 0.5, 0.08, 1.2, zc + 0.5, [0.25, 0.17, 0.1], 3.4, 10);
  for (const z of [-0.3, 0.3]) b.box('dark', -0.3, 0.7, zc + z - 0.02, 0.1, 1.22, zc + z + 0.02, 'xXyYzZ', { tint: DARK });
  if (q) {
    for (const x of [0.5, 1.1, 1.7]) for (const s of [-1, 1]) b.box('metal', x + 0.45, 0.9, zc + s * 0.71 - 0.015, x + 0.55, 0.92, zc + s * 0.71 + 0.015, 'xXyYzZ', { tint: BRASS });
    // bagażnik dachowy z balustradą
    for (const s of [-1, 1]) b.tube('metal', [0.4, roofY + 0.18, zc + s * 0.55], [xh - 0.1, roofY + 0.18, zc + s * 0.55], 0.012, 0.012, 4, { tint: BRASS });
    for (const x of [0.4, (0.4 + xh) / 2, xh - 0.1]) b.tube('metal', [x, roofY + 0.06, zc - 0.55], [x, roofY + 0.06, zc + 0.55], 0.01, 0.01, 4, { tint: BRASS });
    b.box('paint', 0.5, roofY + 0.06, zc - 0.45, 1.5, roofY + 0.34, zc + 0.45, 'xXyYzZ', { tint: [0.22, 0.14, 0.08] });
  }
  void L;
}

function vanBody(b, S) {
  const { L, zc, q } = S, xc = S.cowl, c = S.color;
  // kabina z szybami
  lofted(b, 'body', [
    { x: xc - 0.02, zc, y0: 0.5, y1: 1.1, hw: 0.74, e: 4 },
    { x: xc + 0.9, zc, y0: 0.5, y1: 1.1, hw: 0.74, e: 4 },
  ], c, q ? 12 : 8);
  const roofY = 1.95, cx0 = xc + 0.1, cx1 = xc + 0.88;
  for (const x of [cx0, cx1 - 0.07]) for (const s of [-1, 1]) b.box('body', x, 1.1, zc + s * 0.7 - 0.04, x + 0.07, roofY - 0.02, zc + s * 0.7 + 0.04, 'xXyYzZ', { tint: c });
  lofted(b, 'body', [
    { x: cx0 - 0.06, zc, y0: roofY - 0.08, y1: roofY, hw: 0.74, e: 3 },
    { x: cx1 + 0.12, zc, y0: roofY - 0.08, y1: roofY, hw: 0.74, e: 3 },
  ], c, 8);
  const gl = { tint: [0.58, 0.68, 0.74] };
  for (const s of [-1, 1]) b.poly('glass', [[cx0 + 0.07, 1.13, zc + s * 0.7], [cx1 - 0.07, 1.13, zc + s * 0.7], [cx1 - 0.07, roofY - 0.05, zc + s * 0.7], [cx0 + 0.07, roofY - 0.05, zc + s * 0.7]], [0, 0, s], gl);
  b.poly('glass', [[cx1 + 0.01, 1.13, zc - 0.66], [cx1 + 0.01, 1.13, zc + 0.66], [cx1 - 0.05, roofY - 0.05, zc + 0.66], [cx1 - 0.05, roofY - 0.05, zc - 0.66]], [1, 0.12, 0], gl);
  b.box('dark', xc, 1.05, zc - 0.66, cx1 - 0.1, 1.1, zc + 0.66, 'xXyYzZ', { tint: [0.08, 0.07, 0.06] });
  // przedział ładunkowy: skrzynia z lekko wypukłym dachem
  const bx1 = xc - 0.02;
  lofted(b, 'body', [
    { x: 0.04, zc, y0: 0.55, y1: 2.2, hw: 0.86, e: 5 },
    { x: bx1, zc, y0: 0.55, y1: 2.2, hw: 0.88, e: 5 },
  ], c, q ? 12 : 8);
  // pas reklamowy po bokach: kontrastowa tablica i napis z klocków
  const band = S.band || [0.95, 0.92, 0.82];
  for (const s of [-1, 1]) {
    const z = zc + s * 0.885;
    b.box('paint', 0.3, 1.05, z - (s > 0 ? 0 : 0.01), bx1 - 0.25, 1.85, z + (s > 0 ? 0.01 : 0), 'xXyYzZ', { tint: band });
    if (q) for (let i = 0; i < 7; i++) b.box('dark', 0.5 + i * ((bx1 - 1.0) / 7), 1.3, z - (s > 0 ? 0 : 0.012), 0.5 + i * ((bx1 - 1.0) / 7) + 0.12, 1.65, z + (s > 0 ? 0.012 : 0), 'xXyYzZ', { tint: [0.16, 0.1, 0.07] });
  }
  b.box('dark', -0.01, 1.0, zc - 0.04, 0.05, 2.0, zc + 0.04, 'xXyYzZ', { tint: DARK }); // listwa tylnych drzwi
  steering(b, S, xc + 0.5, -1);
}

function truckBody(b, S) {
  const { L, zc, q } = S, xc = S.cowl, c = S.color;
  // kabina otwarta z daszkiem
  lofted(b, 'body', [
    { x: xc, zc, y0: 0.55, y1: 1.15, hw: 0.78, e: 4 },
    { x: xc + 0.75, zc, y0: 0.55, y1: 1.15, hw: 0.78, e: 4 },
  ], c, 10);
  b.box('paint', xc + 0.45, 1.15, zc - 0.7, xc + 0.7, 1.7, zc + 0.7, 'xXyYzZ', { tint: [0.28, 0.17, 0.1] }); // oparcie
  rbox(b, 'paint', xc + 0.1, 1.15, zc - 0.7, xc + 0.5, 1.3, zc + 0.7, S.seat || LEATHER, 3.2, 8);
  for (const [x, z] of [[xc + 0.05, -0.74], [xc + 0.05, 0.74], [xc + 0.78, -0.74], [xc + 0.78, 0.74]]) b.tube('metal', [x, 1.15, zc + z], [x, 2.0, zc + z], 0.022, 0.022, 6, { tint: DARK });
  lofted(b, 'paint', [
    { x: xc - 0.1, zc, y0: 1.96, y1: 2.04, hw: 0.84, e: 3 },
    { x: xc + 0.4, zc, y0: 1.98, y1: 2.12, hw: 0.88, e: 2.8 },
    { x: xc + 0.9, zc, y0: 1.96, y1: 2.04, hw: 0.84, e: 3 },
  ], [0.12, 0.11, 0.1], 10);
  windscreen(b, S, xc + 0.04, 1.15, 1.9, 0.64, 0.06);
  steering(b, S, xc + 0.38, -1);
  // skrzynia ładunkowa: podłoga, burty z desek, ładunek
  const bx0 = 0.06, bx1 = xc - 0.08, fy = 0.72;
  b.box('wood', bx0, fy - 0.08, zc - 0.88, bx1, fy, zc + 0.88, 'xXyYzZ', { tint: [0.34, 0.24, 0.15] });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) b.box('wood', bx0, fy + 0.02 + k * 0.17, zc + s * 0.86 - 0.02, bx1, fy + 0.17 + k * 0.17, zc + s * 0.86 + 0.02, 'xXyYzZ', { tint: [0.4 + k * 0.01, 0.28, 0.17] });
  }
  b.box('wood', bx0, fy + 0.02, zc - 0.88, bx0 + 0.04, fy + 0.52, zc + 0.88, 'xXyYzZ', { tint: [0.36, 0.25, 0.15] });
  b.box('wood', bx1 - 0.04, fy + 0.02, zc - 0.88, bx1, fy + 0.52, zc + 0.88, 'xXyYzZ', { tint: [0.36, 0.25, 0.15] });
  const cargo = S.cargo || 0;
  if (cargo === 0) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) rbox(b, 'wood', bx0 + 0.15 + i * 0.52, fy + 0.0, zc - 0.7 + j * 0.72, bx0 + 0.62 + i * 0.52, fy + 0.46 + ((i + j) % 2) * 0.1, zc - 0.05 + j * 0.72, [0.5 + i * 0.03, 0.38, 0.22], 6, 6);
  } else {
    for (let i = 0; i < 2; i++) b.cyl('wood', bx0 + 0.45 + i * 0.75, zc - 0.35 + (i ? 0.7 : 0), fy, fy + 0.8, 0.3, 0.3, q ? 12 : 8, { tint: [0.45, 0.32, 0.18] }, 'Y');
    for (let i = 0; i < 2; i++) b.cyl('wood', bx0 + 0.45 + i * 0.75, zc + 0.35 - (i ? 0.7 : 0), fy, fy + 0.8, 0.3, 0.3, q ? 12 : 8, { tint: [0.4, 0.28, 0.16] }, 'Y');
  }
}

function roadsterBody(b, S) {
  const { L, zc, q } = S, xh = S.cowl;
  tubFloor(b, S, 0.1, xh, 0.74, 0.62);
  doorSides(b, S, [[0.1, 0.96], [0.6, 1.0], [1.3, 0.92], [1.7, 0.9], [xh - 0.02, 1.02]], 0.5, 0.04);
  rbox(b, 'body', xh - 0.12, 0.5, zc - 0.62, xh + 0.02, 1.04, zc + 0.62, S.color, 3.4, 10);
  bench(b, S, xh - 0.55, xh - 0.12, 0.84, zc - 0.55, zc + 0.55, 0.48);
  // kufer z tyłu z siedziskiem "rumble" pod klapą
  lofted(b, 'body', [
    { x: 0.04, zc, y0: 0.55, y1: 1.0, hw: 0.5, e: 3.6 },
    { x: 0.5, zc, y0: 0.5, y1: 1.02, hw: 0.64, e: 3.8 },
  ], S.color, q ? 12 : 8);
  b.box('metal', 0.1, 1.02, zc - 0.02, 0.5, 1.05, zc + 0.02, 'xXyYzZ', { tint: BRASS });
  steering(b, S, xh - 0.26, -1);
  windscreen(b, S, xh + 0.08, 1.02, 1.55, 0.54, 0.16);
}

// ── specyfikacje typów ───────────────────────────────────────────────────────
// L, Wd — wymiary nominalne; hood: początek/koniec maski; cowl: przegroda (x)
export const CAR_KINDS = {
  tourer: { L: 3.75, Wd: 1.75, rr: 0.46, rf: 0.41, front: 0.7, rear: 0.68, hood: 1.15, hoodTop: 1.04, hoodH: 0.4, body: tourerBody, board: true, blackFenders: true },
  taxi: { L: 3.8, Wd: 1.78, rr: 0.46, rf: 0.41, front: 0.7, rear: 0.68, hood: 1.15, hoodTop: 1.04, hoodH: 0.4, body: tourerBody, board: true, taxi: true, blackFenders: true },
  sedan: { L: 3.85, Wd: 1.8, rr: 0.47, rf: 0.43, front: 0.72, rear: 0.7, hood: 1.0, hoodTop: 1.06, hoodH: 0.46, body: sedanBody, board: true, blackFenders: true },
  van: { L: 4.6, Wd: 1.9, rr: 0.5, rf: 0.45, front: 0.72, rear: 0.72, hood: 0.95, hoodTop: 1.06, hoodH: 0.46, body: vanBody, board: true, solid: true, blackFenders: true },
  truck: { L: 5.4, Wd: 2.0, rr: 0.56, rf: 0.5, front: 0.8, rear: 0.8, hood: 1.0, hoodTop: 1.12, hoodH: 0.5, body: truckBody, board: true, solid: true, blackFenders: true },
  roadster: { L: 3.6, Wd: 1.7, rr: 0.44, rf: 0.4, front: 0.66, rear: 0.62, hood: 1.2, hoodTop: 1.0, hoodH: 0.38, body: roadsterBody, board: false },
};
export const PARKED_KINDS = ['tourer', 'sedan', 'roadster', 'taxi'];

// punkty zakotwiczenia pasażerów w układzie modułu (środek komórki = 0,0): [x, y, z]
export function carAnchors(kind) {
  const K = CAR_KINDS[kind] || CAR_KINDS.tourer, cowl = K.L - K.hood - 0.25;
  const x = (v) => v - K.L / 2, z = (v) => v - K.Wd / 2;
  const driverX = kind === 'van' ? cowl + 0.5 : kind === 'truck' ? cowl + 0.3 : kind === 'sedan' ? cowl - 0.35 : cowl - 0.37;
  const seatY = kind === 'truck' ? 1.3 : kind === 'van' ? 0.95 : 0.84;
  return {
    driver: [x(driverX), seatY, z(K.Wd / 2 - 0.3)],
    rider: [x(0.65), 0.84, z(K.Wd / 2)],
    steer: [x(cowl - 0.32), 1.3, z(K.Wd / 2 - 0.3)],
    wheels: wheelPoints(K),
  };
}

function wheelPoints(K) {
  const tz = K.Wd / 2 - 0.1, xr = K.rear, xf = K.L - K.front;
  const x = (v) => v - K.L / 2;
  return [
    { x: x(xf), y: K.rf, z: -tz, r: K.rf, front: true }, { x: x(xf), y: K.rf, z: tz, r: K.rf, front: true },
    { x: x(xr), y: K.rr, z: -tz, r: K.rr, front: false }, { x: x(xr), y: K.rr, z: tz, r: K.rr, front: false },
  ];
}

export const vehicleModules = {
  // Wóz: p = { kind, color, seat, q (0..2 poziom detalu), wheels (false = bez kół), taxi }
  oldcar(b, W, H, D, p) {
    const K = CAR_KINDS[p.kind || (p.taxi ? 'taxi' : 'tourer')];
    const kx = W / K.L, zc = D / 2; // skala długości (zaparkowane auta mają stałą stopkę 3,6 m)
    const S = {
      L: W / kx, zc, q: p.q ?? 2, color: p.color || [0.5, 0.1, 0.1], seat: p.seat, band: p.band, cargo: p.cargo,
      rr: K.rr, rf: K.rf, tz: D / 2 - 0.1 - 0.0, hoodW: K.L > 4.2 ? 0.37 : 0.33,
    };
    S.L = K.L; S.xr = K.rear; S.xf = K.L - K.front; S.cowl = K.L - K.hood - 0.25;
    S.tz = K.Wd / 2 - 0.1;
    S.zc = K.Wd / 2;
    S.tint = S.color;
    // wszystkie współrzędne liczymy w układzie nominalnym; cage (W×D) dopasuje długość
    chassis(b, S);
    if (K.board) runningBoards(b, S, S.xr + 0.4, S.xf - 0.45);
    bonnet(b, S, K.L - 0.2, S.cowl + 0.05, K.hoodH, K.hoodTop);
    radiator(b, S, K.L - 0.06, K.hoodTop - K.hoodH - 0.06, K.hoodTop + 0.04);
    lamps(b, S, K.L - 0.14, K.hoodTop - 0.02, K.Wd / 2 - 0.35);
    tailAndPlate(b, S, 0.0, 0.6);
    K.body(b, S);
    if (p.taxi || K === CAR_KINDS.taxi) {
      canopy(b, S, 0.2, S.cowl - 0.9, 0.98, 2.0);
      taxiExtras(b, S, 0.2, S.cowl - 0.9, 2.0);
    }
    for (const [x, r] of [[S.xf, K.rf], [S.xr, K.rr]]) for (const s of [-1, 1]) K.blackFenders ? fender(b, S, x, r, S.zc + s * S.tz, s, [0.07, 0.07, 0.08], 'paint') : fender(b, S, x, r, S.zc + s * S.tz, s, S.color);
    if (p.wheels !== false) {
      const solid = !!K.solid;
      for (const w of wheelPoints(K)) wheel(b, w.x + K.L / 2, w.y, w.z + K.Wd / 2, w.r, { q: S.q, side: Math.sign(w.z), solid, rim: solid ? [0.5, 0.17, 0.12] : undefined, hr: solid ? 0.08 : 0.058, hw: solid ? 0.085 : 0.066 });
    }
  },

  // pojedyncze koło (do aut z kręcącymi się kołami): środek komórki → (W/2, 0.5, D/2)
  carwheel(b, W, H, D, p) {
    wheel(b, W / 2, 0.5, D / 2, p.r || 0.45, { q: p.q ?? 2, side: p.side ?? 1, solid: p.solid, rim: p.rim, hr: p.hr, hw: p.hw });
  },
};
