// ─────────────────────────────────────────────────────────────────────────────
//  NOWE ELEMENTY MIASTA — moduły rekwizytów (rozmiary i zasady stawiania: city/props.js).
//  Każdy moduł pisze w komórce W×H×D (x wzdłuż lica, y w górę, z w głąb; z = 0 to strona
//  zwrócona do ulicy). Instalowane w modules.js przez installProps(M, helpers).
// ─────────────────────────────────────────────────────────────────────────────
import { atlasUV, atlasAspect } from './atlas.js';

const WOOD = [0.64, 0.48, 0.31], DARK_WOOD = [0.45, 0.32, 0.21], IRON = [0.13, 0.14, 0.14], BRASS = [0.85, 0.65, 0.25];
const STONE = [0.78, 0.76, 0.72], GREEN_PATINA = [0.3, 0.46, 0.4];

export function installProps(M, { cubeSphere }) {
  // koło szprychowe w płaszczyźnie xy, oś wzdłuż z (środek x,y,z)
  const wheel = (b, x, y, z, r, o = {}) => {
    const n = 14, tire = o.tire || IRON, spoke = o.spoke || WOOD;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      b.tube('dark', [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], 0.03, 0.03, 5, { tint: tire });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.tube('wood', [x, y, z], [x + Math.cos(a) * (r - 0.03), y + Math.sin(a) * (r - 0.03), z], 0.014, 0.012, 4, { tint: spoke });
    }
    b.tube('metal', [x, y, z - 0.05], [x, y, z + 0.05], 0.05, 0.05, 8, { tint: BRASS, caps: 1 });
  };
  // fasetka plakatu na walcu: kąty a0<a1 w układzie lokalnym, widza zewnętrznego „lewy→prawy” zależy od kostki
  const facetPoster = (b, cx, cz, R, a0, a1, y0, y1, uv) => {
    const [aL, aR] = b.cage.sign > 0 ? [a1, a0] : [a0, a1];
    const L = [cx + Math.cos(aL) * R, cz + Math.sin(aL) * R], Rr = [cx + Math.cos(aR) * R, cz + Math.sin(aR) * R];
    const am = (a0 + a1) / 2;
    b.poly('poster', [[L[0], y0, L[1]], [Rr[0], y0, Rr[1]], [Rr[0], y1, Rr[1]], [L[0], y1, L[1]]], [Math.cos(am), 0, Math.sin(am)], { uv });
  };
  // markiza w pasy (skos od ściany w dół), n pasów
  const awning = (b, x0, x1, yTop, yBot, zTop, zBot, c1, c2, n = 8) => {
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n, o = { tint: i % 2 ? c1 : c2 };
      b.poly('paint', [[xa, yTop, zTop], [xb, yTop, zTop], [xb, yBot, zBot], [xa, yBot, zBot]], [0, 1, -0.5], o);
      b.poly('paint', [[xb, yTop, zTop], [xa, yTop, zTop], [xa, yBot, zBot], [xb, yBot, zBot]], [0, -1, 0.5], { ...o, shade: 0.6 });
      b.rect('paint', xa, yBot - 0.16, xb, yBot, zBot, o);
    }
  };
  // stożek w paski (parasol): n klinów
  const parasol = (b, cx, cz, y0, y1, r, c1, c2, n = 8) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, o = { tint: i % 2 ? c1 : c2 };
      const am = (a0 + a1) / 2;
      b.poly('paint', [[cx, y1, cz], [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r]], [Math.cos(am), 0.6, Math.sin(am)], o);
      b.poly('paint', [[cx, y1 - 0.02, cz], [cx + Math.cos(a0) * r, y0 - 0.02, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y0 - 0.02, cz + Math.sin(a1) * r]], [-Math.cos(am), -0.6, -Math.sin(am)], { ...o, shade: 0.55 });
    }
  };

  Object.assign(M, {
    // ═════════ ULICA ═════════════════════════════════════════════════════════
    hydrant(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, c = { tint: p.color || [0.72, 0.1, 0.08] }, br = { tint: BRASS };
      b.cyl('paint', cx, cz, 0, 0.12, 0.17, 0.14, 8, c);
      b.cyl('paint', cx, cz, 0.12, 0.6, 0.115, 0.1, 8, c);
      b.cyl('paint', cx, cz, 0.56, 0.63, 0.145, 0.145, 8, c, 'Y');
      b.cyl('paint', cx, cz, 0.63, 0.74, 0.1, 0.07, 8, c);
      b.cyl('paint', cx, cz, 0.74, 0.79, 0.075, 0.03, 8, c, 'Y');
      for (const s of [-1, 1]) b.tube('metal', [cx + s * 0.09, 0.46, cz], [cx + s * 0.23, 0.46, cz], 0.045, 0.045, 6, { ...br, caps: 1 });
      b.tube('metal', [cx, 0.38, cz - 0.09], [cx, 0.38, cz - 0.24], 0.065, 0.065, 6, { ...br, caps: 1 });
    },

    postbox(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, c = { tint: p.color || [0.7, 0.1, 0.1] }, y = { tint: [0.95, 0.8, 0.15] };
      b.cyl('paint', cx, cz, 0, 0.1, 0.26, 0.23, 10, c);
      b.cyl('paint', cx, cz, 0.1, 1.2, 0.23, 0.205, 10, c);
      b.cyl('paint', cx, cz, 0.74, 0.86, 0.21, 0.21, 10, y);
      b.cyl('paint', cx, cz, 1.2, 1.3, 0.25, 0.25, 10, c, 'Y');
      b.cyl('paint', cx, cz, 1.3, 1.36, 0.2, 0.06, 10, c, 'Y');
      b.rect('dark', cx - 0.11, 1.02, cx + 0.11, 1.08, cz - 0.215, { shade: 0.5 });
      b.rect('paint', cx - 0.05, 0.5, cx + 0.05, 0.68, cz - 0.213, { tint: [0.95, 0.9, 0.7] });
    },

    bollard(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, o = { tint: p.color || IRON };
      b.cyl('metal', cx, cz, 0, 0.12, 0.13, 0.11, 8, o);
      b.cyl('metal', cx, cz, 0.12, 0.66, 0.1, 0.09, 8, o);
      b.cyl('metal', cx, cz, 0.62, 0.68, 0.12, 0.12, 8, o);
      b.cyl('metal', cx, cz, 0.68, 0.74, 0.09, 0.03, 8, o, 'Y');
    },

    // słup ogłoszeniowy (Litfaß): 8 fasetek z plakatami, dach z blachy
    adcolumn(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, R = 0.78, N = 8, names = p.posters || ['bb0', 'bb1', 'bb2', 'bb3', 'bb4', 'bb5', 'bb0', 'bb2'];
      b.cyl('stone', cx, cz, 0, 0.32, 0.9, 0.82, 16, { tint: STONE });
      b.cyl('stone', cx, cz, 0.32, 0.4, 0.86, 0.86, 16, { tint: STONE, shade: 0.8 }, 'Y');
      b.cyl('paint', cx, cz, 0.4, 2.7, R, R, 16, { tint: [0.22, 0.4, 0.3] });
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2 + 0.06, a1 = ((i + 1) / N) * Math.PI * 2 - 0.06;
        facetPoster(b, cx, cz, R + 0.015, a0, a1, 0.62, 2.28, atlasUV(names[i % names.length]));
      }
      b.cyl('paint', cx, cz, 2.7, 2.78, 0.84, 0.84, 16, { tint: [0.22, 0.4, 0.3] }, 'Y');
      b.cyl('roof', cx, cz, 2.78, 3.3, 0.88, 0.14, 12, { tint: [0.45, 0.62, 0.55] }, 'Y');
      b.cyl('metal', cx, cz, 3.3, 3.56, 0.05, 0.0, 6, { tint: BRASS });
    },

    // zegar uliczny: żeliwny słup, tarcza z obu stron, wskazówki
    streetclock(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, iron = { tint: [0.26, 0.36, 0.3] };
      b.cyl('metal', cx, cz, 0, 0.3, 0.2, 0.12, 8, iron);
      b.cyl('metal', cx, cz, 0.3, 3.2, 0.09, 0.07, 8, iron);
      b.cyl('metal', cx, cz, 0.3, 0.42, 0.14, 0.14, 8, iron, 'Y');
      const y = 3.5, R = 0.4;
      b.box('metal', cx - 0.5, y - 0.5, cz - 0.17, cx + 0.5, y + 0.5, cz + 0.17, 'xXyYzZ', iron);
      for (const [z, f] of [[cz - 0.18, -1], [cz + 0.18, 1]]) {
        const P = (a, r) => [cx + (f < 0 ? 1 : -1) * Math.cos(a) * r, y + Math.sin(a) * r, z];
        for (let i = 0; i < 16; i++) {
          const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
          b.poly('paint', [[cx, y, z], P(a0, R), P(a1, R)], [0, 0, f], { tint: [0.96, 0.94, 0.86] });
        }
        for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2, q = (r, t) => [cx + (f < 0 ? 1 : -1) * (Math.cos(a) * r - Math.sin(a) * t), y + Math.sin(a) * r + Math.cos(a) * t, z + f * 0.035]; b.poly('dark', [q(R * 0.8, -0.012), q(R * 0.8, 0.012), q(R * 0.95, 0.012), q(R * 0.95, -0.012)], [0, 0, f], { tint: [0.06, 0.06, 0.06] }); }
        for (const [len, ang, w] of [[0.24, 1.2 + (f < 0 ? 0 : 0.7), 0.025], [0.34, 3.6 + (f < 0 ? 0 : 0.4), 0.016]]) {
          const q = (r, t) => [cx + (f < 0 ? 1 : -1) * (Math.cos(ang) * r - Math.sin(ang) * t), y + Math.sin(ang) * r + Math.cos(ang) * t, z + f * 0.05];
          b.poly('dark', [q(-0.04, -w), q(-0.04, w), q(len, w), q(len, -w)], [0, 0, f], { tint: [0.05, 0.05, 0.05] });
        }
      }
      b.cyl('metal', cx, cz, y + 0.5, y + 0.64, 0.38, 0.0, 4, iron, 'Y');
      b.cyl('metal', cx, cz, y + 0.64, y + 0.82, 0.03, 0.0, 6, { tint: BRASS });
    },

    // drogowskaz: słup i trzy tabliczki w różne strony
    signpost(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2;
      b.cyl('wood', cx, cz, 0, 2.7, 0.07, 0.06, 8, { tint: DARK_WOOD });
      b.cyl('wood', cx, cz, 2.7, 2.78, 0.09, 0.0, 8, { tint: DARK_WOOD }, 'Y');
      const plates = [[2.35, 0.2, 0], [2.0, -0.35, 1], [1.65, 0.7, 0]];
      plates.forEach(([y, ang, flip], k) => {
        const len = 0.9 - k * 0.1, dir = [Math.cos(ang), Math.sin(ang)], nrm = [-dir[1], dir[0]];
        const A = [cx + dir[0] * 0.07, cz + dir[1] * 0.07], B = [cx + dir[0] * len, cz + dir[1] * len];
        const tip = [B[0] + dir[0] * 0.12, B[1] + dir[1] * 0.12];
        const pt = (q, yy, s) => [q[0] + nrm[0] * s * 0.07, yy, q[1] + nrm[1] * s * 0.07];
        const c = { tint: flip ? [0.9, 0.88, 0.8] : [0.85, 0.78, 0.55] };
        for (const s of [-1, 1]) {
          const hint = [nrm[0] * s, 0, nrm[1] * s];
          b.poly('paint', [pt(A, y - 0.09, s), pt(B, y - 0.09, s), pt(B, y + 0.09, s), pt(A, y + 0.09, s)], hint, c);
          b.poly('paint', [pt(B, y - 0.09, s), pt(tip, y, s), pt(B, y + 0.09, s)], hint, c);
          for (let t = 0; t < 3; t++) {
            const s0 = 0.12 + t * 0.2, s1 = s0 + 0.12, q0 = [A[0] + dir[0] * s0, A[1] + dir[1] * s0], q1 = [A[0] + dir[0] * s1, A[1] + dir[1] * s1];
            b.poly('dark', [pt(q0, y - 0.03, s * 1.15), pt(q1, y - 0.03, s * 1.15), pt(q1, y + 0.03, s * 1.15), pt(q0, y + 0.03, s * 1.15)], hint, { tint: [0.1, 0.08, 0.06] });
          }
        }
      });
    },

    // pompa uliczna z żeliwa na kamiennej płycie
    pump(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, iron = { tint: [0.16, 0.24, 0.2] };
      b.box('stone', cx - 0.3, 0, cz - 0.3, cx + 0.3, 0.1, cz + 0.3, 'xXyYzZ', { tint: STONE });
      b.cyl('metal', cx, cz, 0.1, 0.22, 0.2, 0.15, 8, iron);
      b.cyl('metal', cx, cz, 0.22, 1.0, 0.12, 0.1, 8, iron);
      b.cyl('metal', cx, cz, 1.0, 1.1, 0.15, 0.15, 8, iron, 'Y');
      b.cyl('metal', cx, cz, 1.1, 1.32, 0.1, 0.06, 8, iron);
      b.cyl('metal', cx, cz, 1.32, 1.42, 0.08, 0.0, 8, iron, 'Y');
      b.tube('metal', [cx, 0.82, cz - 0.1], [cx, 0.74, cz - 0.42], 0.045, 0.04, 6, { ...iron, caps: 1 });
      b.tube('metal', [cx + 0.05, 1.2, cz], [cx + 0.1, 1.55, cz + 0.02], 0.02, 0.018, 5, iron);
      b.tube('metal', [cx + 0.1, 1.55, cz + 0.02], [cx + 0.55, 1.1, cz + 0.02], 0.022, 0.02, 5, iron);
      b.box('stone', cx - 0.25, 0.1, cz - 0.62, cx + 0.25, 0.2, cz - 0.3, 'xXyYz', { tint: STONE, shade: 0.9 });
    },

    // donica z kwiatami
    planter(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, so = { tint: p.stone || [0.74, 0.7, 0.64] }, fl = p.flowers || [0.9, 0.3, 0.35];
      b.box('stone', cx - 0.5, 0, cz - 0.5, cx + 0.5, 0.12, cz + 0.5, 'xXyYzZ', { ...so, shade: 0.85 });
      b.box('stone', cx - 0.45, 0.12, cz - 0.45, cx + 0.45, 0.55, cz + 0.45, 'xXzZ', so);
      b.box('stone', cx - 0.52, 0.55, cz - 0.52, cx + 0.52, 0.64, cz + 0.52, 'xXyYzZ', so);
      b.rectY('dark', 0.6, cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4, 1, { shade: 0.5 });
      cubeSphere(b, 'leaf', [cx, 0.8, cz], [0.42, 0.28, 0.42], 1, { tint: p.leaf || [0.3, 0.46, 0.22], wob: 0.05 });
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, rr = 0.1 + (i % 3) * 0.12;
        cubeSphere(b, 'paint', [cx + Math.cos(a) * rr, 0.98 + (i % 2) * 0.05, cz + Math.sin(a) * rr], [0.08, 0.07, 0.08], 1, { tint: i % 3 ? fl : [0.98, 0.9, 0.5] });
      }
    },

    // potykacz (tablica reklamowa w kształcie A) z plakatem sklepu
    sandwich(b, W, H, D, p) {
      const cx = W / 2, hw = 0.32;
      const wo = { tint: WOOD };
      for (const s of [-1, 1]) {
        const z0 = 0.12 + (s < 0 ? 0 : 0.35), zt = 0.3;
        b.poly('wood', [[cx - hw, 0, s < 0 ? 0.05 : 0.6], [cx + hw, 0, s < 0 ? 0.05 : 0.6], [cx + hw, 0.88, zt], [cx - hw, 0.88, zt]], [0, 0.4, s], wo);
        void z0;
      }
      const uv = atlasUV(p.sign || 'bread'), m = b.cage.sign > 0;
      const asp = atlasAspect(p.sign || 'bread'), pw = 2 * hw - 0.12, ph = Math.min(0.62, pw / asp);
      const y0 = 0.14, y1 = y0 + ph, zf = 0.05 + (0.25 * (y0 + ph / 2)) / 0.88 - 0.012;
      b.poly('poster', m ? [[cx + pw / 2, y0, zf], [cx - pw / 2, y0, zf], [cx - pw / 2, y1, zf - 0.004], [cx + pw / 2, y1, zf - 0.004]] : [[cx - pw / 2, y0, zf], [cx + pw / 2, y0, zf], [cx + pw / 2, y1, zf - 0.004], [cx - pw / 2, y1, zf - 0.004]], [0, 0.4, -1], { uv });
      b.cyl('metal', cx - 0.25, 0.3, 0.86, 0.9, 0.012, 0.012, 4, { tint: IRON });
    },

    // poidło dla koni: kamienne koryto z wodą
    trough(b, W, H, D, p) {
      const so = { tint: [0.64, 0.62, 0.58] };
      b.box('stone', 0.05, 0, 0.1, W - 0.05, 0.75, D - 0.1, 'xXyYzZ', so);
      b.rectY('dark', 0.752, 0.2, 0.25, W - 0.2, D - 0.25, 1, { shade: 0.4 });
      b.rectY('water', 0.62, 0.2, 0.25, W - 0.2, D - 0.25, 1, {});
      b.box('stone', 0.05, 0.75, 0.1, W - 0.05, 0.82, 0.22, 'xXyYzZ', { tint: [0.7, 0.68, 0.64] });
      b.box('stone', 0.05, 0.75, D - 0.22, W - 0.05, 0.82, D - 0.1, 'xXyYzZ', { tint: [0.7, 0.68, 0.64] });
      b.box('stone', 0.05, 0.75, 0.22, 0.17, 0.82, D - 0.22, 'xXyYzZ', { tint: [0.7, 0.68, 0.64] });
      b.box('stone', W - 0.17, 0.75, 0.22, W - 0.05, 0.82, D - 0.22, 'xXyYzZ', { tint: [0.7, 0.68, 0.64] });
    },

    // latarnia podwójna: słup i poprzeczka z dwiema latarniami
    lampdouble(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, mo = { tint: p.metalTint || [0.17, 0.22, 0.19] };
      b.cyl('metal', cx, cz, 0, 0.55, 0.17, 0.12, 8, mo);
      b.cyl('metal', cx, cz, 0.55, 0.66, 0.13, 0.09, 8, mo);
      b.cyl('metal', cx, cz, 0.66, 5.1, 0.075, 0.05, 8, mo);
      b.box('metal', cx - 0.68, 5.05, cz - 0.03, cx + 0.68, 5.1, cz + 0.03, 'xXyYzZ', mo);
      for (const s of [-1, 1]) {
        const x = cx + s * 0.64;
        b.tube('metal', [cx + s * 0.1, 5.1, cz], [x, 5.28, cz], 0.025, 0.02, 5, mo);
        b.cyl('metal', x, cz, 5.24, 5.52, 0.2, 0.04, 8, mo, 'y');
        b.cyl('light', x, cz, 5.1, 5.25, 0.09, 0.12, 8, {}, 'y');
        b.cyl('metal', x, cz, 5.52, 5.62, 0.04, 0.0, 6, mo);
      }
      b.cyl('metal', cx, cz, 5.1, 5.32, 0.06, 0.0, 8, mo);
    },

    // stolik kawiarniany z krzesłami i parasolem
    cafeset(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2;
      b.cyl('metal', cx, cz, 0, 0.7, 0.04, 0.04, 6, { tint: IRON });
      b.cyl('metal', cx, cz, 0, 0.05, 0.28, 0.25, 8, { tint: IRON }, 'Y');
      b.cyl('metal', cx, cz, 0.7, 0.75, 0.42, 0.42, 14, { tint: [0.9, 0.88, 0.82] }, 'Yy');
      b.cyl('metal', cx, cz, 0.75, 2.45, 0.02, 0.02, 5, { tint: DARK_WOOD });
      parasol(b, cx, cz, 2.0, 2.6, 1.3, p.c1 || [0.85, 0.2, 0.2], p.c2 || [0.95, 0.93, 0.88]);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + 0.4, x = cx + Math.cos(a) * 0.75, z = cz + Math.sin(a) * 0.75;
        b.cyl('wood', x, z, 0.44, 0.48, 0.2, 0.2, 10, { tint: [0.35, 0.22, 0.12] }, 'Yy');
        for (let l = 0; l < 4; l++) { const q = (l / 4) * Math.PI * 2 + 0.8; b.tube('wood', [x + Math.cos(q) * 0.15, 0, z + Math.sin(q) * 0.15], [x + Math.cos(q) * 0.17, 0.44, z + Math.sin(q) * 0.17], 0.017, 0.017, 4, { tint: [0.35, 0.22, 0.12] }); }
        const ox = Math.cos(a), oz = Math.sin(a);
        for (const s of [-1, 1]) b.tube('wood', [x + ox * 0.2 - oz * 0.12 * s, 0.48, z + oz * 0.2 + ox * 0.12 * s], [x + ox * 0.26 - oz * 0.12 * s, 0.95, z + oz * 0.26 + ox * 0.12 * s], 0.014, 0.014, 4, { tint: [0.35, 0.22, 0.12] });
        b.tube('wood', [x + ox * 0.26 - oz * 0.12, 0.93, z + oz * 0.26 + ox * 0.12], [x + ox * 0.26 + oz * 0.12, 0.93, z + oz * 0.26 - ox * 0.12], 0.02, 0.02, 4, { tint: [0.35, 0.22, 0.12] });
      }
    },

    // rower z lat 1900: dwa koła, rama, kierownica, siodełko
    bicycle(b, W, H, D, p) {
      const z = D / 2, r = 0.34, fx = W - 0.5, rx = 0.5, iron = { tint: IRON };
      for (const x of [fx, rx]) {
        for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2; b.tube('dark', [x + Math.cos(a0) * r, r + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, r + Math.sin(a1) * r, z], 0.014, 0.014, 4, iron); }
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.tube('metal', [x, r, z], [x + Math.cos(a) * r, r + Math.sin(a) * r, z], 0.005, 0.005, 3, { tint: [0.7, 0.7, 0.72] }); }
      }
      const sx = 0.85, sy = 0.9, hx = fx - 0.12, hy = 0.95;
      b.tube('metal', [rx, r, z], [sx, 0.38, z], 0.016, 0.016, 5, iron);
      b.tube('metal', [sx, 0.38, z], [sx, sy, z], 0.016, 0.016, 5, iron);
      b.tube('metal', [sx, sy, z], [hx, hy - 0.05, z], 0.016, 0.016, 5, iron);
      b.tube('metal', [sx, 0.38, z], [fx - 0.05, r, z], 0.016, 0.016, 5, iron);
      b.tube('metal', [hx, hy - 0.05, z], [fx, r, z], 0.016, 0.016, 5, iron);
      b.tube('metal', [hx, hy - 0.05, z], [hx - 0.02, hy + 0.12, z], 0.014, 0.014, 5, iron);
      b.tube('metal', [hx - 0.02, hy + 0.12, z - 0.28], [hx - 0.02, hy + 0.12, z + 0.28], 0.014, 0.014, 5, { tint: [0.7, 0.7, 0.72] });
      b.box('paint', sx - 0.12, sy, z - 0.05, sx + 0.1, sy + 0.05, z + 0.05, 'xXyYzZ', { tint: [0.2, 0.12, 0.08] });
      b.tube('metal', [rx + 0.2, 0.05, z], [rx + 0.2, 0.0, z + 0.2], 0.01, 0.01, 4, iron);
    },

    // ═════════ HANDEL I TRANSPORT ════════════════════════════════════════════
    // stragan: stół, skrzynie z towarem, markiza w pasy
    stall(b, W, H, D, p) {
      const wo = { tint: WOOD }, c1 = p.c1 || [0.8, 0.2, 0.18], c2 = p.c2 || [0.95, 0.93, 0.86];
      for (const x of [0.1, W - 0.18]) {
        b.box('wood', x, 0, 0.08, x + 0.08, 2.25, 0.16, 'xXzZ', wo);
        b.box('wood', x, 0, D - 0.2, x + 0.08, 2.75, D - 0.12, 'xXzZ', wo);
      }
      b.box('wood', 0.1, 0.85, 0.2, W - 0.1, 0.92, 1.3, 'xXyYzZ', { tint: DARK_WOOD });
      b.box('wood', 0.15, 0.1, 0.25, W - 0.15, 0.85, 1.25, 'xXzZ', { tint: DARK_WOOD, shade: 0.8 });
      const goods = p.goods || [[0.9, 0.35, 0.25], [0.95, 0.75, 0.2], [0.4, 0.6, 0.25], [0.85, 0.5, 0.2]];
      for (let i = 0; i < 4; i++) {
        const x0 = 0.25 + i * ((W - 0.5) / 4);
        b.box('wood', x0, 0.92, 0.3, x0 + (W - 0.5) / 4 - 0.08, 1.12, 1.15, 'xXyYzZ', wo);
        for (let k = 0; k < 4; k++) cubeSphere(b, 'paint', [x0 + 0.12 + (k % 2) * 0.17, 1.17, 0.5 + Math.floor(k / 2) * 0.4], [0.08, 0.07, 0.08], 1, { tint: goods[i % goods.length] });
      }
      awning(b, 0, W, 2.75, 2.25, D - 0.1, -0.35, c1, c2, 8);
      b.rect('paint', 0.1, 0.0, W - 0.1, 2.7, D - 0.1, { tint: [0.85, 0.82, 0.74], shade: 0.8 });
    },

    // stragan z owocami: pochylone skrzynki, kule owoców, daszek
    fruitstall(b, W, H, D, p) {
      const wo = { tint: WOOD }, fr = p.fruit || [[0.85, 0.15, 0.12], [0.95, 0.65, 0.12], [0.45, 0.65, 0.2], [0.95, 0.85, 0.3]];
      for (const x of [0.12, W - 0.2]) b.box('wood', x, 0, 0.1, x + 0.08, 2.1, 0.18, 'xXzZ', wo);
      b.box('wood', 0.05, 0, 0.5, W - 0.05, 0.75, D - 0.1, 'xXyYzZ', { tint: DARK_WOOD });
      for (let i = 0; i < 4; i++) {
        const x0 = 0.12 + i * ((W - 0.24) / 4), x1 = x0 + (W - 0.24) / 4 - 0.05;
        b.poly('wood', [[x0, 0.75, D - 0.15], [x1, 0.75, D - 0.15], [x1, 1.0, 0.7], [x0, 1.0, 0.7]], [0, 1, -0.4], { tint: WOOD });
        for (let k = 0; k < 6; k++) cubeSphere(b, 'paint', [x0 + 0.1 + (k % 3) * 0.14, 1.06 - Math.floor(k / 3) * 0.06 - 0.0, 0.85 + Math.floor(k / 3) * 0.28], [0.065, 0.06, 0.065], 1, { tint: fr[i % fr.length] });
      }
      b.poly('paint', [[0, 2.15, 0.0], [W, 2.15, 0.0], [W, 1.85, -0.6], [0, 1.85, -0.6]], [0, 1, -0.5], { tint: p.c1 || [0.3, 0.55, 0.3] });
      b.poly('paint', [[W, 2.15, 0.0], [0, 2.15, 0.0], [0, 1.85, -0.6], [W, 1.85, -0.6]], [0, -1, 0.5], { tint: p.c1 || [0.3, 0.55, 0.3], shade: 0.6 });
      b.box('wood', 0.1, 2.05, 0.0, W - 0.1, 2.15, 0.14, 'xXyYzZ', wo);
    },

    // stoisko z kwiatami: półki z doniczkami, wiadra, markiza
    flowerstand(b, W, H, D, p) {
      const wo = { tint: [0.35, 0.5, 0.38] }, cols = p.cols || [[0.9, 0.25, 0.3], [0.95, 0.85, 0.25], [0.7, 0.4, 0.8], [0.95, 0.6, 0.7], [0.98, 0.98, 0.95]];
      for (const x of [0.06, W - 0.14]) b.box('wood', x, 0, 0.1, x + 0.08, 2.0, 0.18, 'xXzZ', wo);
      for (let t = 0; t < 3; t++) {
        const y = 0.35 + t * 0.5, d = D - 0.15 - t * 0.2;
        b.box('wood', 0.06, y, 0.12, W - 0.06, y + 0.05, d, 'xXyYzZ', wo);
        for (let i = 0; i < 6; i++) {
          const x = 0.2 + i * ((W - 0.4) / 5), z = d - 0.2;
          b.cyl('paint', x, z, y + 0.05, y + 0.2, 0.07, 0.055, 6, { tint: [0.65, 0.35, 0.22] });
          cubeSphere(b, 'paint', [x, y + 0.3, z], [0.12, 0.1, 0.12], 1, { tint: cols[(i + t) % cols.length] });
        }
      }
      for (let i = 0; i < 3; i++) { const x = 0.35 + i * 0.5; b.cyl('metal', x, D - 0.1, 0, 0.32, 0.13, 0.11, 8, { tint: [0.55, 0.57, 0.6] }); cubeSphere(b, 'paint', [x, 0.48, D - 0.1], [0.14, 0.12, 0.14], 1, { tint: cols[(i + 2) % cols.length] }); }
      awning(b, 0, W, 2.18, 1.96, 0.05, -0.42, p.c1 || [0.25, 0.55, 0.35], [0.95, 0.93, 0.86], 6);
    },

    // wózek ręczny z workami
    handcart(b, W, H, D, p) {
      const wo = { tint: WOOD };
      wheel(b, W * 0.5, 0.4, 0.04, 0.4);
      wheel(b, W * 0.5, 0.4, D - 0.04, 0.4);
      b.tube('metal', [W * 0.5, 0.4, 0.04], [W * 0.5, 0.4, D - 0.04], 0.02, 0.02, 5, { tint: IRON });
      b.box('wood', W * 0.2, 0.5, 0.12, W * 0.8, 0.58, D - 0.12, 'xXyYzZ', wo);
      for (const z of [0.12, D - 0.12]) b.box('wood', W * 0.2, 0.58, z - 0.03, W * 0.8, 0.88, z + 0.03, 'xXyYzZ', wo);
      b.box('wood', W * 0.2, 0.58, 0.12, W * 0.2 + 0.06, 0.88, D - 0.12, 'xXyYzZ', wo);
      for (const z of [0.18, D - 0.18]) b.tube('wood', [W * 0.78, 0.55, z], [W * 0.99, 0.75, z * 0.8 + D * 0.1], 0.025, 0.02, 5, wo);
      for (let i = 0; i < 3; i++) cubeSphere(b, 'paint', [W * 0.35 + i * 0.28, 0.75, D / 2 + (i % 2 ? 0.1 : -0.1)], [0.18, 0.2, 0.17], 1, { tint: p.sack || [0.78, 0.68, 0.5] });
    },

    // stos skrzyń
    crates(b, W, H, D, p) {
      const wo = { tint: p.tint || WOOD }, dk = { tint: [0.28, 0.2, 0.13] };
      const crate = (x, y, z, w, h, d) => {
        b.box('wood', x, y, z, x + w, y + h, z + d, 'xXyYzZ', wo);
        for (const t of [0.12, 0.5, 0.88]) {
          b.rect('dark', x + 0.02, y + h * t - 0.012, x + w - 0.02, y + h * t + 0.012, z - 0.004, dk);
          b.rectBack('dark', x + 0.02, y + h * t - 0.012, x + w - 0.02, y + h * t + 0.012, z + d + 0.004, dk);
        }
        b.rect('dark', x + 0.03, y + 0.03, x + 0.07, y + h - 0.03, z - 0.004, dk);
        b.rect('dark', x + w - 0.07, y + 0.03, x + w - 0.03, y + h - 0.03, z - 0.004, dk);
      };
      crate(0.05, 0, 0.1, 0.6, 0.45, 0.5); crate(0.7, 0, 0.12, 0.55, 0.4, 0.55); crate(0.2, 0.45, 0.14, 0.55, 0.4, 0.5);
      crate(0.85, 0.4, 0.2, 0.4, 0.35, 0.4); crate(0.1, 0.85, 0.2, 0.45, 0.32, 0.4);
    },

    // trzy beczki z obręczami
    barrels(b, W, H, D, p) {
      const wo = { tint: p.tint || [0.5, 0.34, 0.2] };
      const barrel = (x, z, h = 0.9, r = 0.3) => {
        b.cyl('wood', x, z, 0, h * 0.5, r * 0.88, r, 10, wo);
        b.cyl('wood', x, z, h * 0.5, h, r, r * 0.88, 10, wo, 'Y');
        for (const t of [0.12, 0.3, 0.7, 0.88]) {
          const rr = (t < 0.5 ? r * (0.88 + 0.12 * (t / 0.5)) : r * (1 - 0.12 * ((t - 0.5) / 0.5))) + 0.012;
          b.cyl('metal', x, z, h * t - 0.02, h * t + 0.02, rr, rr, 10, { tint: [0.15, 0.15, 0.16] });
        }
      };
      barrel(0.4, 0.4); barrel(1.0, 0.45); barrel(0.7, 0.9, 0.85, 0.28);
    },

    // wóz towarowy z beczkami
    wagon(b, W, H, D, p) {
      const wo = { tint: p.tint || [0.45, 0.3, 0.2] }, dk = { tint: DARK_WOOD };
      for (const x of [W * 0.28, W * 0.7]) for (const z of [0.05, D - 0.05]) wheel(b, x, x < W / 2 ? 0.45 : 0.4, z, x < W / 2 ? 0.45 : 0.4);
      b.tube('metal', [W * 0.28, 0.45, 0.05], [W * 0.28, 0.45, D - 0.05], 0.03, 0.03, 5, { tint: IRON });
      b.tube('metal', [W * 0.7, 0.4, 0.05], [W * 0.7, 0.4, D - 0.05], 0.03, 0.03, 5, { tint: IRON });
      b.box('wood', 0.15, 0.62, 0.2, W * 0.88, 0.72, D - 0.2, 'xXyYzZ', dk);
      for (const z of [0.2, D - 0.2]) b.box('wood', 0.15, 0.72, z - 0.04, W * 0.88, 1.15, z + 0.04, 'xXyYzZ', wo);
      for (const x of [0.15, W * 0.88 - 0.08]) b.box('wood', x, 0.72, 0.2, x + 0.08, 1.15, D - 0.2, 'xXyYzZ', wo);
      b.tube('wood', [W * 0.85, 0.66, D / 2], [W - 0.05, 0.3, D / 2], 0.05, 0.04, 6, dk);
      b.tube('wood', [W - 0.05, 0.3, D / 2 - 0.2], [W - 0.05, 0.3, D / 2 + 0.2], 0.035, 0.035, 5, dk);
      for (const [x, z] of [[W * 0.3, D * 0.35], [W * 0.5, D * 0.35], [W * 0.4, D * 0.7]]) {
        b.cyl('wood', x, z, 0.72, 1.05, 0.27, 0.3, 9, { tint: [0.5, 0.34, 0.2] });
        b.cyl('wood', x, z, 1.05, 1.38, 0.3, 0.27, 9, { tint: [0.5, 0.34, 0.2] }, 'Y');
        b.cyl('metal', x, z, 1.03, 1.07, 0.31, 0.31, 9, { tint: [0.15, 0.15, 0.16] });
      }
    },

    // stos drewna na opał
    firewood(b, W, H, D, p) {
      const lw = { tint: [0.5, 0.35, 0.22] }, ends = { tint: [0.72, 0.58, 0.4] };
      for (const x of [0.1, W - 0.12]) b.box('wood', x, 0, 0.05, x + 0.05, 1.1, 0.12, 'xXzZ', { tint: DARK_WOOD });
      for (const x of [0.1, W - 0.12]) b.box('wood', x, 0, D - 0.12, x + 0.05, 1.1, D - 0.05, 'xXzZ', { tint: DARK_WOOD });
      const rows = [8, 7, 6, 5, 4, 3];
      rows.forEach((n, row) => {
        for (let i = 0; i < n; i++) {
          const x = 0.2 + (W - 0.4) * ((i + 0.5 + (8 - n) / 2) / 8), y = 0.1 + row * 0.18;
          b.tube('wood', [x, y, 0.15], [x, y, D - 0.15], 0.085, 0.085, 7, { ...lw, caps: 1, tint: row % 2 ? [0.45, 0.31, 0.2] : [0.52, 0.37, 0.24] });
        }
      });
      void ends;
    },

    // ═════════ PARK I PLAC ═══════════════════════════════════════════════════
    // posąg z brązu na trzystopniowym cokole
    statue(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, so = { tint: STONE }, br = { tint: p.bronze || [0.38, 0.58, 0.5] };
      b.box('stone', cx - 0.8, 0, cz - 0.8, cx + 0.8, 0.3, cz + 0.8, 'xXyYzZ', { ...so, shade: 0.85 });
      b.box('stone', cx - 0.62, 0.3, cz - 0.62, cx + 0.62, 0.8, cz + 0.62, 'xXyYzZ', so);
      b.box('stone', cx - 0.48, 0.8, cz - 0.48, cx + 0.48, 2.0, cz + 0.48, 'xXzZ', so);
      b.box('stone', cx - 0.58, 2.0, cz - 0.58, cx + 0.58, 2.16, cz + 0.58, 'xXyYzZ', so);
      b.rect('metal', cx - 0.28, 1.1, cx + 0.28, 1.5, cz - 0.485, { tint: [0.75, 0.68, 0.45] });
      const y0 = 2.16;
      // nogi, płaszcz rozszerzający się ku dołowi, tors, głowa, ramiona
      for (const s of [-1, 1]) b.tube('paint', [cx + s * 0.1, y0, cz], [cx + s * 0.1, y0 + 0.95, cz], 0.08, 0.1, 8, br);
      b.cyl('paint', cx, cz, y0 + 0.55, y0 + 1.5, 0.3, 0.2, 10, br);
      b.tube('paint', [cx, y0 + 1.45, cz], [cx, y0 + 1.95, cz], 0.2, 0.17, 10, br);
      cubeSphere(b, 'paint', [cx, y0 + 2.12, cz], [0.14, 0.16, 0.14], 2, br);
      b.tube('paint', [cx - 0.2, y0 + 1.85, cz], [cx - 0.38, y0 + 1.25, cz - 0.05], 0.06, 0.05, 6, br);
      b.tube('paint', [cx + 0.2, y0 + 1.85, cz], [cx + 0.34, y0 + 2.4, cz - 0.1], 0.06, 0.05, 6, br);
      cubeSphere(b, 'paint', [cx + 0.36, y0 + 2.46, cz - 0.1], [0.07, 0.07, 0.07], 1, br);
    },

    // altana (muszla): ośmiokątna podłoga, słupki, balustrada, stożkowy dach
    gazebo(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, N = 8, R = 2.25, wo = { tint: p.tint || [0.9, 0.88, 0.82] }, rf = { tint: p.roof || [0.28, 0.5, 0.42] };
      const A = (i, r = R) => [cx + Math.cos((i / N) * Math.PI * 2 + 0.3927) * r, cz + Math.sin((i / N) * Math.PI * 2 + 0.3927) * r];
      for (let i = 0; i < N; i++) {
        const a = A(i), c = A(i + 1), am = ((i + 0.5) / N) * Math.PI * 2 + 0.3927;
        b.poly('stone', [[cx, 0.4, cz], [a[0] + 0.0, 0.4, a[1]], [c[0], 0.4, c[1]]], [0, 1, 0], { tint: [0.7, 0.68, 0.64] });
        b.poly('stone', [[a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], 0.4, c[1]], [a[0], 0.4, a[1]]], [Math.cos(am), 0, Math.sin(am)], { tint: STONE });
        // balustrada między słupkami (poza wejściem: i = 0)
        if (i !== 0) {
          b.tube('wood', [a[0], 0.95, a[1]], [c[0], 0.95, c[1]], 0.035, 0.035, 5, wo);
          b.tube('wood', [a[0], 0.55, a[1]], [c[0], 0.55, c[1]], 0.03, 0.03, 5, wo);
          for (let k = 1; k < 5; k++) { const t = k / 5, x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t; b.tube('wood', [x, 0.4, z], [x, 0.95, z], 0.018, 0.018, 4, wo); }
        }
        b.tube('wood', [a[0], 2.55, a[1]], [c[0], 2.55, c[1]], 0.06, 0.06, 5, wo);
        // zdobienie pod dachem
        for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4, x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t; b.cyl('wood', x, z, 2.35, 2.55, 0.025, 0.04, 5, wo); }
        // dach
        const ra = A(i, R + 0.55), rc = A(i + 1, R + 0.55);
        b.poly('roof', [[ra[0], 2.6, ra[1]], [rc[0], 2.6, rc[1]], [cx, 4.2, cz]], [Math.cos(am), 0.9, Math.sin(am)], rf);
        b.poly('wood', [[rc[0], 2.6, rc[1]], [ra[0], 2.6, ra[1]], [A(i, R)[0], 2.55, A(i, R)[1]], [A(i + 1, R)[0], 2.55, A(i + 1, R)[1]]], [0, -1, 0], { tint: [0.7, 0.66, 0.58], shade: 0.6 });
      }
      for (let i = 0; i < N; i++) { const a = A(i); b.cyl('wood', a[0], a[1], 0.4, 2.58, 0.075, 0.065, 6, wo); }
      b.cyl('metal', cx, cz, 4.2, 4.7, 0.05, 0.0, 6, { tint: BRASS });
      cubeSphere(b, 'metal', [cx, 4.3, cz], [0.14, 0.14, 0.14], 1, { tint: BRASS });
    },

    // studnia z daszkiem i kołowrotem
    well(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, so = { tint: [0.68, 0.64, 0.58] };
      b.cyl('stone', cx, cz, 0, 0.9, 0.78, 0.74, 12, so);
      b.cyl('stone', cx, cz, 0.9, 1.0, 0.82, 0.82, 12, { tint: [0.74, 0.7, 0.64] }, 'Y');
      b.cyl('dark', cx, cz, 0.99, 1.0, 0.58, 0.58, 12, {}, 'Y');
      for (const s of [-1, 1]) b.box('wood', cx + s * 0.7 - 0.05, 1.0, cz - 0.05, cx + s * 0.7 + 0.05, 2.3, cz + 0.05, 'xXzZ', { tint: DARK_WOOD });
      b.tube('wood', [cx - 0.75, 1.75, cz], [cx + 0.75, 1.75, cz], 0.07, 0.07, 6, { tint: [0.4, 0.28, 0.18], caps: 1 });
      b.tube('metal', [cx + 0.75, 1.75, cz], [cx + 0.95, 1.75, cz], 0.025, 0.025, 5, { tint: IRON, caps: 1 });
      b.tube('metal', [cx + 0.95, 1.75, cz], [cx + 0.95, 1.5, cz + 0.2], 0.02, 0.02, 5, { tint: IRON });
      b.tube('dark', [cx, 1.72, cz], [cx, 1.2, cz], 0.012, 0.012, 3, { tint: [0.3, 0.25, 0.18] });
      b.cyl('wood', cx, cz, 0.95, 1.2, 0.1, 0.12, 6, { tint: [0.45, 0.3, 0.2] });
      const rf = { tint: p.roof || [0.62, 0.3, 0.2] };
      b.poly('roof', [[cx - 0.95, 2.3, cz - 0.7], [cx + 0.95, 2.3, cz - 0.7], [cx + 0.95, 2.95, cz], [cx - 0.95, 2.95, cz]], [0, 1, -1], rf);
      b.poly('roof', [[cx + 0.95, 2.3, cz + 0.7], [cx - 0.95, 2.3, cz + 0.7], [cx - 0.95, 2.95, cz], [cx + 0.95, 2.95, cz]], [0, 1, 1], rf);
      b.poly('wood', [[cx - 0.85, 2.3, cz - 0.62], [cx - 0.85, 2.3, cz + 0.62], [cx - 0.85, 2.85, cz]], [-1, 0, 0], { tint: DARK_WOOD });
      b.poly('wood', [[cx + 0.85, 2.3, cz + 0.62], [cx + 0.85, 2.3, cz - 0.62], [cx + 0.85, 2.85, cz]], [1, 0, 0], { tint: DARK_WOOD });
    },

    // pergola z pnączami i ławką
    pergola(b, W, H, D, p) {
      const wo = { tint: p.tint || [0.9, 0.88, 0.82] };
      for (const x of [0.2, W - 0.3]) for (const z of [0.2, D - 0.3]) b.box('wood', x, 0, z, x + 0.1, 2.5, z + 0.1, 'xXzZ', wo);
      for (const z of [0.15, D - 0.25]) b.box('wood', 0.1, 2.5, z, W - 0.1, 2.62, z + 0.12, 'xXyYzZ', wo);
      for (let i = 0; i < 9; i++) { const x = 0.15 + (i * (W - 0.4)) / 8; b.box('wood', x, 2.62, 0.05, x + 0.07, 2.72, D - 0.05, 'xXyYzZ', wo); }
      for (const x of [0.2, W - 0.3]) for (const z of [0.2, D - 0.3]) { cubeSphere(b, 'leaf', [x + 0.05, 1.8, z + 0.05], [0.28, 0.7, 0.28], 1, { tint: p.leaf || [0.28, 0.44, 0.22], wob: 0.08 }); }
      for (let i = 0; i < 6; i++) cubeSphere(b, 'leaf', [0.5 + i * ((W - 1) / 5), 2.82, D * (0.3 + (i % 2) * 0.4)], [0.55, 0.22, 0.5], 1, { tint: p.leaf || [0.28, 0.44, 0.22], wob: 0.1 });
      b.box('wood', 1.0, 0.42, D / 2 - 0.25, W - 1.0, 0.47, D / 2 + 0.25, 'xXyYzZ', { tint: [0.45, 0.3, 0.18] });
      b.box('wood', 1.0, 0.5, D / 2 + 0.2, W - 1.0, 0.95, D / 2 + 0.25, 'xXyYzZ', { tint: [0.45, 0.3, 0.18] });
      for (const x of [1.1, W - 1.15]) b.box('metal', x, 0, D / 2 - 0.2, x + 0.05, 0.42, D / 2 + 0.2, 'xXzZ', { tint: IRON });
    },

    // rabata kwiatowa: kamienne obrzeże i kolorowe kępy w pierścieniach
    flowerbed(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, R = 1.5, so = { tint: [0.74, 0.7, 0.64] }, cols = p.cols || [[0.9, 0.2, 0.3], [0.98, 0.85, 0.25], [0.65, 0.35, 0.8], [0.98, 0.98, 0.95]];
      const N = 14;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
        const P = (a, r, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
        b.poly('stone', [P(a0, R, 0), P(a1, R, 0), P(a1, R, 0.34), P(a0, R, 0.34)], [Math.cos(am), 0, Math.sin(am)], so);
        b.poly('stone', [P(a0, R, 0.34), P(a1, R, 0.34), P(a1, R - 0.2, 0.34), P(a0, R - 0.2, 0.34)], [0, 1, 0], { ...so, shade: 1.05 });
        b.poly('dark', [P(a0, R - 0.2, 0.3), P(a1, R - 0.2, 0.3), [cx, 0.3, cz]], [0, 1, 0], { shade: 0.45 });
      }
      let k = 0;
      for (const [r, n] of [[1.0, 8], [0.55, 5], [0.0, 1]]) for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r;
        cubeSphere(b, 'leaf', [cx + Math.cos(a) * r, 0.5, cz + Math.sin(a) * r], [0.32, 0.22, 0.32], 1, { tint: [0.3, 0.46, 0.22], wob: 0.05 });
        cubeSphere(b, 'paint', [cx + Math.cos(a) * r, 0.66, cz + Math.sin(a) * r], [0.2, 0.12, 0.2], 1, { tint: cols[k++ % cols.length] });
      }
    },

    // zegar słoneczny na kolumnie
    sundial(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, so = { tint: STONE };
      b.cyl('stone', cx, cz, 0, 0.2, 0.36, 0.3, 8, so);
      b.cyl('stone', cx, cz, 0.2, 0.95, 0.2, 0.17, 8, so);
      b.cyl('stone', cx, cz, 0.95, 1.05, 0.34, 0.34, 12, so, 'Y');
      b.cyl('metal', cx, cz, 1.05, 1.08, 0.31, 0.31, 12, { tint: BRASS }, 'Y');
      b.poly('metal', [[cx - 0.01, 1.08, cz], [cx + 0.01, 1.08, cz], [cx + 0.01, 1.3, cz - 0.18], [cx - 0.01, 1.3, cz - 0.18]], [1, 0.2, 0], { tint: BRASS });
      b.poly('metal', [[cx + 0.01, 1.08, cz], [cx - 0.01, 1.08, cz], [cx - 0.01, 1.3, cz - 0.18], [cx + 0.01, 1.3, cz - 0.18]], [-1, 0.2, 0], { tint: BRASS });
      for (let h = 0; h < 8; h++) { const a = Math.PI * (0.15 + h * 0.1); b.box('dark', cx + Math.cos(a) * 0.2 - 0.01, 1.081, cz + Math.sin(a) * 0.2 - 0.01, cx + Math.cos(a) * 0.27 + 0.01, 1.09, cz + Math.sin(a) * 0.27 + 0.01, 'Y', { tint: [0.1, 0.08, 0.04] }); }
    },

    // huśtawka: rama i dwie huśtawki
    swing(b, W, H, D, p) {
      const wo = { tint: p.tint || [0.55, 0.28, 0.2] }, cz = D / 2;
      for (const x of [0.2, W - 0.2]) {
        b.tube('wood', [x, 0, cz - 0.7], [x, 2.35, cz], 0.06, 0.06, 6, wo);
        b.tube('wood', [x, 0, cz + 0.7], [x, 2.35, cz], 0.06, 0.06, 6, wo);
      }
      b.tube('wood', [0.1, 2.35, cz], [W - 0.1, 2.35, cz], 0.07, 0.07, 6, { ...wo, caps: 1 });
      for (const x of [W * 0.33, W * 0.67]) {
        for (const s of [-1, 1]) b.tube('metal', [x + s * 0.22, 2.3, cz], [x + s * 0.22, 0.55, cz + 0.12], 0.012, 0.012, 4, { tint: IRON });
        b.box('wood', x - 0.28, 0.5, cz + 0.0, x + 0.28, 0.55, cz + 0.3, 'xXyYzZ', { tint: [0.6, 0.45, 0.25] });
      }
    },

    // piaskownica z wiaderkiem i babką z piasku
    sandbox(b, W, H, D, p) {
      const wo = { tint: [0.55, 0.38, 0.22] };
      b.box('wood', 0.05, 0, 0.05, W - 0.05, 0.3, 0.2, 'xXyYzZ', wo);
      b.box('wood', 0.05, 0, D - 0.2, W - 0.05, 0.3, D - 0.05, 'xXyYzZ', wo);
      b.box('wood', 0.05, 0, 0.2, 0.2, 0.3, D - 0.2, 'xXyYzZ', wo);
      b.box('wood', W - 0.2, 0, 0.2, W - 0.05, 0.3, D - 0.2, 'xXyYzZ', wo);
      b.rectY('sand', 0.2, 0.2, 0.2, W - 0.2, D - 0.2, 1, { flat: 1 });
      cubeSphere(b, 'paint', [W * 0.35, 0.2, D * 0.4], [0.35, 0.16, 0.3], 1, { tint: [0.88, 0.78, 0.55] });
      b.cyl('paint', W * 0.7, D * 0.6, 0.2, 0.36, 0.1, 0.12, 8, { tint: [0.2, 0.5, 0.85] });
      b.tube('metal', [W * 0.7 - 0.1, 0.34, D * 0.6], [W * 0.7 + 0.1, 0.34, D * 0.6], 0.008, 0.008, 3, { tint: IRON });
    },

    // żywopłot z kępami liści
    hedge(b, W, H, D, p) {
      for (let i = 0; i < 4; i++) cubeSphere(b, 'leaf', [W * (0.13 + i * 0.245), 0.55, D / 2], [W * 0.17, 0.5, D * 0.44], 1, { tint: p.leaf || [0.26, 0.42, 0.2], wob: 0.12 });
    },

    // ═════════ OGRÓD I PODWÓRZE ═════════════════════════════════════════════
    // szopa ogrodowa z drzwiami, oknem i dachem dwuspadowym
    shed(b, W, H, D, p) {
      const wo = { tint: p.tint || [0.55, 0.4, 0.26] }, rf = { tint: p.roof || [0.35, 0.3, 0.28] };
      const rows = 9;
      for (let r = 0; r < rows; r++) {
        const y0 = (r * 1.9) / rows, y1 = ((r + 1) * 1.9) / rows - 0.012;
        b.rect('wood', 0.1, y0, W - 0.1, y1, 0.1, { ...wo, shade: 0.9 + (r % 2) * 0.1 });
        b.rectBack('wood', 0.1, y0, W - 0.1, y1, D - 0.1, { ...wo, shade: 0.9 + (r % 2) * 0.1 });
      }
      b.rectX('wood', 0.1, 0.1, 0, D - 0.1, 1.9, -1, wo);
      b.rectX('wood', W - 0.1, 0.1, 0, D - 0.1, 1.9, 1, wo);
      b.poly('wood', [[0.1, 1.9, 0.1], [0.1, 1.9, D - 0.1], [0.1, 2.4, D / 2]], [-1, 0, 0], wo);
      b.poly('wood', [[W - 0.1, 1.9, D - 0.1], [W - 0.1, 1.9, 0.1], [W - 0.1, 2.4, D / 2]], [1, 0, 0], wo);
      b.poly('roof', [[-0.15, 1.85, -0.15], [W + 0.15, 1.85, -0.15], [W + 0.15, 2.5, D / 2], [-0.15, 2.5, D / 2]], [0, 1, -1], rf);
      b.poly('roof', [[W + 0.15, 1.85, D + 0.15], [-0.15, 1.85, D + 0.15], [-0.15, 2.5, D / 2], [W + 0.15, 2.5, D / 2]], [0, 1, 1], rf);
      const dx = W * 0.62;
      b.box('wood', dx, 0, 0.0, dx + 0.85, 1.75, 0.1, 'xXyYz', { tint: [0.3, 0.24, 0.18] });
      b.box('metal', dx + 0.7, 0.85, -0.04, dx + 0.78, 0.95, 0.0, 'xXyYz', { tint: IRON });
      b.rect('glass', 0.45, 0.85, 1.2, 1.5, 0.08, { tint: [0.45, 0.55, 0.6] });
      b.box('wood', 0.4, 0.8, 0.0, 1.25, 0.86, 0.1, 'xXyYz', wo);
      b.box('wood', 0.4, 1.5, 0.0, 1.25, 1.56, 0.1, 'xXyYz', wo);
    },

    // trzy ule na stojakach
    beehive(b, W, H, D, p) {
      const cols = p.cols || [[0.92, 0.9, 0.85], [0.35, 0.6, 0.75], [0.95, 0.85, 0.4]];
      for (let i = 0; i < 3; i++) {
        const x = 0.25 + i * 0.55, z = D / 2;
        for (const s of [-1, 1]) b.box('wood', x + s * 0.2 - 0.025, 0, z - 0.2, x + s * 0.2 + 0.025, 0.3, z + 0.2, 'xXzZ', { tint: DARK_WOOD });
        b.box('wood', x - 0.24, 0.3, z - 0.24, x + 0.24, 0.62, z + 0.24, 'xXyYzZ', { tint: cols[i % cols.length] });
        b.box('wood', x - 0.22, 0.62, z - 0.22, x + 0.22, 0.9, z + 0.22, 'xXyYzZ', { tint: cols[i % cols.length], shade: 0.95 });
        b.poly('roof', [[x - 0.3, 0.9, z - 0.3], [x + 0.3, 0.9, z - 0.3], [x + 0.3, 1.04, z], [x - 0.3, 1.04, z]], [0, 1, -1], { tint: [0.35, 0.3, 0.28] });
        b.poly('roof', [[x + 0.3, 0.9, z + 0.3], [x - 0.3, 0.9, z + 0.3], [x - 0.3, 1.04, z], [x + 0.3, 1.04, z]], [0, 1, 1], { tint: [0.35, 0.3, 0.28] });
        b.rect('dark', x - 0.12, 0.33, x + 0.12, 0.37, z - 0.245, { shade: 0.4 });
      }
    },

    // stóg siana
    haystack(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, hay = { tint: p.tint || [0.9, 0.78, 0.38] };
      b.cyl('wood', cx, cz, 0, 1.15, 1.2, 1.28, 12, hay);
      b.cyl('wood', cx, cz, 1.15, 2.7, 1.28, 0.06, 12, hay, 'Y');
      b.cyl('wood', cx, cz, 2.7, 2.9, 0.025, 0.02, 4, { tint: DARK_WOOD });
    },

    // sznur z praniem między dwoma słupkami
    clothesline(b, W, H, D, p) {
      const z = D / 2, wo = { tint: DARK_WOOD };
      for (const x of [0.15, W - 0.15]) { b.cyl('wood', x, z, 0, 2.2, 0.05, 0.04, 6, wo); b.box('wood', x - 0.25 * (x < W / 2 ? 0 : 1), 2.05, z - 0.03, x + 0.25 * (x < W / 2 ? 1 : 0), 2.1, z + 0.03, 'xXyYzZ', wo); }
      b.tube('dark', [0.15, 2.0, z], [W - 0.15, 1.85, z], 0.006, 0.006, 3, { tint: [0.8, 0.78, 0.7] });
      const cl = p.cols || [[0.95, 0.95, 0.92], [0.85, 0.3, 0.3], [0.3, 0.45, 0.75], [0.95, 0.9, 0.55], [0.9, 0.9, 0.9]];
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.7) / 6.6, x = 0.15 + (W - 0.3) * t, y = 2.0 - 0.15 * t, w = i % 3 === 0 ? 0.7 : 0.4, h = i % 3 === 0 ? 0.55 : 0.6;
        const x1 = Math.min(W - 0.2, x + w);
        b.rect('paint', x, y - h, x1, y, z - 0.012, { tint: cl[i % cl.length] });
        b.rectBack('paint', x, y - h, x1, y, z + 0.012, { tint: cl[i % cl.length], shade: 0.8 });
      }
    },

    // kurnik na nogach z rampą i wybiegiem
    coop(b, W, H, D, p) {
      const wo = { tint: p.tint || [0.62, 0.4, 0.26] };
      for (const x of [0.15, W - 0.45]) for (const z of [0.2, D - 0.5]) b.box('wood', x, 0, z, x + 0.1, 0.4, z + 0.1, 'xXzZ', { tint: DARK_WOOD });
      b.box('wood', 0.1, 0.4, 0.15, W - 0.6, 1.1, D - 0.15, 'xXyYzZ', wo);
      b.poly('roof', [[0.0, 1.05, 0.05], [W - 0.5, 1.05, 0.05], [W - 0.5, 1.5, D / 2], [0.0, 1.5, D / 2]], [0, 1, -1], { tint: [0.4, 0.2, 0.15] });
      b.poly('roof', [[W - 0.5, 1.05, D - 0.05], [0.0, 1.05, D - 0.05], [0.0, 1.5, D / 2], [W - 0.5, 1.5, D / 2]], [0, 1, 1], { tint: [0.4, 0.2, 0.15] });
      b.rect('dark', 0.4, 0.5, 0.75, 0.9, 0.14, { shade: 0.4 });
      b.poly('wood', [[0.4, 0.0, -0.45], [0.75, 0.0, -0.45], [0.75, 0.5, 0.1], [0.4, 0.5, 0.1]], [0, 1, -1], { tint: DARK_WOOD });
      for (let i = 0; i < 6; i++) b.box('wood', 0.4 + (i % 2) * 0.33 - 0.01, 0.1 + Math.floor(i / 2) * 0.13, -0.3 + 0.0, 0.43 + (i % 2) * 0.3, 0.12 + Math.floor(i / 2) * 0.13, -0.2, 'xXyYzZ', { tint: [0.3, 0.2, 0.12] });
      for (const [x, z] of [[W - 0.45, 0.2], [W - 0.45, D - 0.2], [W - 0.05, 0.2], [W - 0.05, D - 0.2]]) b.cyl('metal', x, z, 0, 0.7, 0.012, 0.012, 3, { tint: IRON });
      for (const z of [0.2, D - 0.2]) b.tube('metal', [W - 0.45, 0.7, z], [W - 0.05, 0.7, z], 0.01, 0.01, 3, { tint: IRON });
      b.tube('metal', [W - 0.05, 0.7, 0.2], [W - 0.05, 0.7, D - 0.2], 0.01, 0.01, 3, { tint: IRON });
      cubeSphere(b, 'paint', [W - 0.28, 0.12, D / 2], [0.1, 0.09, 0.07], 1, { tint: [0.65, 0.35, 0.18] });
    },

    // ═════════ DZIKA PRZYRODA I WYBRZEŻE ═════════════════════════════════════
    rock(b, W, H, D, p) {
      const g = p.tint || [0.78, 0.76, 0.72];
      cubeSphere(b, 'stone', [W * 0.5, H * 0.38, D * 0.5], [W * 0.46, H * 0.4, D * 0.45], 2, { tint: g, wob: 0.06 });
      cubeSphere(b, 'stone', [W * 0.78, H * 0.2, D * 0.35], [W * 0.18, H * 0.2, D * 0.18], 2, { tint: g.map((c) => c * 0.9), wob: 0.05 });
      cubeSphere(b, 'stone', [W * 0.2, H * 0.14, D * 0.72], [W * 0.15, H * 0.14, D * 0.15], 2, { tint: g.map((c) => c * 1.05), wob: 0.05 });
    },

    stump(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2;
      b.cyl('bark', cx, cz, 0, 0.5, 0.36, 0.3, 10, { tint: [0.42, 0.33, 0.25] });
      b.cyl('wood', cx, cz, 0.5, 0.52, 0.3, 0.3, 10, { tint: [0.78, 0.62, 0.42] }, 'Y');
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; b.tube('bark', [cx + Math.cos(a) * 0.25, 0.2, cz + Math.sin(a) * 0.25], [cx + Math.cos(a) * 0.5, 0.0, cz + Math.sin(a) * 0.5], 0.07, 0.04, 5, { tint: [0.4, 0.31, 0.23] }); }
      b.cyl('wood', cx, cz, 0.52, 0.525, 0.14, 0.14, 8, { tint: [0.55, 0.42, 0.26] }, 'Y');
    },

    // kapliczka przydrożna: słup z domkiem, figurką i krzyżem
    shrine(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, wo = { tint: DARK_WOOD };
      b.box('stone', cx - 0.4, 0, cz - 0.4, cx + 0.4, 0.3, cz + 0.4, 'xXyYzZ', { tint: STONE });
      b.box('wood', cx - 0.09, 0.3, cz - 0.09, cx + 0.09, 2.0, cz + 0.09, 'xXzZ', wo);
      b.box('wood', cx - 0.32, 2.0, cz - 0.24, cx + 0.32, 2.62, cz + 0.24, 'xXyYzZ', { tint: [0.52, 0.38, 0.24] });
      b.rect('dark', cx - 0.2, 2.08, cx + 0.2, 2.5, cz - 0.245, { shade: 0.5 });
      b.cyl('paint', cx, cz - 0.16, 2.1, 2.4, 0.045, 0.03, 6, { tint: [0.85, 0.82, 0.74] });
      cubeSphere(b, 'paint', [cx, 2.42, cz - 0.16], [0.05, 0.055, 0.05], 1, { tint: [0.85, 0.7, 0.55] });
      b.poly('roof', [[cx - 0.42, 2.58, cz - 0.34], [cx + 0.42, 2.58, cz - 0.34], [cx + 0.42, 2.95, cz], [cx - 0.42, 2.95, cz]], [0, 1, -1], { tint: [0.4, 0.22, 0.16] });
      b.poly('roof', [[cx + 0.42, 2.58, cz + 0.34], [cx - 0.42, 2.58, cz + 0.34], [cx - 0.42, 2.95, cz], [cx + 0.42, 2.95, cz]], [0, 1, 1], { tint: [0.4, 0.22, 0.16] });
      b.box('wood', cx - 0.02, 2.95, cz - 0.02, cx + 0.02, 3.2, cz + 0.02, 'xXzZ', { tint: [0.2, 0.15, 0.1] });
      b.box('wood', cx - 0.09, 3.07, cz - 0.02, cx + 0.09, 3.11, cz + 0.02, 'xXyYzZ', { tint: [0.2, 0.15, 0.1] });
      for (let i = 0; i < 4; i++) cubeSphere(b, 'paint', [cx - 0.3 + i * 0.2, 0.36, cz - 0.5], [0.07, 0.06, 0.07], 1, { tint: [[0.9, 0.25, 0.3], [0.95, 0.85, 0.3], [0.98, 0.98, 0.95], [0.7, 0.4, 0.8]][i] });
    },

    // krzyż przydrożny pod daszkiem
    roadcross(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, wo = { tint: [0.38, 0.28, 0.2] };
      b.box('stone', cx - 0.3, 0, cz - 0.3, cx + 0.3, 0.45, cz + 0.3, 'xXyYzZ', { tint: STONE });
      b.box('wood', cx - 0.07, 0.45, cz - 0.07, cx + 0.07, 2.4, cz + 0.07, 'xXzZ', wo);
      b.box('wood', cx - 0.4, 1.8, cz - 0.06, cx + 0.4, 1.93, cz + 0.06, 'xXyYzZ', wo);
      b.poly('roof', [[cx - 0.5, 2.25, cz - 0.28], [cx + 0.5, 2.25, cz - 0.28], [cx + 0.5, 2.55, cz], [cx - 0.5, 2.55, cz]], [0, 1, -1], { tint: [0.38, 0.22, 0.16] });
      b.poly('roof', [[cx + 0.5, 2.25, cz + 0.28], [cx - 0.5, 2.25, cz + 0.28], [cx - 0.5, 2.55, cz], [cx + 0.5, 2.55, cz]], [0, 1, 1], { tint: [0.38, 0.22, 0.16] });
      cubeSphere(b, 'paint', [cx, 1.5, cz - 0.1], [0.07, 0.1, 0.05], 1, { tint: [0.8, 0.7, 0.55] });
    },

    // nagrobek: płyta z łukiem, krzyż albo obelisk na cokole, z kamienną obwódką grobu
    gravestone(b, W, H, D, p) {
      const cx = W / 2, cz = D * 0.32, v = p.variant ?? 0, st = { tint: p.tint || [0.55, 0.54, 0.52] };
      b.box('stone', cx - 0.4, 0, cz - 0.9 + 0.55, cx + 0.4, 0.14, cz + 0.9 + 0.55, 'xXyYzZ', { tint: [0.62, 0.6, 0.57] });
      b.box('stone', cx - 0.34, 0.14, cz - 0.25, cx + 0.34, 0.34, cz + 0.25, 'xXyYzZ', st);
      if (v === 0) {
        b.box('stone', cx - 0.26, 0.34, cz - 0.09, cx + 0.26, 1.1, cz + 0.09, 'xXyYzZ', st);
        b.cyl('stone', cx, cz, 1.1, 1.1, 0.26, 0.26, 10, st);
        for (let i = 0; i < 6; i++) {
          const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6), r = 0.26;
          b.poly('stone', [[cx + Math.cos(a0) * r, 1.1 + Math.sin(a0) * 0.17, cz - 0.09], [cx + Math.cos(a1) * r, 1.1 + Math.sin(a1) * 0.17, cz - 0.09], [cx, 1.1, cz - 0.09]], [0, 0, -1], st);
          b.poly('stone', [[cx + Math.cos(a1) * r, 1.1 + Math.sin(a1) * 0.17, cz + 0.09], [cx + Math.cos(a0) * r, 1.1 + Math.sin(a0) * 0.17, cz + 0.09], [cx, 1.1, cz + 0.09]], [0, 0, 1], st);
        }
        b.rect('dark', cx - 0.13, 0.62, cx + 0.13, 0.66, cz - 0.095, { shade: 0.5 });
      } else if (v === 1) {
        b.box('stone', cx - 0.07, 0.34, cz - 0.07, cx + 0.07, 1.5, cz + 0.07, 'xXyYzZ', st);
        b.box('stone', cx - 0.3, 1.0, cz - 0.06, cx + 0.3, 1.14, cz + 0.06, 'xXyYzZ', st);
      } else {
        b.box('stone', cx - 0.2, 0.34, cz - 0.2, cx + 0.2, 0.7, cz + 0.2, 'xXyYzZ', st);
        b.cyl('stone', cx, cz, 0.7, 1.6, 0.14, 0.04, 4, st);
      }
    },

    // kamień milowy z tabliczką
    milestone(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2;
      b.box('stone', cx - 0.22, 0, cz - 0.17, cx + 0.22, 0.7, cz + 0.17, 'xXyzZ', { tint: [0.72, 0.7, 0.66] });
      b.cyl('stone', cx, cz, 0.7, 0.88, 0.19, 0.12, 8, { tint: [0.74, 0.72, 0.68] }, 'Y');
      b.rect('dark', cx - 0.15, 0.42, cx + 0.15, 0.62, cz - 0.175, { shade: 0.7 });
      b.rect('paint', cx - 0.12, 0.47, cx + 0.12, 0.5, cz - 0.178, { tint: [0.9, 0.88, 0.8] });
      b.rect('paint', cx - 0.08, 0.53, cx + 0.08, 0.56, cz - 0.178, { tint: [0.9, 0.88, 0.8] });
    },

    // wiatrak: tapered wieża, czapa, cztery śmigi z kratownicą
    windmill(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, wall = { tint: p.tint || [0.9, 0.86, 0.78] };
      b.cyl('stone', cx, cz, 0, 1.0, 2.55, 2.4, 12, { tint: [0.6, 0.58, 0.54] });
      b.cyl('plaster', cx, cz, 1.0, 6.8, 2.4, 1.6, 12, wall);
      b.cyl('stone', cx, cz, 6.8, 6.95, 1.7, 1.7, 12, { tint: [0.7, 0.68, 0.62] }, 'Y');
      b.cyl('roof', cx, cz, 6.95, 8.6, 1.78, 0.18, 12, { tint: p.roof || [0.3, 0.2, 0.15] }, 'Y');
      b.cyl('metal', cx, cz, 8.6, 9.0, 0.05, 0.0, 5, { tint: IRON });
      b.box('wood', cx - 0.5, 0, cz - 2.62, cx + 0.5, 1.9, cz - 2.3, 'xXyYz', { tint: [0.3, 0.2, 0.14] });
      // wał i śmigi (płaszczyzna xy, przed wieżą po stronie z-)
      const hz = cz - 2.05, hy = 6.3;
      b.tube('metal', [cx, hy, cz - 1.3], [cx, hy, hz - 0.35], 0.16, 0.12, 8, { tint: IRON, caps: 1 });
      const sail = (ang) => {
        const c = Math.cos(ang), s = Math.sin(ang);
        const P = (r, t) => [cx + c * r - s * t, hy + s * r + c * t, hz - 0.3];
        const arm = (t, r0, r1, th) => b.tube('wood', [...P(r0, t)], [...P(r1, t)], th, th, 4, { tint: [0.32, 0.22, 0.14] });
        arm(0, 0.2, 5.6, 0.07);
        arm(0.52, 0.8, 5.5, 0.03); arm(-0.1, 0.8, 5.5, 0.03);
        for (let r = 1.0; r <= 5.4; r += 0.55) b.tube('wood', [...P(r, -0.1)], [...P(r, 0.52)], 0.018, 0.018, 3, { tint: [0.32, 0.22, 0.14] });
        for (let r = 1.2; r <= 5.2; r += 1.1) b.poly('paint', [[...P(r, 0.0)], [...P(r + 0.9, 0.0)], [...P(r + 0.9, 0.5)], [...P(r, 0.5)]], [0, 0, -1], { tint: [0.92, 0.9, 0.85] });
      };
      for (let k = 0; k < 4; k++) sail(0.5 + k * Math.PI / 2);
    },

    // łódź wiosłowa: kadłub z deszczułek, ławki, wiosła
    rowboat(b, W, H, D, p) {
      const hull = { tint: p.hull || [0.25, 0.4, 0.55] }, inside = { tint: [0.62, 0.5, 0.34] }, cz = D / 2;
      const st = 7, xs = [], ws = [], ys = [];
      for (let i = 0; i < st; i++) {
        const t = i / (st - 1), x = 0.1 + t * (W - 0.2);
        const w = 0.62 * Math.sin(Math.PI * Math.pow(t, 0.8) * 0.97 + 0.05) ** 0.7;
        xs.push(x); ws.push(Math.max(0.04, w)); ys.push(0.55 + 0.25 * Math.pow(Math.abs(t - 0.45) * 1.8, 2));
      }
      for (let i = 0; i < st - 1; i++) for (const s of [-1, 1]) {
        const x0 = xs[i], x1 = xs[i + 1], w0 = ws[i] * s, w1 = ws[i + 1] * s;
        b.poly('wood', [[x0, 0.12, cz + w0 * 0.45], [x1, 0.12, cz + w1 * 0.45], [x1, ys[i + 1], cz + w1], [x0, ys[i], cz + w0]], [0, -0.3, s], hull);
        b.poly('wood', [[x1, 0.12, cz + w1 * 0.45], [x0, 0.12, cz + w0 * 0.45], [x0, ys[i] - 0.03, cz + w0 * 0.98], [x1, ys[i + 1] - 0.03, cz + w1 * 0.98]], [0, 0.3, -s], inside);
        b.poly('wood', [[x0, ys[i], cz + w0], [x1, ys[i + 1], cz + w1], [x1, ys[i + 1], cz + w1 * 0.9], [x0, ys[i], cz + w0 * 0.9]], [0, 1, 0], { tint: [0.9, 0.88, 0.8] });
      }
      b.poly('wood', [[xs[0], 0.12, cz - ws[0] * 0.45], [xs[0], 0.12, cz + ws[0] * 0.45], [xs[0], ys[0], cz + ws[0]], [xs[0], ys[0], cz - ws[0]]], [-1, 0, 0], hull);
      for (const x of [W * 0.33, W * 0.62]) b.box('wood', x, 0.34, cz - 0.52, x + 0.22, 0.4, cz + 0.52, 'xXyYzZ', inside);
      b.tube('wood', [W * 0.45, 0.55, cz + 0.7], [W * 0.62, 0.62, cz + 1.5 + 0.0], 0.022, 0.022, 4, { tint: [0.6, 0.48, 0.3] });
    },

    // parasol plażowy i dwa leżaki
    deckchair(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, c1 = p.c1 || [0.2, 0.45, 0.8], c2 = p.c2 || [0.95, 0.93, 0.88];
      b.cyl('wood', cx, cz, 0, 2.4, 0.025, 0.02, 5, { tint: [0.9, 0.88, 0.8] });
      parasol(b, cx, cz, 1.95, 2.55, 1.15, c1, c2, 8);
      for (const [dx, dz] of [[-0.85, 0.35], [0.85, 0.45]]) {
        const x = cx + dx, z = cz + dz, wo = { tint: [0.55, 0.38, 0.22] };
        for (const s of [-1, 1]) {
          b.tube('wood', [x + s * 0.25, 0, z - 0.45], [x + s * 0.25, 0.45, z], 0.02, 0.02, 4, wo);
          b.tube('wood', [x + s * 0.25, 0, z + 0.45], [x + s * 0.25, 0.4, z + 0.1], 0.02, 0.02, 4, wo);
          b.tube('wood', [x + s * 0.25, 0.4, z + 0.1], [x + s * 0.25, 0.75, z + 0.5], 0.02, 0.02, 4, wo);
        }
        for (let k = 0; k < 4; k++) {
          const o = { tint: k % 2 ? c2 : c1 };
          const t0 = k / 4, t1 = (k + 1) / 4;
          b.poly('paint', [[x - 0.26, 0.4 + 0.02 * k, z + 0.1 + t0 * 0.4], [x + 0.26, 0.4 + 0.02 * k, z + 0.1 + t0 * 0.4], [x + 0.26, 0.4 + 0.35 * t1 + 0.0, z + 0.1 + t1 * 0.4], [x - 0.26, 0.4 + 0.35 * t1, z + 0.1 + t1 * 0.4]], [0, 1, -0.5], o);
        }
      }
    },

    // słup telegraficzny z poprzeczkami i izolatorami
    telegraph(b, W, H, D, p) {
      const cx = W / 2, cz = D / 2, wo = { tint: [0.4, 0.3, 0.22] };
      b.tube('wood', [cx, 0, cz], [cx, 7.2, cz], 0.14, 0.09, 8, wo);
      for (const y of [6.7, 6.1]) {
        b.box('wood', cx - 0.8, y, cz - 0.04, cx + 0.8, y + 0.09, cz + 0.04, 'xXyYzZ', wo);
        for (const x of [-0.7, -0.25, 0.25, 0.7]) { b.cyl('paint', cx + x, cz, y + 0.09, y + 0.2, 0.035, 0.025, 6, { tint: [0.55, 0.7, 0.62] }, 'Y'); }
      }
      b.tube('wood', [cx - 0.5, 5.5, cz], [cx, 6.3, cz], 0.025, 0.025, 4, wo);
      b.tube('wood', [cx + 0.5, 5.5, cz], [cx, 6.3, cz], 0.025, 0.025, 4, wo);
      b.cyl('metal', cx, cz, 7.2, 7.32, 0.05, 0.0, 6, { tint: IRON });
    },
  });
}
