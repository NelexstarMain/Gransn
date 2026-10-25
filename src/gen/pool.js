// Pula workerów z kolejką zadań. Jeśli workery nie działają (stara
// przeglądarka, plik otwarty bez serwera, blokada w ramce), po kilku
// sekundach przełączamy się na generowanie w głównym wątku — gra i tak ruszy.
import { buildChunk, buildChunkLOD, buildGroundTile, buildRiver } from './assemble.js';

export class WorkerPool {
  constructor(size, city) {
    this.city = city;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.nextJob = 1;
    this.local = false;
    this.done = 0;
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => {
          const { job, mats } = e.data;
          const item = this.pending.get(job);
          if (!item) return;
          this.pending.delete(job);
          this.done++;
          this.idle.push(w);
          this._pump();
          item.resolve(mats);
        };
        w.onerror = (err) => { console.warn('worker niedostępny — generuję w głównym wątku', err); this._goLocal(); };
        this.workers.push(w);
        this.idle.push(w);
      }
    } catch (err) {
      console.warn('brak Web Workerów', err);
      this._goLocal();
    }
    if (size === 0) this._goLocal();
    // strażnik: brak odpowiedzi przez 10 s → tryb lokalny
    setTimeout(() => { if (!this.local && this.done === 0 && (this.pending.size || this.queue.length)) this._goLocal(); }, 10000);
  }

  _goLocal() {
    if (this.local) return;
    this.local = true;
    for (const w of this.workers) w.terminate();
    for (const item of this.pending.values()) this.queue.push(item);
    this.pending.clear();
    this._tick();
  }

  // jedno zadanie na "takt" — przeglądarka zdąży narysować pasek / klatkę
  _tick() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this.queue.length) return;
      let bi = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority < this.queue[bi].priority) bi = i;
      const item = this.queue.splice(bi, 1)[0];
      const { kind, id, tx, tz } = item.msg, c = this.city;
      const out = kind === 'block' ? buildChunk(c, id) : kind === 'lod' ? buildChunkLOD(c, id) : kind === 'ground' ? buildGroundTile(c, tx, tz) : buildRiver(c);
      this.done++;
      item.resolve(out.mats);
      this._tick();
    }, 0);
  }

  run(msg, priority = 0) {
    return new Promise((resolve) => {
      const job = this.nextJob++;
      this.queue.push({ msg: { ...msg, job }, resolve, priority, job });
      if (this.local) this._tick();
      else this._pump();
    });
  }

  reprioritize(fn) {
    for (const q of this.queue) q.priority = fn(q.msg, q.priority);
  }

  get busy() {
    return this.queue.length + this.pending.size;
  }

  _pump() {
    while (this.idle.length && this.queue.length) {
      let bi = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority < this.queue[bi].priority) bi = i;
      const item = this.queue.splice(bi, 1)[0];
      const w = this.idle.pop();
      this.pending.set(item.job, item);
      w.postMessage(item.msg);
    }
  }
}
