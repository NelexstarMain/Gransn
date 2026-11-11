// Słoneczne popołudnie nad wyspą; lekka mgiełka ukrywa granicę LOD-ów.
import * as THREE from 'three';

// Wspólne liczby światła — używa ich też aparat do zdjęć (scripts/photo.mjs).
export const LIGHTS = {
  fog: 0xa4b2b8, fogDensity: 0.0026,
  hemiSky: 0xc4d6e8, hemiGround: 0x4a4034, hemiIntensity: 0.62,
  sun: 0xffd8a8, sunIntensity: 3.0, sunDir: [-0.55, 0.5, 0.42],
  skyTop: 0x4a78a6, envGround: 0x4a4740, envIntensity: 0.4, exposure: 0.92,
};
export const FOG_COLOR = new THREE.Color(LIGHTS.fog);

export function createAtmosphere(scene, renderer) {
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR, LIGHTS.fogDensity);

  const hemi = new THREE.HemisphereLight(LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity);
  scene.add(hemi);

  // niższe, cieplejsze słońce popołudniowe — dłuższe cienie, złote światło na fasadach
  const sun = new THREE.DirectionalLight(LIGHTS.sun, LIGHTS.sunIntensity);
  sun.castShadow = true;
  let shadowRes = 2048;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80;
  sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(...LIGHTS.sunDir).normalize();

  // kopuła nieba: gradient, poświata słońca, chmury (szum w shaderze, bez tekstur).
  // Rysowana NA KOŃCU z głębią na płaszczyźnie dalekiej: karta liczy niebo tylko tam, gdzie nic go
  // nie zasłania (wcześniej cały ekran był cieniowany pod miastem). Dithering usuwa pasy w gradiencie.
  const skyUni = { top: { value: new THREE.Color(LIGHTS.skyTop) }, horizon: { value: FOG_COLOR.clone() }, sunDir: { value: sunDir }, time: { value: 0 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: skyUni,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = (projectionMatrix * modelViewMatrix * vec4(position,1.0)).xyww; }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float time; varying vec3 vDir;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
        void main(){
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float d = max(dot(dir, sunDir), 0.0);
          vec3 sunC = vec3(1.0, 0.82, 0.58);
          c += sunC * (0.22 * pow(d, 6.0) + 0.16 * pow(d, 24.0)) + vec3(1.6, 1.4, 1.1) * pow(d, 900.0);
          // chmury: warstwa płaska nad miastem, zanikają ku horyzontowi (w mgle)
          if (dir.y > 0.03) {
            vec2 uv = dir.xz / (dir.y + 0.18) * 1.6 + vec2(time * 0.012, time * 0.004);
            float n = vn(uv) * 0.55 + vn(uv * 2.1 + 7.3) * 0.3 + vn(uv * 4.3 + 2.7) * 0.15;
            float cl = smoothstep(0.52, 0.82, n) * smoothstep(0.03, 0.30, dir.y);
            vec3 cc = mix(vec3(0.62, 0.66, 0.72), vec3(1.0, 0.96, 0.9), smoothstep(0.5, 0.95, n));
            cc += sunC * 0.35 * pow(d, 3.0);            // srebrne krawędzie od strony słońca
            c = mix(c, cc, cl * 0.85);
          }
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
          gl_FragColor.rgb += (h21(gl_FragCoord.xy + fract(time)) - 0.5) / 255.0;
        }`,
    }),
  );
  sky.renderOrder = 1e6;
  sky.frustumCulled = false;
  scene.add(sky);

  // mapa otoczenia dla odbić w szybach
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envSky.material = sky.material.clone();
  envScene.add(envSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1500, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: LIGHTS.envGround }));
  ground.position.y = -20;
  envScene.add(ground);
  // sylwetka miasta na horyzoncie — w szybach odbijają się "domy", nie tylko niebo
  const sil = new THREE.Group();
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + Math.sin(i * 7.1) * 0.02, h = 30 + ((i * 37) % 11) * 9, w = 40 + ((i * 13) % 7) * 6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.08 + ((i * 17) % 10) * 0.012, 0.18, 0.32 + ((i * 7) % 5) * 0.05) }));
    m.position.set(Math.cos(a) * 320, h / 2 - 20, Math.sin(a) * 320);
    m.lookAt(0, h / 2 - 20, 0);
    sil.add(m);
  }
  envScene.add(sil);
  // słońce w odbiciach
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(40, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.2, 4) }));
  sunDisc.position.copy(sunDir).multiplyScalar(1200);
  envScene.add(sunDisc);
  scene.environment = pmrem.fromScene(envScene, 0.015).texture;
  scene.environmentIntensity = LIGHTS.envIntensity;

  return {
    sun,
    sky,
    setShadowRes(n) {
      if (n === shadowRes) return;
      shadowRes = n;
      sun.shadow.mapSize.set(n, n);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
    update(camPos, t = 0) {
      sky.position.copy(camPos);
      skyUni.time.value = t;
      // cienie podążają za graczem, przyciągnięte do siatki tekseli (bez migotania)
      const step = 160 / shadowRes;
      const tx = Math.round(camPos.x / step) * step, tz = Math.round(camPos.z / step) * step;
      sun.target.position.set(tx, 0, tz);
      sun.position.set(tx + sunDir.x * 200, sunDir.y * 200, tz + sunDir.z * 200);
    },
  };
}
