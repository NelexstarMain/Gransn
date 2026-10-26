import * as THREE from 'three';
import { generateCity } from './city/layout.js';
import { GROUND_TILES } from './gen/assemble.js';
import { WorkerPool } from './gen/pool.js';
import { createMaterials } from './render/materials.js';
import { createAtmosphere, LIGHTS } from './render/atmosphere.js';
import { CollisionGrid } from './game/collision.js';
import { Player } from './game/player.js';
import { Streamer, buildMeshes } from './game/streaming.js';
import { Hud } from './game/hud.js';
import { Vehicle } from './game/vehicle.js';
import { TaxiJob } from './game/taxi.js';
import { Traffic } from './game/traffic.js';
import { CarFX } from './game/fx.js';
import { Settings } from './game/settings.js';

const params = new URLSearchParams(location.search);
// Każde wejście do gry to nowa wyspa. Numer mapy widać w rogu ekranu; ?seed=N albo #N (w linku
// do gry, gdzie zapytania nie dochodzą) odtwarza dokładnie tę samą wyspę. Losujemy tu, a nie w
// generatorze: samo generowanie jest deterministyczne (te same dane w wątku głównym i workerach).
const randomSeed = () => {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % 999999); } catch { return 1 + Math.floor(Math.random() * 999999); }
};
const fromHash = /^#(\d{1,9})$/.exec(location.hash);
const SEED = Number(params.get('seed')) || (fromHash ? Number(fromHash[1]) : 0) || randomSeed();
const TEST = params.has('test');
// tryb lekki: telefony, słabe komputery albo ?low
const LOW = params.has('low') || (!params.has('high') && (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4)); // tryb testowy: klatki renderowane na żądanie

const $ = (id) => document.getElementById(id);
const setProgress = (t, label) => {
  $('bar').style.width = `${Math.round(t * 100)}%`;
  if (label) $('loadlabel').textContent = label;
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// rozdzielczość, cienie i zasięg detali ustawia potem `Settings` (domyślnie jakość „Wysoka”)
renderer.setPixelRatio(1.5);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LIGHTS.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2200);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

async function start() {
  setProgress(0.02, 'Wyspa wyłania się z morza…');
  await new Promise((r) => setTimeout(r, 30));
  const city = generateCity(SEED);
  const grid = new CollisionGrid(city);
  const { M, telescreen } = await createMaterials();
  const atmo = createAtmosphere(scene, renderer);

  // morze dookoła wyspy
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), M.water);
  sea.position.y = city.terrain.seaY - 0.02;
  sea.geometry.attributes.uv.array.forEach((_, i, a) => { a[i] *= 6000; });
  sea.receiveShadow = true;
  scene.add(sea);

  const pool = new WorkerPool(params.has('local') ? 0 : Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1)), city);
  const streamer = new Streamer(scene, city, pool, M, false);
  const player = new Player(camera, grid, renderer.domElement);
  player.spawn(city.spawn.x, city.spawn.z, city.spawn.yaw);
  player.update(0);
  const hud = new Hud(city);

  // rzeka: lustro wody między brzegami
  const T = city.terrain, wv = [], wi = [], wuv = [];
  for (let i = 0; i < T.left.length; i++) {
    wv.push(T.left[i][0], T.waterY, T.left[i][1], T.right[i][0], T.waterY, T.right[i][1]);
    wuv.push(T.left[i][0], T.left[i][1], T.right[i][0], T.right[i][1]);
    if (i > 0) { const a = (i - 1) * 2; wi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wg.setIndex(wi);
  wg.computeVertexNormals();
  if (wg.attributes.normal.getY(0) < 0) { wi.reverse(); wg.setIndex(wi); wg.computeVertexNormals(); }
  const water = new THREE.Mesh(wg, M.water);
  water.receiveShadow = true;
  scene.add(water);

  // Wszystko ładuje się w tle, według odległości od gracza: najpierw okolica,
  // potem reszta miasta. Do gry można wejść w każdej chwili.
  const near = (x, z) => Math.hypot(x - player.pos.x, z - player.pos.z);
  pool.run({ seed: SEED, kind: 'river' }, 5).then((mats) => scene.add(buildMeshes(mats, M)));
  const tileSize = (2 * city.half) / GROUND_TILES;
  for (let tz = 0; tz < GROUND_TILES; tz++)
    for (let tx = 0; tx < GROUND_TILES; tx++) {
      const cx = -city.half + (tx + 0.5) * tileSize, cz = -city.half + (tz + 0.5) * tileSize;
      pool.run({ seed: SEED, kind: 'ground', tx, tz }, near(cx, cz) - 400).then((mats) => scene.add(buildMeshes(mats, M)));
    }
  streamer.update(player.pos);
  streamer.loadLOD();
  document.body.classList.add('ready');
  const total = pool.busy;
  const progressTimer = setInterval(() => {
    const left = pool.busy;
    setProgress(1 - left / Math.max(1, total), left ? `Budowanie miasta… (${left} zadań, możesz już wejść)` : 'Gotowe. Klienci czekają!');
    if (!left) clearInterval(progressTimer);
  }, 250);

  const overlay = $('overlay');
  // Wejście do gry nie zależy od Pointer Lock (w ramce / na telefonie bywa zablokowany)
  let playing = false, hadLock = false;
  const enter = () => {
    playing = true;
    overlay.style.display = 'none';
    try {
      const r = renderer.domElement.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch { /* bez przechwycenia myszy: rozglądanie przeciąganiem */ }
  };
  const pause = () => { playing = false; overlay.style.display = 'flex'; };
  // nowa wyspa: przeładowanie bez numeru mapy (przycisk w menu albo klawisz N)
  const newIsland = () => {
    const q = new URLSearchParams(location.search); q.delete('seed');
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch { /* ramka bez historii */ }
    try { if (location.hash) location.hash = ''; location.reload(); } catch { /* ramka bez przeładowania: odśwież stronę ręcznie */ }
  };
  $('mapno').textContent = `wyspa nr ${SEED}`;
  $('newmap').addEventListener('click', (e) => { e.stopPropagation(); newIsland(); });
  $('newmap').addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); newIsland(); });
  // ustawienia: otwarcie wstrzymuje grę (bez zasłaniającej nakładki), zamknięcie wznawia
  let wasPlaying = false;
  const settings = new Settings({
    renderer, camera, scene, atmo, streamer, player, M,
    onOpen: () => { wasPlaying = playing; playing = false; document.exitPointerLock?.(); },
    onClose: () => { if (wasPlaying) enter(); wasPlaying = false; },
  });
  overlay.addEventListener('click', enter);
  overlay.addEventListener('touchend', (e) => { e.preventDefault(); enter(); });
  addEventListener('keydown', (e) => {
    if (!playing && (e.code === 'Enter' || e.code === 'Space')) enter();
    else if (playing && e.code === 'KeyP') pause();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) hadLock = true;
    else if (hadLock && playing) { hadLock = false; pause(); } // Esc
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') document.body.classList.toggle('nohud');
    if (e.code === 'KeyN' && e.shiftKey) newIsland();
  });

  // taksówka — główna mechanika: jeździsz po wyspie i wozisz pasażerów
  const car = new Vehicle(scene, grid, M);
  car.active = true;
  car.place(city.spawn.x, city.spawn.z, Math.atan2(-Math.cos(city.spawn.yaw), -Math.sin(city.spawn.yaw)));
  const job = new TaxiJob(scene, city, M);
  // boty-kierowcy (korki) i efekty auta
  const traffic = new Traffic(scene, city, grid, M, LOW ? 16 : 34);
  car.obstacles = (x, z) => traffic.near(x, z, 6);
  const fx = new CarFX(scene, city);
  const carYaw = () => Math.atan2(-Math.cos(car.heading), -Math.sin(car.heading));
  player.yaw = carYaw();
  player.pitch = -0.12;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || !playing) return;
    if (car.active && Math.abs(car.v) < 3) {
      car.active = false;
      const [fx, fz] = car.fwd;
      player.spawn(car.pos.x + fz * 2.4, car.pos.z - fx * 2.4, carYaw());
      job.say('Wysiadłeś. Podejdź do taksówki i wciśnij E, żeby wsiąść.');
    } else if (!car.active && Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z) < 5) {
      car.active = true;
      player.fly = false;
    }
  });
  job.say('W/S gaz i hamulec, A/D skręt. Zatrzymaj się przy pasażerze w żółtym kółku.', 7);

  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsN = 0, fps = 0, streamAcc = 0;
  const tmp = new THREE.Vector3();
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    if (car.active) {
      if (playing) car.update(dt, player.keys, player.touchMove);
      // kamera zza auta; mysz obraca, po chwili wraca za taksówkę
      if (performance.now() - player.lookT > 1500) {
        let d = carYaw() - player.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.yaw += d * Math.min(1, dt * 2.5);
        player.pitch += (-0.12 - player.pitch) * Math.min(1, dt * 2);
      }
      const cp = Math.cos(player.pitch), dist = 7.5;
      tmp.set(car.pos.x + Math.sin(player.yaw) * cp * dist, car.pos.y + 1.6 - Math.sin(player.pitch) * dist, car.pos.z + Math.cos(player.yaw) * cp * dist);
      tmp.y = Math.max(tmp.y, grid.height(tmp.x, tmp.z) + 0.8);
      camera.position.lerp(tmp, Math.min(1, dt * 8));
      camera.lookAt(car.pos.x, car.pos.y + 1.3, car.pos.z);
    } else player.update(dt);
    const active = car.active ? car.pos : player.pos;
    job.update(dt, car, grid);
    if (playing) {
      traffic.update(dt, active, car.active ? car : null);
      fx.update(dt, car, player.keys, grid);
    }
    streamAcc += dt;
    if (streamAcc > 0.25) { streamAcc = 0; streamer.update(active); }
    atmo.update(camera.position);
    telescreen.update(dt);
    M.water.normalMap.offset.set(clock.elapsedTime * 0.012, clock.elapsedTime * 0.007);
    renderer.render(scene, camera);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    const info = `${fps.toFixed(0)} FPS · fragmenty: ${streamer.loaded}/${city.chunks.length} (+${streamer.pendingCount}) · ${(streamer.tris / 1e6).toFixed(2)} M tri · draw ${renderer.info.render.calls}${player.fly ? ' · LOT' : ''}`;
    hud.update(dt, { pos: active, yaw: car.active ? carYaw() : player.yaw }, info, job, car, camera);
    if (!TEST) requestAnimationFrame(frame);
  }
  frame();
  window.__game = { settings, city, player, streamer, renderer, scene, camera, frame, car, job, traffic };
}

const showError = (msg) => {
  const l = $('loadlabel');
  if (l) l.textContent = 'Błąd: ' + msg;
  document.body.classList.add('error');
};
addEventListener('error', (e) => showError(e.message || String(e)));
addEventListener('unhandledrejection', (e) => showError(e.reason?.message || String(e.reason)));
start().catch((e) => {
  console.error(e);
  showError(e.message);
});
