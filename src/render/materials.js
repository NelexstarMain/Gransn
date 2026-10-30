// Materiały PBR. UV wszystkich modułów są w metrach świata, więc "repeat"
// tekstury = 1 / rozmiar kafla w metrach.
import * as THREE from 'three';
import { createTextures } from './textures.js';
import { createPosterAtlas, Telescreen } from './posters.js';
import { makeWearTexture, makeWearVolume, applyWear } from './wear.js';

function tex(set, sx, sy = sx) {
  const map = set.map.clone(), normalMap = set.normalMap.clone();
  for (const t of [map, normalMap]) {
    t.repeat.set(1 / sx, 1 / sy);
    t.needsUpdate = true;
  }
  return { map, normalMap };
}

export async function createMaterials({ low = false } = {}) {
  const T = createTextures();
  const wearTex = makeWearTexture();
  const wearVol = makeWearVolume();
  const telescreen = new Telescreen();
  const atlas = await createPosterAtlas();
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });

  const M = {
    plaster: std({ ...tex(T.plaster, 3.2), roughness: 0.93, normalScale: new THREE.Vector2(0.9, 0.9) }),
    brick: std({ ...tex(T.brick, 1.04, 0.9), roughness: 0.9, normalScale: new THREE.Vector2(1.1, 1.1) }),
    stone: std({ ...tex(T.stone, 2.2), roughness: 0.85 }),
    roof: std({ ...tex(T.roof, 2.0), roughness: 0.55, metalness: 0.35 }),
    // bruk i płyty: wzór i normalne liczy shader (każda kostka / płyta jest inna)
    cobble: std({ roughness: 0.72 }),
    slab: std({ roughness: 0.88 }),
    // bruk daleko (LOD): zwykła tekstura
    cobblelod: std({ ...tex(T.cobble, 1.7), roughness: 0.72, normalScale: new THREE.Vector2(1.6, 1.6) }),
    curb: std({ ...tex(T.curb, 1.0), roughness: 0.7 }),
    grass: std({ ...tex(T.grass, 2.5), roughness: 0.95 }),
    leaf: std({ ...tex(T.leaf, 1.6), roughness: 0.8, normalScale: new THREE.Vector2(1.4, 1.4) }),
    bark: std({ ...tex(T.bark, 0.8, 1.6), roughness: 0.95 }),
    sand: std({ ...tex(T.sand, 3), roughness: 0.95 }),
    gravel: std({ ...tex(T.gravel, 1.2), roughness: 0.95 }),
    asphalt: std({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, roughness: 0.8 }),
    paint: std({ roughness: 0.28, metalness: 0.3, envMapIntensity: 1.3 }),
    tile: std({ ...tex(T.tile, 1.2, 0.9), roughness: 0.75, normalScale: new THREE.Vector2(1.4, 1.4) }),
    wood: std({ roughness: 0.65 }),
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
  // zniszczenia, zacieki i bruk w shaderze — unikalne dla każdego budynku / kostki
  applyWear(M.plaster, 'plaster', wearTex, wearVol, low);
  applyWear(M.brick, 'brick', wearTex, wearVol, low);
  applyWear(M.stone, 'stone', wearTex, wearVol, low);
  applyWear(M.roof, 'sheet', wearTex, wearVol, low);
  applyWear(M.tile, 'tile', wearTex, wearVol, low);
  applyWear(M.cobble, 'cobble', wearTex, wearVol, low);
  applyWear(M.slab, 'slab', wearTex, wearVol, low);
  applyWear(M.asphalt, 'asphalt', wearTex, wearVol, low);
  applyWear(M.metal, 'metal', wearTex, wearVol, low);
  applyWear(M.wood, 'wood', wearTex, wearVol, low);
  M.poster.polygonOffset = true;
  M.poster.polygonOffsetFactor = -2;
  M.screen.polygonOffset = true;
  M.screen.polygonOffsetFactor = -2;
  const waterNormal = T.water.normalMap.clone();
  waterNormal.repeat.set(1 / 9, 1 / 9);
  waterNormal.needsUpdate = true;
  M.water = new THREE.MeshStandardMaterial({ color: 0x1d2c27, roughness: 0.22, metalness: 0.0, normalMap: waterNormal, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.7 });
  return { M, telescreen };
}
