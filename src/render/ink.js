// ─────────────────────────────────────────────────────────────────────────────
//  TUSZ — bajkowy rysunek: kontur i cieniowanie „jak ilustracja”.
//
//  Scena rysuje się do tekstury (kolor + głębia), a jeden pełnoekranowy przebieg:
//   • dorysowuje kontur tam, gdzie głębia się załamuje. Miarą jest druga różnica surowej
//     głębi: na płaskiej ścianie wynosi dokładnie zero (głębia w buforze jest liniowa na
//     ekranie), a skacze na sylwetkach i na narożnikach (ściana–ściana, ściana–dach). Progi
//     są w jednostkach „zmiana nachylenia na piksel”, więc kreska ma tę samą czułość przy
//     każdej rozdzielczości; daleko (we mgle) zanika;
//   • robi mapowanie tonów i korekcję kolorów (te same wzory co GRADE w materials.js, które
//     na czas rysowania do tekstury jest wyłączane) i spłaszcza jasność w kilka stopni —
//     plamy barwne zamiast płynnych przejść.
//  Tekstura ma wygładzanie MSAA ×4 (głębia jest z niej rozwiązywana do tekstury).
//  Gdy shader się nie skompiluje (ok = false), gra wraca do zwykłego rysowania.
//  Wyłączone na telefonach (?low) i przez ?noink; klawisz K przełącza w grze.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GRADE_UNIFORM } from './materials.js';

export class Ink {
  constructor() {
    this.ok = true;
    this.on = true;
    this.calls = 0;
    this.size = new THREE.Vector2();
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: new THREE.DepthTexture(4, 4), samples: 4 } /* MSAA: bez niego krawędzie i kreski migotały w ruchu */);
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.rt.depthTexture.minFilter = this.rt.depthTexture.magFilter = THREE.NearestFilter;
    this.mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) }, near: { value: 0.2 }, far: { value: 2200 }, pxa: { value: 0.001 },
        gradeDark: { value: 1 }, inkK: { value: 0.82 },
        invVP: { value: new THREE.Matrix4() }, prevVP: { value: new THREE.Matrix4() }, prevTVP: { value: new THREE.Matrix4() }, blurK: { value: 0 }, blurR: { value: 0 },
        inkW: { value: 0.028 }, // grubość kreski w metrach (na odległości 1 m = tyle metrów)
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far; uniform float pxa; uniform float gradeDark; uniform float inkK; uniform mat4 invVP; uniform mat4 prevVP; uniform mat4 prevTVP; uniform float blurK; uniform float blurR; uniform float inkW;
        varying vec2 vUv;
        float rawZ(vec2 uv){ return texture2D(tDepth, uv).x; }
        void main(){
          vec3 c = texture2D(tColor, vUv).rgb;
          float z0 = rawZ(vUv);
          float speed = 0.0;
          // odległość w metrach; kreska ma grubość „w świecie”: z bliska gruba (do 3,4 px), z daleka
          // cienka i coraz bledsza — dal nie zarasta kreskami, a to, co blisko, jest wyraźnie obrysowane
          float dist = 2.0 * near * far / (far + near - (z0 * 2.0 - 1.0) * (far - near));
          float rad = clamp(inkW / (dist * pxa), 1.3, 3.4);
          vec2 o = texel * rad, od = o * 0.7071;
          float zl = rawZ(vUv - vec2(o.x, 0.0)), zr = rawZ(vUv + vec2(o.x, 0.0));
          float zd = rawZ(vUv - vec2(0.0, o.y)), zu = rawZ(vUv + vec2(0.0, o.y));
          float za = rawZ(vUv + od), zb = rawZ(vUv - od), zc = rawZ(vUv + vec2(od.x, -od.y)), ze = rawZ(vUv + vec2(-od.x, od.y));
          // druga różnica głębi w czterech kierunkach, przeliczona na względny skok (Δz / z)
          float lap = max(max(abs(zl + zr - 2.0 * z0), abs(zd + zu - 2.0 * z0)), max(abs(za + zb - 2.0 * z0), abs(zc + ze - 2.0 * z0))) * dist / near;
          float thr = pxa * rad;
          float edge = smoothstep(0.7 * thr, 2.6 * thr, lap) * mix(1.0, 0.35, smoothstep(14.0, 60.0, dist)) * (1.0 - smoothstep(60.0, 130.0, dist)); // szeroki próg i szybkie gaśnięcie w dali: kreska nie zapala się i nie gaśnie co klatkę
          // rozmycie ruchu: gdzie ten punkt świata był na ekranie klatkę temu (ruch kamery); kolor
          // uśredniony wzdłuż tej drogi. Wnętrze auta (bliżej niż ~2,5 m) jedzie z kamerą — zostaje ostre
          // i nie rozmazuje się na drogę.
          if (blurK > 0.0) {
            vec4 wp = invVP * vec4(vUv * 2.0 - 1.0, z0 * 2.0 - 1.0, 1.0);
            vec4 pc = prevVP * vec4(wp.xyz / wp.w, 1.0);    // poprzednia klatka: obrót i przesunięcie kamery
            vec4 pt = prevTVP * vec4(wp.xyz / wp.w, 1.0);   // samo przesunięcie (obrót jak teraz)
            vec2 vAll = vUv - (pc.xy / pc.w * 0.5 + 0.5), vT = vUv - (pt.xy / pt.w * 0.5 + 0.5);
            // jazda rozmywa wyraźnie, rozglądanie się — ledwie
            vec2 vel = (vT * blurK + (vAll - vT) * blurR) * smoothstep(2.5, 6.0, dist);
            if (pc.w <= 0.0 || pt.w <= 0.0) vel = vec2(0.0);
            float vl = length(vel);
            if (vl > 0.045) vel *= 0.045 / vl;
            speed = min(vl, 0.045);
            if (speed > 0.0012) {
              float wsum = 1.0;
              for (int i = 1; i <= 5; i++) {
                vec2 uv = clamp(vUv - vel * (float(i) / 5.0), vec2(0.001), vec2(0.999));
                float zt = rawZ(uv);
                float dt = 2.0 * near * far / (far + near - (zt * 2.0 - 1.0) * (far - near));
                float w = step(2.5, dt);
                c += texture2D(tColor, uv).rgb * w; wsum += w;
              }
              c /= wsum;
            }
          }
          edge *= 1.0 - smoothstep(0.004, 0.018, speed);                // w pędzie kreska rozpływa się w smugę
          c *= mix(vec3(1.0), vec3(0.2, 0.12, 0.1), edge * inkK);   // ciepły, ciemnobrązowy tusz
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // korekcja kolorów (jak GRADE w materiałach) + spłaszczenie jasności w stopnie
          vec3 go = gl_FragColor.rgb, gc = go;
          float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
          gc = mix(vec3(gl), gc, 1.14);
          gc = pow(max(gc, vec3(0.0)), vec3(1.12));
          gc *= mix(vec3(0.96, 0.84, 0.98), vec3(1.08, 1.0, 0.86), smoothstep(0.04, 0.5, gl));
          gc = mix(gc, gc * gc * (3.0 - 2.0 * gc), 0.25);
          float l2 = max(dot(gc, vec3(0.2126, 0.7152, 0.0722)), 0.0001), x = l2 * 6.0;
          float band = (floor(x) + smoothstep(0.1, 0.9, fract(x))) / 6.0;
          gc *= mix(1.0, band / l2, 0.3);
          gl_FragColor.rgb = max(mix(go, gc * 0.98, min(gradeDark, 1.0)) * (gradeDark > 1.0 ? 1.0 / gradeDark : 1.0), vec3(0.0));
        }`,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g, this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.Camera();
    this.vp = new THREE.Matrix4();
    this.prev = null;
    this.blur = true; // rozmycie ruchu (klawisz B)
  }

  render(renderer, scene, camera, dt = 1 / 60) {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(4, Math.floor(this.size.x)), h = Math.max(4, Math.floor(this.size.y));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const u = this.mat.uniforms, g = GRADE_UNIFORM.value;
    u.texel.value.set(1 / w, 1 / h);
    u.near.value = camera.near; u.far.value = camera.far;
    u.pxa.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / h; // kąt jednego piksela
    u.gradeDark.value = g;
    GRADE_UNIFORM.value = 0; // materiały bez własnej korekcji: robi ją ten przebieg, po mapowaniu tonów
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, camera);
    this.calls = renderer.info.render.calls;
    // macierze do rozmycia ruchu: bieżąca odwrotna i poprzednia widok×rzut; siła niezależna od FPS
    this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.invVP.value.copy(this.vp).invert();
    if (!this.prev) { this.prev = this.vp.clone(); this.prevPos = camera.getWorldPosition(new THREE.Vector3()); this.q = new THREE.Quaternion(); this.m = new THREE.Matrix4(); this.one = new THREE.Vector3(1, 1, 1); this.pos = new THREE.Vector3(); }
    u.prevVP.value.copy(this.prev);
    // kamera z poprzedniej pozycji, ale z dzisiejszym obrotem → sam ruch postępowy
    camera.getWorldQuaternion(this.q);
    this.m.compose(this.prevPos, this.q, this.one).invert();
    u.prevTVP.value.multiplyMatrices(camera.projectionMatrix, this.m);
    const k = this.blur ? Math.min(2, 1 / 60 / Math.max(1e-3, dt)) : 0;
    u.blurK.value = 1.25 * k; u.blurR.value = 0.1 * k;
    camera.getWorldPosition(this.prevPos);
    this.prev.copy(this.vp);
    GRADE_UNIFORM.value = g;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }
}
