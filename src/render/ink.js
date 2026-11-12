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
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    // blask: łańcuch małych tekstur (1/4 i 1/16 rozdzielczości) rozmywany prawdziwym gaussem — mipmapy dawały blokowe „kwadraty”
    const mk = () => { const t = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }); t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; t.texture.generateMipmaps = false; return t; };
    this.g1 = mk(); this.g1b = mk(); this.g2 = mk(); this.g2b = mk();
    this.rt.depthTexture.minFilter = this.rt.depthTexture.magFilter = THREE.NearestFilter;
    this.mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) }, near: { value: 0.2 }, far: { value: 2200 }, pxa: { value: 0.001 },
        gradeDark: { value: 1 }, inkK: { value: 0.82 },
        invVP: { value: new THREE.Matrix4() }, prevVP: { value: new THREE.Matrix4() }, prevTVP: { value: new THREE.Matrix4() }, blurK: { value: 0 }, blurR: { value: 0 },
        tanF: { value: new THREE.Vector2(1, 1) },
        glowK: { value: 0.6 }, tG1: { value: this.g1.texture }, tG2: { value: this.g2.texture },
        inkW: { value: 0.028 }, // grubość kreski w metrach (na odległości 1 m = tyle metrów)
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far; uniform float pxa; uniform float gradeDark; uniform float inkK; uniform mat4 invVP; uniform mat4 prevVP; uniform mat4 prevTVP; uniform float blurK; uniform float blurR; uniform float inkW; uniform vec2 tanF; uniform float glowK; uniform sampler2D tG1; uniform sampler2D tG2;
        varying vec2 vUv;
        float rawZ(vec2 uv){ return texture2D(tDepth, uv).x; }
        float zdist(float z){ return 2.0 * near * far / (far + near - (z * 2.0 - 1.0) * (far - near)); }
        vec3 vpos(vec2 uv, float z){ float d = zdist(z); return vec3((uv * 2.0 - 1.0) * tanF * d, -d); } // pozycja w układzie kamery
        void main(){
          vec3 c = textureLod(tColor, vUv, 0.0).rgb;
          float z0 = rawZ(vUv);
          float speed = 0.0;
          // odległość w metrach; kreska ma grubość „w świecie”: z bliska gruba (do 3,4 px), z daleka
          // cienka i coraz bledsza — dal nie zarasta kreskami, a to, co blisko, jest wyraźnie obrysowane
          float dist = 2.0 * near * far / (far + near - (z0 * 2.0 - 1.0) * (far - near));
          float rad = clamp(inkW / (dist * pxa), 1.2, 3.4);
          vec2 o = texel * rad;
          // Krawędź z KIERUNKU powierzchni: z pięciu próbek głębi powstają dwa wektory normalne tego samego
          // piksela (z sąsiadów prawy+górny i lewy+dolny). Na płaskiej ścianie są równe; na narożniku różnią
          // się o kąt narożnika, na sylwetce — mocno. Kąt nie zależy od odległości ani rozdzielczości,
          // więc kreska jest zawsze albo jej nie ma: nie mruga i widać ją także w dali.
          vec3 p0 = vpos(vUv, z0);
          vec3 pr = vpos(vUv + vec2(o.x, 0.0), rawZ(vUv + vec2(o.x, 0.0))), pl = vpos(vUv - vec2(o.x, 0.0), rawZ(vUv - vec2(o.x, 0.0)));
          vec3 pu = vpos(vUv + vec2(0.0, o.y), rawZ(vUv + vec2(0.0, o.y))), pd = vpos(vUv - vec2(0.0, o.y), rawZ(vUv - vec2(0.0, o.y)));
          vec3 c0 = cross(pr - p0, pu - p0), c1 = cross(pl - p0, pd - p0);
          vec3 n0 = c0 / max(length(c0), 1e-9), n1 = c1 / max(length(c1), 1e-9);
          float bend = clamp(1.0 - dot(n0, n1), 0.0, 2.0);
          // „zamazanie” dali: ostro blisko, coraz bardziej rozmyte od ok. 30 m (jak słabszy wzrok)
          float haze = smoothstep(30.0, 170.0, dist);
          float edge = smoothstep(0.1, 0.42, bend) * (1.0 - 0.55 * haze) * (1.0 - smoothstep(200.0, 330.0, dist));
          if (haze > 0.12) {
            float br = haze * 4.5, wsum = 1.0;
            for (int i = 0; i < 5; i++) {
              float a = float(i) * 2.399963 + 0.7, rr = sqrt((float(i) + 0.5) / 5.0) * br;
              vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * texel;
              float w = step(0.6 * dist, zdist(rawZ(uv)));   // nie wciągaj tego, co stoi bliżej (auto, słup)
              c += texture2D(tColor, uv).rgb * w; wsum += w;
            }
            c /= wsum;
          }
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
            if (speed > 0.002) {
              float wsum = 1.0;
              for (int i = 1; i <= 4; i++) {
                vec2 uv = clamp(vUv - vel * (float(i) / 4.0), vec2(0.001), vec2(0.999));
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
          // blask rozlany we mgle: rozmyte kopie obrazu (łańcuch gaussa) dodane z powrotem. Nocą obraz jest ciemny,
          // więc świeci to, co świeci — okna, latarnie, reflektory — a im dalej (gęstsza mgła), tym szerzej.
          vec3 glow = min(texture2D(tG1, vUv).rgb, vec3(4.0)) * 0.5 + min(texture2D(tG2, vUv).rgb, vec3(3.0)) * 0.6;
          if (!(glow.r < 50.0 && glow.g < 50.0 && glow.b < 50.0)) glow = vec3(0.0); // NaN/inf w mipmapach: bez kwadratów
          c += glow * glowK * (0.6 + 0.9 * haze);
          c = max(min(c, vec3(8.0)), vec3(0.0)); // bez inf/NaN (kwadraty)
          if (!(c.r < 50.0 && c.g < 50.0 && c.b < 50.0)) c = vec3(0.0);
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
          float band = (floor(x) + smoothstep(0.2, 0.8, fract(x))) / 6.0;
          gc *= mix(1.0, band / l2, 0.5);
          gl_FragColor.rgb = max(mix(go, gc * 0.98, min(gradeDark, 1.0)) * (gradeDark > 1.0 ? 1.0 / gradeDark : 1.0), vec3(0.0));
        }`,
    });
    const PV = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    // zmniejszenie 4× (pudełko 4×4 z czterech próbek dwuliniowych); prefilter: tylko jasne, bez NaN/inf
    this.down = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, st: { value: new THREE.Vector2() }, pre: { value: 1 } }, vertexShader: PV,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 st; uniform float pre; varying vec2 vUv;
        vec3 fx(vec3 v){ if (!(v.r < 60.0 && v.g < 60.0 && v.b < 60.0)) v = vec3(0.0); return min(v, vec3(6.0)); }
        void main(){ vec3 s = fx(texture2D(tSrc, vUv + st * vec2(-1.0, -1.0)).rgb) + fx(texture2D(tSrc, vUv + st * vec2(1.0, -1.0)).rgb) + fx(texture2D(tSrc, vUv + st * vec2(-1.0, 1.0)).rgb) + fx(texture2D(tSrc, vUv + st * vec2(1.0, 1.0)).rgb);
          s *= 0.25; if (pre > 0.5) s = max(s - 0.04, vec3(0.0)); gl_FragColor = vec4(s, 1.0); }` });
    // gauss separowalny: 5 próbek dwuliniowych = 9 teksów (wagi dwumianowe)
    this.blurM = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: PV,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
        void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270 + (texture2D(tSrc, vUv + dir * 1.3846153846).rgb + texture2D(tSrc, vUv - dir * 1.3846153846).rgb) * 0.3162162162 + (texture2D(tSrc, vUv + dir * 3.2307692308).rgb + texture2D(tSrc, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
          gl_FragColor = vec4(s, 1.0); }` });
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

  // jeden przebieg pełnoekranowy z danym materiałem do danego celu
  pass(renderer, mat, target) {
    this.quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }

  // blask: scena → 1/4 (prefilter) → gauss → 1/16 → gauss; wszystko na małych teksturach, koszt pomijalny
  glowChain(renderer, w, h) {
    const w1 = Math.max(4, w >> 2), h1 = Math.max(4, h >> 2), w2 = Math.max(4, w >> 4), h2 = Math.max(4, h >> 4);
    if (this.g1.width !== w1 || this.g1.height !== h1) { this.g1.setSize(w1, h1); this.g1b.setSize(w1, h1); this.g2.setSize(w2, h2); this.g2b.setSize(w2, h2); }
    const D = this.down.uniforms, B = this.blurM.uniforms;
    D.tSrc.value = this.rt.texture; D.st.value.set(1 / w, 1 / h); D.pre.value = 1;
    this.pass(renderer, this.down, this.g1);
    B.tSrc.value = this.g1.texture; B.dir.value.set(1.4 / w1, 0); this.pass(renderer, this.blurM, this.g1b);
    B.tSrc.value = this.g1b.texture; B.dir.value.set(0, 1.4 / h1); this.pass(renderer, this.blurM, this.g1);
    D.tSrc.value = this.g1.texture; D.st.value.set(1 / w1, 1 / h1); D.pre.value = 0;
    this.pass(renderer, this.down, this.g2);
    B.tSrc.value = this.g2.texture; B.dir.value.set(1.8 / w2, 0); this.pass(renderer, this.blurM, this.g2b);
    B.tSrc.value = this.g2b.texture; B.dir.value.set(0, 1.8 / h2); this.pass(renderer, this.blurM, this.g2);
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
    { const t = Math.tan((camera.fov * Math.PI) / 360); u.tanF.value.set(t * camera.aspect, t); }
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
    this.glowChain(renderer, w, h);
    renderer.setRenderTarget(null);
    this.quad.material = this.mat;
    renderer.render(this.scene, this.cam);
  }
}
