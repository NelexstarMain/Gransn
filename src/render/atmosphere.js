// Pochmurne, zimne kwietniowe popołudnie: "Był jasny, zimny dzień kwietniowy
// i zegary biły trzynastą." Mgła ogranicza widoczność — i zasięg LOD-ów.
import * as THREE from 'three';

export const FOG_COLOR = new THREE.Color(0x9da39f);

export function createAtmosphere(scene, renderer) {
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0042);

  const hemi = new THREE.HemisphereLight(0xcfd6dc, 0x4b4740, 1.25);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0dc, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80;
  sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(-0.45, 0.78, 0.35).normalize();

  // kopuła nieba z gradientem (bez mgły)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x8d969c) }, horizon: { value: FOG_COLOR.clone() }, sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.6));
          float s = pow(max(dot(normalize(vDir), sunDir), 0.0), 24.0);
          c += vec3(0.25, 0.23, 0.2) * s;
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
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1500, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3936 }));
  ground.position.y = -20;
  envScene.add(ground);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;

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
