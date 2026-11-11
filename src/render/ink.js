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
//  Bez wygładzania krawędzi MSAA (tekstura z głębią) — kreska sama maskuje ząbki.
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
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: new THREE.DepthTexture(4, 4) });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.rt.depthTexture.minFilter = this.rt.depthTexture.magFilter = THREE.NearestFilter;
    this.mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) }, near: { value: 0.2 }, far: { value: 2200 }, pxa: { value: 0.001 },
        gradeDark: { value: 1 }, inkK: { value: 0.82 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far; uniform float pxa; uniform float gradeDark; uniform float inkK;
        varying vec2 vUv;
        float rawZ(vec2 uv){ return texture2D(tDepth, uv).x; }
        void main(){
          vec3 c = texture2D(tColor, vUv).rgb;
          float z0 = rawZ(vUv);
          float zl = rawZ(vUv - vec2(texel.x, 0.0)), zr = rawZ(vUv + vec2(texel.x, 0.0));
          float zd = rawZ(vUv - vec2(0.0, texel.y)), zu = rawZ(vUv + vec2(0.0, texel.y));
          // odległość w metrach i druga różnica głębi przeliczona na względny skok (Δz / z)
          float dist = 2.0 * near * far / (far + near - (z0 * 2.0 - 1.0) * (far - near));
          float lap = (abs(zl + zr - 2.0 * z0) + abs(zd + zu - 2.0 * z0)) * dist / near;
          float edge = smoothstep(0.7 * pxa, 1.9 * pxa, lap) * (1.0 - smoothstep(110.0, 300.0, dist));
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
          float band = (floor(x) + smoothstep(0.25, 0.75, fract(x))) / 6.0;
          gc *= mix(1.0, band / l2, 0.5);
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
  }

  render(renderer, scene, camera) {
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
    GRADE_UNIFORM.value = g;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }
}
