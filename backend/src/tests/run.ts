/**
 * Unit tests for pure financial/date helpers.
 * Run: npm test  (requires Oracle reachable — db.ts initializes the pool on import)
 */
import { equalAllocation } from '../services/finance';
import { monthBounds, monthOf } from '../db';

let pass = 0, fail = 0;
function eq(name: string, actual: any, expected: any) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}: expected ${e}, got ${a}`); }
}
function ok(name: string, cond: boolean) { eq(name, cond, true); }

// ---------- equalAllocation ----------
{
  const m = equalAllocation(3000, [1, 2]);
  eq('alloc 3000/2 sums', [...m.values()].reduce((a, b) => a + b, 0), 3000);
  eq('alloc 3000/2 each', m.get(1), 1500);
}
{
  // 100.00 across 3 -> 33.34 + 33.33 + 33.33 (largest remainder, exact sum)
  const m = equalAllocation(100, [1, 2, 3]);
  const vals = [m.get(1)!, m.get(2)!, m.get(3)!];
  eq('alloc 100/3 sums exactly', Math.round(vals.reduce((a, b) => a + b, 0) * 100), 10000);
  eq('alloc 100/3 first gets remainder', vals[0], 33.34);
}
{
  const m = equalAllocation(0.03, [1, 2, 3]);
  eq('alloc 0.03/3 sums', Math.round([...m.values()].reduce((a, b) => a + b, 0) * 100), 3);
}
eq('alloc empty members', equalAllocation(500, []).size, 0);
{
  const m = equalAllocation(1234.56, [7]);
  eq('alloc single member', m.get(7), 1234.56);
}
// determinism
{
  const a = equalAllocation(999.99, [3, 1, 2]);
  const b = equalAllocation(999.99, [3, 1, 2]);
  eq('alloc deterministic', [...a.entries()], [...b.entries()]);
}

// ---------- monthBounds (Asia/Dhaka = UTC+6, no DST) ----------
{
  const { start, end } = monthBounds('2026-11');
  eq('monthBounds start', start.toISOString(), '2026-10-31T18:00:00.000Z'); // Nov 1 00:00 Dhaka
  eq('monthBounds end', end.toISOString(), '2026-11-30T18:00:00.000Z');   // Dec 1 00:00 Dhaka
}
{
  const { start } = monthBounds('2026-01');
  eq('monthBounds Jan', start.toISOString(), '2025-12-31T18:00:00.000Z');
}

// ---------- monthOf ----------
eq('monthOf date', monthOf(new Date('2026-11-15T10:00:00Z')), '2026-11');
eq('monthOf string', monthOf('2026-11-30T20:00:00Z'), '2026-12'); // 02:00 Dhaka Dec 1

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
