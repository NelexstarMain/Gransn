// Efekty: dym z wydechu, kurz spod kół na drogach gruntowych, ślady opon.
// Wszystko w dwóch obiektach (Points + jedna geometria śladów) — tanie dla FPS.
import * as THREE from 'three';

export class CarFX {
  constructor(scene, city) {
    this.city = city;
    // ── cząsteczki (dym i kurz) ──
    const N = (this.N = 260);
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 4);
    this.size = new Float32Array(N);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.max = new Float32Array(N);
    this.a0 = new Float32Array(N);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d)*4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r) * (1.0 - r)); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // ── ślady opon (bufor pierścieniowy czworokątów) ──
    const Q = (this.Q = 900);
    this.tp = new Float32Array(Q * 4 * 3);
    this.ta = new Float32Array(Q * 4);
    const idx = new Uint32Array(Q * 6);
    for (let i = 0; i < Q; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tp, 3));
    tg.setAttribute('alpha', new THREE.BufferAttribute(this.ta, 1));
    tg.setIndex(new THREE.BufferAttribute(idx, 1));
    const tm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.05,0.045,0.04, vA); }',
    });
    this.tracks = new THREE.Mesh(tg, tm);
    this.tracks.frustumCulled = false;
    scene.add(this.tracks);
    this.tq = 0;
    this.lastW = null;
    this.acc = 0;
  }

  emit(x, y, z, vx, vy, vz, size, life, r, g, b, a) {
    const i = this.next;
    this.next = (this.next + 1) % this.N;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b, a], i * 4);
    this.size[i] = size;
    this.life[i] = life;
    this.max[i] = life;
    this.a0[i] = a;
  }

  addTrack(p0, p1, q0, q1, y, a) {
    const i = this.tq;
    this.tq = (this.tq + 1) % this.Q;
    this.tp.set([p0[0], y, p0[1], q0[0], y, q0[1], q1[0], y, q1[1], p1[0], y, p1[1]], i * 12);
    this.ta.set([a, a, a, a], i * 4);
  }

  update(dt, car, keys, grid) {
    // starzenie cząsteczek
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = this.life[i] / this.max[i];
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.97; this.vel[i * 3 + 2] *= 0.97;
      this.size[i] += dt * 1.6;
      this.col[i * 4 + 3] = Math.max(0, k) * this.a0[i];
    }
    if (car && car.active) {
      const fx = Math.cos(car.heading), fz = Math.sin(car.heading), rx = -fz, rz = fx;
      const thr = keys.has('KeyW') || keys.has('ArrowUp');
      this.acc += dt;
      // dym z rury wydechowej (z tyłu, po prawej burcie — tam jest tłumik)
      const rate = thr ? 0.03 : 0.12, half = car.L / 2;
      if (this.acc > rate) {
        this.acc = 0;
        const ex = car.pos.x - fx * (half + 0.1) + rx * 0.72, ez = car.pos.z - fz * (half + 0.1) + rz * 0.72;
        const gr = 0.55 + Math.random() * 0.1;
        this.emit(ex, car.pos.y + 0.45, ez, -fx * 0.6 + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.4, -fz * 0.6 + (Math.random() - 0.5) * 0.4, thr ? 0.5 : 0.32, thr ? 2.2 : 1.6, gr, gr, gr, thr ? 0.5 : 0.3);
      }
      // nawierzchnia pod kołami (liczy ją pojazd)
      const onDirt = car.surface === 'dirt';
      const sp = Math.abs(car.v);
      if ((onDirt || car.surface === 'grass') && sp > 4 && Math.random() < sp / 30) {
        for (const sd of [-0.75, 0.75]) {
          this.emit(car.pos.x - fx * 1.3 + rx * sd, car.pos.y + 0.2, car.pos.z - fz * 1.3 + rz * sd, -fx * sp * 0.08 + (Math.random() - 0.5), 0.4 + Math.random() * 0.6, -fz * sp * 0.08 + (Math.random() - 0.5), 0.7, 1.8, 0.62, 0.52, 0.4, 0.35);
        }
      }
      // ślady opon: poślizg (liczy go pojazd: ręczny, boczny poślizg, blokowanie kół) albo grunt
      const skid = car.skid;
      const back = half - 0.68, tw = car.W / 2 - 0.1;
      const wheels = [-tw, tw].map((sd) => [car.pos.x - fx * back + rx * sd, car.pos.z - fz * back + rz * sd]);
      if ((skid || onDirt) && sp > 1.5) {
        if (this.lastW) {
          const d = Math.hypot(wheels[0][0] - this.lastW[0][0], wheels[0][1] - this.lastW[0][1]);
          if (d > 0.35) {
            const y = grid.height(car.pos.x, car.pos.z) + 0.015;
            const a = skid ? 0.55 : 0.22;
            for (let k = 0; k < 2; k++) {
              const w0 = this.lastW[k], w1 = wheels[k];
              const wx = rx * 0.07, wz = rz * 0.07;
              this.addTrack([w0[0] - wx, w0[1] - wz], [w1[0] - wx, w1[1] - wz], [w0[0] + wx, w0[1] + wz], [w1[0] + wx, w1[1] + wz], y, a);
            }
            this.lastW = wheels;
            this.tracks.geometry.attributes.position.needsUpdate = true;
            this.tracks.geometry.attributes.alpha.needsUpdate = true;
          }
        } else this.lastW = wheels;
      } else this.lastW = null;
      if (skid && sp > 6 && Math.random() < 0.5) {
        const w = wheels[Math.random() < 0.5 ? 0 : 1];
        this.emit(w[0], car.pos.y + 0.15, w[1], (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, 0.6, 1.2, 0.85, 0.85, 0.85, 0.4);
      }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}
