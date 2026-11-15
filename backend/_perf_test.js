// Latency + light load benchmark against live backend
const B = 'http://localhost:4001/api';
let cookie = '';
async function call(path) {
  const t0 = performance.now();
  const r = await fetch(B + path, { headers: { cookie, 'x-mess-id': '1' } });
  await r.arrayBuffer();
  return { ms: performance.now() - t0, status: r.status };
}
function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const p = q => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1), p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), p99: +p(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}
(async () => {
  let r = await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'superadmin', password: 'admin123' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];

  const endpoints = ['/health', '/dashboard/admin', '/members', '/bazar', '/deposits', '/bills', '/charges', '/closing', '/reports/admin/monthly-summary?month=2026-11', '/chat/conversations', '/notifications/my'];
  // warmup
  for (const e of endpoints) await call(e);
  // sequential latency x5
  for (const e of endpoints) {
    const ts = [];
    for (let i = 0; i < 5; i++) ts.push((await call(e)).ms);
    console.log(e.padEnd(55), JSON.stringify(stats(ts)));
  }
  // concurrent load: 50 reqs across endpoints, 10 at a time
  const all = [];
  for (let i = 0; i < 50; i++) all.push(call(endpoints[i % endpoints.length]));
  const res = await Promise.all(all);
  const oks = res.filter(x => x.status === 200).length;
  console.log('\nCONCURRENT 50:', JSON.stringify(stats(res.map(x => x.ms))), 'ok:', oks + '/50');
  // burst 100 dashboard
  const t0 = performance.now();
  const burst = await Promise.all(Array.from({ length: 100 }, () => call('/dashboard/admin')));
  console.log('BURST 100 dashboard:', (performance.now() - t0).toFixed(0) + 'ms total,', JSON.stringify(stats(burst.map(x => x.ms))), 'ok:', burst.filter(x => x.status === 200).length);
})().catch(e => console.log('ERR', e.message));
