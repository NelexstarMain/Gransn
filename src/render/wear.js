// Zniszczenia, zacieki i bruk liczone w shaderze — bez ani jednej unikalnej tekstury.
//
// Każdy budynek ma własne ziarno i stopień zniszczenia (atrybut wierzchołka `wear`),
// a każdy moduł wie, gdzie ma okno i na jakiej wysokości stoi. Dzięki temu:
//  • zacieki spływają spod parapetów i bokami ościeży, a pod gzymsem ciemnieje cały pas,
//  • tynk odpada najchętniej przy narożnikach okien, pod gzymsem i przy ziemi (wilgoć
//    podciągana od dołu), a spod spodu wychodzi cegła,
//  • pęknięcia rozchodzą się z narożników okien.
// Wszystko pochodzi z jednej małej tekstury szumu (512², 1,4 MB), próbkowanej z
// przesunięciem zależnym od budynku i od pozycji w świecie — nic się nie powtarza.
//
// Bruk: każda kostka ma własny rozmiar, kształt, kolor i pochylenie; rzędy leżą wzdłuż
// jezdni, mają całkowitą liczbę rzędów między krawężnikami i lekko "pływają".
// Płyty chodnikowe: każda ma własne pęknięcia, plamy i pochylenie.
import * as THREE from 'three';
import { tileNoise, voronoi } from './textures.js';
import { mulberry32 } from '../core/rng.js';

// ── tekstura szumu (RGBA8, bezszwowa) ───────────────────────────────────────
// R: plamy (wyrównany histogram → próg = dokładny procent pokrycia)
// G: pole zacieków (rozciągane w pionie w shaderze)
// B: sieć pęknięć (0 na krawędziach komórek Voronoi)
// A: ziarno
function equalize(a) {
  const BINS = 4096, h = new Uint32Array(BINS);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  const k = (BINS - 1) / (hi - lo || 1);
  for (let i = 0; i < a.length; i++) h[Math.floor((a[i] - lo) * k)]++;
  const cdf = new Float32Array(BINS);
  let acc = 0;
  for (let i = 0; i < BINS; i++) { acc += h[i]; cdf[i] = acc / a.length; }
  for (let i = 0; i < a.length; i++) a[i] = cdf[Math.floor((a[i] - lo) * k)];
  return a;
}

export function makeWearData(S = 512) {
  const nR = tileNoise(401), nG = tileNoise(402), nA = tileNoise(403), nW1 = tileNoise(404), nW2 = tileNoise(405);
  const vor = voronoi(7, 406, 0.95);
  const R = new Float32Array(S * S), G = new Float32Array(S * S), A = new Float32Array(S * S), B = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      R[i] = nR(u, v, 5, 5);
      G[i] = nG(u, v, 24, 3);
      A[i] = nA(u, v, 64, 2);
      // pęknięcia: Voronoi ze zniekształconymi współrzędnymi (kręte linie)
      const wu = u + (nW1(u, v, 6, 2) - 0.5) * 0.09, wv = v + (nW2(u, v, 6, 2) - 0.5) * 0.09;
      const c = vor(wu, wv);
      B[i] = Math.min(1, (c.d2 - c.d1) / 0.4);
    }
  equalize(R); equalize(G); equalize(A);
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    out[i * 4] = Math.round(R[i] * 255);
    out[i * 4 + 1] = Math.round(G[i] * 255);
    out[i * 4 + 2] = Math.round(B[i] * 255);
    out[i * 4 + 3] = Math.round(A[i] * 255);
  }
  return out;
}

export function makeWearTexture(S = 512) {
  const t = new THREE.DataTexture(makeWearData(S), S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}


// ── wolumen szumu 3D (64³, RGBA8, bezszwowy, okres 16 m) ─────────────────────
// Pola zniszczeń są funkcją POZYCJI W ŚWIECIE (x,y,z), a nie współrzędnych UV ściany —
// dlatego płaty tynku, zacieki i wilgoć przechodzą płynnie przez narożniki budynków
// z jednej ściany na drugą. R: płaty (4 komórki/okres), G: zacieki i wżery (16),
// B: "gorące miejsca" (2), A: drugie pole — pasy, poszarpane brzegi (8).
function noise3(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(256), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const m = (a, P) => ((a % P) + P) % P;
  const h = (i, j, k, P) => val[perm[(perm[(perm[m(i, P) & 255] + m(j, P)) & 255] + m(k, P)) & 255]];
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y, z, P) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    const c = (a, b, d) => h(xi + a, yi + b, zi + d, P);
    const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * xf, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * xf;
    const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * xf, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * xf;
    const y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
    return y0 + (y1 - y0) * zf;
  };
  return (u, v, w, P, oct) => {
    let s = 0, amp = 0.5, f = P, norm = 0;
    for (let o = 0; o < oct; o++) { s += amp * n(u * f, v * f, w * f, f); norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}

export function makeWearVolumeData(N = 64) {
  const fR = noise3(501), fG = noise3(502), fB = noise3(503), fA = noise3(504);
  const n = N * N * N;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), A = new Float32Array(n);
  for (let z = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = (z * N + y) * N + x, u = x / N, v = y / N, w = z / N;
        R[i] = fR(u, v, w, 4, 4);
        G[i] = fG(u, v, w, 16, 3);
        B[i] = fB(u, v, w, 2, 2);
        A[i] = fA(u, v, w, 8, 4);
      }
  equalize(R); equalize(G); equalize(B); equalize(A);
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(R[i] * 255);
    out[i * 4 + 1] = Math.round(G[i] * 255);
    out[i * 4 + 2] = Math.round(B[i] * 255);
    out[i * 4 + 3] = Math.round(A[i] * 255);
  }
  return out;
}

export function makeWearVolume(N = 64) {
  const t = new THREE.Data3DTexture(makeWearVolumeData(N), N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

// ── GLSL ────────────────────────────────────────────────────────────────────
// Składnia zgodna z GLSL ES 1.00 i 3.00 (three.js mapuje texture2D → texture).
export const GLSL_COMMON = /* glsl */ `
uniform sampler2D wearTex;
varying vec4 vWear;
varying vec2 vWUV;
varying vec3 vWP;
varying vec3 vWN;
#ifndef WEAR_NOVOL
uniform highp sampler3D wearVol;
// pole szumu 3D w metrach świata (okres 16 m)
vec4 wV(vec3 p){ return texture(wearVol, p * (1.0 / 16.0)); }
#endif

float wh11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float wh21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 wh22(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
vec3 wlin(vec3 c){ return pow(c, vec3(2.2)); }

// normalna z pola wysokości (metry) liczona pochodnymi ekranowymi — bez normal map
vec3 wBump(vec3 P, vec3 N, float h){
  vec3 sx = dFdx(P), sy = dFdy(P);
  vec3 r1 = cross(sy, N), r2 = cross(N, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * N - g);
}
`;

// Elewacja: tynk / cegła / kamień. wear.x = przesunięcie od środka modułu (16 / m, 128 = środek),
// wear.y = wysokość nad podłogą modułu (50 / m), wear.z = ziarno budynku,
// wear.w = rola (2 bity: 0 piętro, 1 parter, 2 pod gzymsem, 3 parter pod gzymsem) · zniszczenie (3 bity) · okno (3 bity).
//
// Odpadanie tynku ma kilka rodzajów: (1) duże poszarpane płaty, (2) pasy — poziome lub pionowe,
// skupione pod gzymsem i przy ziemi, (3) wżery (drobne ubytki), (4) łaty z cementu w prostokątach,
// (5) pęknięcia z narożników okien. W "gorących miejscach" (pole B wolumenu) szansa jest wielokrotnie
// większa. Ubytki mają GŁĘBIĘ: promień oka jest marszowany w głąb ubytku (paralaksa), więc cegła
// siedzi głęboko pod tynkiem, widać grubość tynku na krawędzi, a wnętrze jest zacienione.
export const GLSL_FACADE = /* glsl */ `
varying vec4 vProfA;
varying vec4 vProfB;
float wHole(vec3 q, vec4 k, vec3 bo, out vec2 info){
  vec4 a = wV(q * 0.9 + bo);
  vec4 r = wV(q * 5.0 + bo.zxy);
  float f1 = a.r + (r.a - 0.5) * 0.11;
  float big = smoothstep(1.0 - k.x, 1.0 - k.x + 0.012, f1);
  info = vec2(f1, big);
  float strip = 0.0, pit = 0.0;
  #ifndef WEAR_LOW
    vec3 s = k.w > 0.5 ? vec3(2.2, 0.45, 2.2) : vec3(0.45, 2.4, 0.45);
    strip = smoothstep(1.0 - k.y, 1.0 - k.y + 0.02, wV(q * s + bo.yzx).a);
    pit = smoothstep(1.0 - k.z, 1.0 - k.z + 0.04, wV(q * 4.7 + bo.zyx).g + (r.g - 0.5) * 0.15);
  #endif
  return max(big, max(strip * 0.75, pit * 0.55));
}

vec3 wFacade(vec3 col, out float hgt, out float rgh){
  hgt = 0.0; rgh = 1.0;
  float wv = floor(vWear.w * 255.0 + 0.5);
  float role = floor(wv / 64.0);
  float rest = wv - role * 64.0;
  float di = floor(rest / 8.0);
  float dmg = di / 7.0;
  float kk = rest - di * 8.0;
  float seed = floor(vWear.z * 255.0 + 0.5);
  vec2 bo = wh22(vec2(seed, 3.0)) * 13.0;
  vec3 bo3 = vec3(wh21(vec2(seed, 1.0)), wh21(vec2(seed, 2.0)), wh21(vec2(seed, 3.0))) * 16.0;
  float isG = (role == 1.0 || role == 3.0) ? 1.0 : 0.0;
  float isT = role >= 2.0 ? 1.0 : 0.0;
  float lx = (vWear.x * 255.0 - 128.0) / 16.0;
  float ly = vWear.y * 255.0 / 50.0;
  float Hm = mix(3.2, 3.8, isG);
  float sillY = mix(0.86, 1.3, isG);
  float openH = mix(1.65, 2.0, isG);
  float hw = 0.3 + 0.075 * kk;
  float hasWin = kk > 0.5 ? 1.0 : 0.0;
  float amt = 0.3 + 0.7 * dmg;
  vec3 P = vWP;
  vec4 pa = vProfA, pb = vProfB;
  float dcam = length(P - cameraPosition);

  // pola 3D (ciągłe przez narożniki) i drobne ziarno 2D
  vec4 nB = wV(P * 0.25 + bo3);
  float tideN = wV(P * 0.8 + bo3.yzx).a;
  float hot = smoothstep(0.5, 0.85, wV(P * 0.9 + bo3.zxy).b);
  vec4 nS = wV(vec3(P.x * 3.0, P.y * 0.2, P.z * 3.0) + bo3);
  vec4 nT = wV(vec3(P.x * 7.0, P.y * 0.45, P.z * 7.0) + bo3.yzx);
  vec4 nF = texture2D(wearTex, vWUV * 2.3 + bo * 0.5);

  // nitki spływającej wody
  float rv = smoothstep(0.5, 0.86, nS.g) * (0.45 + 0.55 * smoothstep(0.35, 0.8, nT.g));

  // — zacieki dopasowane do układu: spod parapetu, wzdłuż ościeży, pod gzymsem, od ziemi —
  float axo = abs(lx) - hw;
  float dd = sillY - ly;
  float side = hasWin * exp(-pow((axo - 0.17) / 0.13, 2.0)) * step(0.0, axo + 0.02);
  float sideS = side * mix(0.5, 1.0, smoothstep(-0.05, 0.1, dd));
  float tongue = hasWin * (1.0 - smoothstep(hw - 0.08, hw + 0.2, abs(lx))) * smoothstep(0.0, 0.06, dd) * (1.0 - smoothstep(0.05, 0.85, dd)) * smoothstep(0.0, 0.3, ly);
  float corn = isT * smoothstep(Hm - 1.8, Hm - 0.02, ly);
  float band = isT * smoothstep(Hm - 0.28, Hm, ly);
  float tide = 0.55 + (nB.r - 0.5) * 0.9 + (tideN - 0.5) * 0.5;
  float damp = isG * (1.0 - smoothstep(tide - 0.25, tide + 0.2, ly));

  float S = max(max(sideS * (0.2 + 0.8 * rv), tongue * (0.3 + 0.7 * rv)), corn * (0.25 + 0.75 * rv) * 0.9);
  S = max(S, band * 0.6);
  S = clamp(S * pa.x * amt * 1.5 * (0.6 + 0.8 * hot) + damp * pa.y * amt * 0.9, 0.0, 1.0);
  S *= 0.7 + 0.6 * tideN;

  col *= 1.0 + (nB.r - 0.5) * 0.22 * amt * pb.w - 0.04;
  col *= mix(vec3(1.0), vec3(0.42, 0.39, 0.34), S);
  col = mix(col, col * vec3(0.62, 0.72, 0.5), damp * amt * smoothstep(0.6, 0.95, tideN) * 0.4 * pb.w);

  // narożniki okien: stąd rozchodzą się pęknięcia i odpada tynk
  vec2 c1 = vec2(axo, ly - sillY);
  vec2 c2 = vec2(axo, ly - sillY - openH);
  float corner = hasWin * (exp(-dot(c1, c1) / 0.5) + exp(-dot(c2, c2) / 0.5));
  float cornerW = hasWin * (exp(-dot(c1, c1) / 1.2) + exp(-dot(c2, c2) / 1.2));

  #ifdef WEAR_PLASTER
    float hotMul = mix(0.15, 3.0, hot);
    float prox = corner + isT * smoothstep(Hm - 0.9, Hm, ly) + isG * (1.0 - smoothstep(0.0, 1.4, ly));
    float stripZone = isT * smoothstep(Hm - 1.2, Hm, ly) + isG * (1.0 - smoothstep(0.0, 1.2, ly));
    // drobne ubytki (pasy, wżery) tylko z bliska; rodzaj budynku mnoży pokrycie każdego z nich
    vec4 hk = vec4(
      clamp(((0.005 + 0.15 * dmg * dmg) * hotMul + 0.11 * prox * (0.15 + dmg * dmg)) * pa.z, 0.0, 0.7),
      dcam < 45.0 ? clamp((0.01 + 0.12 * dmg * dmg) * hotMul * (0.4 + 1.2 * stripZone) * pa.w, 0.0, 0.5) : 0.0,
      dcam < 45.0 ? clamp((0.01 + 0.2 * dmg) * hotMul * 0.5 * pb.x, 0.0, 0.35) : 0.0,
      wh11(seed + 0.5) > 0.5 ? 1.0 : 0.0);
    vec3 Vw = normalize(P - cameraPosition);
    vec3 Nw = normalize(vWN);
    float vn = max(-dot(Vw, Nw), 0.25);
    vec3 sh = (Vw - Nw * dot(Vw, Nw)) / vn;
    vec3 tg = normalize(vec3(Nw.z, 0.0, -Nw.x) + vec3(0.0001, 0.0, 0.0));
    vec2 inf = vec2(0.0);
    float h0 = 0.0;
    float rim = 0.0;
    // budynek bez ubytków (rodzaj "czysty", "tylko zacieki"...) pomija całe pole
    if (hk.x + hk.y + hk.z > 0.004) {
      h0 = wHole(P, hk, bo3, inf);
      rim = smoothstep(1.0 - hk.x - 0.045, 1.0 - hk.x, inf.x) * (1.0 - inf.y);
    }
    if (h0 > 0.02) {
      vec3 qh = P;
      float hq = h0;
      #ifndef WEAR_LOW
        if (dcam < 30.0)   // paralaksa tylko z bliska
        for (int i = 1; i <= 4; i++) {
          float f = float(i) * 0.25;
          vec3 q = P + sh * (f * 0.02);   // ubytek ma do 2 cm głębokości
          vec2 iq;
          float hd = wHole(q, hk, bo3, iq);
          qh = q; hq = hd;
          if (hd < f) break;
        }
      #endif
      vec2 duv = vec2(dot(qh - P, tg), qh.y - P.y);
      vec2 bp = vec2((vWUV.x + duv.x) / 0.26, (vWUV.y + duv.y) / 0.078);
      bp.x += 0.5 * mod(floor(bp.y), 2.0);
      vec2 bi = floor(bp), bf = fract(bp);
      float mort = max(step(bf.x, 0.06), step(bf.y, 0.12));
      float bid = wh21(bi + bo);
      float gA = wV(qh * 2.3 + bo3.yxz).a;
      vec3 brk = mix(wlin(vec3(0.5, 0.29, 0.23)), wlin(vec3(0.36, 0.22, 0.19)), bid) * (0.7 + 0.5 * nF.a);
      brk = mix(brk, wlin(vec3(0.62, 0.6, 0.55)) * (0.7 + 0.4 * nF.a), mort);
      vec3 under = wlin(vec3(0.66, 0.62, 0.55)) * (0.75 + 0.5 * nF.a);
      vec3 floorC = mix(under, brk, smoothstep(0.3, 0.7, hq * (0.75 + 0.5 * gA)));
      vec3 pcol = mix(under * 0.45, floorC, smoothstep(0.08, 0.2, hq));   // przy krawędzi widać przekrój tynku
      pcol *= mix(0.5, 1.0, smoothstep(0.05, 0.85, hq));                   // zacienione wnętrze
      col = pcol * (1.0 - 0.35 * S);
      hgt += -0.012 * hq;
      rgh += 0.05;
    }
    col *= 1.0 - rim * 0.25;
    hgt += rim * 0.004;

    // łaty z cementu: prostokąty przy własnej siatce budynku
    vec2 gp = vec2(vWUV.x / 0.95, vWUV.y / 0.6) + bo3.xy * 0.37;
    vec2 gi = floor(gp), gf = fract(gp);
    float pr = dcam < 70.0 ? clamp((0.008 + 0.05 * dmg * hotMul + 0.04 * corner) * pb.y, 0.0, 0.3) : 0.0;
    vec2 r0 = 0.06 + 0.25 * wh22(gi + 3.0), r1 = 1.0 - 0.06 - 0.25 * wh22(gi + 9.0);
    vec2 inr = step(r0, gf) * step(gf, r1);
    float rep = step(1.0 - pr, wh21(gi + seed * 1.7)) * inr.x * inr.y * (h0 > 0.02 ? 0.0 : 1.0);
    float rd = min(min(gf.x - r0.x, r1.x - gf.x) * 0.95, min(gf.y - r0.y, r1.y - gf.y) * 0.6);
    vec3 cem = wlin(vec3(0.58, 0.57, 0.54)) * (0.8 + 0.35 * nF.a) * (1.0 - 0.3 * S);
    col = mix(col, cem, rep);
    hgt += rep * (smoothstep(0.0, 0.03, rd) * 0.004 + 0.002);
    rgh += rep * 0.05;
  #endif
  #ifdef WEAR_BRICK
    float salt = damp * smoothstep(0.45, 0.85, nF.a) * (0.4 + 0.6 * dmg) * pb.w;
    col = mix(col, wlin(vec3(0.78, 0.76, 0.68)) * (0.8 + 0.3 * nF.a), salt * 0.6);
    col *= 1.0 - band * 0.2;
  #endif

  if (dcam < 60.0 && pb.z > 0.05) {
    float cb = texture2D(wearTex, vWUV * 0.66 + bo * 2.3).b;
    float crk = 1.0 - smoothstep(0.0, 0.1, cb);
    float cm = clamp((0.06 + cornerW) * dmg * dmg * pb.z, 0.0, 1.0);
    col *= 1.0 - crk * cm * 0.6;
    hgt -= crk * cm * 0.004;
  }

  rgh -= S * 0.18;
  return col;
}
`;

// Dachy: mech, wyblakłe i ciemne połacie, rdza na blasze. Rodzic: ziarno budynku (wear.z) i zniszczenie.
export const GLSL_ROOF = /* glsl */ `
vec3 wRoof(vec3 col, out float hgt, out float rgh){
  hgt = 0.0; rgh = 1.0;
  float seed = floor(vWear.z * 255.0 + 0.5);
  vec2 bo = wh22(vec2(seed, 5.0)) * 13.0;
  float dmg = floor(mod(floor(vWear.w * 255.0 + 0.5), 64.0) / 8.0) / 7.0;
  float amt = 0.25 + 0.75 * dmg;
  vec2 q = vWP.xz + vWP.y * 0.7;
  vec4 a = texture2D(wearTex, q * 0.037 + bo);
  vec4 b = texture2D(wearTex, q * 0.21 + bo * 1.9);
  vec4 c = texture2D(wearTex, q * 1.7 + bo);
  col *= 0.8 + 0.4 * a.g;
  col *= 0.9 + 0.2 * c.a;
  float cov = 0.05 + 0.4 * amt;
  float moss = smoothstep(1.0 - cov, 1.0 - cov + 0.05, a.r * 0.7 + b.r * 0.3);
  col = mix(col, wlin(vec3(0.24, 0.31, 0.16)) * (0.7 + 0.6 * c.a), moss * 0.85);
  #ifdef WEAR_SHEET
    float rs = smoothstep(0.55, 0.8, texture2D(wearTex, vec2(vWUV.x * 0.4, vWUV.y * 0.03) + bo).g) * smoothstep(0.25, 0.7, b.g);
    col = mix(col, wlin(vec3(0.45, 0.22, 0.12)) * (0.7 + 0.5 * c.a), rs * amt * 0.75);
    rgh += rs * 0.3;
  #endif
  rgh += moss * 0.2;
  return col;
}
`;

// Rekwizyty (drewno, metal): rdza i brud w skali świata.
export const GLSL_PROP = /* glsl */ `
vec3 wProp(vec3 col, out float hgt, out float rgh){
  hgt = 0.0; rgh = 1.0;
  vec4 a = texture2D(wearTex, vWP.xz * 0.31 + vWP.y * 0.17);
  vec4 b = texture2D(wearTex, vWP.xz * 1.37 + vWP.y * 0.73);
  float s = a.r * 0.6 + b.r * 0.4;
  col *= 0.8 + 0.35 * a.g;
  #ifdef WEAR_METAL
    float rust = smoothstep(0.66, 0.92, s) * (0.5 + 0.5 * b.a);
    col = mix(col, wlin(vec3(0.42, 0.2, 0.1)) * (0.7 + 0.5 * b.a), rust * 0.8);
    rgh += rust * 0.5;
  #else
    float chips = smoothstep(0.72, 0.78, s);
    col = mix(col, wlin(vec3(0.5, 0.47, 0.42)) * (0.8 + 0.3 * b.a), chips * 0.5);
  #endif
  return col;
}
`;

// Asfalt: pęknięcia, łaty remontowe, plamy oleju.
export const GLSL_ASPHALT = /* glsl */ `
vec3 wAsphalt(vec3 col, out float hgt, out float rgh){
  hgt = 0.0; rgh = 1.0;
  vec4 a = texture2D(wearTex, vWP.xz * 0.013);
  vec4 b = texture2D(wearTex, vWP.xz * 0.11);
  vec4 c = texture2D(wearTex, vWP.xz * 0.9);
  float cb = texture2D(wearTex, vWP.xz * 0.17 + a.rg * 0.2).b;
  float crk = (1.0 - smoothstep(0.0, 0.09, cb)) * smoothstep(0.35, 0.8, a.g);
  float rep = smoothstep(0.8, 0.82, a.r * 0.6 + b.r * 0.4);
  float oil = smoothstep(0.86, 0.93, b.g);
  col *= 1.0 - crk * 0.5;
  col = mix(col, col * 0.72, rep);
  col *= 1.0 - oil * 0.4;
  col *= 0.9 + 0.2 * c.a;
  hgt = -crk * 0.004;
  rgh = 1.0 - oil * 0.35;
  return col;
}
`;

// Bruk. Współrzędne vWUV są w "kostkach": 1 = wysokość rzędu (~15 cm). wear.x = liczba rzędów
// między krawężnikami (0 = podwórze bez krawędzi). Rzędy leżą wzdłuż jezdni i lekko falują,
// przy krawężnikach są proste. Każda kostka: własna długość, skos, zaokrąglenie, kolor, pochylenie.
export const GLSL_COBBLE = /* glsl */ `
vec3 wpal(float t){
  vec3 a = vec3(0.45, 0.45, 0.45), b = vec3(0.37, 0.39, 0.42), c = vec3(0.48, 0.44, 0.38), d = vec3(0.49, 0.42, 0.38), e = vec3(0.27, 0.27, 0.28);
  t *= 4.0;
  vec3 r = mix(a, b, smoothstep(0.0, 1.0, t));
  r = mix(r, c, smoothstep(1.0, 2.0, t));
  r = mix(r, d, smoothstep(2.0, 3.0, t));
  r = mix(r, e, smoothstep(3.0, 4.0, t));
  r = mix(vec3(dot(r, vec3(0.333))), r, 0.55);
  return wlin(r);
}
vec3 wCobble(vec3 base, out float hgt, out float rgh){
  hgt = 0.0; rgh = 1.0;
  vec2 cp = vWUV;
  float px = max(length(dFdx(cp)), length(dFdy(cp)));
  vec3 avg = wlin(vec3(0.34, 0.33, 0.31));
  if (px > 1.2) return avg;
  float nR = floor(vWear.x * 255.0 + 0.5);
  float bs = floor(vWear.z * 255.0 + 0.5);
  vec2 bo = wh22(vec2(bs, 9.0)) * 11.0;

  // rzędy lekko falują, przy krawężnikach są proste
  float edgeD = nR > 0.5 ? min(cp.y, nR - cp.y) : 100.0;
  float amp = smoothstep(0.2, 3.5, edgeD);
  float wave = sin(cp.x * 0.21 + cp.y * 0.9 + bo.x * 5.0) * 0.55 + sin(cp.x * 0.083 - cp.y * 0.37 + bo.y * 5.0) * 0.45;
  float yy = cp.y + wave * 0.3 * amp;
  float row = floor(yy);
  float fy = yy - row;
  float rid = row + bs * 0.37;
  float L = 1.1 + 0.9 * wh11(rid);
  float xi = (cp.x + wh11(rid * 1.7) * 10.0) / L;
  float i0 = floor(xi);
  float b0 = i0 + (wh21(vec2(i0, rid)) - 0.5) * 0.55;
  float b1 = i0 + 1.0 + (wh21(vec2(i0 + 1.0, rid)) - 0.5) * 0.55;
  if (xi < b0) { i0 -= 1.0; b1 = b0; b0 = i0 + (wh21(vec2(i0, rid)) - 0.5) * 0.55; }
  else if (xi >= b1) { i0 += 1.0; b0 = b1; b1 = i0 + 1.0 + (wh21(vec2(i0 + 1.0, rid)) - 0.5) * 0.55; }

  float sid = wh21(vec2(i0, rid) + bo * 3.0);
  vec2 sj = wh22(vec2(i0 * 1.3, rid * 0.7) + 17.0);
  float wL = (b1 - b0) * L;
  float cx = (xi - 0.5 * (b0 + b1)) * L;
  float cy = fy - 0.5 + (cx / wL) * (sj.x - 0.5) * 0.35;
  float hx = wL * 0.5 - 0.03 - 0.025 * sj.y;
  float hy = 0.5 - 0.035 - 0.03 * sj.x;
  float rr = 0.12 + 0.1 * sid;
  vec2 q = abs(vec2(cx, cy)) - vec2(hx, hy) + rr;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;   // < 0 wewnątrz kostki

  float st = smoothstep(0.0, -0.13, sd);
  float dome = 1.0 - 0.5 * (cx * cx) / (hx * hx) - 0.5 * (cy * cy) / (hy * hy);
  float tilt = (cx * (sj.x - 0.5) + cy * (sj.y - 0.5)) * 0.4;
  float hu = st * (0.55 + 0.25 * dome) + tilt * st;
  hgt = hu * 0.035;

  vec4 nF = texture2D(wearTex, cp * vec2(0.37, 0.41) + bo);
  vec4 nG = texture2D(wearTex, cp * 1.9 + bo.yx);
  float tone = 0.8 + 0.4 * nF.a;
  vec3 sc = wpal(sid) * tone * (0.9 + 0.2 * sj.y);
  // przetarcie w koleinach (tylko jezdnie)
  float lane = 0.0;
  if (nR > 0.5) {
    float t = cp.y / nR;
    lane = exp(-pow((t - 0.28) / 0.07, 2.0)) + exp(-pow((t - 0.72) / 0.07, 2.0));
  }
  sc *= 1.0 + 0.2 * lane * st;
  sc *= 0.6 + 0.4 * smoothstep(0.0, 0.15, -sd);

  // plamy w skali świata: wilgoć, olej, nawóz
  vec4 nW = texture2D(wearTex, vWP.xz * 0.035 + bo.yx);
  float stain = smoothstep(0.76, 0.95, nW.r);
  sc *= 1.0 - stain * 0.45;

  float gr = 1.0 - smoothstep(-px * 0.6, 0.07 + px * 0.8, -sd);   // spoina szersza niż piksel: bez postrzępienia
  vec3 groutC = wlin(vec3(0.27, 0.23, 0.18)) * (0.65 + 0.7 * nG.a);
  float moss = smoothstep(0.6, 0.9, nG.g) * (1.0 - smoothstep(0.0, 2.0, edgeD));
  groutC = mix(groutC, wlin(vec3(0.2, 0.27, 0.12)), moss * 0.6);
  vec3 col = mix(sc, groutC, gr);

  rgh = 1.0 - 0.3 * lane * st - 0.12 * stain;
  float lodF = smoothstep(0.4, 1.0, px);
  hgt *= 1.0 - smoothstep(0.1, 0.5, px);
  return mix(col, avg, lodF);
}
`;

// Płyty chodnikowe 50×50 cm leżące wzdłuż najbliższej jezdni (wear.x = kąt jezdni / π).
export const GLSL_SLAB = /* glsl */ `
vec3 wSlab(vec3 base, out float hgt, out float rgh){
  hgt = 0.0; rgh = 1.0;
  float px = max(length(dFdx(vWUV)), length(dFdy(vWUV)));
  vec3 avg = wlin(vec3(0.6, 0.59, 0.57));
  if (px > 0.25) return avg;
  float ang = vWear.x * 255.0 / 255.0 * 3.14159265;
  vec2 p = vec2(cos(ang) * vWUV.x + sin(ang) * vWUV.y, -sin(ang) * vWUV.x + cos(ang) * vWUV.y);
  vec4 wv = texture2D(wearTex, p * 0.021 + 0.3);
  p += (wv.rg - 0.5) * 0.1;            // osiadanie: spoiny lekko falują
  vec2 g = p / 0.5;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float h1 = wh21(id);
  vec2 h2 = wh22(id + 5.0);
  float eD = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 0.5;   // m do krawędzi płyty
  float gap = 0.003 + 0.005 * h2.x;
  float inSlab = smoothstep(gap - px * 0.5, gap + 0.004 + px * 0.9, eD);   // spoina nigdy węższa niż piksel (bez kropek)

  vec4 nF = texture2D(wearTex, p * 1.3 + id * 0.137);
  vec4 nB = texture2D(wearTex, vWP.xz * 0.09);
  vec3 c = wlin(vec3(0.62, 0.61, 0.58)) * (0.82 + 0.3 * h1);
  c = mix(c, c * vec3(1.05, 1.0, 0.92), step(0.7, h2.y));          // niektóre cieplejsze
  c *= 0.88 + 0.22 * nF.a;
  // pęknięcie przekątne w co piątej płycie
  float crk = 0.0;
  if (h1 > 0.8) {
    vec2 d = f - 0.5;
    float a2 = h2.x * 6.2831;
    float dist = abs(d.x * sin(a2) - d.y * cos(a2) + (nF.g - 0.5) * 0.08);
    crk = 1.0 - smoothstep(0.004, 0.012, dist);
  }
  // wyszczerbiony róg
  vec2 cq = vec2(f.x > 0.5 ? 1.0 - f.x : f.x, f.y > 0.5 ? 1.0 - f.y : f.y);
  float chip = (h2.y > 0.9 && length(cq) < 0.05 + 0.05 * h2.x) ? 1.0 : 0.0;
  c *= 1.0 - crk * 0.55 - chip * 0.2;
  // wymieniona łatą płyta: ciemniejsza, szarsza
  c = mix(c, wlin(vec3(0.42, 0.42, 0.42)), step(0.93, h1) * 0.8);
  c *= 1.0 - smoothstep(0.78, 0.95, nB.r) * 0.35;                  // plamy brudu / wilgoci
  vec3 grout = wlin(vec3(0.3, 0.26, 0.21)) * (0.7 + 0.6 * nF.g);
  grout = mix(grout, wlin(vec3(0.22, 0.3, 0.13)), smoothstep(0.6, 0.9, nF.a) * 0.5);   // trawa w spoinach
  vec3 col = mix(grout, c, inSlab);
  hgt = inSlab * 0.003 + (f.x - 0.5) * (h2.x - 0.5) * 0.004 - crk * 0.002;
  float lodF = smoothstep(0.03, 0.2, px);
  hgt *= 1.0 - smoothstep(0.01, 0.06, px);
  return mix(col, avg, lodF);
}
`;


// 20 rodzajów zniszczeń budynku. Rodzaj = ziarno mod 20. Każdy ma 8 wag:
// A = (zacieki, wilgoć, duże płaty, pasy), B = (wżery, łaty cementowe, pęknięcia, brud/glony).
// Liczone w vertex shaderze, więc we fragmencie nic to nie kosztuje.
export const GLSL_PROFILE = /* glsl */ `
void wProfile(float k, out vec4 a, out vec4 b){
  a = vec4(1.0); b = vec4(1.0);
  if (k < 0.5) { a = vec4(0.1, 0.1, 0.0, 0.0); b = vec4(0.0, 0.0, 0.1, 0.2); }
  else if (k < 1.5) { a = vec4(0.2, 0.1, 0.0, 0.0); b = vec4(0.0, 1.6, 0.2, 0.1); }
  else if (k < 2.5) { a = vec4(1.2, 0.3, 0.0, 0.0); b = vec4(0.0, 0.0, 0.0, 0.6); }
  else if (k < 3.5) { a = vec4(0.6, 0.2, 0.0, 0.0); b = vec4(0.0, 0.0, 0.3, 1.4); }
  else if (k < 4.5) { a = vec4(1.6, 0.5, 0.1, 0.0); b = vec4(0.0, 0.0, 0.3, 0.8); }
  else if (k < 5.5) { a = vec4(1.0, 0.3, 0.0, 0.8); b = vec4(0.0, 0.0, 0.3, 1.8); }
  else if (k < 6.5) { a = vec4(0.4, 1.8, 0.3, 0.3); b = vec4(0.3, 0.0, 0.3, 0.6); }
  else if (k < 7.5) { a = vec4(0.6, 1.6, 0.0, 0.0); b = vec4(0.4, 0.0, 0.2, 2.0); }
  else if (k < 8.5) { a = vec4(0.4, 1.0, 1.0, 0.3); b = vec4(0.0, 0.0, 0.5, 0.6); }
  else if (k < 9.5) { a = vec4(0.6, 0.4, 0.2, 1.8); b = vec4(0.4, 0.0, 0.4, 0.8); }
  else if (k < 10.5) { a = vec4(0.5, 0.3, 0.2, 0.2); b = vec4(2.0, 0.0, 0.6, 0.8); }
  else if (k < 11.5) { a = vec4(0.6, 0.4, 0.4, 0.0); b = vec4(0.2, 2.2, 0.5, 0.8); }
  else if (k < 12.5) { a = vec4(0.5, 0.3, 0.3, 0.0); b = vec4(0.0, 0.3, 2.0, 0.8); }
  else if (k < 13.5) { a = vec4(0.6, 0.5, 1.6, 0.3); b = vec4(0.3, 0.3, 0.7, 0.8); }
  else if (k < 14.5) { a = vec4(0.8, 0.8, 2.2, 0.8); b = vec4(0.8, 0.5, 1.2, 1.2); }
  else if (k < 15.5) { a = vec4(0.7, 0.5, 1.0, 0.4); b = vec4(0.3, 1.6, 0.8, 1.0); }
  else if (k < 16.5) { a = vec4(1.4, 1.8, 0.8, 0.6); b = vec4(0.5, 0.3, 0.8, 1.6); }
  else if (k < 17.5) { a = vec4(0.9, 0.5, 0.4, 0.3); b = vec4(1.6, 0.4, 1.5, 1.2); }
  else if (k < 18.5) { a = vec4(1.0, 1.0, 0.8, 0.6); b = vec4(0.6, 0.6, 0.8, 1.0); }
  else { a = vec4(1.4, 1.4, 2.0, 1.6); b = vec4(1.6, 1.2, 1.6, 1.6); }
}
`;

// ── doklejenie do materiału three.js ─────────────────────────────────────────
// kind: 'plaster' | 'brick' | 'stone' | 'tile' | 'sheet' | 'metal' | 'wood' | 'cobble' | 'slab' | 'asphalt'
const KINDS = {
  plaster: { fn: GLSL_FACADE, call: 'wFacade', attr: true, prof: true, defs: { WEAR_PLASTER: 1 } },
  brick: { fn: GLSL_FACADE, call: 'wFacade', attr: true, prof: true, defs: { WEAR_BRICK: 1 } },
  stone: { fn: GLSL_FACADE, call: 'wFacade', attr: true, prof: true, defs: { WEAR_STONE: 1 } },
  tile: { fn: GLSL_ROOF, call: 'wRoof', attr: true, defs: {} },
  sheet: { fn: GLSL_ROOF, call: 'wRoof', attr: true, defs: { WEAR_SHEET: 1 } },
  metal: { fn: GLSL_PROP, call: 'wProp', attr: false, defs: { WEAR_METAL: 1 } },
  wood: { fn: GLSL_PROP, call: 'wProp', attr: false, defs: {} },
  cobble: { fn: GLSL_COBBLE, call: 'wCobble', attr: true, defs: {} },
  slab: { fn: GLSL_SLAB, call: 'wSlab', attr: true, defs: {} },
  asphalt: { fn: GLSL_ASPHALT, call: 'wAsphalt', attr: false, defs: {} },
};

export function applyWear(material, kind, wearTex, wearVol, low = false) {
  const K = KINDS[kind];
  material.defines = { ...(material.defines || {}), ...K.defs, ...(low ? { WEAR_LOW: 1 } : {}) };
  material.customProgramCacheKey = () => 'wear-' + kind;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wearTex = { value: wearTex };
    shader.uniforms.wearVol = { value: wearVol };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec4 vWear; varying vec2 vWUV; varying vec3 vWP; varying vec3 vWN;
${K.attr ? 'attribute vec4 wear;' : ''}
${K.prof ? 'varying vec4 vProfA; varying vec4 vProfB;' + GLSL_PROFILE : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWUV = uv; vWP = position; vWN = normal; vWear = ${K.attr ? 'wear' : 'vec4(0.0)'};
${K.prof ? 'wProfile(mod(floor(wear.z * 255.0 + 0.5), 20.0), vProfA, vProfB);' : ''}`);
    const use = `float wHgt = 0.0, wRgh = 1.0; diffuseColor.rgb = ${K.call}(diffuseColor.rgb, wHgt, wRgh);`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\n${K.fn}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${use}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * wRgh, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = wBump(-vViewPosition, normal, wHgt);');
  };
  material.needsUpdate = true;
}
