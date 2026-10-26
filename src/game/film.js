// ─────────────────────────────────────────────────────────────────────────────
//  TRYB FILMOWY — ~2 minuty autonomicznego przejazdu taksówki po całej wyspie.
//  • Trasa: kolejne punkty wokół wyspy (różne promienie, więc i rynek, i obrzeża, i mosty),
//    połączone A* po grafie dróg botów; prawy pas, bez nawrotów.
//  • Jazda: autopilot (pure pursuit) steruje fizyką auta; zwalnia w zakrętach i przed botami.
//  • Kamera przymocowana do auta: tuż przed szybą, nad maską (widać maskę, chłodnicę i lampy),
//    zderzak (nisko, szeroko) albo zza auta. Klawisz V przełącza. Szeroki kąt (FOV 100°).
//  • Grafika: preset Ultra, wysoka rozdzielczość, cienie 4096, duży zasięg detali.
//  • Bez HUD-u, z wygaszeniem na początku i końcu. Esc / C kończy.
//  Film nagrywa się zewnętrznie (OBS, Win+G, nagrywanie ekranu): przeglądarka nie zapisze go sama.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { astar } from './traffic.js';

const DURATION = 150;      // s jazdy (górny limit; zwykle okrążenie zajmuje ~2 min)
const PREP_MAX = 9;        // s oczekiwania na załadowanie okolicy
const VMAX = 16;           // m/s (~58 km/h); auto z 1900 r. ma limit 17
const WB = 2.3;            // rozstaw osi (jak w Vehicle)
const FOV = 100;

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// kamery przymocowane do auta: [x, y, z] w układzie auta (x = przód), pochylenie w dół (rad)
const MOUNTS = [
  { name: 'maska', pos: [1.12, 1.42, 0], pitch: -0.06 },
  { name: 'zderzak', pos: [2.15, 0.78, 0], pitch: -0.03 },
  { name: 'zza auta', chase: true },
];

export class FilmMode {
  constructor({ city, grid, car, traffic, camera, settings, streamer, enterGame }) {
    Object.assign(this, { city, grid, car, traffic, camera, settings, streamer, enterGame });
    this.active = false;
    this.mount = 0;
    this.q = new THREE.Quaternion();
    this.qOff = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    this.qPitch = new THREE.Quaternion();
    this.v3 = new THREE.Vector3();
    this.fade = document.createElement('div');
    this.fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:30;transition:opacity 1.6s ease';
    document.body.appendChild(this.fade);
  }

  nearestNode(x, z) {
    const G = this.traffic.G;
    let best = -1, bd = 1e18;
    for (const i of this.traffic.liveNodes) {
      const d = (G.nodes[i].x - x) ** 2 + (G.nodes[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ── trasa: węzły grafu → wielokąt na prawym pasie ───────────────────────────
  buildRoute() {
    const { city, traffic } = this, G = traffic.G, T = city.terrain;
    const a0 = Math.atan2(city.spawn.z, city.spawn.x);
    const wps = [this.nearestNode(city.spawn.x, city.spawn.z)];
    let nodes = [wps[0]], len = 0;
    // jedno okrążenie wyspy w środkowym pasie (promień faluje 0,36–0,56 brzegu: raz bliżej rynku, raz bliżej wybrzeża)
    for (let k = 1; k < 40; k++) {
      const ang = a0 + k * 0.6, r = T.coastR(ang) * (0.46 + 0.1 * Math.sin(k * 1.3));
      const to = this.nearestNode(Math.cos(ang) * r, Math.sin(ang) * r);
      const from = nodes[nodes.length - 1];
      if (to < 0 || to === from) continue;
      const path = astar(G, from, to);
      if (!path || path.length < 2) continue;
      for (let i = 1; i < path.length; i++) nodes.push(path[i]);
      len = this.length(nodes);
      if (k * 0.6 > Math.PI * 2 + 0.1) break; // okrążenie zamknięte
    }
    // bez nawrotów: a, b, a → a
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 2; i < nodes.length; i++) if (nodes[i] === nodes[i - 2]) { nodes.splice(i - 1, 2); changed = true; break; }
    }
    // punkty na prawym pasie (przesunięcie o 0,45 szerokości półjezdni)
    const P = nodes.map((n) => [G.nodes[n].x, G.nodes[n].z]);
    const rw = nodes.map((n, i) => {
      const m = i < nodes.length - 1 ? nodes[i + 1] : nodes[i - 1];
      const e = traffic.edgeBetween(n, m);
      return e === undefined ? 3 : G.edges[e].rw;
    });
    // lekki zapas: pas bliżej osi, jeśli przy brzegu rzeki, krawężniku czy rekwizycie auto by się zablokowało
    const room = (x, z, h) => {
      const c = Math.cos(h), s = Math.sin(h);
      for (const [u, w] of [[1.9, -0.95], [1.9, 0.95], [-1.9, -0.95], [-1.9, 0.95], [0, -0.95], [0, 0.95]]) if (this.grid.solid(x + c * u - s * w, z + s * u + c * w)) return false;
      return true;
    };
    const R = P.map((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, h = Math.atan2(dz, dx);
      let pick = [p[0], p[1]];
      for (const k of [0.45, 0.3, 0.15, 0, -0.2]) {
        const off = rw[i] * k, q = [p[0] - (dz / l) * off, p[1] + (dx / l) * off];
        if (room(q[0], q[1], h)) { pick = q; break; }
      }
      return pick;
    });
    const cum = [0];
    for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]));
    this.route = R; this.cum = cum;
  }

  length(nodes) {
    const G = this.traffic.G;
    let l = 0;
    for (let i = 1; i < nodes.length; i++) l += Math.hypot(G.nodes[nodes[i]].x - G.nodes[nodes[i - 1]].x, G.nodes[nodes[i]].z - G.nodes[nodes[i - 1]].z);
    return l;
  }

  // punkt na trasie w odległości s wzdłuż łuku
  at(s) {
    const { route: R, cum } = this;
    s = Math.max(0, Math.min(cum[cum.length - 1], s));
    let i = this.seg || 0;
    if (cum[i] > s) i = 0;
    while (i < R.length - 2 && cum[i + 1] < s) i++;
    const t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
    return [R[i][0] + (R[i + 1][0] - R[i][0]) * t, R[i][1] + (R[i + 1][1] - R[i][1]) * t, Math.atan2(R[i + 1][1] - R[i][1], R[i + 1][0] - R[i][0])];
  }

  start() {
    if (this.active) return;
    this.buildRoute();
    const { car, settings, camera } = this;
    this.saved = { ...settings.v };
    this.savedFov = camera.fov;
    // najwyższa jakość: Ultra, rozdzielczość do 2,5×, cienie 4096, daleki zasięg detali, szeroki kąt
    settings.usePreset('ultra');
    settings.set('res', Math.min(2.5, Math.max(2, (window.devicePixelRatio || 1) * 1.5)));
    settings.set('detail', 300);
    settings.set('fov', FOV);
    document.body.classList.add('nohud', 'film');
    const vg = document.getElementById('vignette');
    if (vg) vg.style.display = 'none';
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* bez pełnego ekranu */ }
    this.enterGame();
    const [x, z, h] = this.at(0);
    car.place(x, z, h);
    this.seg = 0; this.s = 0;
    car.auto = { steer: 0, v: 0 };
    this.t = 0; this.run = 0; this.stuck = 0; this.phase = 'prep';
    this.fade.style.transition = 'none';
    this.fade.style.opacity = '1';
    this.active = true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.car.auto = null;
    this.car.v = 0;
    document.body.classList.remove('nohud', 'film');
    const vg = document.getElementById('vignette');
    if (vg) vg.style.display = '';
    this.settings.restore(this.saved);
    this.camera.fov = this.saved.fov;
    this.camera.updateProjectionMatrix();
    this.fade.style.transition = 'opacity 0.6s ease';
    this.fade.style.opacity = '0';
    try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignoruj */ }
  }

  cycleMount() {
    this.mount = (this.mount + 1) % MOUNTS.length;
  }

  // autopilot: pure pursuit + prędkość z krzywizny i przeszkód; zwraca { steer, v }
  drive(dt) {
    const { car } = this;
    // postęp po trasie: najbliższy punkt przed autem
    let best = 1e18, bs = this.s;
    for (let s = Math.max(0, this.s - 4); s < this.s + 30; s += 1.5) {
      const p = this.at(s), d = (p[0] - car.pos.x) ** 2 + (p[1] - car.pos.z) ** 2;
      if (d < best) { best = d; bs = s; }
    }
    this.s = Math.max(this.s, bs);
    const k = this.cum.findIndex((c) => c > this.s);
    this.seg = Math.max(0, (k < 0 ? this.cum.length - 1 : k) - 1);
    const Ld = Math.max(4.5, Math.min(14, 3.5 + Math.abs(car.v) * 0.75));
    const tp = this.at(this.s + Ld);
    const alpha = norm(Math.atan2(tp[1] - car.pos.z, tp[0] - car.pos.x) - car.heading);
    const delta = Math.atan((2 * WB * Math.sin(alpha)) / Ld);
    const maxA = 0.6 * (1 - Math.min(0.55, Math.abs(car.v) / 45));
    const steer = Math.max(-1, Math.min(1, delta / maxA));
    // zakręty: zmiana kierunku trasy na najbliższych ~25 m
    const d1 = this.at(this.s + 5)[2], d2 = this.at(this.s + 26)[2], turn = Math.abs(norm(d2 - d1));
    // prędkość z przyspieszenia bocznego ~7 m/s² (krzywizna ≈ zmiana kierunku / 21 m)
    let v = Math.max(5.5, Math.min(VMAX, Math.sqrt((7 * 21) / Math.max(turn, 0.05))));
    // przeszkody (boty) przed maską
    let free = 99;
    if (car.obstacles) {
      const c = Math.cos(car.heading), s = Math.sin(car.heading);
      for (const d of [4, 7, 10, 14, 19]) {
        const x = car.pos.x + c * d, z = car.pos.z + s * d;
        for (const o of car.obstacles(x, z)) if (Math.hypot(o.x - x, o.z - z) < 2.5) { free = Math.min(free, d); }
      }
    }
    if (free < 99) v = Math.min(v, Math.max(0, (free - 5.5) * 1.1));
    // utknięcie (bot, krawężnik): po kilku sekundach auto przeskakuje kawałek do przodu po trasie
    this.stuck = car.v < 0.5 && this.run > 3 ? this.stuck + dt : 0;
    // zakleszczenie z botem: po 2,5 s bot tuż obok znika (ruch uzupełni się sam), dopiero potem przeskok
    if (this.stuck > 2.5 && this.stuck - dt <= 2.5) this.traffic.removeNear(car.pos.x, car.pos.z, 9);
    if (this.stuck > 5) {
      const [x, z, h] = this.at(this.s + 14);
      car.place(x, z, h);
      this.s += 14; this.stuck = 0;
    }
    return { steer, v };
  }

  // wywoływane co klatkę zamiast zwykłej kamery
  update(dt) {
    if (!this.active) return;
    const { car } = this;
    this.t += dt;
    if (this.phase === 'prep') {
      car.auto = { steer: 0, v: 0 };
      if (this.t > 2 && (this.streamer.pendingCount === 0 || this.t > PREP_MAX)) {
        this.phase = 'run'; this.run = 0;
        this.fade.style.transition = 'opacity 2.2s ease';
        this.fade.style.opacity = '0';
      }
    } else {
      this.run += dt;
      car.auto = this.drive(dt);
      if (this.run > DURATION - 2.5) { this.fade.style.transition = 'opacity 2.2s ease'; this.fade.style.opacity = '1'; }
      if (this.run > DURATION || this.s >= this.cum[this.cum.length - 1] - 3) this.stop();
    }
  }

  // kamera przymocowana do auta
  placeCamera(dt) {
    const { car, camera } = this, m = MOUNTS[this.mount];
    if (m.chase) {
      const c = Math.cos(car.heading), s = Math.sin(car.heading);
      this.v3.set(car.pos.x - c * 6.5, car.pos.y + 2.5, car.pos.z - s * 6.5);
      camera.position.lerp(this.v3, Math.min(1, dt * 6));
      camera.lookAt(car.pos.x + c * 6, car.pos.y + 1.2, car.pos.z + s * 6);
      return;
    }
    this.v3.set(m.pos[0], m.pos[1], m.pos[2]);
    car.mesh.updateMatrixWorld(true);
    car.mesh.localToWorld(this.v3);
    camera.position.copy(this.v3);
    // orientacja auta (przód = +x modelu → kierunek patrzenia kamery), pochylenie w dół
    this.q.copy(car.mesh.quaternion).multiply(this.qOff);
    this.qPitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), m.pitch);
    this.q.multiply(this.qPitch);
    camera.quaternion.slerp(this.q, Math.min(1, dt * 14)); // lekko tłumi drgania podłoża
  }
}
