// Materiały PBR. UV wszystkich modułów są w metrach świata, więc "repeat"
// tekstury = 1 / rozmiar kafla w metrach.
import * as THREE from 'three';
import { createTextures } from './textures.js';
import { createPosterAtlas, Telescreen } from './posters.js';

function tex(set, sx, sy = sx) {
  const map = set.map.clone(), normalMap = set.normalMap.clone();
  for (const t of [map, normalMap]) {
    t.repeat.set(1 / sx, 1 / sy);
    t.needsUpdate = true;
  }
  return { map, normalMap };
}

export function createMaterials() {
  const T = createTextures();
  const telescreen = new Telescreen();
  const atlas = createPosterAtlas();
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });

  const M = {
    plaster: std({ ...tex(T.plaster, 3.2), roughness: 0.93, normalScale: new THREE.Vector2(0.9, 0.9) }),
    brick: std({ ...tex(T.brick, 1.04, 0.9), roughness: 0.9, normalScale: new THREE.Vector2(1.1, 1.1) }),
    stone: std({ ...tex(T.stone, 2.2), roughness: 0.85 }),
    roof: std({ ...tex(T.roof, 2.0), roughness: 0.55, metalness: 0.35 }),
    cobble: std({ ...tex(T.cobble, 1.7), roughness: 0.72, normalScale: new THREE.Vector2(1.6, 1.6) }),
    slab: std({ ...tex(T.slab, 2.0), roughness: 0.88 }),
    curb: std({ ...tex(T.curb, 1.0), roughness: 0.7 }),
    wood: std({ roughness: 0.65 }),
    metal: std({ roughness: 0.5, metalness: 0.45 }),
    glass: std({ roughness: 0.06, metalness: 0.15, envMapIntensity: 1.6 }),
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
  return { M, telescreen };
}
