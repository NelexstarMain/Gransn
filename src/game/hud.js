// HUD: minimapa z pasażerami i celem, panel taksówkarza, strzałka do celu,
// prędkościomierz, nazwa okolicy, komunikaty.
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
    this.panel = document.getElementById('taxi');
    this.arrow = document.getElementById('arrow');
    this.speed = document.getElementById('speed');
    this.base = this.renderBase();
    this.msgT = 0;
    this.lastMsg = null;
  }

  renderBase() {
    const S = 220, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const k = S / (this.city.size + 40), o = this.city.half + 20;
    this.k = k;
    this.o = o;
    ctx.fillStyle = '#3d6a80';
    ctx.fillRect(0, 0, S, S);
    const T = this.city.terrain, g = this.city.grid;
    const poly = (p, fill) => {
      ctx.beginPath();
      p.forEach(([x, z], i) => (i ? ctx.lineTo((x + o) * k, (z + o) * k) : ctx.moveTo((x + o) * k, (z + o) * k)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const coast = [];
    for (let a = 0; a < Math.PI * 2; a += 0.05) { const r = T.coastR(a); coast.push([Math.cos(a) * r, Math.sin(a) * r]); }
    poly(coast, '#d9c79a');
    const inner = coast.map(([x, z]) => { const l = Math.hypot(x, z); return [x * (1 - 34 / l), z * (1 - 34 / l)]; });
    poly(inner, '#6d8a52');
    for (let i = 0; i < T.left.length - 1; i++) poly([T.left[i], T.left[i + 1], T.right[i + 1], T.right[i]], '#3d6a80');
    ctx.lineCap = 'round';
    for (const s of this.city.streets) {
      ctx.strokeStyle = s.mat === 'asphalt' ? '#e8e2d0' : s.mat === 'dirt' ? '#a58a64' : '#c9c4b6';
      ctx.lineWidth = Math.max(1.2, s.rw * 2 * k);
      ctx.beginPath();
      ctx.moveTo((s.a[0] + o) * k, (s.a[1] + o) * k);
      ctx.lineTo((s.b[0] + o) * k, (s.b[1] + o) * k);
      ctx.stroke();
    }
    for (let q = 0; q < g.quads.length / 4; q++) {
      const G = quadGeom(g, q);
      for (let i = 0; i < 4; i++) {
        const a = G.v[i];
        if (g.TY[a] !== T_BLD) continue;
        poly([G.p[i], G.m[i], G.c, G.m[(i + 3) % 4]], g.ZN[a] === 2 ? '#e0c9a0' : g.ZN[a] === 1 ? '#8f8778' : '#b88a70');
      }
    }
    for (const key of ['rail']) {
      const R = this.city.routes[key];
      ctx.strokeStyle = '#4a3f38';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      R.pts.forEach(([x, z], i) => (i ? ctx.lineTo((x + o) * k, (z + o) * k) : ctx.moveTo((x + o) * k, (z + o) * k)));
      ctx.stroke();
    }
    return c;
  }

  update(dt, view, info, job, car, camera) {
    const { ctx, k, o } = this;
    ctx.drawImage(this.base, 0, 0);
    const P = (p) => [(p[0] + o) * k, (p[1] + o) * k];
    ctx.fillStyle = '#ffd23a';
    for (const w of job.waiting) { const [x, y] = P(w.p); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
    if (job.fare) {
      const [x, y] = P(job.fare.dest);
      ctx.fillStyle = '#46e08a';
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
    const [px, py] = P([view.pos.x, view.pos.z]);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-view.yaw);
    ctx.fillStyle = car.active ? '#ffd23a' : '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // panel taksówkarza
    const f = job.fare;
    let tgt = null, line2;
    if (f) {
      tgt = f.dest;
      const d = Math.hypot(f.dest[0] - view.pos.x, f.dest[1] - view.pos.z);
      const t = Math.max(0, Math.ceil(f.left));
      line2 = `Kurs: ${f.name} · ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}${f.left < 0 ? ' (bez napiwku)' : ''}`;
    } else {
      let best = null, bd = 1e9;
      for (const w of job.waiting) { const d = Math.hypot(w.p[0] - view.pos.x, w.p[1] - view.pos.z); if (d < bd) { bd = d; best = w; } }
      if (best) tgt = best.p;
      line2 = best ? `Najbliższy pasażer: ${Math.round(bd)} m` : 'Szukaj pasażerów';
    }
    this.panel.innerHTML = `<b>${job.money} zł</b> · kursy: ${job.trips}<br>${line2}`;
    if (tgt && camera) {
      const a = Math.atan2(tgt[0] - view.pos.x, tgt[1] - view.pos.z);
      const camYaw = Math.atan2(-(camera.matrixWorld.elements[8]), -(camera.matrixWorld.elements[10]));
      this.arrow.style.display = 'block';
      this.arrow.style.transform = `translateX(-50%) rotate(${camYaw - a}rad)`;
      this.arrow.style.borderBottomColor = f ? '#46e08a' : '#ffd23a';
    } else this.arrow.style.display = 'none';
    this.speed.textContent = car.active ? `${Math.round(car.kmh)} km/h` : 'pieszo · E przy taksówce';

    if (job.msg && job.msg !== this.lastMsg) {
      this.lastMsg = job.msg;
      this.msg.textContent = job.msg.text;
      this.msgT = job.msg.t;
    }
    this.msgT -= dt;
    this.msg.style.opacity = this.msgT > 0 ? '1' : '0';

    const here = this.city.blocks.find((b) => pointInPoly(b.poly, view.pos.x, view.pos.z));
    const name = this.city.terrain.inRiver(view.pos.x, view.pos.z, 2) ? 'Most' : here ? { plaza: 'Rynek', park: 'Park', houses: 'Przedmieście', tenement: 'Śródmieście', nature: 'Las i wydmy' }[here.kind] : 'Wybrzeże';
    this.clock.textContent = `Gransn · ${name} · wyspa nr ${this.city.seed}`;
    if (info) this.stats.textContent = info;
  }
}
