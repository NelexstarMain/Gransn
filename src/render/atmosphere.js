// Słoneczne popołudnie nad wyspą; lekka mgiełka ukrywa granicę LOD-ów.
import * as THREE from 'three';

export const FOG_COLOR = new THREE.Color(0xc4d2d8);

export function createAtmosphere(scene, renderer) {
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0026);

  const hemi = new THREE.HemisphereLight(0xd6e6f4, 0x6a5a44, 1.05);
  scene.add(hemi);

  // niższe, cieplejsze słońce popołudniowe — dłuższe cienie, złote światło na fasadach
  const sun = new THREE.DirectionalLight(0xffe0b8, 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80;
  sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(-0.55, 0.5, 0.42).normalize();

  // kopuła nieba z gradientem (bez mgły)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x5f93c4) }, horizon: { value: FOG_COLOR.clone() }, sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.6));
          float d = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(0.35, 0.28, 0.18) * pow(d, 12.0) + vec3(1.6, 1.4, 1.1) * pow(d, 900.0);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // mapa otoczenia dla odbić w szybach
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envSky.material = sky.material.clone();
  envScene.add(envSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1500, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4740 }));
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
  scene.environmentIntensity = 0.6;

  return {
    sun,
    sky,
    update(camPos) {
      sky.position.copy(camPos);
      // cienie podążają za graczem, przyciągnięte do siatki tekseli (bez migotania)
      const step = 160 / 2048;
      const tx = Math.round(camPos.x / step) * step, tz = Math.round(camPos.z / step) * step;
      sun.target.position.set(tx, 0, tz);
      sun.position.set(tx + sunDir.x * 200, sunDir.y * 200, tz + sunDir.z * 200);
    },
  };
}
