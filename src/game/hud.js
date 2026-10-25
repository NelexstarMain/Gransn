// HUD: minimapa, zegar (13:00), komunikaty teleekranów, statystyki.
import { pointInPoly } from '../city/layout.js';
import { quadGeom, T_BLD } from '../city/grid.js';

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
    const T = this.city.terrain, g = this.city.grid;
    for (const blk of this.city.blocks) if (blk.kind === 'park') poly(blk.poly, '#5d7046');
    for (let i = 0; i < T.left.length - 1; i++) poly([T.left[i], T.left[i + 1], T.right[i + 1], T.right[i]], '#3c5560');
    for (const br of this.city.bridges) {
      const w = br.width / 2, P = (p, s) => [p[0] + br.perp[0] * s, p[1] + br.perp[1] * s];
      poly([P(br.e0, -w), P(br.e1, -w), P(br.e1, w), P(br.e0, w)], '#8a857a');
    }
    for (let q = 0; q < g.quads.length / 4; q++) {
      const G = quadGeom(g, q);
      for (let i = 0; i < 4; i++) {
        const a = G.v[i];
        if (g.TY[a] !== T_BLD) continue;
        const h = Math.min(1, g.H[a] / 7);
        poly([G.p[i], G.m[i], G.c, G.m[(i + 3) % 4]], g.ZN[a] === 2 ? '#e6e3da' : `rgb(${150 + h * 40},${140 + h * 30},${120 + h * 20})`);
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

    const here = this.city.blocks.find((b) => pointInPoly(b.curb, player.pos.x, player.pos.z));
    const name = here ? { plaza: ' · Plac Zwycięstwa', park: ' · Park Ludowy', houses: ' · Przedmieście', tenement: ' · Śródmieście' }[here.kind] : this.city.terrain.inRiver(player.pos.x, player.pos.z, 2) ? ' · Most na rzece' : '';
    this.clock.textContent = `13:00 · Pas Startowy Jeden${name}`;
    if (info) this.stats.textContent = info;
  }

  show(text) {
    this.msg.textContent = text;
    this.msgT = 4;
  }
}
