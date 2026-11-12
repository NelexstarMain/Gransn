// ─────────────────────────────────────────────────────────────────────────────
//  ŚWIATŁA NOCNE — prawdziwe źródła światła, jak w zwykłej grze.
//
//  • Latarnie: pula N prawdziwych świateł punktowych (PointLight). Co 0,2 s pula przypina się
//    do latarni najbliższych kamerze (z przewagą tych przed nią). Zmiana jest płynna: wolne
//    światło najpierw gaśnie, potem przeskakuje do nowej latarni i się rozjaśnia — bez mrugania.
//    Liczba świateł w scenie jest stała, więc shadery kompilują się raz.
//  • Reflektory taksówki gracza: dwa prawdziwe światła stożkowe (SpotLight) z lamp, świecą
//    na drogę i ściany przed autem.
//  • Reflektory botów: kilka świateł stożkowych przypinanych do najbliższych aut przed kamerą.
//  • Poświata żarówek: mała, miękka tarcza zwrócona do kamery wokół każdej żarówki (zanika
//    we mgle). Brzeg jest dokładnie zerowy, a rozmiar w metrach — nie ma kwadratów ani pasków.
//  Daleko od kamery latarnie to świecące klosze z poświatą (bez oświetlania ziemi) — tak jak
//  w większości gier z oświetleniem „do przodu”.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const LAMP_COLOR = 0xffb56e, HEAD_COLOR = 0xffe2b8;

export class CityLights {
  constructor(scene, city, car, { low = false, fogDensity = 0.004 } = {}) {
    const T = city.terrain;
    this.car = car;
    this.nLamp = low ? 4 : 8;
    this.nBot = low ? 0 : 2;
    // żarówki latarni (środek klosza ok. 5,25 m nad chodnikiem)
    this.lamps = city.lamps.map((l) => new THREE.Vector3(l.p[0], T.height(l.p[0], l.p[1]) + (l.y ?? 0.15) + 5.25, l.p[1]));
    // pula świateł latarni: zawieszone tuż pod kloszem, żeby oświetlały chodnik i jezdnię
    this.pool = [];
    for (let i = 0; i < this.nLamp; i++) {
      const L = new THREE.PointLight(LAMP_COLOR, 0, 26, 2);
      L.castShadow = false;
      scene.add(L);
      this.pool.push({ L, lamp: -1, k: 0 });
    }
    this.LAMP_I = 55; // natężenie latarni [cd]
    // reflektory taksówki gracza
    this.heads = [];
    for (const s of [-0.55, 0.55]) {
      const S = new THREE.SpotLight(HEAD_COLOR, 70, 60, 0.42, 0.55, 1.3);
      S.position.set(car.L / 2 + 0.25, 0.95, s);
      S.target.position.set(car.L / 2 + 16, 0.0, s * 1.6);
      car.mesh.add(S, S.target);
      this.heads.push(S);
    }
    // reflektory botów (jedno światło na auto, z przodu na środku)
    this.botSpots = [];
    for (let i = 0; i < this.nBot; i++) {
      const S = new THREE.SpotLight(HEAD_COLOR, 0, 45, 0.5, 0.6, 1.3);
      scene.add(S, S.target);
      this.botSpots.push({ S, id: -1, k: 0 });
    }
    // poświaty: jedna instancja na latarnię + po dwie na reflektory i tylne światła botów
    this.MAXB = 40;
    const n = this.lamps.length + this.MAXB * 4;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { fogD: { value: fogDensity } },
      vertexShader: `varying vec2 vUv; varying vec3 vC; varying float vF; uniform float fogD;
        void main(){
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float s = length(instanceMatrix[0].xyz);
          float d = length(mv.xyz);
          mv.xyz -= normalize(mv.xyz) * min(0.6, d * 0.5);      // trochę bliżej kamery: nie chowa się w kloszu
          mv.xy += position.xy * s;
          vUv = position.xy * 2.0;
          vC = instanceColor * smoothstep(1.5, 4.0, d);           // tuż przy kamerze znika
          vF = exp(-fogD * fogD * d * d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vC; varying float vF;
        void main(){
          float r2 = dot(vUv, vUv);
          if (r2 >= 1.0) discard;
          float a = (exp(-r2 * 6.0) - 0.0025) * (1.0 - r2) + exp(-r2 * 60.0) * 0.8;  // miękki blask + jasny środek; na brzegu 0
          gl_FragColor = vec4(vC * a * vF, 1.0);
        }`,
    });
    this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, n);
    this.halos.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 60;
    const m = new THREE.Matrix4(), c = new THREE.Color(1.0, 0.62, 0.32);
    this.lamps.forEach((p, i) => { m.makeScale(2.2, 2.2, 2.2).setPosition(p); this.halos.setMatrixAt(i, m); this.halos.setColorAt(i, c); });
    scene.add(this.halos);
    this.m = m; this.col = new THREE.Color(); this.v = new THREE.Vector3(); this.dir = new THREE.Vector3();
    this.acc = 1;
  }

  update(dt, camera, bots) {
    const cp = camera.position;
    camera.getWorldDirection(this.dir);
    const fade = Math.min(1, dt * 5);
    // ── latarnie: co 0,2 s wybór najbliższych (przed kamerą liczą się jako bliższe) ──
    this.acc += dt;
    if (this.acc > 0.2) {
      this.acc = 0;
      const sc = [];
      for (let i = 0; i < this.lamps.length; i++) {
        const p = this.lamps[i], dx = p.x - cp.x, dz = p.z - cp.z, d = Math.hypot(dx, dz);
        if (d > 90) continue;
        const ahead = (dx * this.dir.x + dz * this.dir.z) / (d || 1);
        sc.push([d - 14 * Math.max(0, ahead), i]);
      }
      sc.sort((a, b) => a[0] - b[0]);
      this.want = new Set(sc.slice(0, this.nLamp).map((s) => s[1]));
    }
    if (this.want) {
      const taken = new Set(this.pool.map((s) => s.lamp));
      const free = [...this.want].filter((i) => !taken.has(i));
      for (const s of this.pool) {
        const keep = s.lamp >= 0 && this.want.has(s.lamp);
        if (!keep && s.k < 0.02 && free.length) { s.lamp = free.shift(); s.L.position.copy(this.lamps[s.lamp]).y -= 0.35; }
        s.k += ((keep || (s.lamp >= 0 && this.want.has(s.lamp)) ? 1 : 0) - s.k) * fade;
        s.L.intensity = this.LAMP_I * s.k;
      }
    }
    // ── boty: reflektory światłem dla najbliższych przed kamerą, poświaty dla wszystkich ──
    const nl = this.lamps.length;
    let k = nl;
    const cand = [];
    for (const b of bots) {
      if (k >= nl + this.MAXB * 4) break;
      const y = b.y ?? 0, fx = Math.cos(b.h), fz = Math.sin(b.h), hl = b.len / 2;
      const dx = cp.x - b.x, dz = cp.z - b.z, d = Math.hypot(dx, dz) || 1;
      if (d > 160) continue;
      const face = (dx * fx + dz * fz) / d, front = Math.max(0, face) ** 1.5, back = Math.max(0, -face) ** 1.5;
      for (const s of [-0.55, 0.55]) {
        this.v.set(b.x + fx * hl - fz * s, y + 0.95, b.z + fz * hl + fx * s);
        this.m.makeScale(1.1, 1.1, 1.1).setPosition(this.v); this.halos.setMatrixAt(k, this.m);
        this.halos.setColorAt(k++, this.col.setRGB(1.0 * (0.15 + front), 0.88 * (0.15 + front), 0.65 * (0.15 + front)));
        this.v.set(b.x - fx * hl - fz * s, y + 0.65, b.z - fz * hl + fx * s);
        this.m.makeScale(0.6, 0.6, 0.6).setPosition(this.v); this.halos.setMatrixAt(k, this.m);
        this.halos.setColorAt(k++, this.col.setRGB(0.9 * (0.1 + back), 0.06, 0.03));
      }
      const ahead = -((dx * this.dir.x + dz * this.dir.z) / d);
      if (d < 70 && ahead > -0.2) cand.push([d, b]);
    }
    for (let i = k; i < nl + this.MAXB * 4; i++) { this.m.makeScale(0, 0, 0); this.halos.setMatrixAt(i, this.m); }
    this.halos.instanceMatrix.needsUpdate = true;
    this.halos.instanceColor.needsUpdate = true;
    cand.sort((a, b) => a[0] - b[0]);
    const ids = cand.slice(0, this.nBot).map((c) => c[1]);
    for (let i = 0; i < this.botSpots.length; i++) {
      const s = this.botSpots[i], b = ids[i];
      if (!b) { s.k += (0 - s.k) * fade; s.S.intensity = 50 * s.k; continue; }
      if (s.id !== b.id) { s.id = b.id; s.k = 0; }
      const y = b.y ?? 0, fx = Math.cos(b.h), fz = Math.sin(b.h), hl = b.len / 2;
      s.S.position.set(b.x + fx * (hl + 0.3), y + 0.95, b.z + fz * (hl + 0.3));
      s.S.target.position.set(b.x + fx * (hl + 16), y, b.z + fz * (hl + 16));
      s.S.target.updateMatrixWorld();
      s.k += (1 - s.k) * fade;
      s.S.intensity = 50 * s.k;
    }
  }
}
