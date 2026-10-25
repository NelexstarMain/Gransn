// Kontroler FPS: WASD + mysz (Pointer Lock), Shift = bieg, Spacja = skok,
// F = tryb lotu (podgląd miasta z góry), kolizje z siatką 0.5 m.
import * as THREE from 'three';

const EYE = 1.68, RADIUS = 0.32;

export class Player {
  constructor(camera, grid, dom) {
    this.camera = camera;
    this.grid = grid;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.vy = 0;
    this.onGround = true;
    this.fly = false;
    this.keys = new Set();
    this.bob = 0;
    this.locked = false;

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF') { this.fly = !this.fly; this.vy = 0; }
      if (e.code === 'Space' && this.onGround && !this.fly) { this.vy = 4.2; this.onGround = false; }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    this.lookT = 0;
    const look = (dx, dy, k = 0.0022) => {
      this.lookT = performance.now();
      this.yaw -= dx * k;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * k));
    };
    let drag = false;
    dom.addEventListener('mousedown', () => { drag = true; });
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
        if (s.left) this.touchMove = [Math.max(-1, Math.min(1, (t.clientX - s.x0) / 60)), Math.max(-1, Math.min(1, (s.y0 - t.clientY) / 60))];
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
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(sT, fT) > 0.95;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = -sin * fT + cos * sT, dz = -cos * fT - sin * sT;
    const l = Math.hypot(dx, dz);
    if (l > 0) { dx /= l; dz /= l; }

    if (this.fly) {
      const sp = run ? 70 : 22;
      const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
      this.pos.x += (-sin * cp * f + cos * s) * sp * dt;
      this.pos.z += (-cos * cp * f - sin * s) * sp * dt;
      this.pos.y += sp2 * f * sp * dt + ((k.has('Space') ? 1 : 0) - (k.has('KeyC') ? 1 : 0)) * sp * dt;
      this.pos.y = Math.max(this.grid.height(this.pos.x, this.pos.z), this.pos.y);
    } else {
      const sp = run ? 6.4 : 3.3;
      const nx = this.pos.x + dx * sp * dt, nz = this.pos.z + dz * sp * dt;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz;
      const gh = this.grid.height(this.pos.x, this.pos.z);
      this.vy -= 12 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh) {
        // łagodne wejście na krawężnik
        this.pos.y = Math.min(gh, this.pos.y + Math.max(0, gh - this.pos.y) * Math.min(1, dt * 18));
        if (gh - this.pos.y < 0.01) this.pos.y = gh;
        this.vy = 0;
        this.onGround = true;
      }
      if (l > 0 && this.onGround) this.bob += dt * (run ? 11 : 7.5);
    }
    const lim = 660;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    const bobY = this.fly ? 0 : Math.sin(this.bob) * 0.035;
    this.camera.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 0.5) * 0.004, 'YXZ');
  }
}
