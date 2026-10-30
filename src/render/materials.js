// Materiały PBR. UV wszystkich modułów są w metrach świata, więc "repeat"
// tekstury = 1 / rozmiar kafla w metrach.
import * as THREE from 'three';
import { createTextures } from './textures.js';
import { createPosterAtlas, Telescreen } from './posters.js';
import { SURFACE, depthOffset } from './layers.js';

function tex(set, sx, sy = sx) {
  const map = set.map.clone(), normalMap = set.normalMap.clone();
  for (const t of [map, normalMap]) {
    t.repeat.set(1 / sx, 1 / sy);
    t.needsUpdate = true;
  }
  return { map, normalMap };
}

// Color grading w shaderze materiału (bez postprocessingu, bez dodatkowego przejścia):
// ciemniejsze cienie i półcienie, stonowane kolory, chłodne cienie / ciepłe światła.
export const GRADE_UNIFORM = { value: 1 }; // 0 = bez gradingu, 1 = domyślny, >1 = ciemniej (ustawienia)
const GRADE = `
  {
    vec3 go = gl_FragColor.rgb;
    vec3 gc = go;
    float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
    gc = mix(vec3(gl), gc, 0.80);                         // mniej nasycone
    gc = pow(max(gc, vec3(0.0)), vec3(1.28));             // ciemniejsze cienie i półtony
    gc *= mix(vec3(0.86, 0.93, 1.07), vec3(1.06, 1.02, 0.93), smoothstep(0.05, 0.55, gl)); // zimne cienie, ciepłe światła
    gc = mix(gc, gc * gc * (3.0 - 2.0 * gc), 0.35);       // lekki kontrast S
    gl_FragColor.rgb = max(mix(go, gc * 0.94, gradeDark), vec3(0.0));
  }
`;
function grade(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.gradeDark = GRADE_UNIFORM;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'uniform float gradeDark;\n#include <common>').replace('#include <dithering_fragment>', GRADE + '#include <dithering_fragment>');
  };
  m.customProgramCacheKey = () => 'grade2';
}

export async function createMaterials() {
  const T = createTextures();
  const telescreen = new Telescreen();
  const atlas = await createPosterAtlas();
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });

  const M = {
    plaster: std({ ...tex(T.plaster, 3.2), roughness: 0.93, normalScale: new THREE.Vector2(0.9, 0.9) }),
    brick: std({ ...tex(T.brick, 1.04, 0.9), roughness: 0.9, normalScale: new THREE.Vector2(1.1, 1.1) }),
    stone: std({ ...tex(T.stone, 2.2), roughness: 0.85 }),
    frieze: std({ ...tex(T.frieze, 0.6, 0.8), roughness: 0.88, normalScale: new THREE.Vector2(1.6, 1.6) }),
    roof: std({ ...tex(T.roof, 2.0), roughness: 0.55, metalness: 0.35 }),
    cobble: std({ ...tex(T.cobble, 3.2), roughness: 0.72, normalScale: new THREE.Vector2(1.6, 1.6) }),
    slab: std({ ...tex(T.slab, 2.0), roughness: 0.88 }),
    curb: std({ ...tex(T.curb, 1.0), roughness: 0.7 }),
    grass: std({ ...tex(T.grass, 2.5), roughness: 0.95 }),
    lawn: std({ ...tex(T.grass, 2.5), roughness: 0.95 }),
    cobblep: std({ ...tex(T.cobble, 3.2), roughness: 0.72, normalScale: new THREE.Vector2(1.6, 1.6) }),
    sett: std({ ...tex(T.sett, 1.0), roughness: 0.8, normalScale: new THREE.Vector2(1.3, 1.3) }),
    lodwalk: std({ ...tex(T.slab, 2.0), roughness: 0.88 }),
    leaf: std({ ...tex(T.leaf, 1.6), roughness: 0.8, normalScale: new THREE.Vector2(1.4, 1.4) }),
    bark: std({ ...tex(T.bark, 0.8, 1.6), roughness: 0.95 }),
    sand: std({ ...tex(T.sand, 3), roughness: 0.95 }),
    gravel: std({ ...tex(T.gravel, 1.2), roughness: 0.95 }),
    asphalt: std({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, roughness: 0.8 }),
    paint: std({ roughness: 0.28, metalness: 0.3, envMapIntensity: 1.3 }),
    // lakier karoserii: barwiony per egzemplarz (instanceColor) albo wierzchołkami
    body: std({ roughness: 0.24, metalness: 0.35, envMapIntensity: 1.4 }),
    // tylne światła (w aucie gracza klonowane, żeby zapalać przy hamowaniu)
    tail: std({ color: 0x3a0c08, emissive: 0xff2a14, emissiveIntensity: 0.35, roughness: 0.4 }),
    // tkaniny i skóra ludzi: matowe, barwione instanceColor
    cloth: std({ roughness: 0.92, metalness: 0 }),
    tile: std({ ...tex(T.tile, 1.2, 0.9), roughness: 0.75, normalScale: new THREE.Vector2(1.4, 1.4) }),
    wood: std({ ...tex(T.wood, 0.5, 0.5), roughness: 0.65 }),
    metal: std({ roughness: 0.5, metalness: 0.45 }),
    // szkło: lustrzane odbicia otoczenia (niebo, słońce, sylwetka miasta) — bez kosztu w klatce
    glass: std({ roughness: 0.035, metalness: 0.9, envMapIntensity: 2.4 }),
    dark: std({ color: 0x1a1816, roughness: 1 }),
    light: std({ color: 0xfff1cc, emissive: 0xffe2a0, emissiveIntensity: 1.2 }),
    screen: new THREE.MeshStandardMaterial({ map: telescreen.texture, emissiveMap: telescreen.texture, emissive: 0xffffff, emissiveIntensity: 1.15, roughness: 0.3 }),
    poster: std({ map: atlas, roughness: 0.85 }),
    lod: std({ ...tex(T.lod, 1, 1), roughness: 0.9, side: THREE.DoubleSide }),
    lodroof: std({ roughness: 0.8, side: THREE.DoubleSide }),
  };
  // tekstura LOD — kafel = przęsło × kondygnacja (UV już w tych jednostkach)
  M.lod.map.repeat.set(1, 1);
  M.lod.normalMap.repeat.set(1, 1);
  M.poster.polygonOffset = true;
  M.poster.polygonOffsetFactor = -2;
  M.screen.polygonOffset = true;
  M.screen.polygonOffsetFactor = -2;
  const waterNormal = T.water.normalMap.clone();
  waterNormal.repeat.set(1 / 9, 1 / 9);
  waterNormal.needsUpdate = true;
  M.water = new THREE.MeshStandardMaterial({ color: 0x1d2c27, roughness: 0.22, metalness: 0.0, normalMap: waterNormal, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.7 });
  // warstwy nawierzchni: przesunięcie głębi wg tabeli z layers.js
  for (const name of Object.keys(SURFACE)) {
    const o = depthOffset(name);
    if (o && M[name]) Object.assign(M[name], o);
  }
  for (const m of Object.values(M)) grade(m);
  return { M, telescreen };
}
