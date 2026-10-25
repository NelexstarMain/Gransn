// Web Worker: generuje geometrię kwartałów poza wątkiem renderującym.
// Układ miasta odtwarzany jest z seeda (deterministycznie), więc do workera
// wysyłamy tylko { kind, id } — z powrotem wracają gołe TypedArray'e.
import { generateCity } from '../city/layout.js';
import { buildChunk, buildChunkLOD, buildGroundTile, buildRiver } from './assemble.js';

let city = null;

self.onmessage = (e) => {
  const { job, seed, kind, id, tx, tz } = e.data;
  if (!city || city.seed !== seed) city = generateCity(seed);
  let out;
  if (kind === 'block') out = buildChunk(city, id);
  else if (kind === 'lod') out = buildChunkLOD(city, id);
  else if (kind === 'ground') out = buildGroundTile(city, tx, tz);
  else if (kind === 'river') out = buildRiver(city);
  self.postMessage({ job, mats: out.mats }, out.transfer);
};
