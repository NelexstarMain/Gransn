// Nocne światła bez prawdziwych źródeł (tanie): poświata we mgle wokół każdej latarni i reflektorów
// aut (miękkie, addytywne krążki zwrócone do kamery — światło „rozchodzi się”, nie stożek) oraz
// plama światła na ziemi pod latarnią. Rozlewanie się blasku na obraz dokłada przebieg tuszu (ink.js).
import * as THREE from 'three';

const VS = `attribute float size; attribute vec3 tint; varying vec3 vT; uniform float scale;
  void main(){ vT = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(size * scale / -mv.z, 420.0); gl_Position = projectionMatrix * mv; }`;
const FS = `varying vec3 vT; void main(){ vec2 d = gl_PointCoord - 0.5; float r = clamp(1.0 - dot(d, d) * 4.0, 0.0, 1.0);
  gl_FragColor = vec4(vT * (r * r * r * 0.9 + pow(r, 12.0) * 2.5), 1.0); }`;

function points(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { scale: { value: 700 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 50;
  return p;
}

export class NightGlow {
  constructor(scene, city, grid) {
    this.grid = grid;
    const L = city.lamps, T = city.terrain;
    // poświaty latarni (stałe)
    this.lamps = points(L.length);
    const lp = this.lamps.geometry.attributes;
    L.forEach((l, i) => {
      lp.position.setXYZ(i, l.p[0], T.height(l.p[0], l.p[1]) + (l.y ?? 0.15) + 5.25, l.p[1]);
      lp.size.setX(i, 7.5);
      lp.tint.setXYZ(i, 0.5, 0.33, 0.15);
    });
    scene.add(this.lamps);
    // plamy światła na ziemi
    const disc = new THREE.CircleGeometry(7.5, 20).rotateX(-Math.PI / 2);
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -6,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz / 7.5; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vP; void main(){ float r = clamp(1.0 - dot(vP, vP), 0.0, 1.0); gl_FragColor = vec4(vec3(0.42, 0.27, 0.12) * r * r, 1.0); }',
    });
    this.pools = new THREE.InstancedMesh(disc, pm, Math.max(1, L.length));
    const m4 = new THREE.Matrix4();
    L.forEach((l, i) => { m4.makeTranslation(l.p[0], T.height(l.p[0], l.p[1]) + 0.3, l.p[1]); this.pools.setMatrixAt(i, m4); });
    this.pools.count = L.length;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 40;
    scene.add(this.pools);
    // reflektory i tylne światła aut (co klatkę)
    this.MAX = 60;
    this.cars = points(this.MAX * 4 + this.MAX * 4);
    scene.add(this.cars);
    // wiązki reflektorów: trapez na jezdni przed autem (zwęża się przy lampach, rozszerza i gaśnie z odległością)
    const bg = new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
    const bm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -8,
      vertexShader: `varying vec2 vB; void main(){ vB = vec2(position.x, position.z * 2.0); vec3 p = position; p.z *= mix(1.0, 6.0, position.x); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying vec2 vB; void main(){ float f = pow(1.0 - vB.x, 1.7) * smoothstep(0.0, 0.06, vB.x), s = 1.0 - clamp(abs(vB.y), 0.0, 1.0); gl_FragColor = vec4(vec3(0.5, 0.4, 0.24) * f * s * s * 0.85, 1.0); }`,
    });
    this.beams = new THREE.InstancedMesh(bg, bm, this.MAX);
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 41;
    this.beams.count = 0;
    scene.add(this.beams);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sc = new THREE.Vector3(); this.ps = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }

  update(bots, car, cam) {
    const a = this.cars.geometry.attributes, N = this.MAX * 8;
    let k = 0, nb = 0;
    const put = (x, y, z, sz, r, g, b) => { if (k >= N) return; a.position.setXYZ(k, x, y, z); a.size.setX(k, sz); a.tint.setXYZ(k, r, g, b); k++; };
    const one = (x, y, z, h, len) => {
      const fx = Math.cos(h), fz = Math.sin(h), hl = len / 2;
      const dx = cam.x - x, dz = cam.z - z, dl = Math.hypot(dx, dz) || 1;
      if (dl > 140) return;
      // blask zwrócony „do kamery” tylko z kierunku świecenia: reflektory widać patrząc na auto od przodu,
      // tylne światła od tyłu; z boku zostaje sama wiązka na jezdni
      const face = (dx * fx + dz * fz) / dl, front = Math.pow(Math.max(0, face), 2), back = Math.pow(Math.max(0, -face), 2);
      for (const s of [-0.55, 0.55]) {
        put(x + fx * hl - fz * s, y + 0.95, z + fz * hl + fx * s, 2.8, 0.6 * front, 0.5 * front, 0.32 * front);
        put(x - fx * hl - fz * s, y + 0.65, z - fz * hl + fx * s, 1.3, 0.5 * back, 0.05 * back, 0.03 * back);
      }
      // smuga światła w mgle przed autem: trzy miękkie plamy wzdłuż wiązki, mocniejsze patrząc w kierunku auta
      for (let i = 1; i <= 3; i++) { const d = hl + i * 4.5, w = 0.05 + 0.08 * front; put(x + fx * d, y + 0.8, z + fz * d, 2.2 + i * 1.6, 0.55 * w * 4, 0.44 * w * 4, 0.26 * w * 4); }
      if (nb < this.MAX) {
        this.ps.set(x + fx * (hl - 0.1), y + 0.1, z + fz * (hl - 0.1));
        this.q.setFromAxisAngle(this.up, -h);
        this.sc.set(19, 1, 1);
        this.m4.compose(this.ps, this.q, this.sc);
        this.beams.setMatrixAt(nb++, this.m4);
      }
    };
    for (let i = 0; i < bots.length && i < this.MAX - 1; i++) { const b = bots[i]; one(b.x, b.y ?? this.grid.height(b.x, b.z), b.z, b.h, b.len); }
    if (car) one(car.pos.x, car.pos.y, car.pos.z, car.heading, car.L);
    for (let i = k; i < N; i++) a.size.setX(i, 0);
    this.beams.count = nb;
    this.beams.instanceMatrix.needsUpdate = true;
    a.position.needsUpdate = a.size.needsUpdate = a.tint.needsUpdate = true;
  }
}
