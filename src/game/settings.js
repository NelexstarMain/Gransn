// Ustawienia gracza: jakość (preset), rozdzielczość, cienie, zasięg detali, pole widzenia,
// czułość, ciemność kolorów, jasność, mgła. Zapis w localStorage (gdy dostępny).
// Zmiany działają od razu — bez przeładowania.
import { LIGHTS } from '../render/atmosphere.js';
import { GRADE_UNIFORM } from '../render/materials.js';

const KEY = 'gransn.settings.v2';

// preset = wartości dla: res (pixel ratio), shadow (0 wył., 1 niskie, 2 średnie, 3 wysokie), detail (m)
export const PRESETS = {
  low: { name: 'Niska', res: 0.75, shadow: 0, detail: 90 },
  medium: { name: 'Średnia', res: 1, shadow: 1, detail: 130 },
  high: { name: 'Wysoka', res: 1.5, shadow: 2, detail: 170 },
  ultra: { name: 'Ultra', res: 2, shadow: 3, detail: 240 },
};
export const SHADOW_RES = [0, 1024, 2048, 4096];
const SHADOW_NAMES = ['Wyłączone', 'Niskie', 'Średnie', 'Wysokie'];

export const DEFAULTS = {
  preset: 'high', res: 1.5, shadow: 2, detail: 170,
  fov: 72, sens: 1, dark: 1, bright: 1, fog: 1,
};

const CONTROLS = [
  { k: 'res', label: 'Rozdzielczość', min: 0.5, max: 2.5, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { k: 'detail', label: 'Zasięg detali', min: 60, max: 320, step: 10, fmt: (v) => `${v} m` },
  { k: 'fov', label: 'Pole widzenia (FOV)', min: 50, max: 110, step: 1, fmt: (v) => `${v}°` },
  { k: 'sens', label: 'Czułość kamery', min: 0.3, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { k: 'dark', label: 'Ciemność i kolory', min: 0, max: 1.6, step: 0.05, fmt: (v) => (v === 0 ? 'wył.' : `${Math.round(v * 100)}%`) },
  { k: 'bright', label: 'Jasność', min: 0.5, max: 1.6, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { k: 'fog', label: 'Mgła', min: 0, max: 2.5, step: 0.1, fmt: (v) => (v === 0 ? 'brak' : `${Math.round(v * 100)}%`) },
];

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...DEFAULTS, ...s };
  } catch { /* brak localStorage */ }
  return { ...DEFAULTS };
}

export class Settings {
  // ctx: { renderer, camera, scene, atmo, streamer, player, M, onOpen, onClose }
  constructor(ctx) {
    this.ctx = ctx;
    this.v = load();
    this.controls = {};
    this.build();
    this.applyAll();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* ignoruj */ }
  }

  set(k, val, fromPreset = false) {
    this.v[k] = val;
    if (!fromPreset && (k === 'res' || k === 'shadow' || k === 'detail')) this.v.preset = 'custom';
    this.apply(k);
    this.save();
    this.sync();
  }

  usePreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    this.v.preset = name;
    for (const k of ['res', 'shadow', 'detail']) { this.v[k] = p[k]; this.apply(k); }
    this.save();
    this.sync();
  }

  reset() {
    this.v = { ...DEFAULTS };
    this.applyAll();
    this.save();
    this.sync();
  }

  // przywraca zapisany zestaw ustawień (po trybie filmowym)
  restore(v) {
    this.v = { ...v };
    this.applyAll();
    this.save();
    this.sync();
  }

  applyAll() {
    for (const k of ['res', 'shadow', 'detail', 'fov', 'sens', 'dark', 'bright', 'fog']) this.apply(k);
  }

  apply(k) {
    const { renderer, camera, scene, atmo, streamer, player, M } = this.ctx, v = this.v;
    switch (k) {
      case 'res':
        renderer.setPixelRatio(v.res);
        renderer.setSize(innerWidth, innerHeight);
        break;
      case 'shadow': {
        const on = v.shadow > 0;
        if (renderer.shadowMap.enabled !== on) {
          renderer.shadowMap.enabled = on;
          for (const m of Object.values(M)) m.needsUpdate = true; // przekompiluj shadery
        }
        atmo.sun.castShadow = on;
        if (on) atmo.setShadowRes(SHADOW_RES[v.shadow]);
        break;
      }
      case 'detail':
        streamer.din = v.detail;
        streamer.dout = v.detail + 60;
        break;
      case 'fov':
        camera.fov = v.fov;
        camera.updateProjectionMatrix();
        break;
      case 'sens':
        player.sens = v.sens;
        break;
      case 'dark':
        GRADE_UNIFORM.value = v.dark;
        break;
      case 'bright':
        renderer.toneMappingExposure = LIGHTS.exposure * v.bright;
        break;
      case 'fog':
        scene.fog.density = LIGHTS.fogDensity * v.fog;
        break;
    }
  }

  // ── interfejs ────────────────────────────────────────────────────────────
  build() {
    const css = document.createElement('style');
    css.textContent = `
      #gear { position: fixed; right: 16px; top: 244px; width: 44px; height: 44px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.35); background: rgba(16,28,36,0.78); color: #fdf8ea; font-size: 24px; line-height: 42px; text-align: center; cursor: pointer; pointer-events: auto; z-index: 20; user-select: none; -webkit-tap-highlight-color: transparent; }
      body.nohud #gear { display: none; }
      #settings { position: fixed; left: 0; top: 0; bottom: 0; width: min(360px, 94vw); box-sizing: border-box; padding: 14px 16px 18px; overflow-y: auto; background: rgba(16,28,36,0.9); color: #fdf8ea; z-index: 40; display: none; font-size: 15px; -webkit-overflow-scrolling: touch; }
      #settings.open { display: block; }
      #settings h3 { margin: 0 0 10px; font-size: 20px; letter-spacing: 0.08em; color: #f2c200; }
      #settings .row { margin: 12px 0; }
      #settings .row label { display: flex; justify-content: space-between; margin-bottom: 4px; }
      #settings .row label b { color: #f2c200; font-weight: normal; }
      #settings input[type=range] { width: 100%; accent-color: #f2c200; height: 28px; }
      #settings select { width: 100%; padding: 8px; font-size: 16px; background: #22343f; color: #fdf8ea; border: 1px solid #556; border-radius: 6px; }
      #settings .btns { display: flex; gap: 10px; margin-top: 18px; }
      #settings button { flex: 1; padding: 12px; font-size: 16px; border-radius: 8px; border: 0; cursor: pointer; background: #3a4d58; color: #fdf8ea; }
      #settings button.main { background: #f2c200; color: #1a1a1a; font-weight: bold; }
      #settings .hint { font-size: 12px; color: #aab; margin-top: 10px; line-height: 1.4; }
      #setbtn { margin-top: 18px; padding: 10px 22px; font-size: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.4); background: rgba(16,28,36,0.6); color: #fdf8ea; cursor: pointer; letter-spacing: 0.1em; }
    `;
    document.head.appendChild(css);

    const gear = document.createElement('div');
    gear.id = 'gear';
    gear.textContent = '⚙';
    gear.title = 'Ustawienia (O)';
    document.body.appendChild(gear);

    const panel = document.createElement('div');
    panel.id = 'settings';
    const presetOpts = [...Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`), '<option value="custom">Własna</option>'].join('');
    const shadowOpts = SHADOW_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    panel.innerHTML = `<h3>USTAWIENIA</h3>
      <div class="row"><label>Jakość grafiki</label><select data-k="preset">${presetOpts}</select></div>
      <div class="row"><label>Cienie</label><select data-k="shadow">${shadowOpts}</select></div>
      ${CONTROLS.map((c) => `<div class="row"><label>${c.label}<b data-v="${c.k}"></b></label><input type="range" data-k="${c.k}" min="${c.min}" max="${c.max}" step="${c.step}"></div>`).join('')}
      <div class="hint">Wyższa rozdzielczość, cienie i zasięg detali obciążają procesor i kartę. Jeśli gra zwalnia, wybierz niższą jakość. Ustawienia zapisują się w przeglądarce.</div>
      <div class="btns"><button data-act="reset">Domyślne</button><button class="main" data-act="close">Zamknij</button></div>`;
    document.body.appendChild(panel);
    this.panel = panel;

    panel.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      this.controls[k] = el;
      el.addEventListener('input', () => {
        if (k === 'preset') { if (el.value !== 'custom') this.usePreset(el.value); return; }
        this.set(k, Number(el.value));
      });
    });
    panel.querySelector('[data-act=reset]').addEventListener('click', () => this.reset());
    panel.querySelector('[data-act=close]').addEventListener('click', () => this.close());
    // klawisze w panelu nie sterują autem
    panel.addEventListener('keydown', (e) => e.stopPropagation());

    const bind = (el, fn) => {
      let t = 0;
      el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); t = Date.now(); fn(); });
      el.addEventListener('click', (e) => { e.stopPropagation(); if (Date.now() - t > 500) fn(); });
    };
    bind(gear, () => this.toggle());
    const ob = document.getElementById('setbtn');
    if (ob) bind(ob, () => this.open());
    addEventListener('keydown', (e) => { if (e.code === 'KeyO') this.toggle(); });
    this.sync();
  }

  sync() {
    const v = this.v;
    for (const c of CONTROLS) {
      this.controls[c.k].value = v[c.k];
      this.panel.querySelector(`[data-v="${c.k}"]`).textContent = c.fmt(v[c.k]);
    }
    this.controls.preset.value = v.preset in PRESETS ? v.preset : 'custom';
    this.controls.shadow.value = String(v.shadow);
  }

  get isOpen() { return this.panel.classList.contains('open'); }

  toggle() { this.isOpen ? this.close() : this.open(); }

  open() {
    this.panel.classList.add('open');
    this.ctx.onOpen?.();
  }

  close() {
    this.panel.classList.remove('open');
    this.ctx.onClose?.();
  }
}
