// Test dymny gry BEZ przeglądarki: buduje wszystkie obiekty gry (auto, ruch, piesi, tłum, taksówka,
// karabin, efekty) na atrapie DOM i materiałach zastępczych, potem symuluje jazdę, kurs z pasażerem,
// wysiadanie, strzały i potrącenie. Łapie wyjątki i NaN. Nie sprawdza grafiki.
//   node scripts/smoke-game.mjs
import * as THREE from 'three';

// ── atrapa środowiska przeglądarki ──
const noop = () => {};
const fakeCtx = { createRadialGradient: () => ({ addColorStop: noop }), fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, arc: noop, drawImage: noop, save: noop, restore: noop, translate: noop, rotate: noop, closePath: noop, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: noop };
const fakeEl = () => ({ style: {}, addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop }, getContext: () => fakeCtx, width: 0, height: 0, textContent: '', set innerHTML(v) {}, setAttribute: noop });
globalThis.document = { createElement: fakeEl, getElementById: fakeEl, addEventListener: noop, pointerLockElement: null, body: fakeEl() };
globalThis.addEventListener = noop;
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.window = globalThis;
globalThis.navigator ??= { userAgent: 'node' };

const { generateCity } = await import('../src/city/layout.js');
const { CollisionGrid } = await import('../src/game/collision.js');
const { Vehicle } = await import('../src/game/vehicle.js');
const { CarKit } = await import('../src/game/carkit.js');
const { Traffic } = await import('../src/game/traffic.js');
const { Crowd } = await import('../src/game/crowd.js');
const { Pedestrians } = await import('../src/game/pedestrians.js');
const { TaxiJob } = await import('../src/game/taxi.js');
const { CarFX } = await import('../src/game/fx.js');
const { Weapon } = await import('../src/game/weapon.js');
const { Player } = await import('../src/game/player.js');
const { Hud } = await import('../src/game/hud.js');

const t0 = performance.now();
const M = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true })) });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 2000);
const city = generateCity(1984), grid = new CollisionGrid(city);
const kit = new CarKit(M);
const crowd = new Crowd(scene, M, 170, 170);
const car = new Vehicle(scene, grid, M, kit, 'taxi');
const traffic = new Traffic(scene, city, grid, M, 34, kit, crowd);
const peds = new Pedestrians(city, grid, traffic.G, crowd, 56);
traffic.peds = peds; car.traffic = traffic; car.peds = peds; car.active = true;
car.place(city.spawn.x, city.spawn.z, Math.atan2(-Math.cos(city.spawn.yaw), -Math.sin(city.spawn.yaw)));
const job = new TaxiJob(scene, city, M, crowd, peds);
const fx = new CarFX(scene, city);
const player = new Player(camera, grid, fakeEl());
player.spawn(city.spawn.x, city.spawn.z, 0);
const weapon = new Weapon(scene, camera, M);
const sounds = [];
const sound = new Proxy({}, { get: (t, k) => (...a) => { sounds.push(k); } });
weapon.deps = { grid, player, peds, traffic, fx, sound, say: noop };
const hud = new Hud(city);
console.log('budowa ms', Math.round(performance.now() - t0));

const keys = new Set(), noKeys = new Set(), dt = 1 / 30;
let nan = 0, frames = 0, shots = 0, board = 0;
const check = (v, what) => { if (!Number.isFinite(v)) { nan++; if (nan < 6) console.log('NaN w', what); } };
const frame = (onFoot) => {
  frames++;
  car.update(dt, car.active ? keys : noKeys, [0, 0]);
  if (car.active) car.updateCamera(dt, camera, player); else { player.update(dt); }
  weapon.update(dt);
  const active = car.active ? car.pos : player.pos;
  job.update(dt, car, grid);
  traffic.update(dt, active, car);
  peds.update(dt, { x: active.x, z: active.z }, { bots: traffic.bots, car }, { x: 1, z: 0 });
  fx.update(dt, car, keys, grid);
  crowd.update(dt, camera.position);
  hud.update(dt, { pos: active, yaw: 0 }, 'x', job, car, camera, { onFoot, weapon, player, peds, nearCar: false });
  for (const v of [car.pos.x, car.pos.y, car.pos.z, car.heading, car.v, car.lat, car.bp, car.br, player.pos.x, player.pos.y, camera.position.x, camera.position.y]) check(v, 'stan');
  for (const b of traffic.bots) { check(b.x, 'bot'); check(b.z, 'bot'); }
  for (const h of crowd.people) { check(h.x, 'człowiek'); check(h.y, 'człowiek'); check(h.phase, 'faza'); }
};

// 1) jazda po najdłuższej prostej ulicy: gaz, slalom, ręczny (drift), hamowanie
{
  const st = [...city.streets].filter((q) => q.mat === 'asphalt' && !q.bridge).sort((a, b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) - Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]))[0];
  const l = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]), ux = (st.b[0] - st.a[0]) / l, uz = (st.b[1] - st.a[1]) / l;
  car.place(st.a[0] + ux * 4, st.a[1] + uz * 4, Math.atan2(uz, ux));
  console.log('ulica', Math.round(l), 'm, rw', st.rw);
}
keys.add('KeyW');
let maxV = 0, maxLat = 0;
for (let i = 0; i < 600; i++) {
  if (i === 150) keys.add('KeyD');
  if (i === 170) keys.delete('KeyD');
  if (i === 230) { keys.add('KeyA'); keys.add('Space'); }
  if (i === 260) { keys.delete('KeyA'); keys.delete('Space'); }
  if (i === 330) { keys.delete('KeyW'); keys.add('KeyS'); }
  if (i === 450) keys.delete('KeyS');
  frame(false);
  maxV = Math.max(maxV, car.kmh); maxLat = Math.max(maxLat, Math.abs(car.lat));
  if (i % 50 === 0) console.log(' t', (i / 30).toFixed(1), 's  v', car.kmh.toFixed(0), 'km/h  bieg', car.gear, ' slizg', car.lat.toFixed(1), ' skid', car.skid, ' nawierzchnia', car.surface, 'pos', car.pos.x.toFixed(0), car.pos.z.toFixed(0));
}
console.log({ jazda: true, maxKmh: maxV.toFixed(0), maxPoslizg: maxLat.toFixed(1), surface: car.surface, gear: car.gear, skidSeen: car.skid });

// 2) kurs z pasażerem: ustaw czekającego tuż obok i zatrzymaj auto
keys.clear();
const w = job.waiting[0];
car.place(w.p[0] + 3, w.p[1], 0);
for (let i = 0; i < 400 && !job.fare; i++) frame(false);
console.log({ pasazerWsiadl: !!job.fare, pasazerSiedzi: !!job.rider });
if (job.fare) {
  car.place(job.fare.dest[0] + 2, job.fare.dest[1], 0);
  for (let i = 0; i < 120 && job.fare; i++) frame(false);
  console.log({ zaplacono: job.money, kursy: job.trips, chodzi: peds.walkers.some((x) => x.h === job.rider?.h) });
}

// 3) wysiadanie, strzelanie do pieszych
car.active = false;
weapon.setActive(true);
player.spawn(car.pos.x + 2, car.pos.z, 0);
for (let i = 0; i < 90; i++) frame(true);
let downs0 = peds.stats.downed, kinds = {};
const clearShot = (t) => {
  // znajdź stanowisko 8 m od celu z wolną linią (bez budynków pomiędzy)
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, px = t.h.x + Math.cos(a) * 8, pz = t.h.z + Math.sin(a) * 8;
    if (grid.solid(px, pz)) continue;
    player.pos.set(px, grid.height(px, pz), pz);
    player.yaw = Math.atan2(-(t.h.x - px), -(t.h.z - pz)); player.pitch = -0.05; player.vx = player.vz = 0;
    player.update(dt); camera.updateMatrixWorld(true);
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    const r = weapon.trace(camera.position, d);
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    if (r.kind === 'ped') return true;
  }
  return false;
};
for (let n = 0; n < 8; n++) {
  const t = peds.walkers.find((x) => x.mode !== 'down' && Math.hypot(x.h.x - player.pos.x, x.h.z - player.pos.z) < 80 && x.mode !== 'wait');
  if (!t) break;
  t.mode = 'pause'; t.modeT = 0; t.pauseLen = 99; t.h.speed = 0; // stoi w miejscu
  if (!clearShot(t)) continue;
  for (let i = 0; i < 40; i++) frame(true);
  if (weapon.state !== 'ready') for (let i = 0; i < 60; i++) frame(true);
  const ammo = weapon.ammo;
  weapon.spread = 0; weapon.press(0); shots += ammo - weapon.ammo;
  for (let i = 0; i < 45; i++) frame(true);
  if (weapon.ammo === 0) { weapon.startReload(); for (let i = 0; i < 90; i++) frame(true); }
}
// strzał w auto-bota
const bot = traffic.bots.find((b) => Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < 200);
let botHit = false;
if (bot) {
  const tp = new THREE.Vector3(bot.x, bot.y + 1, bot.z), o = new THREE.Vector3(bot.x - 12 * Math.cos(bot.h), bot.y + 1.4, bot.z - 12 * Math.sin(bot.h)), d = tp.clone().sub(o).normalize();
  const r = traffic.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 100); botHit = !!r;
}
console.log({ liniaStrzalu: kinds, botTrafiony: botHit });
weapon.press(2); for (let i = 0; i < 20; i++) frame(true); weapon.release(2);
console.log({ strzaly: shots, trafieni: peds.stats.downed - downs0, dzwieki: [...new Set(sounds)].join(','), ammo: weapon.ammo, rezerwa: weapon.reserve });

// 4) potrącenie: auto z dużą prędkością wjeżdża w pieszego
car.active = true; weapon.setActive(false);
const v = peds.walkers.find((x) => x.mode !== 'down');
car.place(v.h.x - 6, v.h.z, 0); car.vx = 12; car.vz = 0; keys.add('KeyW');
const d1 = peds.stats.downed;
for (let i = 0; i < 60; i++) frame(false);
console.log({ potracenia: peds.stats.downed - d1 });

// 5) każdy typ auta buduje się i ma kotwice
for (const k of Object.keys(kit.kinds)) { const a = kit.anchors(k); const parts = kit.body(k, 1); if (!a.driver || !parts.length) { console.log('BŁĄD typ', k); nan++; } }
console.log({ klatek: frames, nan, ludzie: crowd.count, boty: traffic.bots.length, piesi: peds.walkers.length, ms: Math.round(performance.now() - t0) });
if (nan) process.exit(1);
