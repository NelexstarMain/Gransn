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
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0022));
    });
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.grid.height(x, z), z);
    this.yaw = yaw;
  }

  blocked(x, z) {
    const g = this.grid;
    if (g.solid(x, z)) return true;
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
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = -sin * f + cos * s, dz = -cos * f - sin * s;
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
