// Karabin powtarzalny z zamkiem (z epoki): łoże, lufa, komora zamkowa, muszka i szczerbinka,
// magazynek, kabłąk, pasek. Układ: x = do przodu (lufa), y = góra, z = prawa strona;
// początek w komorze zamkowej, tam gdzie chwyta prawa dłoń. Zamek jest osobno (animacja).
import { skin, sp, TAU } from './vehicles.js';

const WOOD = [0.43, 0.27, 0.14], WOOD_D = [0.3, 0.18, 0.1], STEEL = [0.2, 0.22, 0.25], BLUE = [0.12, 0.13, 0.16];

function ringZY(x, yc, zc, hy, hz, e = 3, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * TAU; pts.push([x, yc + hy * sp(Math.sin(t), 2 / e), zc + hz * sp(Math.cos(t), 2 / e)]); }
  return pts;
}

function stock(b) {
  // [x, y0, y1, półszerokość]
  const S = [
    [-0.54, -0.135, 0.045, 0.016], [-0.5, -0.135, 0.05, 0.022], [-0.4, -0.115, 0.058, 0.023], [-0.28, -0.09, 0.05, 0.019],
    [-0.17, -0.105, 0.034, 0.019], [-0.1, -0.125, 0.024, 0.021], [-0.03, -0.09, 0.012, 0.022], [0.1, -0.07, 0.008, 0.023],
    [0.25, -0.058, 0.0, 0.021], [0.42, -0.05, -0.004, 0.018], [0.47, -0.046, -0.006, 0.016],
  ];
  skin(b, 'wood', S.map(([x, y0, y1, hw]) => ringZY(x, (y0 + y1) / 2, 0, (y1 - y0) / 2, hw, 3, 10)), { tint: WOOD, caps: true });
  // okładka lufy (górna osłona drewniana nad lufą przy przedzie)
  skin(b, 'wood', [0.12, 0.36].map((x) => ringZY(x, 0.02, 0, 0.012, 0.016, 3, 8)), { tint: WOOD_D, caps: true });
  // kolba: metalowa stopka
  b.box('metal', -0.552, -0.138, -0.025, -0.538, 0.05, 0.025, 'xXyYzZ', { tint: STEEL });
}

function metal(b) {
  // lufa
  b.tube('metal', [-0.06, 0.028, 0], [0.74, 0.028, 0], 0.0115, 0.0085, 10, { tint: BLUE, caps: 1 });
  // komora zamkowa (pudło) + pierścień
  b.box('metal', -0.12, 0.002, -0.02, 0.1, 0.054, 0.02, 'xXyYzZ', { tint: STEEL });
  b.tube('metal', [0.04, 0.028, 0], [0.12, 0.028, 0], 0.017, 0.015, 10, { tint: STEEL, caps: 1 });
  // obejmy lufy
  for (const x of [0.2, 0.34, 0.47]) b.tube('metal', [x, 0.028, 0], [x + 0.012, 0.028, 0], 0.018, 0.018, 10, { tint: [0.35, 0.33, 0.28], caps: 1 });
  // muszka z osłoną i koniec lufy
  b.box('metal', 0.69, 0.036, -0.003, 0.7, 0.056, 0.003, 'xXyYzZ', { tint: STEEL });
  b.tube('metal', [0.725, 0.028, 0], [0.745, 0.028, 0], 0.013, 0.013, 10, { tint: STEEL, caps: 1 });
  // szczerbinka (rampa i drabinka)
  b.box('metal', 0.12, 0.054, -0.012, 0.2, 0.064, 0.012, 'xXyYzZ', { tint: STEEL });
  b.box('metal', 0.19, 0.064, -0.01, 0.2, 0.082, -0.004, 'xXyYzZ', { tint: STEEL });
  b.box('metal', 0.19, 0.064, 0.004, 0.2, 0.082, 0.01, 'xXyYzZ', { tint: STEEL });
  // magazynek pod komorą i kabłąk spustu
  b.box('metal', -0.03, -0.095, -0.017, 0.1, -0.012, 0.017, 'xXyYzZ', { tint: BLUE });
  const arc = [];
  for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); arc.push([-0.1 - 0.05 * Math.sin(a) * 0 + 0.0, -0.01 - 0.045 * Math.sin(a), 0]); }
  b.tube('metal', [-0.17, -0.02, 0], [-0.16, -0.068, 0], 0.0045, 0.0045, 5, { tint: STEEL });
  b.tube('metal', [-0.16, -0.068, 0], [-0.07, -0.068, 0], 0.0045, 0.0045, 5, { tint: STEEL });
  b.tube('metal', [-0.07, -0.068, 0], [-0.07, -0.01, 0], 0.0045, 0.0045, 5, { tint: STEEL });
  void arc;
  // spust i bolec
  b.tube('metal', [-0.125, -0.012, 0], [-0.118, -0.045, 0], 0.004, 0.0035, 5, { tint: STEEL });
  // uchwyty paska
  b.tube('metal', [-0.5, -0.12, -0.026], [-0.5, -0.12, 0.026], 0.004, 0.004, 5, { tint: STEEL });
  b.tube('metal', [0.46, -0.05, -0.02], [0.46, -0.05, 0.02], 0.004, 0.004, 5, { tint: STEEL });
}

export const weaponModules = {
  rifle(b) {
    stock(b);
    metal(b);
  },
  // zamek: trzpień + uchwyt z gałką; początek w osi komory, przesuwa się wzdłuż x
  bolt(b) {
    b.tube('metal', [-0.2, 0.034, 0], [0.0, 0.034, 0], 0.0115, 0.0115, 10, { tint: [0.55, 0.55, 0.58], caps: 1 });
    b.tube('metal', [-0.17, 0.034, 0.0], [-0.17, 0.018, 0.058], 0.006, 0.006, 6, { tint: [0.55, 0.55, 0.58], caps: 1 });
    // gałka
    b.tube('metal', [-0.17, 0.018, 0.058], [-0.17, 0.006, 0.072], 0.014, 0.011, 8, { tint: [0.6, 0.6, 0.62], caps: 1 });
  },
  // ręce: rękawy w kolorze płaszcza i dłonie (skóra), do widoku z pierwszej osoby
  arms(b, W, H, D, p) {
    const sleeve = { tint: p.coat || [0.2, 0.17, 0.14] }, skinT = { tint: p.skin || [0.86, 0.66, 0.52] };
    // prawa ręka: za chwyt kolby, spust
    b.tube('cloth', [-0.62, -0.32, 0.18], [-0.12, -0.075, 0.012], 0.044, 0.036, 9, { ...sleeve, caps: 1 });
    b.box('cloth', -0.145, -0.1, -0.026, -0.06, -0.035, 0.034, 'xXyYzZ', skinT);
    b.tube('cloth', [-0.1, -0.035, 0.025], [-0.07, -0.0, 0.01], 0.012, 0.01, 5, { ...skinT, caps: 1 }); // palec na spuście
    // lewa ręka: pod łożem
    b.tube('cloth', [0.05, -0.4, -0.22], [0.27, -0.082, -0.0], 0.04, 0.034, 9, { ...sleeve, caps: 1 });
    b.box('cloth', 0.225, -0.115, -0.034, 0.335, -0.05, 0.034, 'xXyYzZ', skinT);
  },
};
