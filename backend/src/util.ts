/** Dhaka (UTC+6, no DST) helpers. */

export function nowDhaka(): Date {
  // returns a Date shifted so that UTC getters read Dhaka wall-clock
  return new Date(Date.now() + 6 * 3600 * 1000);
}

export function dhakaDateStr(d: Date = nowDhaka()): string {
  return d.toISOString().slice(0, 10);
}

export function dhakaTimeMinutes(d: Date = nowDhaka()): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function toDateOnly(d: Date | string): Date {
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return new Date(s + 'T00:00:00Z');
}
