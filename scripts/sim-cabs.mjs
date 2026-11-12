// Symulacja taksówkarzy-rywali bez grafiki: 300 s, gracz stoi w miejscu; sprawdza, czy rywale
// zabierają pasażerów, zarabiają, nie utykają, a trafienia i taranowanie je niszczą.
//   node scripts/sim-cabs.mjs [ziarno]
import * as THREE from 'three';
import { generateCity } from '../src/city/layout.js';
import { CollisionGrid } from '../src/game/collision.js';
import { Traffic, buildRoadGraph } from '../src/game/traffic.js';
import { Vehicle } from '../src/game/vehicle.js';
import { TaxiJob } from '../src/game/taxi.js';
import { Cabbies } from '../src/game/cabbies.js';
import { Rng } from '../src/core/rng.js';

const el = () => ({ style: {}, textContent: '', innerHTML: '', remove() {} });
globalThis.document = { createElement: el, body: { appendChild() {}, classList: { contains: () => false } } };
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
const seed = Number(process.argv[2] || 1984);
const c = generateCity(seed), grid = new CollisionGrid(c), G = buildRoadGraph(c.streets);
const t = Object.create(Traffic.prototype);
Object.assign(t, { city: c, grid, G, rng: new Rng(9001), bots: [], count: 34, t: 0, nearBuf: [] });
t.liveNodes = G.nodes.map((_, i) => i).filter((i) => G.live[i] && G.nodes[i].edges.length);
const car = new Vehicle(null, grid, null, null);
car.active = true; car.traffic = t;
car.obstacles = (x, z) => t.near(x, z, 6);
const scene = new THREE.Scene();
const crowd = { add: () => ({ x: 0, y: 0, z: 0 }), remove() {}, addDriver: () => null };
const job = new TaxiJob(scene, c, null, crowd, { });
job.grid = grid;
const camera = new THREE.PerspectiveCamera(72, 1.7, 0.2, 2000);
const fx = { emit() {} };
const cabs = new Cabbies({ traffic: t, job, fx, camera, grid, city: c });
car.onBotHit = (b, v) => { if (b.cab.ram > 0) return; b.cab.ram = 0.35; cabs.damage(b, Math.min(40, (v - 2) * 7), true); };
car.place(c.spawn.x, c.spawn.z, 0);
const dt = 1 / 30;
let nan = 0, stuckMax = 0;
const stuck = new Map();
for (let i = 0; i < 300 / dt; i++) {
  t.t += dt;
  while (t.bots.length < 38) { const n0 = t.bots.length; t.spawn([car.pos.x, car.pos.z]); if (t.bots.length === n0) break; }
  job.update(dt, car, grid);
  for (const b of t.bots) t.drive(b, dt, null); // gracz stoi poza ruchem (nie blokuje)
  cabs.update(dt, car);
  for (const b of cabs.cabs) {
    if (!isFinite(b.x) || !isFinite(b.v)) nan++;
    const s = b.v < 0.3 && b.cab.state !== 'wreck' ? (stuck.get(b) || 0) + dt : 0; stuck.set(b, s); stuckMax = Math.max(stuckMax, s);
  }
  if (i % Math.floor(30 / dt) === 0 && process.argv.includes('-v')) console.log(Math.round(i * dt), cabs.cabs.map((b) => `${b.cab.name} ${b.cab.state} tgt=${b.cab.target ? Math.round(Math.hypot(b.cab.target.p[0] - b.x, b.cab.target.p[1] - b.z)) : '-'} d=${Math.round(Math.hypot(b.x - car.pos.x, b.z - car.pos.z))} v=${b.v.toFixed(1)} path=${b.path.length}`).join(' | '));
  if (i === Math.floor(200 / dt) && process.argv.includes('-d')) for (const b of cabs.cabs) if (b.v < 0.2) { const nx = G.nodes[b.path[1]]; console.log(b.cab.name, 'wait', b.wait.toFixed(1), 'bump', b.bump, 'turn', !!b.turn, 'edge', b.edge, 'path', b.path.length, 'next lock', nx && nx.lock, 'me', b.id, 'near', t.bots.filter((o) => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 14).map((o) => `${o.id}:${o.kind}:v${o.v.toFixed(1)}:${Math.hypot(o.x - b.x, o.z - b.z).toFixed(0)}m${o.cab ? ':' + o.cab.name : ''}`).join(',')); }
  if (i === Math.floor(150 / dt)) { const b = cabs.cabs[0]; cabs.damage(b, 34, true); cabs.damage(b, 34, true); console.log('po 2 trafieniach', b.cab.name, 'hp', b.cab.hp); cabs.damage(b, 34, true); console.log('po 3 trafieniach', b.cab.state, 'zł gracza', job.money); }
}
console.log({ seed, rywale: cabs.cabs.map((b) => `${b.cab.name}: ${b.cab.money} zł, kursy ${b.cab.trips}, ${b.cab.state}`), pasazerowieCzeka: job.waiting.length, najdluzszyPostojS: +stuckMax.toFixed(1), nan });
