// Improved Perlin noise 3D (Ken Perlin 2002). Funkcja pozycji w świecie,
// więc sąsiednie moduły dostają identyczne przesunięcie we wspólnych wierzchołkach.
// Gradienty z tablicy zamiast rozgałęzień: wynik co do bitu ten sam, ~3× szybciej
// (generator woła tę funkcję dziesiątki milionów razy).
import { mulberry32 } from './rng.js';

const perm = new Uint8Array(512);
(() => {
  const r = mulberry32(1984);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

// grad(h) = GX·x + GY·y + GZ·z — współczynniki ∈ {0, ±1} z klasycznych 16 gradientów
const G = new Float64Array(48);
for (let h = 0; h < 16; h++) {
  const c = [0, 0, 0];
  c[h < 8 ? 0 : 1] += h & 1 ? -1 : 1;
  c[h < 4 ? 1 : h === 12 || h === 14 ? 0 : 2] += h & 2 ? -1 : 1;
  G.set(c, h * 3);
}

export function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  x -= fx; y -= fy; z -= fz;
  const u = x * x * x * (x * (x * 6 - 15) + 10);
  const v = y * y * y * (y * (y * 6 - 15) + 10);
  const w = z * z * z * (z * (z * 6 - 15) + 10);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  const x1 = x - 1, y1 = y - 1, z1 = z - 1;
  let k = (perm[AA] & 15) * 3;
  const g000 = G[k] * x + G[k + 1] * y + G[k + 2] * z;
  k = (perm[BA] & 15) * 3;
  const g100 = G[k] * x1 + G[k + 1] * y + G[k + 2] * z;
  k = (perm[AB] & 15) * 3;
  const g010 = G[k] * x + G[k + 1] * y1 + G[k + 2] * z;
  k = (perm[BB] & 15) * 3;
  const g110 = G[k] * x1 + G[k + 1] * y1 + G[k + 2] * z;
  k = (perm[AA + 1] & 15) * 3;
  const g001 = G[k] * x + G[k + 1] * y + G[k + 2] * z1;
  k = (perm[BA + 1] & 15) * 3;
  const g101 = G[k] * x1 + G[k + 1] * y + G[k + 2] * z1;
  k = (perm[AB + 1] & 15) * 3;
  const g011 = G[k] * x + G[k + 1] * y1 + G[k + 2] * z1;
  k = (perm[BB + 1] & 15) * 3;
  const g111 = G[k] * x1 + G[k + 1] * y1 + G[k + 2] * z1;
  const a0 = g000 + (g100 - g000) * u, a1 = g010 + (g110 - g010) * u;
  const b0 = g001 + (g101 - g001) * u, b1 = g011 + (g111 - g011) * u;
  const c0 = a0 + (a1 - a0) * v, c1 = b0 + (b1 - b0) * v;
  return c0 + (c1 - c0) * w;
}

export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
