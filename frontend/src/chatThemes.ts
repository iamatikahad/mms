// WhatsApp-inspired chat themes — per-user, stored via /api/chat/theme
export interface ChatThemeDef {
  key: string;
  name: string;
  bg: string;          // css background for chat area
  bubbleIn: string;
  bubbleOut: string;
  header: string;
  composer: string;
  text: string;        // primary text on bubbles
  sub: string;         // secondary text
  accent: string;
  dark: boolean;
}

export const CHAT_THEMES: ChatThemeDef[] = [
  { key: 'whatsapp', name: 'WhatsApp Classic', bg: '#efeae2', bubbleIn: '#ffffff', bubbleOut: '#d9fdd3', header: '#f0f2f5', composer: '#f0f2f5', text: '#111b21', sub: '#667781', accent: '#00a884', dark: false },
  { key: 'ocean', name: 'Ocean Blue', bg: '#dbe7f3', bubbleIn: '#ffffff', bubbleOut: '#cde7ff', header: '#2b6cb0', composer: '#e8f0f8', text: '#0f2740', sub: '#5a7ba6', accent: '#2b6cb0', dark: false },
  { key: 'midnight', name: 'Midnight Dark', bg: '#0b141a', bubbleIn: '#202c33', bubbleOut: '#005c4b', header: '#202c33', composer: '#202c33', text: '#e9edef', sub: '#8696a0', accent: '#00a884', dark: true },
  { key: 'amoled', name: 'Pure Black AMOLED', bg: '#000000', bubbleIn: '#1f2c34', bubbleOut: '#143d34', header: '#1f2c34', composer: '#1f2c34', text: '#e9edef', sub: '#8696a0', accent: '#00a884', dark: true },
  { key: 'sunset', name: 'Sunset Orange', bg: '#f6e3d4', bubbleIn: '#fff7f0', bubbleOut: '#ffd9b8', header: '#e2703a', composer: '#fae8d8', text: '#3d1d05', sub: '#8a5a3a', accent: '#e2703a', dark: false },
  { key: 'rose', name: 'Rose Pink', bg: '#f7e3ea', bubbleIn: '#fff5f8', bubbleOut: '#ffd1e0', header: '#c2447e', composer: '#fbe9f0', text: '#3d0f24', sub: '#8a5570', accent: '#c2447e', dark: false },
  { key: 'lavender', name: 'Lavender Purple', bg: '#e9e2f5', bubbleIn: '#f8f5ff', bubbleOut: '#d9c8ff', header: '#6d4fc2', composer: '#efe9fb', text: '#241245', sub: '#6a5a8a', accent: '#6d4fc2', dark: false },
  { key: 'forest', name: 'Forest Green', bg: '#dfe9d8', bubbleIn: '#f4faf0', bubbleOut: '#c4e3b4', header: '#3e7c4f', composer: '#e6f0e2', text: '#122b16', sub: '#55704f', accent: '#3e7c4f', dark: false },
  { key: 'gold', name: 'Premium Gold', bg: '#f3ead6', bubbleIn: '#fdfaf1', bubbleOut: '#e8d9a8', header: '#8a6d1f', composer: '#f0e6cd', text: '#2e2408', sub: '#7a6a42', accent: '#b8912f', dark: false },
  { key: 'minimal', name: 'Minimal White', bg: '#ffffff', bubbleIn: '#f0f2f5', bubbleOut: '#d1f4cc', header: '#ffffff', composer: '#ffffff', text: '#111b21', sub: '#667781', accent: '#54656f', dark: false },
  { key: 'cream', name: 'Soft Cream', bg: '#f7f1e3', bubbleIn: '#fffdf6', bubbleOut: '#efe0bd', header: '#efe6d0', composer: '#f3ecd9', text: '#33290f', sub: '#7a6f52', accent: '#a08030', dark: false },
  { key: 'royal', name: 'Royal Purple', bg: '#e4dcf7', bubbleIn: '#f6f3ff', bubbleOut: '#cfc0f5', header: '#5b21b6', composer: '#ece5fb', text: '#1e0f3d', sub: '#5c4f85', accent: '#5b21b6', dark: false },
];

export function getThemeDef(key?: string): ChatThemeDef {
  return CHAT_THEMES.find(t => t.key === key) || CHAT_THEMES[0];
}

export interface ResolvedTheme extends ChatThemeDef {
  vars: Record<string, string>;
}

/** Resolve preset + custom overrides into CSS vars for the chat pane. */
export function resolveTheme(themeKey: string, custom: any, convOverride?: string): ResolvedTheme {
  const base = getThemeDef(convOverride || themeKey);
  const t: ChatThemeDef = { ...base };
  const c = custom || {};
  if (c.bg?.type === 'solid' && c.bg.value) t.bg = c.bg.value;
  else if (c.bg?.type === 'gradient' && c.bg.value) t.bg = c.bg.value;
  else if (c.bg?.type === 'image' && c.bg.value) t.bg = `url(${c.bg.value}) center/cover no-repeat`;
  if (c.bubbleIn) t.bubbleIn = c.bubbleIn;
  if (c.bubbleOut) t.bubbleOut = c.bubbleOut;
  if (c.header) t.header = c.header;
  if (c.accent) t.accent = c.accent;
  const vars: Record<string, string> = {
    '--wa-bg': t.bg,
    '--wa-in': t.bubbleIn,
    '--wa-out': t.bubbleOut,
    '--wa-header': t.header,
    '--wa-composer': t.composer,
    '--wa-text': t.text,
    '--wa-sub': t.sub,
    '--wa-accent': t.accent,
  };
  return { ...t, vars };
}
