import * as THREE from 'three';
import { generateCity } from './city/layout.js';
import { GROUND_TILES } from './gen/assemble.js';
import { WorkerPool } from './gen/pool.js';
import { createMaterials } from './render/materials.js';
import { createAtmosphere, LIGHTS } from './render/atmosphere.js';
import { CollisionGrid } from './game/collision.js';
import { Player } from './game/player.js';
import { Streamer } from './game/streaming.js';
import { Hud } from './game/hud.js';
import { Vehicle } from './game/vehicle.js';
import { CarKit } from './game/carkit.js';
import { TaxiJob } from './game/taxi.js';
import { Traffic } from './game/traffic.js';
import { CarFX } from './game/fx.js';
import { Crowd } from './game/crowd.js';
import { Pedestrians } from './game/pedestrians.js';
import { Weapon } from './game/weapon.js';
import { Sound } from './game/audio.js';
import { Settings } from './game/settings.js';
import { FilmMode } from './game/film.js';
import { makeStyle } from './game/rig.js';
import { Rng } from './core/rng.js';

const params = new URLSearchParams(location.search);
// Każde wejście do gry to nowa wyspa. Numer mapy widać w rogu ekranu; ?seed=N albo #N (w linku
// do gry, gdzie zapytania nie dochodzą) odtwarza dokładnie tę samą wyspę. Losujemy tu, a nie w
// generatorze: samo generowanie jest deterministyczne (te same dane w wątku głównym i workerach).
const randomSeed = () => {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % 999999); } catch { return 1 + Math.floor(Math.random() * 999999); }
};
const fromHash = /^#(\d{1,9})$/.exec(location.hash);
const SEED = Number(params.get('seed')) || (fromHash ? Number(fromHash[1]) : 0) || randomSeed();
const TEST = params.has('test'); // tryb testowy: klatki renderowane na żądanie
// tryb lekki: telefony, słabe komputery albo ?low
const LOW = params.has('low') || (!params.has('high') && (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4));

const $ = (id) => document.getElementById(id);
const setProgress = (t, label) => {
  $('bar').style.width = `${Math.round(t * 100)}%`;
  if (label) $('loadlabel').textContent = label;
};
const tick = () => new Promise((r) => setTimeout(r, 0)); // oddaj sterowanie przeglądarce (pasek ładowania żyje)

// Rozdzielczość, cienie i zasięg detali ustawia potem `Settings`; automat (patrz pętla) obniża
// rozdzielczość przy spadku FPS, ale nie poniżej MIN_SCALE ustawionej wartości.
const MIN_SCALE = 0.6;
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOW ? 1 : 1.5);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LIGHTS.exposure;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // mapę cieni odświeżamy co drugą klatkę (patrz pętla)
$('app').appendChild(renderer.domElement);
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.2, 2200);
camera.userData.baseFov = 72; // bazowy FOV (Settings go zmienia; kamera auta i broń dokładają własne zmiany)
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

async function start() {
  setProgress(0.02, 'Wyspa wyłania się z morza…');
  await tick();
  const city = generateCity(SEED);
  const grid = new CollisionGrid(city);
  setProgress(0.05, 'Malowanie tekstur…');
  await tick();
  const { M, telescreen } = await createMaterials({ low: LOW });
  const atmo = createAtmosphere(scene, renderer);

  // morze dookoła wyspy
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), M.water);
  sea.position.y = city.terrain.seaY - 0.02;
  sea.geometry.attributes.uv.array.forEach((_, i, a) => { a[i] *= 6000; });
  sea.receiveShadow = true;
  scene.add(sea);

  const pool = new WorkerPool(params.has('local') ? 0 : Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1)), city);
  const streamer = new Streamer(scene, city, pool, M, LOW, GROUND_TILES);
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

  // Przed grą cała mapa buduje się w workerach i scala w kilka siatek (jedna na materiał);
  // przycisk startu pojawia się, gdy wszystko jest gotowe. W trybie lekkim (telefon) budujemy
  // tylko okolicę startu, a resztę doładowuje się w trakcie jazdy.
  let worldReady = false;
  const loading = streamer.load(player.pos, (t, label) => setProgress(0.1 + t * 0.85, label));

  // ── postacie, auta, ruch, piesi, karabin, dźwięk ──
  setProgress(0.08, 'Budowa aut i ludzi…');
  await tick();
  const sound = new Sound();
  const kit = new CarKit(M);
  const crowd = new Crowd(scene, M, LOW ? 90 : 170, LOW ? 110 : 170);
  const car = new Vehicle(scene, grid, M, kit, 'taxi');
  await tick();
  const traffic = new Traffic(scene, city, grid, M, LOW ? 16 : 34, kit, crowd);
  const peds = new Pedestrians(city, grid, traffic.G, crowd, LOW ? 26 : 56);
  traffic.peds = peds;
  car.traffic = traffic;
  car.peds = peds;
  car.obstacles = (x, z) => traffic.near(x, z, 6); // podgląd przeszkód dla autopilota trybu filmowego
  car.active = true;
  car.place(city.spawn.x, city.spawn.z, Math.atan2(-Math.cos(city.spawn.yaw), -Math.sin(city.spawn.yaw)));
  const job = new TaxiJob(scene, city, M, crowd, peds);
  const fx = new CarFX(scene, city);
  const weapon = new Weapon(scene, camera, M);
  weapon.deps = { grid, player, peds, traffic, fx, sound, say: (t, s) => job.say(t, s) };
  // kierowca (gracz) widoczny w kamerze zza auta
  const meStyle = makeStyle(new Rng(2024), { female: false });
  meStyle.torso = 'jacket'; meStyle.hat = 'hatBowler'; meStyle.hair = 'hairShort'; meStyle.hasShirt = true;
  const me = crowd.add(meStyle, { sit: 1, sitT: 1 });
  loading.then(async () => {
    setProgress(0.97, 'Scalanie świata i kompilacja shaderów…');
    try { await renderer.compileAsync(scene, camera); } catch { /* kompilacja przy pierwszej klatce */ }
    worldReady = true;
    setProgress(1, 'Gotowe. Klienci czekają!');
    document.body.classList.add('ready');
  });

  // piechur nie przechodzi przez zaparkowaną taksówkę ani przez auta-boty: wypychamy go z ich obrysu
  const pushOut = (pos, x, z, h, len, wid, r) => {
    const dx = pos.x - x, dz = pos.z - z, ch = Math.cos(h), sh = Math.sin(h);
    const al = dx * ch + dz * sh, la = -dx * sh + dz * ch, hl = len / 2 + r, hw = wid / 2 + r;
    if (Math.abs(al) >= hl || Math.abs(la) >= hw) return;
    // wyjście najkrótszą drogą (wzdłuż lub w poprzek)
    let nal = al, nla = la;
    if (hl - Math.abs(al) < hw - Math.abs(la)) nal = Math.sign(al || 1) * hl; else nla = Math.sign(la || 1) * hw;
    pos.x = x + nal * ch - nla * sh;
    pos.z = z + nal * sh + nla * ch;
  };
  player.resolve = (pos) => {
    if (!car.active) pushOut(pos, car.pos.x, car.pos.z, car.heading, car.L, car.W, 0.32);
    for (const b of traffic.near(pos.x, pos.z, 4)) pushOut(pos, b.x, b.z, b.h, b.len, 1.8, 0.32);
  };
  player.onStep = (run, crouch) => sound.step(run, crouch);
  player.onJump = () => sound.step(true, false);
  player.onLand = (v) => sound.thud(v * 0.35);
  peds.onEvent = (type, x, z) => {
    const d = Math.hypot(x - (car.active ? car.pos.x : player.pos.x), z - (car.active ? car.pos.z : player.pos.z));
    if (type === 'down') sound.thud(3 / (1 + d / 20));
  };

  const overlay = $('overlay');
  // Wejście do gry nie zależy od Pointer Lock (w ramce / na telefonie bywa zablokowany)
  let playing = false, hadLock = false;
  const enter = () => {
    if (!worldReady && !playing) return; // świat jeszcze się buduje
    playing = true;
    overlay.style.display = 'none';
    document.body.classList.add('playing');
    sound.init();
    try {
      const r = renderer.domElement.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch { /* bez przechwycenia myszy: rozglądanie przeciąganiem */ }
  };
  const pause = () => { film.stop(); playing = false; overlay.style.display = 'flex'; document.body.classList.remove('playing'); sound.horn(false); weapon.aimHeld = false; };
  // nowa wyspa: przeładowanie bez numeru mapy (przycisk w menu albo Shift+N)
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
    renderer, camera, scene, atmo, streamer, player, M, low: LOW,
    onOpen: () => { wasPlaying = playing; playing = false; weapon.aimHeld = false; sound.horn(false); document.exitPointerLock?.(); },
    onClose: () => { if (wasPlaying) enter(); wasPlaying = false; },
  });
  // tryb filmowy: autopilot jedzie taksówką po trasie, kamera filmuje (patrz film.js)
  const film = new FilmMode({
    city, grid, car, traffic, camera, settings, streamer,
    enterGame: () => { playing = true; overlay.style.display = 'none'; document.body.classList.add('playing'); sound.init(); },
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
    if (e.code === 'KeyM') job.say(sound.toggleMute() ? 'Dźwięk wyłączony (M).' : 'Dźwięk włączony.', 2);
    if (e.code === 'KeyN' && e.shiftKey) newIsland();
  });

  // wsiadanie / wysiadanie: pieszy dostaje karabin, w aucie amunicja się uzupełnia
  const carYaw = () => Math.atan2(-Math.cos(car.heading), -Math.sin(car.heading));
  player.yaw = carYaw();
  player.pitch = -0.12;
  const toggleCar = () => {
    if (!playing || film.active) return;
    if (car.active && Math.abs(car.v) < 3) {
      const [fx2, fz2] = car.fwd;
      // lewa burta (kierowca), potem prawa, potem tył
      for (const [dx, dz] of [[fz2, -fx2], [-fz2, fx2], [-fx2, -fz2]]) {
        const x = car.pos.x + dx * 2.3, z = car.pos.z + dz * 2.3;
        if (player.blocked(x, z)) continue;
        car.active = false;
        player.spawn(x, z, carYaw());
        player.pitch = 0;
        weapon.setActive(true);
        sound.horn(false);
        job.say('Wysiadłeś z karabinem. LPM — strzał, PPM — celuj, R — przeładuj. E przy taksówce — wsiadasz.', 6);
        return;
      }
      job.say('Brak miejsca, żeby wysiąść.', 2);
    } else if (!car.active && Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z) < 5) {
      car.active = true;
      player.fly = false;
      weapon.setActive(false);
      const had = weapon.reserve;
      weapon.refill();
      if (had < 55) job.say('Amunicja uzupełniona w bagażniku.', 3);
    }
  };
  addEventListener('keydown', (e) => {
    if (!playing || e.repeat) return;
    if (e.code === 'KeyE') toggleCar();
    else if (e.code === 'KeyR' && !car.active) weapon.startReload();
    else if (e.code === 'KeyX' && !car.active) weapon.press(0); // zapasowy spust (bez Pointer Lock)
    else if (e.code === 'KeyZ' && !car.active) weapon.press(2);  // zapasowe celowanie
    else if (e.code === 'KeyQ' && car.active) sound.horn(true);
  });
  addEventListener('keyup', (e) => { if (e.code === 'KeyQ') sound.horn(false); if (e.code === 'KeyZ') weapon.release(2); });
  // mysz: LPM strzał, PPM celowanie (tylko pieszo, przy przechwyconym kursorze; w ramce bez Pointer Lock
  // LPM służy do rozglądania się przeciąganiem, a strzela X i celuje Z)
  addEventListener('mousedown', (e) => { if (playing && !car.active && player.locked) weapon.press(e.button); });
  addEventListener('mouseup', (e) => weapon.release(e.button));
  // przyciski dotykowe
  const bind = (id, down, up) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); if (up) up(); }, { passive: false });
  };
  bind('b-fire', () => { if (!car.active) weapon.press(0); else sound.horn(true); }, () => sound.horn(false));
  bind('b-aim', () => weapon.press(2), () => weapon.release(2));
  bind('b-r', () => { if (!car.active) weapon.startReload(); });
  bind('b-jump', () => player.jump());
  bind('b-e', () => toggleCar());

  job.say('W/S gaz i hamulec, A/D skręt, Spacja ręczny. Zatrzymaj się przy machającym pasażerze w żółtym kółku.', 7);

  // tryb filmowy: przycisk w menu i klawisz C (V = zmiana kamery na aucie)
  const startFilm = () => { car.active = true; player.fly = false; weapon.setActive(false); job.film = true; film.start(); };
  const fb = $('filmbtn');
  if (fb) {
    fb.addEventListener('click', (e) => { e.stopPropagation(); startFilm(); });
    fb.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); startFilm(); });
  }
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && (car.active || !playing)) { film.active ? film.stop() : startFilm(); }
    else if (e.code === 'KeyV' && film.active) film.cycleMount();
  });

  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsN = 0, fps = 0, streamAcc = 0, frameNo = 0, perfAcc = 0, perfN = 0, perfBad = 0, perfGood = 0, infoAcc = 1, info = '';
  const view = { x: 0, z: -1 };
  const bodyV = new THREE.Vector3();
  const noKeys = new Set();
  const carCars = { bots: traffic.bots, car };
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    frameNo++;
    player.controlsOff = car.active;
    job.film = film.active;
    if (film.active) film.update(dt);
    // auto symuluje się zawsze (zaparkowane trzyma ręczny); steruje nim gracz tylko w środku (w trybie filmowym — autopilot)
    if (playing) car.update(dt, car.active ? player.keys : noKeys, car.active ? player.touchMove : [0, 0]);
    const onFoot = !car.active;
    if (film.active) film.placeCamera(dt);
    else if (car.active) car.updateCamera(dt, camera, player);
    else player.update(playing ? dt : 0);
    if (playing) weapon.update(dt);
    const active = car.active ? car.pos : player.pos;
    job.update(dt, car, grid);
    if (playing) {
      // kierunek patrzenia kamery (piesi nie pojawiają się na oczach gracza)
      camera.getWorldDirection(bodyV);
      const vl = Math.hypot(bodyV.x, bodyV.z) || 1;
      view.x = bodyV.x / vl; view.z = bodyV.z / vl;
      traffic.foot = onFoot ? player.pos : null;
      traffic.update(dt, active, car);
      carCars.car = car;
      peds.update(dt, { x: active.x, z: active.z }, carCars, view);
      // pieszy blokuje kroki innych: popchnij NPC odsuwając ich od gracza na piechotę
      if (onFoot) for (const w of peds.walkers) { const dx = w.h.x - player.pos.x, dz = w.h.z - player.pos.z, d = Math.hypot(dx, dz); if (d < 0.9 && d > 1e-3 && w.mode !== 'down') { w.fx += (dx / d) * dt * 2.2; w.fz += (dz / d) * dt * 2.2; } }
      fx.update(dt, car, player.keys, grid);
      // uderzenia auta: iskry, dźwięk
      if (car.impact > 0.6) {
        sound.thud(car.impact);
        for (let i = 0; i < 6; i++) fx.emit(car.pos.x + (Math.random() - 0.5) * 2, car.pos.y + 0.6, car.pos.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.14, 0.5, 1, 0.8, 0.4, 0.8);
      }
      car.impact = 0;
    }
    // sterowanie kierowcą w widocznym aucie
    me.hidden = !car.active;
    if (car.active) {
      car.anchorWorld('driver', bodyV);
      me.x = bodyV.x; me.y = bodyV.y - 0.12; me.z = bodyV.z; me.yaw = car.heading; me.steer = car.steer; me.speed = 0;
    }
    crowd.update(dt, camera.position);
    sound.setEngine(car.rpm, car.throttle, playing && car.active);
    sound.setSkid(playing && car.active && car.skid ? Math.min(1, 0.35 + Math.abs(car.lat) / 6) : 0);
    streamer.tick();
    streamAcc += dt;
    if (streamAcc > 0.25) { streamAcc = 0; streamer.update(active); }
    atmo.update(camera.position);
    telescreen.update(dt);
    M.water.normalMap.offset.set(clock.elapsedTime * 0.012, clock.elapsedTime * 0.007);
    // cienie co drugą klatkę: odciąża GPU, a ruch cieni i tak jest płynny
    if (renderer.shadowMap.enabled && (frameNo & 1) === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    // wydajność: gdy klatki są wolne, obniż rozdzielczość; gdy zapas — podnieś (z histerezą).
    // Mnożnik trzyma `Settings` (autoScale), więc ręczna rozdzielczość z menu pozostaje punktem odniesienia.
    fpsAcc += dt; fpsN++; perfAcc += dt; perfN++;
    if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (perfAcc > 1.5) {
      const f = perfN / perfAcc;
      perfAcc = 0; perfN = 0;
      if (playing && !TEST && settings.v.auto && !settings.isOpen && !film.active) {
        const k = settings.autoScale;
        if (f < 40 && k > MIN_SCALE) { if (++perfBad >= 2) { settings.setAutoScale(Math.max(MIN_SCALE, k - 0.07)); perfBad = 0; } perfGood = 0; }
        else if (f > 57 && k < 1) { if (++perfGood >= 3) { settings.setAutoScale(Math.min(1, k + 0.04)); perfGood = 0; } perfBad = 0; }
        else { perfBad = 0; perfGood = 0; }
      } else { perfBad = 0; perfGood = 0; }
    }
    infoAcc += dt;
    if (infoAcc > 0.5) {
      infoAcc = 0;
      info = `${fps.toFixed(0)} FPS · ${settings.resNow.toFixed(2)}× rozdz. · fragmenty: ${streamer.loaded}/${city.chunks.length} (+${streamer.pendingCount}) · ${(streamer.tris / 1e6).toFixed(2)} M tri · draw ${renderer.info.render.calls} · ludzie ${crowd.count}${player.fly ? ' · LOT' : ''}`;
    }
    const nearCar = onFoot && Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z) < 5;
    hud.update(dt, { pos: active, yaw: car.active ? carYaw() : player.yaw }, info, job, car, camera, { onFoot, weapon, player, peds, nearCar });
    if (!TEST) requestAnimationFrame(frame);
  }
  frame();
  window.__game = { settings, film, city, player, streamer, renderer, scene, camera, frame, car, job, traffic, peds, crowd, weapon, kit };
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
