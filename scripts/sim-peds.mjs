// Symulacja pieszych bez grafiki (razem z autami-botami): czy chodzą po chodnikach,
// nie wchodzą w budynki i wodę, czekają na krawężniku, nie zakleszczają ruchu.
//   node scripts/sim-peds.mjs [seed]
import { generateCity } from '../src/city/layout.js';
import { CollisionGrid, SOLID, ROAD, BRIDGE, WALK, GROUND } from '../src/game/collision.js';
import { Traffic, buildRoadGraph } from '../src/game/traffic.js';
import { Pedestrians } from '../src/game/pedestrians.js';
import { Rng } from '../src/core/rng.js';

const seed = Number(process.argv[2]) || 1984;
const city = generateCity(seed), grid = new CollisionGrid(city);
const G = buildRoadGraph(city.streets);
// atrapa tłumu: tylko dane (bez GPU)
const crowd = {
  people: [], max: 200,
  add(style, st = {}) { const h = { style, x: 0, y: 0, z: 0, yaw: 0, speed: 0, look: 0, waveT: 0, sitT: 0, fall: 0, fallDx: 1, fallDz: 0, ...st }; this.people.push(h); return h; },
  remove(h) { const i = this.people.indexOf(h); if (i >= 0) this.people.splice(i, 1); },
};
const traffic = Object.create(Traffic.prototype);
Object.assign(traffic, { city, G, rng: new Rng(9001), bots: [], count: 30, t: 0, crowd: null });
traffic.liveNodes = G.nodes.map((_, i) => i).filter((i) => G.live[i] && G.nodes[i].edges.length);
const peds = new Pedestrians(city, grid, G, crowd, 60);
traffic.peds = peds;
const P = { x: city.spawn.x, z: city.spawn.z };
const car = { pos: { x: P.x, z: P.z }, heading: 0, v: 0, L: 3.8, W: 1.75, vx: 0, vz: 0, shake: 0 };

let nan = 0, inSolid = 0, offWalk = 0, samples = 0, onRoadSamples = 0, waits = 0, maxWaitT = 0;
const types = {};
const dt = 0.05, T = 4000;
const t0 = performance.now();
let removedStuck = 0, downs = 0;
const before = new Set();
for (let step = 0; step < T; step++) {
  traffic.t += dt;
  if (traffic.bots.length < traffic.count) traffic.spawn([P.x, P.z]);
  for (const b of traffic.bots) traffic.drive(b, dt, null);
  // gracz jeździ po okręgu wzdłuż ulic, żeby populacja się odnawiała
  const a = step * dt * 0.05;
  car.pos.x = P.x + Math.cos(a) * 60; car.pos.z = P.z + Math.sin(a) * 60; car.heading = a + Math.PI / 2; car.v = 8;
  peds.update(dt, P, { bots: traffic.bots, car: null }, { x: 1, z: 0 });
  if (step === 2000) { for (const w of peds.walkers.slice(0, 6)) peds.shoot(w, w.h.x - 10, w.h.z); downs = peds.stats.downed; }
  for (const w of peds.walkers) {
    const h = w.h;
    if (!Number.isFinite(h.x) || !Number.isFinite(h.z) || !Number.isFinite(h.y)) nan++;
    if (step % 10 === 0 && w.mode !== 'down') {
      samples++;
      const t = grid.type(h.x, h.z);
      types[t] = (types[t] || 0) + 1;
      if (t === SOLID) inSolid++;
      if (t === ROAD || t === BRIDGE) onRoadSamples++;
      if (w.mode === 'wait') waits++;
      if (city.terrain.height(h.x, h.z) < city.terrain.seaY + 0.3 && t !== BRIDGE) offWalk++;
    }
  }
}
const ms = performance.now() - t0;
console.log({
  steps: T, simSeconds: T * dt, wallMs: Math.round(ms), msPerStep: (ms / T).toFixed(3),
  walkers: peds.walkers.length, crowd: crowd.people.length, nan,
  cellTypes: types, inSolidShare: (inSolid / samples).toFixed(4), onRoadShare: (onRoadSamples / samples).toFixed(3), waitShare: (waits / samples).toFixed(3), inWater: offWalk,
  downed: peds.stats.downed, downsAtShot: downs,
});
