// ─────────────────────────────────────────────────────────────────────────────
//  TAKSÓWKARZE-RYWALE — walka o pasażerów.
//  • 4 żółte taksówki z imionami jeżdżą jako boty ruchu, ale zamiast błądzić po mieście jadą po
//    najbliższego czekającego pasażera (ten sam, na którego czekasz Ty). Kto pierwszy podjedzie,
//    zabiera go: pasażer znika z miasta, a rywal wiezie go pod losowy adres i dostaje opłatę.
//  • Ranking: Ty i rywale wg zarobków (panel po lewej). Imiona i pasek zdrowia nad taksówkami.
//  • Walka: taranowanie (od ok. 12 km/h różnicy prędkości) i strzały z karabinu odbierają zdrowie.
//    Poniżej 40% auto dymi, przy zerze płonie i po kilku sekundach znika; rywal wraca po 25 s
//    z nowym autem (zarobki zostają). Za rozbitą taksówkę dostajesz 50 zł.
//  • Rywale nie strzelają ani nie taranują Ciebie — tylko podbierają pasażerów.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { astar } from './traffic.js';
import { Rng } from '../core/rng.js';

const NAMES = ['Stasiu', 'Hela', 'Mundek', 'Zdzisiu', 'Józio', 'Bronka'];
const HP = 100, SHOT = 34;
const lin = (c) => Math.pow(c, 2.2);

export class Cabbies {
  constructor({ traffic, job, fx, camera, grid, city }) {
    Object.assign(this, { traffic, job, fx, camera, grid, city });
    this.rng = new Rng(8123);
    this.cabs = [];
    this.v = new THREE.Vector3();
    this.t = 0; this.acc = 0; this.rt = 0;
    traffic.cabPlan = (b) => this.plan(b);
    traffic.onShot = (b) => { if (b.cab) this.damage(b, SHOT, true); };
    // panel rankingu i znaczniki nad autami
    this.panel = document.createElement('div');
    this.panel.style.cssText = 'position:fixed;left:16px;top:176px;min-width:170px;background:rgba(42,24,14,0.72);border-left:4px solid #f2c200;padding:8px 12px;font:14px/1.5 "Trebuchet MS",sans-serif;color:#fdf8ea;text-shadow:0 1px 2px #000;pointer-events:none;z-index:5';
    document.body.appendChild(this.panel);
    this.tags = [];
    this.spawnAll();
  }

  spawnAll() {
    for (let i = 0; i < 4; i++) this.addCab(NAMES[i]);
  }

  addCab(name, money = 0, trips = 0) {
    const P = [this.city.spawn.x, this.city.spawn.z];
    for (let k = 0; k < 6; k++) {
      const b = this.traffic.spawn(P, 'taxi', { vmax: this.rng.float(10.5, 13) });
      if (!b) continue;
      b.cab = { name, hp: HP, money, trips, state: 'seek', target: null, fare: 0, dest: null, hurt: 0, t: 0, ram: 0 };
      b.rgb = [0.95, 0.76, 0.12].map(lin);
      this.cabs.push(b);
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:0;top:0;font:bold 13px "Trebuchet MS",sans-serif;color:#fff;text-shadow:0 1px 3px #000;background:rgba(0,0,0,0.42);padding:1px 7px;border-radius:3px;pointer-events:none;white-space:nowrap;display:none;z-index:4;transform:translate(-50%,-100%)';
      document.body.appendChild(el);
      b.cab.el = el;
      return b;
    }
    return null;
  }

  nearestNode(x, z) {
    const G = this.traffic.G;
    let best = -1, bd = 1e18;
    for (const i of this.traffic.liveNodes) { const d = (G.nodes[i].x - x) ** 2 + (G.nodes[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }

  setPath(b, to) {
    const T = this.traffic, path = astar(T.G, b.from, to);
    if (!path || path.length < 2) return false;
    b.path = path; b.edge = T.edgeBetween(path[0], path[1]); b.s = 0;
    return true;
  }

  // wywoływane przez Traffic, gdy bot-taksówkarz dojedzie do końca trasy (b.from = węzeł, w którym stoi)
  plan(b) {
    const c = b.cab, J = this.job;
    if (c.state === 'wreck') return false;
    if (c.state === 'carry') {
      c.money += c.fare; c.trips++; c.state = 'seek'; c.target = null; c.fare = 0;
    }
    if (c.state === 'seek' && c.target) {
      const w = c.target;
      if (J.waiting.includes(w) && Math.hypot(w.p[0] - b.x, w.p[1] - b.z) < 28) {
        J.waiting.splice(J.waiting.indexOf(w), 1); J.remove(w);   // pasażer wsiada do rywala
        const dest = J.pickStand([b.x, b.z], 150, 520);
        c.fare = Math.round(6 + Math.hypot(dest[0] - b.x, dest[1] - b.z) * 0.025);
        c.state = 'carry'; c.target = null;
        if (this.setPath(b, this.nearestNode(dest[0], dest[1]))) return true;
        c.state = 'seek'; c.money += c.fare;
      }
      c.target = null;
    }
    // nowy cel: najbliższy pasażer, którego nie wybrał inny rywal
    let best = null, bd = 1e18;
    for (const w of J.waiting) {
      if (w.leaving || this.cabs.some((o) => o !== b && o.cab.target === w)) continue;
      const d = Math.hypot(w.p[0] - b.x, w.p[1] - b.z);
      if (d < bd && d < 650) { bd = d; best = w; }
    }
    if (best) {
      c.target = best;
      const n = this.nearestNode(best.p[0], best.p[1]);
      if (n === b.from) {   // już na miejscu
        return this.plan(b);
      }
      if (this.setPath(b, n)) return true;
      c.target = null;
    }
    return this.traffic.plan(b);
  }

  // obrażenia: amount zdrowia; byPlayer = trafienie albo taranowanie gracza
  damage(b, amount, byPlayer) {
    const c = b.cab;
    if (!c || c.state === 'wreck') return;
    c.hp -= amount;
    c.hurt = 0.4;
    if (c.hp <= 0) {
      c.hp = 0; c.state = 'wreck'; c.t = 0; c.fare = 0; c.target = null;
      b.bump = 1e9; b.rgb = [0.07, 0.065, 0.06].map(lin);
      if (byPlayer) { this.job.money += 50; this.job.say(`Rozbiłeś taksówkę ${c.name}! +50 zł`, 4); }
    }
  }

  update(dt, car) {
    this.t += dt;
    const T = this.traffic;
    for (const b of this.cabs) {
      const c = b.cab;
      c.ram = Math.max(0, c.ram - dt); c.hurt = Math.max(0, c.hurt - dt);
      if (c.state === 'wreck') {
        c.t += dt; b.bump = 1e9; b.v = 0;
        if (this.fx && (c.t * 8) % 1 < dt * 8) this.fx.emit(b.x, 1.0, b.z, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 0.9, 2.4, 0.12, 0.11, 0.1, 0.7, 1.8, 0.99);
        if (this.fx && c.t < 8 && (c.t * 12) % 1 < dt * 12) this.fx.emit(b.x + (Math.random() - 0.5), 0.7, b.z + (Math.random() - 0.5), 0, 1.6, 0, 0.5, 0.6, 1, 0.55, 0.12, 0.9, 0.5, 0.95);
      } else if (c.hp < 40 && this.fx && (this.t * 6) % 1 < dt * 6) {
        this.fx.emit(b.x, 1.1, b.z, 0, 1.0, 0, 0.55, 1.6, 0.25, 0.24, 0.23, 0.55, 1.5, 0.98);
      }
      // rywale daleko od gracza wracają w jego okolicę (tam są pasażerowie)
      if (c.state !== 'wreck' && c.state !== 'carry' && Math.hypot(b.x - car.pos.x, b.z - car.pos.z) > 420 && (c.t = (c.t || 0) + dt) > 3) {
        c.t = 0;
        const n = T.liveNodes[Math.floor(this.rng.next() * T.liveNodes.length)], p = T.nodePos(n);
        const d = Math.hypot(p[0] - car.pos.x, p[1] - car.pos.z);
        if (d > 160 && d < 330) { b.from = n; b.turn = null; if (this.plan(b)) { const q = T.lanePoint(b.edge, b.path[0], 0); b.x = q[0]; b.z = q[1]; b.h = b.hPrev = q[2]; b.v = 0; } }
      }
      // wrak znika po 10 s, taksówkarz wraca po 25 s z nowym autem
      if (c.state === 'wreck' && c.t > 10 && !c.gone) {
        c.gone = true;
        const i = T.bots.indexOf(b);
        if (i >= 0) { T.bots.splice(i, 1); T.remove(b); }
        c.el.style.display = 'none';
      }
      if (c.state === 'wreck' && c.t > 25) {
        this.cabs.splice(this.cabs.indexOf(b), 1);
        c.el.remove();
        this.addCab(c.name, c.money, c.trips);
        break;
      }
    }
    // znaczniki nad autami (imię, zarobek, pasek zdrowia)
    const cam = this.camera, W = innerWidth, H = innerHeight;
    for (const b of this.cabs) {
      const c = b.cab, el = c.el;
      const dx = b.x - cam.position.x, dz = b.z - cam.position.z, d = Math.hypot(dx, dz);
      if (c.gone || d > 110 || d < 3) { el.style.display = 'none'; continue; }
      this.v.set(b.x, this.grid.height(b.x, b.z) + 2.7, b.z).project(cam);
      if (this.v.z > 1 || this.v.z < -1) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * W).toFixed(0)}px,${((-this.v.y * 0.5 + 0.5) * H).toFixed(0)}px) translate(-50%,-100%)`;
      const hp = Math.round(c.hp);
      if (c.shown !== `${hp}|${c.money}|${c.state}`) {
        c.shown = `${hp}|${c.money}|${c.state}`;
        const col = hp > 60 ? '#6fe26f' : hp > 30 ? '#ffc82e' : '#ff5a3c';
        el.innerHTML = `${c.name}${c.state === 'carry' ? ' 🚖' : ''}<br><span style="display:inline-block;width:60px;height:5px;background:#3338;vertical-align:middle"><span style="display:block;height:100%;width:${hp * 0.6}px;background:${col}"></span></span> <span style="font-size:11px;font-weight:normal">${c.state === 'wreck' ? 'ROZBITA' : c.money + ' zł'}</span>`;
      }
    }
    // ranking (2×/s)
    this.rt += dt;
    if (this.rt > 0.5) {
      this.rt = 0;
      const rows = [{ n: 'Ty', m: this.job.money, me: true }, ...this.cabs.map((b) => ({ n: b.cab.name, m: b.cab.money, hp: b.cab.hp, w: b.cab.state === 'wreck' }))].sort((a, b) => b.m - a.m);
      this.panel.innerHTML = '<b style="color:#f2c200">Ranking taksówkarzy</b>' + rows.map((r, i) => `<div style="${r.me ? 'color:#ffd23a;font-weight:bold' : r.w ? 'opacity:0.5' : ''}">${i + 1}. ${r.n}<span style="float:right;margin-left:14px">${r.m} zł</span></div>`).join('');
    }
  }

  setVisible(v) {
    this.panel.style.display = v ? 'block' : 'none';
    if (!v) for (const b of this.cabs) b.cab.el.style.display = 'none';
  }
}
