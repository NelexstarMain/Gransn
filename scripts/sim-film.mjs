// Symulacja trybu filmowego bez grafiki: autopilot jedzie 120 s po trasie, z botami na drodze.
// Liczy: przejechany dystans, odchylenie od trasy, jazdę poza jezdnią, utknięcia i przeskoki.
//   node scripts/sim-film.mjs [ziarno]
import * as THREE from 'three';
import { generateCity } from '../src/city/layout.js';
import { CollisionGrid } from '../src/game/collision.js';
import { Traffic, buildRoadGraph } from '../src/game/traffic.js';
import { Vehicle } from '../src/game/vehicle.js';
import { FilmMode } from '../src/game/film.js';
import { Rng } from '../src/core/rng.js';

const seed = Number(process.argv[2] || 1984);
const c = generateCity(seed), grid = new CollisionGrid(c), G = buildRoadGraph(c.streets);
const t = Object.create(Traffic.prototype);
Object.assign(t, { city: c, grid, G, rng: new Rng(9001), bots: [], count: 34, t: 0, nearBuf: [] });
t.liveNodes = G.nodes.map((_, i) => i).filter((i) => G.live[i] && G.nodes[i].edges.length);
const car = new Vehicle(null, grid, null, null); // tryb bez grafiki: sama fizyka
car.active = true;
car.obstacles = (x, z) => t.near(x, z, 6);
car.traffic = t;
const film = Object.create(FilmMode.prototype);
Object.assign(film, { city: c, grid, car, traffic: t, seg: 0, s: 0, run: 0, stuck: 0 });
film.buildRoute();
const total = film.cum[film.cum.length - 1];
const [x0, z0, h0] = film.at(0);
car.place(x0, z0, h0);
car.auto = { steer: 0, v: 0 };
let warps = 0, off = 0, maxLat = 0, nan = 0, maxS = 0;
const P = { x: car.pos.x, z: car.pos.z };
const dt = 1 / 30;
for (let step = 0; step < 200 / dt; step++) {
  t.t += dt;
  while (t.bots.length < 34) { const n0 = t.bots.length; t.spawn([car.pos.x, car.pos.z]); if (t.bots.length === n0) break; }
  film.run += dt;
  const s0 = film.s;
  car.auto = film.drive(dt);
  if (film.s - s0 > 10) { warps++; if (process.argv.includes('-v')) console.log('warp at', car.pos.x.toFixed(0), car.pos.z.toFixed(0), 't', film.run.toFixed(0), 'obst', car.obstacles(car.pos.x + Math.cos(car.heading) * 5, car.pos.z + Math.sin(car.heading) * 5).length, 'blockedNow', car.blocked(car.pos.x, car.pos.z, car.heading), 'ty', grid.type(car.pos.x, car.pos.z), 'lat', Math.hypot(film.at(film.s)[0] - car.pos.x, film.at(film.s)[1] - car.pos.z).toFixed(1)); }
  car.update(dt, new Set(), [0, 0]);
  if (process.argv.includes('-v') && film.stuck > 4.9) { const p0 = film.at(film.s); console.log('STUCK', car.pos.x.toFixed(0), car.pos.z.toFixed(0), 'v', car.v.toFixed(1), 'ty', grid.type(car.pos.x, car.pos.z), 'lat', Math.hypot(p0[0] - car.pos.x, p0[1] - car.pos.z).toFixed(1), 'hdgErr', ((car.heading - p0[2]) * 57).toFixed(0), 'obstAhead', car.obstacles(car.pos.x + Math.cos(car.heading) * 4, car.pos.z + Math.sin(car.heading) * 4).length, 'nearestRoad', JSON.stringify((() => { const n = c.roads.nearest(car.pos.x, car.pos.z); return n ? [n.d.toFixed(1), n.s.rw, n.s.type] : null; })()), 'blockedPts', [[1.8,-0.85],[1.8,0.85],[-1.8,-0.85],[-1.8,0.85],[1.8,0],[0,-0.85],[0,0.85]].map(([u,w]) => grid.solid(car.pos.x + Math.cos(car.heading)*u - Math.sin(car.heading)*w, car.pos.z + Math.sin(car.heading)*u + Math.cos(car.heading)*w) ? 1 : 0).join('')); }
  for (const b of t.bots) t.drive(b, dt, car);
  if (!isFinite(car.pos.x) || !isFinite(car.v)) nan++;
  if (car.offRoad) off += dt;
  const p = film.at(film.s);
  maxLat = Math.max(maxLat, Math.hypot(p[0] - car.pos.x, p[1] - car.pos.z));
  maxS = film.s;
  if (film.s >= total - 3) break;
}
console.log({ seed, trasaM: Math.round(total), przejechaneM: Math.round(maxS), czasS: Math.round(film.run), warps, pozaJezdniS: +off.toFixed(1), maxOdchylenieM: +maxLat.toFixed(1), nan, vKmh: +(car.kmh).toFixed(0) });
