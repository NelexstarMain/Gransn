// Zestaw siatek aut dla gry: karoseria (per typ i poziom detalu) i koło (wspólne),
// zbudowane z tych samych modułów co zaparkowane auta w mieście.
// Karoserie dla ruchu mają BIAŁY lakier — kolor egzemplarza dokłada instanceColor.
import * as THREE from 'three';
import { Builder } from '../gen/builder.js';
import { Cage } from '../gen/cage.js';
import { vehicleModules, CAR_KINDS, carAnchors } from '../gen/vehicles.js';

// siatka modułu (wycentrowana w xz) jako lista { name, geometry, material }
export function modelParts(fn, W, H, D, p, M) {
  const b = new Builder();
  b.cell(Cage.quad([-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], 0, H), W, H, D);
  fn(b, W, H, D, p);
  const out = [];
  for (const [name, buf] of Object.entries(b.finish().mats)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(buf.n, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(buf.c, 3, true));
    g.setIndex(new THREE.BufferAttribute(buf.i, 1));
    g.computeBoundingSphere();
    out.push({ name, geometry: g, material: M[name] });
  }
  return out;
}

// nominalne promienie kół: szprychowe 0.45, pełne 0.5 — mesh skaluje się do r / nominał
export const WHEEL_NOMINAL = { spoke: 0.45, solid: 0.5 };

export class CarKit {
  constructor(M) {
    this.M = M;
    this.cache = new Map();
    this.kinds = CAR_KINDS;
  }

  // karoseria bez kół
  body(kind, q = 1, color = [1, 1, 1]) {
    const key = `b|${kind}|${q}|${color.join(',')}`;
    let v = this.cache.get(key);
    if (!v) {
      const K = CAR_KINDS[kind];
      v = modelParts(vehicleModules.oldcar, K.L, 2.4, K.Wd, { kind, color, q, wheels: false, taxi: !!K.taxi, seat: [0.3, 0.13, 0.09], band: [0.95, 0.92, 0.82] }, this.M);
      this.cache.set(key, v);
    }
    return v;
  }

  // koło o środku w początku układu, oś wzdłuż z, piasta po obu stronach
  wheel(solid, q = 1) {
    const key = `w|${solid}|${q}`;
    let v = this.cache.get(key);
    if (!v) {
      const nom = solid ? WHEEL_NOMINAL.solid : WHEEL_NOMINAL.spoke;
      v = modelParts(vehicleModules.carwheel, 1, 1, 1, { r: nom, q, side: 0, solid, rim: solid ? [0.5, 0.17, 0.12] : undefined, hr: solid ? 0.08 : 0.058, hw: solid ? 0.085 : 0.066 }, this.M);
      for (const p of v) { p.geometry.translate(0, -0.5, 0); p.geometry.computeBoundingSphere(); }
      this.cache.set(key, v);
    }
    return v;
  }

  anchors(kind) {
    return carAnchors(kind);
  }
}
