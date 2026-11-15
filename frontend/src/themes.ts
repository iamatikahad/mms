// UI theme palettes — applied as data-theme on <html>; .dark toggles light/dark variant.
export interface ThemeVars { bg: string; bg2: string; card: string; input: string; border: string; text: string; text2: string; accent: string; accent2: string; onAccent: string }
export interface UiTheme { key: string; name: string; en: string; bn: string; light: ThemeVars; dark: ThemeVars }

const T = (bg: string, bg2: string, card: string, input: string, border: string, text: string, text2: string, accent: string, accent2: string, onAccent = '#1a1408'): ThemeVars =>
  ({ bg, bg2, card, input, border, text, text2, accent, accent2, onAccent });

export const UI_THEMES: UiTheme[] = [
  { key: 'royal', name: 'Royal Black & Gold', en: 'Royal Black & Gold', bn: 'রয়্যাল ব্ল্যাক ও গোল্ড',
    light: T('#faf6ea', '#f1e8d0', '#fffdf6', '#ffffff', '#e3d9bd', '#241c08', '#6b5f40', '#b8912f', '#8a6d1f'),
    dark: T('#101010', '#191919', '#202020', '#242424', '#3a3428', '#f8f5ec', '#b8b2a3', '#d4af37', '#e6c875') },
  { key: 'navy', name: 'Royal Navy & Silver', en: 'Royal Navy & Silver', bn: 'নেভি ও সিলভার',
    light: T('#f2f5fa', '#e2e9f4', '#ffffff', '#f7f9fc', '#d3dcea', '#0f1e3d', '#51648a', '#4a6fa5', '#8aa9cf'),
    dark: T('#0a1120', '#101a30', '#16203a', '#1a2745', '#2c3a5c', '#eef2fb', '#a8b6d4', '#9db8e0', '#c8d8f2') },
  { key: 'emerald', name: 'Emerald Luxury', en: 'Emerald Luxury', bn: 'এমারাল্ড লাক্সারি',
    light: T('#f1f7f2', '#e0efe3', '#fbfefb', '#ffffff', '#cfe3d3', '#0d2b18', '#4c6b52', '#2e7d4f', '#5aa06f'),
    dark: T('#0a140d', '#0f1f14', '#142619', '#1a2f20', '#2c4a34', '#eef7ef', '#a3bfa8', '#4caf7d', '#7fd0a0') },
  { key: 'burgundy', name: 'Burgundy Royale', en: 'Burgundy Royale', bn: 'বারগান্ডি রয়াল',
    light: T('#faf1f2', '#f3e0e3', '#fffafa', '#ffffff', '#ecd0d4', '#330f14', '#7a4a50', '#8e2f3c', '#b04a56'),
    dark: T('#140a0c', '#1f1013', '#291419', '#332026', '#4a2830', '#f7eef0', '#c4a3a8', '#d4707e', '#e89aa2') },
  { key: 'champagne', name: 'Champagne Minimal', en: 'Champagne Minimal', bn: 'শ্যাম্পেন মিনিমাল',
    light: T('#faf8f3', '#f2ede0', '#ffffff', '#fcfbf7', '#e8e2d2', '#2a2519', '#7a7260', '#a08c5a', '#c2ab7d'),
    dark: T('#12100c', '#1a1712', '#221e17', '#2a251d', '#3d362a', '#f5f1e6', '#b0a78d', '#d4c08a', '#e6d5a8') },
  { key: 'graphite', name: 'Graphite Copper', en: 'Graphite Copper', bn: 'গ্রাফাইট কপার',
    light: T('#f5f4f2', '#e9e7e3', '#ffffff', '#faf9f7', '#ddd9d2', '#1c1a17', '#6e6a62', '#b06a3c', '#d18a52'),
    dark: T('#121110', '#1b1a18', '#232120', '#2b2926', '#45423c', '#f2f0ea', '#b0aa9e', '#d98e56', '#eab584') },
  { key: 'violet', name: 'Midnight Violet', en: 'Midnight Violet', bn: 'মিডনাইট ভায়োলেট',
    light: T('#f6f4fb', '#eae4f5', '#fdfcff', '#ffffff', '#ddd3ee', '#1d1433', '#5c4f85', '#6d4fc2', '#9178dd'),
    dark: T('#100d1a', '#171226', '#1f1832', '#281f40', '#3a2f5c', '#f1eefb', '#b3a8d9', '#a78bfa', '#c4b0fd') },
  { key: 'arctic', name: 'Arctic Mint', en: 'Arctic Mint', bn: 'আর্কটিক মিন্ট',
    light: T('#f2faf7', '#e0f2ec', '#ffffff', '#f8fdfb', '#cde8de', '#0b2b20', '#4a6b5d', '#2a9d8f', '#5cc4b4'),
    dark: T('#081310', '#0e1f1a', '#132a23', '#1a352c', '#2b4f43', '#ecf7f3', '#9fc4b8', '#4fd1b5', '#8be0d0') },
];

export function getUiTheme(key?: string | null): UiTheme { return UI_THEMES.find(t => t.key === key) || UI_THEMES[0]; }
