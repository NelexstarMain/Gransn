// Web Worker: generuje geometrię kwartałów poza wątkiem renderującym.
// Układ miasta odtwarzany jest z seeda (deterministycznie), więc do workera
// wysyłamy tylko { kind, id } — z powrotem wracają gołe TypedArray'e.
import { generateCity } from '../city/layout.js';
import { buildBlock, buildBlockLOD, buildGroundTile } from './assemble.js';

let city = null;

self.onmessage = (e) => {
  const { job, seed, kind, id, tx, tz } = e.data;
  if (!city || city.seed !== seed) city = generateCity(seed);
  let out;
  if (kind === 'block') out = buildBlock(city, id);
  else if (kind === 'lod') out = buildBlockLOD(city, id);
  else if (kind === 'ground') out = buildGroundTile(city, tx, tz);
  self.postMessage({ job, mats: out.mats }, out.transfer);
};
