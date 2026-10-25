// Prosta pula workerów z kolejką zadań.
export class WorkerPool {
  constructor(size) {
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.nextJob = 1;
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const { job, mats } = e.data;
        const res = this.pending.get(job);
        this.pending.delete(job);
        this.idle.push(w);
        this._pump();
        res(mats);
      };
      w.onerror = (err) => console.error('worker error', err);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run(msg, priority = 0) {
    return new Promise((resolve) => {
      const job = this.nextJob++;
      this.queue.push({ msg: { ...msg, job }, resolve, priority, job });
      this._pump();
    });
  }

  // zmiana priorytetów (np. kwartały najbliżej gracza najpierw)
  reprioritize(fn) {
    for (const q of this.queue) q.priority = fn(q.msg);
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
      this.pending.set(item.job, item.resolve);
      w.postMessage(item.msg);
    }
  }
}
