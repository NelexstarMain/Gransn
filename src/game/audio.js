// Dźwięk syntezowany w locie (Web Audio) — zero plików: silnik, klakson, strzał, zamek,
// kroki, uderzenia, pisk opon. Wszystko opakowane w try/catch: brak dźwięku nie psuje gry.
// AudioContext startuje dopiero po geście użytkownika (init() z kliknięcia w „Jedź”).
const safe = (fn) => (...a) => { try { return fn(...a); } catch { /* bez dźwięku */ } };

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOn = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(ctx.destination);
      // 1 s białego szumu do wszystkich „uderzeń”
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.buildEngine();
      this.buildSkid();
    } catch { this.ctx = null; }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  buildEngine() {
    const c = this.ctx;
    this.eo1 = c.createOscillator(); this.eo1.type = 'sawtooth';
    this.eo2 = c.createOscillator(); this.eo2.type = 'square';
    this.efilter = c.createBiquadFilter(); this.efilter.type = 'lowpass'; this.efilter.frequency.value = 500; this.efilter.Q.value = 2;
    this.egain = c.createGain(); this.egain.gain.value = 0;
    // „stukanie” czterosuwu: wolny LFO moduluje głośność
    const lfo = c.createOscillator(); lfo.frequency.value = 12;
    const lfoGain = c.createGain(); lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain);
    this.elfo = lfo;
    const mod = c.createGain(); mod.gain.value = 0.65;
    lfoGain.connect(mod.gain);
    this.eo1.connect(this.efilter); this.eo2.connect(this.efilter);
    this.efilter.connect(mod); mod.connect(this.egain); this.egain.connect(this.master);
    this.eo1.start(); this.eo2.start(); lfo.start();
  }

  buildSkid() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 3;
    this.sgain = c.createGain(); this.sgain.gain.value = 0;
    src.connect(f); f.connect(this.sgain); this.sgain.connect(this.master);
    src.start();
  }

  // obroty 0..1, gaz 0..1, w aucie?
  setEngine = safe((rpm, thr, on) => {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = 26 + rpm * 62;
    this.eo1.frequency.setTargetAtTime(f, t, 0.06);
    this.eo2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.elfo.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.efilter.frequency.setTargetAtTime(240 + rpm * 520 + thr * 380, t, 0.1);
    this.egain.gain.setTargetAtTime(on ? 0.05 + 0.05 * rpm + 0.05 * thr : 0, t, 0.12);
  });

  setSkid = safe((level) => {
    if (this.ctx) this.sgain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.13, this.ctx.currentTime, 0.05);
  });

  // klakson (dwa tony), włączany i wyłączany
  horn = safe((on) => {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this.hornNodes) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
      const os = [349, 440].map((f) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; o.connect(lp); lp.connect(g); o.start(); return o; });
      g.gain.setTargetAtTime(0.06, c.currentTime, 0.01);
      this.hornNodes = { g, os };
    } else if (!on && this.hornNodes) {
      const { g, os } = this.hornNodes;
      g.gain.setTargetAtTime(0, c.currentTime, 0.02);
      setTimeout(() => os.forEach((o) => o.stop()), 120);
      this.hornNodes = null;
    }
  });

  // szum o zadanej barwie i obwiedni; vol skalowany odległością (0..)
  burst = safe((dur, type, f0, f1, gain, when = 0, q = 0.7) => {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  });

  tone = safe((f0, f1, dur, gain, when = 0, type = 'sine') => {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  });

  shot() { this.burst(0.42, 'lowpass', 4200, 260, 1.0); this.burst(0.09, 'highpass', 2200, 1500, 0.5); this.tone(95, 34, 0.28, 0.9); }
  bolt() { this.burst(0.035, 'highpass', 3200, 2400, 0.25, 0.08); this.burst(0.05, 'bandpass', 1800, 1200, 0.3, 0.2); this.burst(0.04, 'highpass', 3000, 2500, 0.28, 0.34); this.burst(0.05, 'bandpass', 1500, 900, 0.3, 0.46); }
  reload() { this.burst(0.05, 'bandpass', 2200, 1500, 0.25, 0.25); this.burst(0.06, 'highpass', 2800, 2000, 0.3, 0.9); this.burst(0.08, 'bandpass', 1400, 800, 0.3, 1.5); }
  dry() { this.burst(0.03, 'highpass', 3500, 3000, 0.3); }
  step(run, crouch) { this.burst(0.08, 'lowpass', run ? 1300 : 900, 250, crouch ? 0.05 : run ? 0.2 : 0.11); }
  thud(power, dist = 0) { const v = Math.min(1, power * 0.16) / (1 + dist / 25); this.burst(0.2, 'lowpass', 500, 90, v); this.tone(75, 38, 0.22, v * 0.8); }
  ricochet(dist = 0) { const v = 0.35 / (1 + dist / 60); this.burst(0.12, 'bandpass', 3000, 1600, v, 0, 5); this.tone(2100, 900, 0.18, v * 0.3, 0, 'triangle'); }
  hitFlesh(dist = 0) { const v = 0.5 / (1 + dist / 50); this.burst(0.1, 'lowpass', 900, 200, v); }
  chime() { this.tone(880, 880, 0.18, 0.12); this.tone(1320, 1320, 0.28, 0.1, 0.1); }
}
