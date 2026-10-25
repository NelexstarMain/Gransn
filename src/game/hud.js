// HUD: minimapa, zegar (13:00), komunikaty teleekranów, statystyki.
import { pointInPoly } from '../city/layout.js';

export class Hud {
  constructor(city) {
    this.city = city;
    this.map = document.getElementById('minimap');
    this.ctx = this.map.getContext('2d');
    this.msg = document.getElementById('msg');
    this.stats = document.getElementById('stats');
    this.clock = document.getElementById('clock');
    this.base = this.renderBase();
    this.msgT = 0;
    this.lastScreen = -1;
  }

  renderBase() {
    const S = 220, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const k = S / (this.city.size + 40), o = this.city.half + 20;
    this.k = k;
    this.o = o;
    ctx.fillStyle = '#3b3e3b';
    ctx.fillRect(0, 0, S, S);
    const poly = (p, fill) => {
      ctx.beginPath();
      p.forEach(([x, z], i) => (i ? ctx.lineTo((x + o) * k, (z + o) * k) : ctx.moveTo((x + o) * k, (z + o) * k)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    for (const b of this.city.blocks) {
      poly(b.curb, '#7d807a');
      if (b.kind === 'plaza') {
        const h = 52, [cx, cz] = b.center;
        poly([[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]], '#e6e3da');
      } else {
        poly(b.bline, '#a49c8c');
        poly(b.court, '#5c5d58');
      }
    }
    return c;
  }

  update(dt, player, info) {
    const { ctx, k, o } = this;
    ctx.drawImage(this.base, 0, 0);
    const x = (player.pos.x + o) * k, y = (player.pos.z + o) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#c0261c';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // teleekran w pobliżu?
    let near = -1;
    this.city.screens.forEach((s, i) => {
      if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 9) near = i;
    });
    if (near >= 0 && near !== this.lastScreen) {
      this.show(['6079 SMITH W.! Tak, ty! Wyprostuj się!', 'Teleekran cię widzi, obywatelu.', 'Wielki Brat patrzy na ciebie.', 'Myślozbrodnia to śmierć.'][near % 4]);
    }
    this.lastScreen = near;
    this.msgT -= dt;
    this.msg.style.opacity = this.msgT > 0 ? '1' : '0';

    const inPlaza = this.city.blocks.some((b) => b.kind === 'plaza' && pointInPoly(b.curb, player.pos.x, player.pos.z));
    this.clock.textContent = `13:00 · Pas Startowy Jeden${inPlaza ? ' · Plac Zwycięstwa' : ''}`;
    if (info) this.stats.textContent = info;
  }

  show(text) {
    this.msg.textContent = text;
    this.msgT = 4;
  }
}
