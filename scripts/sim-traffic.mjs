import { generateCity } from '../src/city/layout.js';
import { Traffic, buildRoadGraph } from '../src/game/traffic.js';
import { Rng } from '../src/core/rng.js';
const c = generateCity(Number(process.argv[2]) || 1984);
const G = buildRoadGraph(c.streets);
const live = G.live.filter(Boolean).length;
console.log('graph nodes', G.nodes.length, 'edges', G.edges.length, 'live', live, 'deg3+', G.nodes.filter((n) => n.edges.length >= 3).length);
const t = Object.create(Traffic.prototype);
Object.assign(t, { city: c, G, rng: new Rng(9001), bots: [], count: 34, t: 0 });
t.liveNodes = G.nodes.map((_, i) => i).filter((i) => G.live[i] && G.nodes[i].edges.length);
const P = { x: c.spawn.x, z: c.spawn.z };
let nan = 0, stuckMax = 0, speeds = [], stopped = 0, samples = 0, trips = 0;
const still = new Map();
for (let step = 0; step < 3600; step++) {
  const dt = 0.05;
  t.t += dt;
  while (t.bots.length < t.count) { const n0 = t.bots.length; t.spawn([P.x, P.z]); if (t.bots.length === n0) break; }
  for (const b of t.bots) {
    const before = b.path.length;
    t.drive(b, dt, null);
    if (b.path.length > before + 1) trips++;
    if (!isFinite(b.x) || !isFinite(b.z)) nan++;
    const k = b.id;
    still.set(k, b.v < 0.2 ? (still.get(k) || 0) + dt : 0);
    stuckMax = Math.max(stuckMax, still.get(k));
  }
  if (step % 20 === 0) for (const b of t.bots) { speeds.push(b.v); samples++; if (b.v < 0.5) stopped++; }
}
const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
console.log({ bots: t.bots.length, nan, avgSpeedKmh: (avg * 3.6).toFixed(1), stoppedShare: (stopped / samples).toFixed(2), longestWaitS: stuckMax.toFixed(1), replans: trips });
