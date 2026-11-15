// Subtle WebAudio notification sounds — no audio assets needed.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, vol = 0.08) {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ac.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(ac.currentTime + start);
  o.stop(ac.currentTime + start + dur + 0.05);
}

export const soundPrefs = {
  get soundOn() { return localStorage.getItem('chat_sound') !== 'off'; },
  set soundOn(v: boolean) { localStorage.setItem('chat_sound', v ? 'on' : 'off'); },
  get muted() { return localStorage.getItem('chat_muted') === '1'; },
  set muted(v: boolean) { localStorage.setItem('chat_muted', v ? '1' : '0'); },
};

/** Soft two-note "pop" for incoming messages. */
export function playMessageSound() {
  if (!soundPrefs.soundOn || soundPrefs.muted) return;
  tone(880, 0, 0.12);
  tone(1174.66, 0.09, 0.16);
}

/** Gentle rising chime for first chat open of the day / new poll. */
export function playWelcomeSound() {
  if (!soundPrefs.soundOn || soundPrefs.muted) return;
  tone(523.25, 0, 0.18);
  tone(659.25, 0.12, 0.18);
  tone(783.99, 0.24, 0.28);
}

/** Short confirm blip for sending/voting. */
export function playConfirmSound() {
  if (!soundPrefs.soundOn || soundPrefs.muted) return;
  tone(987.77, 0, 0.09, 0.05);
}

/** Gentle two-note chime for meal reminders / app notifications. */
export function playReminderSound() {
  if (!soundPrefs.soundOn || soundPrefs.muted) return;
  tone(659.25, 0, 0.15);
  tone(880, 0.14, 0.22);
}

/** Spoken login welcome — uses speechSynthesis, falls back to chime. */
export function playLoginWelcome(text?: string) {
  if (!soundPrefs.soundOn || soundPrefs.muted) return;
  const msg = text || 'Thank you for using our Mess Management System.';
  try {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(msg);
      u.rate = 1;
      u.pitch = 1;
      u.volume = 0.9;
      u.lang = 'en-US';
      speechSynthesis.speak(u);
      return;
    }
  } catch { /* fall through */ }
  playWelcomeSound();
}

/** Per-user cached notification prefs (synced from server, defaults on). */
export const notifPrefs = {
  cache: null as any,
  async load(): Promise<any> {
    try {
      const { api } = await import('./api');
      const r = await api.get('/chat/prefs');
      this.cache = r.data.prefs;
      return this.cache;
    } catch { return this.cache; }
  },
  get(name: string, dflt = true): boolean {
    if (!this.cache) return dflt;
    const map: any = { chatNotify: 'chatNotify', messageSound: 'messageSound', mealReminder: 'mealReminder', loginSound: 'loginSound' };
    const key = map[name] || name;
    return this.cache[key] !== false;
  },
};
