// ─────────────────────────────────────────────────────────────────────────────
//  LUDZIE — części ciała na przegubach. Każda część ma początek układu w swoim
//  przegubie (biodro, kolano, ramię, szyja…) i wisi w dół / rośnie w górę, więc
//  animacja to tylko obrót wokół początku. Układ: x = przód, y = góra, z = prawa strona.
//  Wszystko z materiału `cloth`; kolor nadaje instanceColor (skóra, ubranie, włosy…),
//  a wierzchołki niosą tylko względne zaciemnienie detali (oczy, guziki, opaski).
//  Wymiary ~1,9 m: w grze skalowane do ~1,75 m.
// ─────────────────────────────────────────────────────────────────────────────
import { skin, sp, TAU, rbox } from './vehicles.js';

export const PELVIS_Y = 0.99; // wysokość biodra nad podłożem
export const DIM = { torso: 0.57, thigh: 0.46, shin: 0.44, foot: 0.085, upper: 0.3, fore: 0.27, hand: 0.09, shoulderY: 0.5, shoulderZ: 0.215, hipZ: 0.086, neck: 0.0 };

// pierścień w płaszczyźnie poziomej (x,z) na wysokości y; łuk t0..t1 (domyślnie cały obwód)
function ringY(y, cx, cz, hx, hz, e = 2.3, n = 12, t0 = 0, t1 = TAU) {
  const pts = [], full = t1 - t0 >= TAU - 1e-6, m = full ? n : n + 1;
  for (let i = 0; i < m; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    pts.push([cx + hx * sp(Math.cos(t), 2 / e), y, cz + hz * sp(Math.sin(t), 2 / e)]);
  }
  return pts;
}

// loft pionowy: secs = [[y, cx, hx, hz, (e)]...] (cz = 0); open = łuk (t0,t1) bez zaślepek
function vloft(b, secs, tint, n = 12, caps = true, arc = null) {
  const rings = secs.map(([y, cx, hx, hz, e]) => ringY(y, cx, 0, hx, hz, e || 2.3, n, arc ? arc[0] : 0, arc ? arc[1] : TAU));
  skin(b, 'cloth', rings, { tint, caps: caps && !arc, open: !!arc });
}

const WHITE = [1, 1, 1];

// ── korpus: kurtka, płaszcz, suknia (początek = biodro, góra = szyja przy y = 0.57) ──
function bodiceSecs() {
  return [
    [0.0, 0, 0.108, 0.17], [0.1, 0, 0.095, 0.145], [0.25, 0.005, 0.11, 0.175],
    [0.4, 0.005, 0.115, 0.205], [0.5, 0, 0.1, 0.215], [0.54, 0, 0.082, 0.165], [0.575, 0, 0.05, 0.07],
  ];
}

function buttons(b, ys) {
  for (const y of ys) {
    const hx = y < 0.18 ? 0.098 : 0.113;
    b.box('cloth', hx - 0.004, y - 0.012, -0.012, hx + 0.012, y + 0.012, 0.012, 'xXyYzZ', { tint: [0.08, 0.08, 0.08] });
  }
}

export const PEOPLE_PARTS = {
  jacket(b) {
    vloft(b, [[-0.14, 0, 0.108, 0.168], [-0.07, 0, 0.11, 0.172], ...bodiceSecs().slice(0)], WHITE, 14);
    buttons(b, [0.08, 0.2, 0.32]);
  },
  coat(b) {
    vloft(b, [[-0.68, 0, 0.17, 0.255], [-0.45, 0, 0.145, 0.225], [-0.2, 0, 0.12, 0.19], [-0.06, 0, 0.112, 0.176], ...bodiceSecs()], WHITE, 14);
    buttons(b, [0.0, 0.12, 0.24, 0.36]);
    // kołnierz płaszcza
    vloft(b, [[0.5, 0.0, 0.082, 0.1], [0.58, 0.0, 0.075, 0.085]], [0.82, 0.82, 0.82], 10, false);
  },
  dress(b) {
    // stanik + dzwonowa spódnica do kostek, pas i rąbek ciemniejsze
    vloft(b, [
      [-0.9, 0, 0.29, 0.325], [-0.6, 0, 0.24, 0.285], [-0.3, 0, 0.18, 0.225], [-0.08, 0, 0.14, 0.19], [0.0, 0, 0.1, 0.15],
      [0.1, 0, 0.083, 0.118], [0.25, 0.01, 0.108, 0.158], [0.4, 0.012, 0.112, 0.178], [0.5, 0, 0.09, 0.19], [0.54, 0, 0.075, 0.15], [0.575, 0, 0.05, 0.07],
    ], WHITE, 16);
    vloft(b, [[-0.9, 0, 0.292, 0.327], [-0.8, 0, 0.275, 0.31]], [0.55, 0.55, 0.55], 16, false);
    vloft(b, [[0.06, 0, 0.088, 0.12], [0.14, 0, 0.088, 0.12]], [0.55, 0.55, 0.55], 12, false);
  },
  // koszula z kołnierzykiem i krawatem (jasna wstawka z przodu korpusu)
  shirt(b) {
    vloft(b, [[0.06, 0, 0.101, 0.05], [0.25, 0.005, 0.115, 0.07], [0.42, 0.005, 0.118, 0.075], [0.5, 0, 0.104, 0.07]], WHITE, 8, false, [-1.35, 1.35]);
    vloft(b, [[0.5, 0, 0.056, 0.058], [0.6, 0.0, 0.052, 0.054]], WHITE, 10, false);
    b.box('cloth', 0.104, 0.12, -0.012, 0.118, 0.5, 0.012, 'xXyYzZ', { tint: [0.28, 0.28, 0.3] }); // krawat
  },
  // szal/chustka dla kobiet
  scarf(b) {
    vloft(b, [[0.5, 0, 0.1, 0.12], [0.6, 0, 0.07, 0.08]], WHITE, 10, false);
  },

  // ── głowa (początek = podstawa szyi) ──
  head(b) {
    vloft(b, [[0, 0, 0.05, 0.05], [0.1, 0, 0.047, 0.047]], WHITE, 8, false);
    vloft(b, [
      [0.085, 0.018, 0.06, 0.055], [0.12, 0.015, 0.088, 0.077], [0.17, 0.008, 0.106, 0.09],
      [0.23, 0.0, 0.11, 0.092], [0.285, -0.005, 0.099, 0.081], [0.325, -0.008, 0.066, 0.056], [0.345, -0.008, 0.03, 0.026],
    ], WHITE, 14, true);
    rbox(b, 'cloth', 0.1, 0.152, -0.016, 0.138, 0.205, 0.016, [0.96, 0.9, 0.88], 3, 6); // nos
    for (const s of [-1, 1]) {
      b.box('cloth', -0.02, 0.165, s * 0.09 - 0.007, 0.03, 0.215, s * 0.09 + 0.007, 'xXyYzZ', { tint: [0.95, 0.9, 0.88] }); // ucho
      b.box('cloth', 0.103, 0.205, s * 0.037 - 0.014, 0.113, 0.217, s * 0.037 + 0.014, 'xXyYzZ', { tint: [0.06, 0.06, 0.07] }); // oko
      b.box('cloth', 0.098, 0.228, s * 0.037 - 0.018, 0.108, 0.234, s * 0.037 + 0.018, 'xXyYzZ', { tint: [0.35, 0.3, 0.28] }); // brew
    }
    b.box('cloth', 0.097, 0.118, -0.024, 0.107, 0.128, 0.024, 'xXyYzZ', { tint: [0.62, 0.34, 0.34] }); // usta
  },
  hairShort(b) {
    vloft(b, [[0.255, -0.004, 0.113, 0.094], [0.29, -0.008, 0.103, 0.085], [0.33, -0.01, 0.07, 0.06], [0.352, -0.01, 0.032, 0.028]], WHITE, 14, true);
    vloft(b, [[0.12, -0.012, 0.094, 0.088], [0.17, -0.012, 0.106, 0.098], [0.22, -0.008, 0.113, 0.098], [0.27, -0.008, 0.109, 0.095]], WHITE, 12, false, [Math.PI * 0.55, Math.PI * 1.45]);
  },
  hairStache(b) {
    PEOPLE_PARTS.hairShort(b);
    rbox(b, 'cloth', 0.099, 0.132, -0.034, 0.122, 0.15, 0.034, WHITE, 3, 6);
  },
  hairLong(b) {
    PEOPLE_PARTS.hairShort(b);
    vloft(b, [[-0.26, -0.07, 0.05, 0.085], [-0.12, -0.06, 0.07, 0.1], [0.05, -0.04, 0.095, 0.108], [0.17, -0.02, 0.112, 0.1], [0.24, -0.01, 0.115, 0.097]], WHITE, 12, false, [Math.PI * 0.5, Math.PI * 1.5]);
  },
  hairBun(b) {
    PEOPLE_PARTS.hairShort(b);
    vloft(b, [[0.195, -0.1, 0.01, 0.01], [0.22, -0.12, 0.045, 0.045], [0.255, -0.115, 0.055, 0.055], [0.29, -0.105, 0.04, 0.04], [0.305, -0.1, 0.012, 0.012]], WHITE, 10, true);
  },

  // ── nakrycia głowy ──
  hatTop(b) {
    vloft(b, [[0.292, 0, 0.17, 0.16], [0.3, 0, 0.176, 0.166], [0.312, 0, 0.12, 0.11]], WHITE, 16, true);
    vloft(b, [[0.31, 0, 0.098, 0.088], [0.46, 0, 0.1, 0.09], [0.505, 0, 0.098, 0.088]], WHITE, 14, true);
    vloft(b, [[0.312, 0, 0.1, 0.09], [0.345, 0, 0.102, 0.092]], [0.3, 0.3, 0.3], 14, false);
  },
  hatBowler(b) {
    vloft(b, [[0.295, 0, 0.152, 0.138], [0.304, 0, 0.157, 0.142], [0.31, 0, 0.115, 0.1]], WHITE, 16, true);
    vloft(b, [[0.305, 0, 0.108, 0.094], [0.355, 0, 0.103, 0.09], [0.4, 0, 0.082, 0.07], [0.43, 0, 0.045, 0.04], [0.443, 0, 0.012, 0.01]], WHITE, 14, true);
    vloft(b, [[0.308, 0, 0.11, 0.096], [0.332, 0, 0.108, 0.094]], [0.3, 0.3, 0.3], 14, false);
  },
  hatCap(b) {
    vloft(b, [[0.285, -0.01, 0.126, 0.104], [0.325, -0.012, 0.128, 0.106], [0.352, -0.014, 0.1, 0.085], [0.365, -0.014, 0.05, 0.045], [0.37, -0.014, 0.012, 0.01]], WHITE, 14, true);
    rbox(b, 'cloth', 0.09, 0.288, -0.07, 0.19, 0.3, 0.07, [0.88, 0.88, 0.88], 3, 8); // daszek
  },
  hatBonnet(b) {
    vloft(b, [[0.282, 0, 0.24, 0.23], [0.292, 0, 0.245, 0.235], [0.3, 0, 0.16, 0.15]], WHITE, 18, true);
    vloft(b, [[0.298, 0, 0.1, 0.092], [0.34, 0, 0.098, 0.09], [0.385, 0, 0.07, 0.065], [0.4, 0, 0.03, 0.028]], WHITE, 14, true);
    vloft(b, [[0.3, 0, 0.102, 0.094], [0.328, 0, 0.1, 0.092]], [0.35, 0.35, 0.35], 14, false);
  },

  // ── kończyny ──
  upperArm(b) {
    vloft(b, [[0.035, 0, 0.034, 0.033], [0.0, 0, 0.05, 0.048], [-0.1, 0, 0.048, 0.046], [-0.22, 0, 0.041, 0.04], [-0.3, 0, 0.037, 0.036]], WHITE, 9, true);
  },
  foreArm(b) {
    vloft(b, [[0.0, 0, 0.038, 0.036], [-0.14, 0, 0.034, 0.031], [-0.27, 0, 0.03, 0.027]], WHITE, 9, true);
    vloft(b, [[-0.24, 0, 0.032, 0.03], [-0.27, 0, 0.032, 0.03]], [0.9, 0.9, 0.9], 9, false);
  },
  hand(b) {
    vloft(b, [[0.0, 0, 0.022, 0.028], [-0.03, 0, 0.02, 0.036], [-0.075, 0, 0.017, 0.03], [-0.095, 0, 0.008, 0.012]], WHITE, 8, true);
    rbox(b, 'cloth', 0.012, -0.065, -0.004, 0.034, -0.012, 0.01, WHITE, 3, 6);
  },
  thigh(b) {
    vloft(b, [[0.03, 0, 0.06, 0.056], [-0.02, 0, 0.076, 0.068], [-0.2, 0, 0.068, 0.062], [-0.46, 0, 0.054, 0.05]], WHITE, 10, true);
  },
  shin(b) {
    vloft(b, [[0.0, 0, 0.058, 0.055], [-0.12, -0.008, 0.058, 0.054], [-0.3, -0.004, 0.046, 0.044], [-0.44, 0, 0.04, 0.038]], WHITE, 9, true);
    vloft(b, [[-0.4, 0, 0.044, 0.042], [-0.44, 0, 0.044, 0.042]], [0.85, 0.85, 0.85], 9, false);
  },
  shoe(b) {
    const col = [0.1, 0.065, 0.045];
    const rings = [
      [-0.085, 0.045, -0.085, 0.03], [-0.05, 0.05, -0.085, 0.043], [0.04, 0.052, -0.088, 0.02], [0.14, 0.047, -0.088, -0.012], [0.215, 0.028, -0.086, -0.045],
    ].map(([x, hw, y0, y1]) => {
      const pts = [];
      for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU; pts.push([x, (y0 + y1) / 2 + ((y1 - y0) / 2) * sp(Math.sin(t), 0.55), hw * sp(Math.cos(t), 0.5)]); }
      return pts;
    });
    skin(b, 'cloth', rings, { tint: col, caps: true });
    b.box('cloth', -0.07, -0.09, -0.05, 0.22, -0.082, 0.05, 'xXyYzZ', { tint: [0.04, 0.035, 0.03] }); // podeszwa
  },
};

// które części dostają kolor skóry, ubioru, włosów — używa renderer (instanceColor)
export const PART_TINT = {
  jacket: 'coat', coat: 'coat', dress: 'coat', shirt: 'shirt', scarf: 'accent', head: 'skin', hairShort: 'hair', hairStache: 'hair', hairLong: 'hair', hairBun: 'hair',
  hatTop: 'hat', hatBowler: 'hat', hatCap: 'hat', hatBonnet: 'hat', upperArm: 'coat', foreArm: 'coat', hand: 'skin', thigh: 'pants', shin: 'pants', shoe: null,
};
