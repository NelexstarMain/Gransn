// Symulacja wyścigu bez grafiki: gracza zastępuje autopilot (ten sam co rywali, vmax 17 m/s).
// Sprawdza: trasę, start, bramki, metę, miejsca, utknięcia rywali, NaN.
//   node scripts/sim-race.mjs [ziarno] [ile wyścigów]
import * as THREE from 'three';
import { createCanvas } from '@napi-rs/canvas';
import { generateCity } from '../src/city/layout.js';
import { CollisionGrid } from '../src/game/collision.js';
import { Traffic, buildRoadGraph } from '../src/game/traffic.js';
import { Vehicle } from '../src/game/vehicle.js';
import { Races } from '../src/game/race.js';
import { Rng } from '../src/core/rng.js';

const el = () => ({ style: {}, textContent: '', innerHTML: '' });
globalThis.document = { createElement: (t) => (t === 'canvas' ? createCanvas(64, 16) : el()), body: { appendChild() {} } };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const seed = Number(process.argv[2] || 1984), N = Number(process.argv[3] || 3);
const c = generateCity(seed), grid = new CollisionGrid(c), G = buildRoadGraph(c.streets);
const t = Object.create(Traffic.prototype);
Object.assign(t, { city: c, grid, G, rng: new Rng(9001), bots: [], count: 34, t: 0, nearBuf: [] });
t.liveNodes = G.nodes.map((_, i) => i).filter((i) => G.live[i] && G.nodes[i].edges.length);
const car = new Vehicle(null, grid, null, null);
car.active = true;
car.obstacles = (x, z) => t.near(x, z, 6);
const job = { money: 0, say(m) { job.last = m; } };
const scene = new THREE.Scene();
const R = new Races({ scene, city: c, grid, traffic: t, M: null, kit: null, car, job, crowd: null });
console.log('starty', R.starts.length);
const dt = 1 / 30, out = [];
for (let k = 0; k < Math.min(N, R.starts.length); k++) {
  const st = R.starts[k];
  car.place(st.x, st.z, 0); car.v = 0;
  R.update(dt, true); // wjazd w pierścień → start
  if (R.state !== 'count') { out.push({ k, blad: 'nie wystartował' }); continue; }
  const me = { v: car, s: 10, vmax: Number(process.argv[4] || 17), stuck: 0, lat: 7 };
  const nSigns = R.signs ? R.signs.children.length : 0;
  let last = null, lastP = 0, stat = null; let nan = 0, warps = 0, time = 0, maxOff = 0; const len = Math.round(R.route.len);
  for (let i = 0; i < 260 / dt && R.state !== 'idle'; i++) {
    t.t += dt; time += dt;
    while (t.bots.length < 34) { const n0 = t.bots.length; t.spawn([car.pos.x, car.pos.z]); if (t.bots.length === n0) break; }
    if (R.state === 'run') { const s0 = me.s; car.auto = R.drive(me, dt, me.s); if (me.s - s0 > 10) warps++; car.update(dt, new Set(), [0, 0]); }
    R.update(dt, true);
    for (const b of t.bots) t.drive(b, dt, car);
    if (!isFinite(car.pos.x) || (R.rivals && R.rivals.some((r) => !isFinite(r.v.pos.x)))) nan++;
    if (R.rivals) { last = R.rivals.map((r) => [Math.round(r.s), +(r.lo || 0).toFixed(1), +r.v.v.toFixed(1)]); lastP = Math.round(R.ps); for (const r of R.rivals) { r.maxLo = Math.max(r.maxLo || 0, r.lo || 0); r.vs = (r.vs || 0) + r.v.v; r.n = (r.n || 0) + 1; } stat = R.rivals.map((r) => [+(r.maxLo).toFixed(2), +(r.vs / r.n).toFixed(1)]); }
    if (R.route) maxOff = Math.max(maxOff, R.progress(car.pos.x, car.pos.z, R.ps).d);
  }
  if (R.state !== 'idle') out.push({ dbg: 'koniec czasu', gracz: Math.round(R.ps), rywale: R.rivals.map((r) => Math.round(r.s) + (r.done ? 'M' : '') + ' v' + r.v.v.toFixed(1)) });
  out.push({ ostatnie: JSON.stringify(last), gracz: lastP, stat: JSON.stringify(stat) });
  out.push({ k, znakiSkretu: nSigns, trasaM: len, czasS: Math.round(time), wynik: job.last, nan, przeskokiGracza: warps, maxOdchylenieM: +maxOff.toFixed(1) });
  R.cool.clear();
}
console.log(out);
