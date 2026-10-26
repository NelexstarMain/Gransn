// Kontroler pieszego (FPS): WASD + mysz (Pointer Lock), Shift = bieg, C / Ctrl = kucanie,
// Spacja = skok, F = tryb lotu (podgląd miasta z góry), kolizje z siatką 0.5 m.
//  • Marsz jest WOLNY (≈2 m/s), bieg ≈4,3 m/s i zużywa wytrzymałość (po wyczerpaniu trzeba odpocząć).
//  • Prędkość rośnie i maleje płynnie (bezwładność), w powietrzu prawie nie da się sterować.
//  • Celowanie i kucanie spowalniają; kołysanie głowy zależy od tempa, kroki wywołują onStep.
import * as THREE from 'three';

const EYE = 1.68, EYE_CROUCH = 1.14, RADIUS = 0.32;
export const WALK = 2.0, RUN = 4.3, CROUCH = 1.05, AIM = 1.35;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Player {
  constructor(camera, grid, dom) {
    this.camera = camera;
    this.grid = grid;
    this.pos = new THREE.Vector3();
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.fly = false;
    this.keys = new Set();
    this.bob = 0;
    this.locked = false;
    this.crouchT = 0;      // 0 stoi … 1 kuca (wygładzone)
    this.stamina = 1;
    this.tired = false;
    this.sprinting = false;
    this.aiming = false;   // ustawia broń
    this.speed = 0;        // prędkość pozioma
    this.sens = 1;         // mnożnik czułości z ustawień (Settings)
    this.aimSens = 1;      // dodatkowy mnożnik przy celowaniu (ustawia broń)
    this.recoilP = 0; this.recoilY = 0;
    this.land = 0;         // chwilowe opuszczenie głowy po lądowaniu
    this.onStep = null; this.onJump = null; this.onLand = null;
    this.resolve = null;   // (pos) → wypycha gracza z innych brył (auta); ustawia main
    this.lookT = 0;
    this._stepSign = 1;

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF') { this.fly = !this.fly; this.vy = 0; }
      if (e.code === 'Space' && !e.repeat) this.jump();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    const look = (dx, dy, k = 0.0022) => {
      this.lookT = performance.now();
      this.yaw -= dx * k * this.sens * this.aimSens;
      this.pitch = clamp(this.pitch - dy * k * this.sens * this.aimSens, -1.5, 1.5);
    };
    let drag = false;
    dom.addEventListener('mousedown', (e) => { if (e.button === 0) drag = true; });
    addEventListener('mouseup', () => { drag = false; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked || drag) look(e.movementX, e.movementY);
    });
    // dotyk: lewa połowa ekranu = chodzenie (joystick), prawa = rozglądanie
    this.touchMove = [0, 0];
    const touches = new Map();
    dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, left: t.clientX < innerWidth / 2 });
      e.preventDefault();
    }, { passive: false });
    dom.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const s = touches.get(t.identifier);
        if (!s) continue;
        if (s.left) this.touchMove = [clamp((t.clientX - s.x0) / 60, -1, 1), clamp((s.y0 - t.clientY) / 60, -1, 1)];
        else look(t.clientX - s.x, t.clientY - s.y, 0.004);
        s.x = t.clientX; s.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) { const s = touches.get(t.identifier); if (s?.left) this.touchMove = [0, 0]; touches.delete(t.identifier); }
    };
    dom.addEventListener('touchend', end);
    dom.addEventListener('touchcancel', end);
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.grid.height(x, z), z);
    this.yaw = yaw;
    this.vx = this.vz = this.vy = 0;
    this.speed = 0;
    this.onGround = true;
  }

  jump() {
    if (!this.onGround || this.fly || this.crouchT > 0.5 || this.stamina < 0.12 || this.controlsOff) return;
    this.vy = 3.3; // ≈ 0,45 m
    this.onGround = false;
    this.stamina -= 0.08;
    if (this.onJump) this.onJump();
  }

  // odrzut broni: unosi lufę i lekko znosi w bok; wraca sam
  kick(pitch, yaw) {
    this.recoilP += pitch;
    this.recoilY += yaw;
  }

  blocked(x, z) {
    const g = this.grid;
    if (g.solid(x, z)) return true;
    const T = g.T;
    if (T && g.type(x, z) !== 5 && T.height(x, z) < T.seaY + 0.4) return true; // morze
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (g.solid(x + Math.cos(ang) * RADIUS, z + Math.sin(ang) * RADIUS)) return true;
    }
    return false;
  }

  update(dt) {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let fT = f, sT = s;
    if (this.touchMove[0] || this.touchMove[1]) { sT = this.touchMove[0]; fT = this.touchMove[1]; }
    const wantRun = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(sT, fT) > 0.95;
    const wantCrouch = k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight');
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = -sin * fT + cos * sT, dz = -cos * fT - sin * sT;
    const l = Math.hypot(dx, dz);
    const moving = l > 0.01;
    if (l > 0) { dx /= l; dz /= l; }

    if (this.fly) {
      const sp = wantRun ? 70 : 22;
      const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
      this.pos.x += (-sin * cp * f + cos * s) * sp * dt;
      this.pos.z += (-cos * cp * f - sin * s) * sp * dt;
      this.pos.y += sp2 * f * sp * dt + ((k.has('Space') ? 1 : 0) - (k.has('KeyC') ? 1 : 0)) * sp * dt;
      this.pos.y = Math.max(this.grid.height(this.pos.x, this.pos.z), this.pos.y);
      this.speed = 0; this.sprinting = false;
    } else {
      // wytrzymałość: bieg ją zużywa, po wyczerpaniu odpoczynek do 30 %
      const canRun = wantRun && fT > 0.1 && !this.aiming && this.crouchT < 0.4 && !this.tired && this.stamina > 0.02;
      this.sprinting = canRun && moving && this.onGround;
      if (this.sprinting) this.stamina -= dt * 0.17;
      else this.stamina += dt * (moving ? 0.1 : 0.2);
      this.stamina = clamp(this.stamina, 0, 1);
      if (this.stamina <= 0.02) this.tired = true;
      else if (this.tired && this.stamina > 0.3) this.tired = false;
      this.crouchT += ((wantCrouch ? 1 : 0) - this.crouchT) * Math.min(1, dt * 9);

      let vmax = this.sprinting ? RUN : this.crouchT > 0.5 ? CROUCH : this.aiming ? AIM : WALK;
      if (!moving) vmax = 0;
      // wolniej pod górę, szybciej z góry (łagodnie)
      const gh = this.grid.height(this.pos.x + dx * 1.0, this.pos.z + dz * 1.0) - this.pos.y;
      vmax *= clamp(1 - gh * 0.35, 0.7, 1.15);
      // przyspieszenie: na ziemi szybko, w powietrzu prawie wcale
      const acc = this.onGround ? (moving ? 11 : 15) : 1.2;
      const tx = dx * vmax, tz = dz * vmax;
      const ex = tx - this.vx, ez = tz - this.vz, el = Math.hypot(ex, ez), maxd = acc * dt;
      if (el > maxd) { this.vx += (ex / el) * maxd; this.vz += (ez / el) * maxd; } else { this.vx = tx; this.vz = tz; }

      const nx = this.pos.x + this.vx * dt, nz = this.pos.z + this.vz * dt;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx; else this.vx = 0;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz; else this.vz = 0;
      this.speed = Math.hypot(this.vx, this.vz);

      const gh2 = this.grid.height(this.pos.x, this.pos.z);
      const wasAir = !this.onGround;
      this.vy -= 11.5 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh2) {
        // łagodne wejście na krawężnik
        this.pos.y = Math.min(gh2, this.pos.y + Math.max(0, gh2 - this.pos.y) * Math.min(1, dt * 18));
        if (gh2 - this.pos.y < 0.01) this.pos.y = gh2;
        if (wasAir && this.vy < -2) { this.land = Math.min(0.12, -this.vy * 0.025); if (this.onLand) this.onLand(-this.vy); }
        this.vy = 0;
        this.onGround = true;
      } else this.onGround = false;

      // kołysanie: tempo kroków zależy od prędkości; zdarzenie kroku przy przejściu fazy
      if (this.onGround && this.speed > 0.3) {
        const before = Math.sin(this.bob);
        this.bob += dt * (3.2 + this.speed * 1.25);
        if (before < 0 && Math.sin(this.bob) >= 0 && this.onStep) this.onStep(this.sprinting, this.crouchT > 0.5);
      }
    }
    if (this.resolve && !this.fly) this.resolve(this.pos);
    const lim = 660;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);

    // odrzut i lądowanie wracają do zera
    this.recoilP *= Math.exp(-dt * 7); this.recoilY *= Math.exp(-dt * 7); this.land *= Math.exp(-dt * 10);
    const eye = EYE + (EYE_CROUCH - EYE) * this.crouchT;
    const amp = this.fly ? 0 : clamp(this.speed * 0.011, 0, 0.05) * (this.sprinting ? 1.25 : 1);
    const bobY = Math.sin(this.bob * 2) * amp, bobX = Math.cos(this.bob) * amp * 0.9;
    this.camera.position.set(this.pos.x + cos * bobX, this.pos.y + eye + bobY - this.land, this.pos.z - sin * bobX);
    this.camera.rotation.set(this.pitch + this.recoilP, this.yaw + this.recoilY, Math.sin(this.bob) * amp * 0.9, 'YXZ');
  }
}
