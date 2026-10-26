// Audyt sieci ulic dla wielu ziaren: node scripts/audit-roads.mjs [od] [do]
import { generateCity } from '../src/city/layout.js';
import { auditStreets } from '../src/city/audit.js';

const args = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const a = Number(args[0] || 1), b = Number(args[1] || a + 9);
const sum = {};
for (let seed = a; seed <= b; seed++) {
  const c = generateCity(seed);
  const { where, ...m } = auditStreets(c.streets, c.terrain);
  if (process.argv.includes('--where')) console.log(JSON.stringify(where));
  // mosty: żadne dwa nie stoją w tym samym miejscu, a oba końce każdego mają dojazd ulicą
  let minBr = 1e9, loose = 0;
  c.bridges.forEach((b, i) => {
    c.bridges.forEach((o, j) => { if (j > i) minBr = Math.min(minBr, Math.hypot(b.p[0] - o.p[0], b.p[1] - o.p[1])); });
    for (const e of b.highway ? [] : [b.e0, b.e1]) {
      const n = c.streets.filter((s) => !s.bridge && (Math.hypot(s.a[0] - e[0], s.a[1] - e[1]) < 3 || Math.hypot(s.b[0] - e[0], s.b[1] - e[1]) < 3)).length;
      if (!n) loose++;
    }
  });
  m.bridgeGap = Math.round(minBr === 1e9 ? 0 : minBr); m.looseBridgeEnds = loose;
  console.log(seed, JSON.stringify({ ...m, km: +m.km.toFixed(1), score: Math.round(m.score) }));
  for (const k of Object.keys(m)) sum[k] = (sum[k] || 0) + m[k];
}
const n = b - a + 1;
console.log('ŚREDNIO', JSON.stringify(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, +(v / n).toFixed(1)]))));
