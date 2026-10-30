// Karabin powtarzalny z zamkiem — widok z pierwszej osoby i strzelanie.
//  • LPM strzał (po strzale cykl zamka ≈ 1 s), PPM celowanie (przybliżenie, mały rozrzut),
//    R przeładowanie (magazynek 5 naboi). Zapas amunicji uzupełnia się po wsiadaniu do taksówki.
//  • Rozrzut rośnie przy ruchu, w powietrzu i bez celowania; maleje przy kucaniu.
//  • Trafienie: promień w pieszych (walec), auta (OBB) i świat (siatka kolizji / teren);
//    smuga, błysk, kurz, odrzut kamery i modelu, dźwięk.
import * as THREE from 'three';
import { weaponModules } from '../gen/weapons.js';
import { identityParts } from './rig.js';
import { Rng } from '../core/rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const MAG = 5, RESERVE = 55, RANGE = 380;
const CYCLE = 1.0, RELOAD = 2.5;

export class Weapon {
  constructor(scene, camera, M) {
    this.scene = scene;
    this.camera = camera;
    this.deps = {};           // { grid, player, peds, traffic, fx, sound, say } — ustawia main
    this.rng = new Rng(4242);
    this.ammo = MAG; this.reserve = RESERVE;
    this.state = 'ready';     // ready | cycling | reloading
    this.t = 0;               // czas w bieżącym stanie
    this.active = false;
    this.aimHeld = false; this.aim = 0; this.sprintT = 0;
    this.kick = 0;            // chwilowe odrzucenie modelu (0..1)
    this.flash = 0;
    this.hitT = 0; this.headT = 0; // znacznik trafienia na celowniku
    this.spread = 0.02;
    this.queued = false;      // wciśnięty spust w czasie cyklu
    this._yaw = 0; this._pitch = 0; this.swayX = 0; this.swayY = 0;
    this.reloaded = false;
    this.wallPush = 0;

    // model: rifle + zamek + ręce; początek układu w komorze zamkowej, lufa na -z kamery
    const vm = (this.vm = new THREE.Group());
    const gun = (this.gun = new THREE.Group());
    gun.rotation.y = Math.PI / 2;
    vm.add(gun);
    const add = (parts, parent) => {
      for (const p of parts) {
        const m = new THREE.Mesh(p.geometry, p.material);
        m.frustumCulled = false;
        parent.add(m);
      }
    };
    add(identityParts(weaponModules.rifle, {}, M), gun);
    this.bolt = new THREE.Group();
    add(identityParts(weaponModules.bolt, {}, M), this.bolt);
    gun.add(this.bolt);
    add(identityParts(weaponModules.arms, { coat: [0.22, 0.18, 0.14], skin: [0.86, 0.66, 0.52] }, M), gun);
    vm.visible = false;
    camera.add(vm);
    scene.add(camera);

    // błysk wylotowy (sprite addytywny w układzie lufy)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.85)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,230,160,0.9)'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); x.stroke(); }
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.flashSprite.position.set(0.79, 0.03, 0);
    this.flashSprite.visible = false;
    gun.add(this.flashSprite);

    // smugi pocisków (pula linii w świecie)
    this.tracers = [];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.nextTracer = 0;
    this.tmp = { d: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), o: new THREE.Vector3(), m: new THREE.Vector3() };
  }

  setActive(on) {
    this.active = on;
    this.vm.visible = on;
    if (!on) { this.aimHeld = false; this.aim = 0; this.state = 'ready'; this.t = 0; this.queued = false; this.flashSprite.visible = false; }
  }

  refill() {
    this.reserve = RESERVE;
    this.ammo = MAG;
  }

  press(btn) {
    if (!this.active) return;
    if (btn === 0) this.trigger();
    else if (btn === 2) this.aimHeld = true;
  }

  release(btn) {
    if (btn === 2) this.aimHeld = false;
  }

  trigger() {
    if (this.state === 'cycling') { this.queued = true; return; }
    if (this.state !== 'ready') return;
    if (this.ammo <= 0) {
      this.deps.sound?.dry();
      if (this.reserve > 0) this.startReload();
      return;
    }
    this.fire();
  }

  startReload() {
    if (this.state === 'reloading' || this.ammo >= MAG || this.reserve <= 0) return;
    this.state = 'reloading';
    this.t = 0;
    this.reloaded = false;
    this.aimHeld = false;
    this.deps.sound?.reload();
  }

  // ── strzał ──
  fire() {
    const { player, sound, fx } = this.deps, cam = this.camera, T = this.tmp;
    cam.updateMatrixWorld(true);
    this.ammo--;
    this.state = 'cycling';
    this.t = 0;
    // kierunek z rozrzutem
    cam.getWorldDirection(T.d);
    T.r.setFromMatrixColumn(cam.matrixWorld, 0);
    T.u.setFromMatrixColumn(cam.matrixWorld, 1);
    const a = this.rng.next() * Math.PI * 2, rad = this.spread * Math.sqrt(this.rng.next());
    T.d.addScaledVector(T.r, Math.cos(a) * rad).addScaledVector(T.u, Math.sin(a) * rad).normalize();
    T.o.copy(cam.position);
    const hit = this.trace(T.o, T.d);
    // wylot lufy w świecie (do smugi i dymu)
    this.gun.updateMatrixWorld(true);
    T.m.set(0.76, 0.03, 0).applyMatrix4(this.gun.matrixWorld);
    const end = Math.min(hit.t, 160);
    this.addTracer(T.m, T.o.x + T.d.x * end, T.o.y + T.d.y * end, T.o.z + T.d.z * end);
    // efekty
    this.kick = 1;
    this.flash = 0.055;
    this.flashSprite.visible = true;
    this.flashSprite.scale.setScalar(0.28 + this.rng.next() * 0.16);
    this.flashSprite.material.rotation = this.rng.next() * 6.28;
    player.kick(0.028 + this.rng.next() * 0.014 + (this.aim > 0.5 ? -0.008 : 0.012), (this.rng.next() - 0.5) * 0.014);
    sound?.shot();
    if (fx) {
      for (let i = 0; i < 5; i++) fx.emit(T.m.x, T.m.y, T.m.z, T.d.x * 1.2 + (this.rng.next() - 0.5) * 0.8, 0.3 + this.rng.next() * 0.5, T.d.z * 1.2 + (this.rng.next() - 0.5) * 0.8, 0.22, 1.6, 0.72, 0.72, 0.74, 0.35);
    }
    this.deps.peds?.panicAround(T.o.x, T.o.z, 55);
    this.applyHit(hit, T);
    this.cycleSound = false;
  }

  // najbliższe trafienie: pieszy, auto albo świat
  trace(o, d) {
    const { peds, traffic } = this.deps;
    let best = { t: RANGE, kind: 'none' };
    const pr = peds?.raycast(o.x, o.y, o.z, d.x, d.y, d.z, RANGE);
    if (pr && pr.t < best.t) best = { t: pr.t, kind: 'ped', pr };
    const br = traffic?.raycast(o.x, o.y, o.z, d.x, d.y, d.z, RANGE);
    if (br && br.t < best.t) best = { t: br.t, kind: 'bot', br };
    const wt = this.march(o, d, best.t);
    if (wt >= 0 && wt < best.t) best = { t: wt, kind: 'world' };
    return best;
  }

  // marsz po promieniu: teren (wysokość) i bryły z siatki kolizji (budynki do 18 m)
  march(o, d, maxT) {
    const g = this.deps.grid;
    const blocked = (t) => {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, gh = g.height(x, z);
      return y < gh || (g.solid(x, z) && y < gh + 18);
    };
    let prev = 0;
    for (let t = 0.6; t < maxT; t += t < 40 ? 0.5 : 1.5) {
      if (blocked(t)) {
        let lo = prev, hi = t;
        for (let i = 0; i < 5; i++) { const mid = (lo + hi) / 2; if (blocked(mid)) hi = mid; else lo = mid; }
        return hi;
      }
      prev = t;
    }
    return -1;
  }

  applyHit(hit, T) {
    const { sound, fx, peds, traffic } = this.deps;
    const px = T.o.x + T.d.x * hit.t, py = T.o.y + T.d.y * hit.t, pz = T.o.z + T.d.z * hit.t;
    const dist = hit.t;
    if (hit.kind === 'ped') {
      peds.shoot(hit.pr.w, T.o.x, T.o.z);
      this.hitT = 0.25; this.headT = hit.pr.head ? 0.4 : 0;
      sound?.hitFlesh(dist);
      if (fx) for (let i = 0; i < 4; i++) fx.emit(px, py, pz, (this.rng.next() - 0.5) * 1.2, 0.5 + this.rng.next(), (this.rng.next() - 0.5) * 1.2, 0.18, 0.9, 0.55, 0.5, 0.45, 0.4);
    } else if (hit.kind === 'bot') {
      traffic.shot(hit.br.bot);
      this.hitT = 0.15;
      sound?.ricochet(dist);
      if (fx) for (let i = 0; i < 6; i++) fx.emit(px, py, pz, (this.rng.next() - 0.5) * 3, 0.5 + this.rng.next() * 2, (this.rng.next() - 0.5) * 3, 0.1, 0.5, 1, 0.8, 0.4, 0.7);
    } else if (hit.kind === 'world') {
      sound?.ricochet(dist);
      if (fx) for (let i = 0; i < 5; i++) fx.emit(px, py, pz, (this.rng.next() - 0.5) * 1.6 - T.d.x * 0.6, 0.4 + this.rng.next() * 1.2, (this.rng.next() - 0.5) * 1.6 - T.d.z * 0.6, 0.35, 1.2, 0.6, 0.56, 0.5, 0.45);
    }
  }

  addTracer(from, x, y, z) {
    const tr = this.tracers[this.nextTracer++ % this.tracers.length], a = tr.line.geometry.attributes.position.array;
    a[0] = from.x; a[1] = from.y; a[2] = from.z; a[3] = x; a[4] = y; a[5] = z;
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.material.opacity = 0.75;
    tr.line.visible = true;
    tr.life = 0.07;
  }

  // ── pętla (wołana co klatkę, gdy piechur) ──
  update(dt) {
    const { player, grid, sound } = this.deps;
    // tracery i błysk działają zawsze
    for (const tr of this.tracers) if (tr.life > 0) { tr.life -= dt; tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.75; if (tr.life <= 0) tr.line.visible = false; }
    if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) this.flashSprite.visible = false; }
    this.hitT = Math.max(0, this.hitT - dt); this.headT = Math.max(0, this.headT - dt);
    if (!this.active) return;

    // stany: cykl zamka, przeładowanie
    this.t += dt;
    if (this.state === 'cycling') {
      if (this.t > 0.3 && !this.cycleSound) { this.cycleSound = true; sound?.bolt(); }
      if (this.t >= CYCLE) {
        this.state = 'ready'; this.t = 0;
        if (this.queued) { this.queued = false; this.trigger(); }
        else if (this.ammo <= 0 && this.reserve > 0) this.startReload();
      }
    } else if (this.state === 'reloading') {
      if (this.t > 1.6 && !this.reloaded) {
        this.reloaded = true;
        const take = Math.min(MAG - this.ammo, this.reserve);
        this.ammo += take; this.reserve -= take;
      }
      if (this.t >= RELOAD) { this.state = 'ready'; this.t = 0; }
    }
    // celowanie, czułość, FOV, rozrzut
    const target = this.aimHeld && this.state !== 'reloading' && !player.sprinting ? 1 : 0;
    this.aim += (target - this.aim) * Math.min(1, dt * 11);
    this.sprintT += ((player.sprinting ? 1 : 0) - this.sprintT) * Math.min(1, dt * 8);
    player.aiming = this.aim > 0.5;
    player.aimSens = 1 - 0.55 * this.aim; // czułość z ustawień (player.sens) zostaje; celowanie ją tylko zmniejsza
    const fov = (this.camera.userData.baseFov ?? 72) * (1 - 0.33 * this.aim) + (player.sprinting ? 3 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 9); this.camera.updateProjectionMatrix(); }
    const move = Math.min(1, player.speed / 4.3);
    this.spread = lerp(0.016, 0.0012, this.aim) * (1 - 0.35 * player.crouchT) + move * lerp(0.016, 0.004, this.aim) + (player.onGround ? 0 : 0.03);

    this.animate(dt, player, grid);
    // zatrzymaj wciśnięcie w kolejce, jeśli ręka odpuściła
    this.kick = Math.max(0, this.kick - dt * 6);
  }

  // pozycja modelu: biodro ↔ celowanie ↔ sprint ↔ przeładowanie + kołysanie, odrzut, zamek
  animate(dt, player, grid) {
    const aim = this.aim, sp = this.sprintT;
    let px = lerp(0.17, 0, aim), py = lerp(-0.19, -0.105, aim), pz = lerp(-0.3, -0.31, aim);
    let rx = lerp(0.03, 0, aim), ry = lerp(-0.07, 0, aim), rz = 0;
    px = lerp(px, 0.1, sp); py = lerp(py, -0.27, sp); pz = lerp(pz, -0.2, sp);
    rx = lerp(rx, -0.55, sp); ry = lerp(ry, 0.5, sp);
    // przeładowanie: lufa w dół i w bok, ręka wsuwa ładownik
    if (this.state === 'reloading') {
      const k = this.t, ease = clamp(Math.min(k / 0.3, (RELOAD - k) / 0.35), 0, 1), ins = k > 0.9 && k < 1.8 ? Math.sin((k - 0.9) * Math.PI / 0.9) : 0;
      py -= 0.09 * ease; rx -= 0.65 * ease; rz += 0.45 * ease; px -= 0.05 * ease;
      this.bolt.position.x = k > 0.35 && k < 2.1 ? -0.12 : 0; this.bolt.rotation.x = k > 0.25 && k < 2.2 ? -1.2 : 0;
      pz += 0.04 * ins; py -= 0.03 * ins;
    } else if (this.state === 'cycling') {
      // zamek: unieś rączkę, odciągnij, wsuń, opuść
      const k = this.t;
      let lift = 0, back = 0;
      if (k < 0.3) { lift = 0; } else if (k < 0.45) lift = (k - 0.3) / 0.15; else if (k < 0.8) lift = 1; else if (k < 0.95) lift = 1 - (k - 0.8) / 0.15; else lift = 0;
      if (k > 0.45 && k < 0.6) back = (k - 0.45) / 0.15; else if (k >= 0.6 && k < 0.78) back = 1 - (k - 0.6) / 0.18 * 0.0 - (k - 0.6) / 0.18; else back = 0;
      this.bolt.rotation.x = -1.25 * lift;
      this.bolt.position.x = -0.12 * back;
    } else { this.bolt.position.x = 0; this.bolt.rotation.x = 0; }
    // kołysanie od kroków i opóźnienie za obrotem głowy
    const bobAmp = clamp(player.speed * 0.006, 0, 0.026) * (1 - aim * 0.85);
    px += Math.cos(player.bob) * bobAmp; py += Math.abs(Math.sin(player.bob)) * bobAmp * 0.8 * -1;
    let dy = player.yaw - this._yaw, dp = player.pitch - this._pitch;
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    this._yaw = player.yaw; this._pitch = player.pitch;
    this.swayX += (clamp(-dy * 0.9, -0.05, 0.05) - this.swayX) * Math.min(1, dt * 12);
    this.swayY += (clamp(dp * 0.9, -0.05, 0.05) - this.swayY) * Math.min(1, dt * 12);
    px += this.swayX * (1 - aim * 0.7); py += this.swayY * (1 - aim * 0.7);
    // odrzut
    pz += this.kick * 0.055; rx += this.kick * 0.085; py += this.kick * 0.012;
    // przy ścianie: opuść i cofnij broń
    const cam = this.camera.position, fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const near = grid.solid(cam.x + fx * 0.95, cam.z + fz * 0.95) || grid.solid(cam.x + fx * 0.6, cam.z + fz * 0.6);
    this.wallPush += ((near ? 1 : 0) - this.wallPush) * Math.min(1, dt * 10);
    py -= 0.08 * this.wallPush; rx -= 0.5 * this.wallPush; pz += 0.1 * this.wallPush;
    // oddychanie
    py += Math.sin(performance.now() * 0.0016) * 0.0016 * (1 - aim * 0.7);

    const v = this.vm;
    v.position.set(px, py, pz);
    v.rotation.set(rx, ry, rz);
  }

  get reloading() { return this.state === 'reloading'; }
}
