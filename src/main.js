import * as THREE from 'three';
import { generateCity } from './city/layout.js';
import { GROUND_TILES } from './gen/assemble.js';
import { WorkerPool } from './gen/pool.js';
import { createMaterials } from './render/materials.js';
import { createAtmosphere } from './render/atmosphere.js';
import { CollisionGrid } from './game/collision.js';
import { Player } from './game/player.js';
import { Streamer, buildMeshes } from './game/streaming.js';
import { Hud } from './game/hud.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed')) || 1984;
const TEST = params.has('test');
// tryb lekki: telefony, słabe komputery albo ?low
const LOW = params.has('low') || (!params.has('high') && (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4)); // tryb testowy: klatki renderowane na żądanie

const $ = (id) => document.getElementById(id);
const setProgress = (t, label) => {
  $('bar').style.width = `${Math.round(t * 100)}%`;
  if (label) $('loadlabel').textContent = label;
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !LOW;
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
  setProgress(0.02, 'Ministerstwo Prawdy planuje miasto…');
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
  const streamer = new Streamer(scene, city, pool, M, LOW);
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
    setProgress(1 - left / Math.max(1, total), left ? `Budowanie miasta… (${left} zadań, możesz już wejść)` : 'Gotowe. Wielki Brat patrzy.');
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
  });

  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsN = 0, fps = 0, streamAcc = 0;
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    player.update(dt);
    streamAcc += dt;
    if (streamAcc > 0.25) { streamAcc = 0; streamer.update(player.pos); }
    atmo.update(camera.position);
    telescreen.update(dt);
    M.water.normalMap.offset.set(clock.elapsedTime * 0.012, clock.elapsedTime * 0.007);
    M.screen.emissiveIntensity = 1.05 + Math.sin(clock.elapsedTime * 37) * 0.04 + (Math.random() < 0.01 ? -0.4 : 0);
    renderer.render(scene, camera);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    const info = `${fps.toFixed(0)} FPS · fragmenty: ${streamer.loaded}/${city.chunks.length} (+${streamer.pendingCount}) · ${(streamer.tris / 1e6).toFixed(2)} M tri · draw ${renderer.info.render.calls}${player.fly ? ' · LOT' : ''}`;
    hud.update(dt, player, info);
    if (!TEST) requestAnimationFrame(frame);
  }
  frame();
  window.__game = { city, player, streamer, renderer, scene, camera, frame };
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
