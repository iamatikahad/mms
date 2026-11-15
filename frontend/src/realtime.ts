import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

const EVENTS = ['data:meals', 'data:guests', 'data:bazar', 'data:deposits', 'data:charges', 'data:bills'] as const;
type DataEvent = typeof EVENTS[number];

// entity -> last fire timestamp (debounce duplicate bursts)
const lastFired = new Map<DataEvent, number>();
const subscribers = new Set<(entity: string) => void>();
let wired = false;

function ensureWired() {
  if (wired) return;
  wired = true;
  const s = getSocket();
  for (const ev of EVENTS) {
    s.on(ev, () => {
      const now = Date.now();
      if (now - (lastFired.get(ev) ?? 0) < 400) return; // collapse bursts
      lastFired.set(ev, now);
      subscribers.forEach(cb => { try { cb(ev); } catch { /* ignore */ } });
    });
  }
}

/**
 * Subscribe to mess-scoped data-change events emitted by the backend.
 * Returns an unsubscribe function. Safe across mess switches: the socket
 * reconnects with the new messId and the server re-joins the correct room.
 */
export function onMessData(cb: (entity: string) => void): () => void {
  ensureWired();
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/**
 * React hook: re-run `fn` whenever backend data changes for the active mess.
 * Debounced per entity; fn identity changes are handled via ref (no re-subscribe churn).
 */
export function useMessRefresh(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onMessData(() => ref.current()), []);
}
