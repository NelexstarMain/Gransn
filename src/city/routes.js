// Trasy (autostrada i kolej) powstają w plan.js jako łuki pierścieni. Tu zostaje tylko
// odległość punktu od trasy (łamanej), używana przy ustawianiu budynków i rekwizytów.
export function polyDist(route, x, z) {
  let best = 1e9;
  const P = route.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}
