// Test rozruchowy: uruchamia PRAWDZIWY src/main.js w Node (atrapa DOM i renderera, bez GPU) i przechodzi
// scenariusz: Enter → jazda → klakson → hamowanie → wysiadanie → strzał → przeładowanie → kucanie → skok → wsiadanie.
//   node scripts/boot-test.mjs
import { register } from 'node:module';
register('./boot-hooks.mjs', import.meta.url);

const noop = () => {};
const L = {}, DL = {};
const addTo = (m) => (type, fn) => { (m[type] ??= []).push(fn); };
const fire = (m, type, ev = {}) => { for (const fn of m[type] || []) fn({ preventDefault: noop, stopPropagation: noop, repeat: false, ...ev }); };
const gradient = () => ({ addColorStop: noop });
const ctx = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? gradient : k === 'measureText' ? () => ({ width: 100 }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : t[k] ?? noop), set: (t, k, v) => { t[k] = v; return true; } });
let errors = 0;
const el = (id = '') => {
  const o = { id, style: {}, width: 0, height: 0, textContent: '', innerHTML: '', addEventListener: noop, appendChild: noop, requestPointerLock: noop, getContext: () => ctx, setAttribute: noop,
    classList: { add: (c) => { if (c === 'error') errors++; }, remove: noop, toggle: noop } };
  return o;
};
const els = new Map();
globalThis.document = { createElement: () => el(), getElementById: (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); }, addEventListener: addTo(DL), pointerLockElement: null, body: el('body') };
globalThis.addEventListener = addTo(L);
globalThis.window = globalThis;
globalThis.location = { search: '?test&local&high' };
globalThis.devicePixelRatio = 1; globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.Image = class { set src(v) { this.width = 400; this.height = 300; setTimeout(() => this.onload?.(), 0); } };
globalThis.requestAnimationFrame = noop;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('uncaughtException', (e) => { errors++; console.log('WYJĄTEK', e.stack?.split('\n').slice(0, 4).join(' | ')); });
process.on('unhandledRejection', (e) => { errors++; console.log('ODRZUCENIE', e?.stack?.split('\n').slice(0, 4).join(' | ') || e); });

const t0 = performance.now();
await import('../src/main.js');
for (let i = 0; i < 400 && !globalThis.__game; i++) await sleep(50);
const G = globalThis.__game;
if (!G) { console.log('BŁĄD: gra się nie uruchomiła', errors); process.exit(1); }
console.log('rozruch ms', Math.round(performance.now() - t0));

const key = (code, down = true) => fire(L, down ? 'keydown' : 'keyup', { code });
const frames = async (n) => { for (let i = 0; i < n; i++) { G.frame(); if (i % 30 === 0) await sleep(0); } };
fire(L, 'keydown', { code: 'Enter' });
await frames(5);
// jazda
key('KeyW'); await frames(120); key('KeyD'); await frames(40); key('KeyD', false); key('KeyQ'); await frames(20); key('KeyQ', false);
console.log({ jazda: true, kmh: Math.round(G.car.kmh), pozycja: [Math.round(G.car.pos.x), Math.round(G.car.pos.z)], boty: G.traffic.bots.length, ludzie: G.crowd.count });
key('KeyW', false); key('KeyS'); await frames(150); key('KeyS', false);
console.log({ staje: Math.round(G.car.kmh) });
// wysiadanie
key('KeyE');
await frames(3);
console.log({ pieszo: !G.car.active, bron: G.weapon.active });
const ammo0 = G.weapon.ammo;
fire(L, 'mousedown', { button: 0 }); await frames(5); fire(L, 'mouseup', { button: 0 });
await frames(80);
console.log({ strzal: ammo0 - G.weapon.ammo });
fire(L, 'mousedown', { button: 2 }); await frames(30); fire(L, 'mouseup', { button: 2 });
key('KeyR'); await frames(100);
console.log({ ammo: G.weapon.ammo, rezerwa: G.weapon.reserve });
key('KeyW'); await frames(60); const v1 = G.player.speed; key('ShiftLeft'); await frames(60); const v2 = G.player.speed; key('ShiftLeft', false);
key('KeyC'); await frames(40); const v3 = G.player.speed; key('KeyC', false);
key('Space'); await frames(10); key('Space', false); await frames(30); key('KeyW', false);
console.log({ marsz: v1.toFixed(2), bieg: v2.toFixed(2), kucanie: v3.toFixed(2), wytrzymalosc: G.player.stamina.toFixed(2) });
// wsiadanie
G.player.pos.set(G.car.pos.x + 2, G.car.pos.y, G.car.pos.z);
key('KeyE'); await frames(5);
console.log({ wsiadl: G.car.active, amunicja: G.weapon.ammo + '/' + G.weapon.reserve });
await frames(300);
fire(L, 'keydown', { code: 'KeyP' });
console.log({ klatek: G.renderer.frames, bledy: errors, ms: Math.round(performance.now() - t0), fragmenty: G.streamer.loaded, tri: G.streamer.tris });
process.exit(errors ? 1 : 0);
