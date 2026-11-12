import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';

export interface SessionUser {
  userId: number;
  username: string;
  fullName: string;
  email?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
  memberId: number | null;
  permissions: string[];
  MEMBER_ID?: number | null;
  MEMBER_CODE?: string;
  ROLE_NAME?: string;
}

interface Toast { id: number; type: 'success' | 'error' | 'info'; text: string }

interface AppCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshMe: () => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  uiTheme: string;
  setUiTheme: (k: string) => void;
  toasts: Toast[];
  toast: (type: Toast['type'], text: string) => void;
  confirm: (msg: string) => Promise<boolean>;
  messName: string;
}

const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('theme') as any) || 'dark');
  const [uiTheme, setUiTheme] = useState<string>(() => localStorage.getItem('ui_theme') || 'royal');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [messName, setMessName] = useState('The Attic 712');
  const [confirmState, setConfirmState] = useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // apply UI theme palette (data-theme attr drives CSS vars)
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    localStorage.setItem('ui_theme', uiTheme);
  }, [uiTheme]);

  const norm = (u: any): SessionUser => ({ ...u, memberId: u.memberId ?? u.MEMBER_ID ?? null });

  useEffect(() => {
    api.get('/auth/me').then(r => setUser(norm(r.data.user))).catch(() => setUser(null))
      .finally(() => setLoading(false));
    api.get('/settings/app.mess_name').then(r => {
      const v = r.data?.setting?.SETTING_VALUE ?? r.data?.SETTING_VALUE ?? r.data?.value;
      if (typeof v === 'string' && v.trim()) setMessName(v.replace(/^"|"$/g, '').trim());
    }).catch(() => {});
  }, []);

  const refresh = async () => {
    const r = await api.get('/auth/me');
    setUser(norm(r.data.user));
  };

  const login = async (identifier: string, password: string) => {
    await api.post('/auth/login', { identifier, password });
    const me = await api.get('/auth/me');
    const u = norm(me.data.user);
    setUser(u);
    // spoken welcome — once per successful login (logout→login replays it)
    try {
      const { playLoginWelcome, notifPrefs } = await import('./sound');
      const prefs = await notifPrefs.load();
      if (!prefs || prefs.loginSound !== false) {
        // browsers need a user gesture; the login click counts
        playLoginWelcome('Welcome to Our Mess Management System.');
      }
    } catch { /* ignore */ }
    return u;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setUser(null);
    window.location.href = '/login';
  };

  const toast = (type: Toast['type'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, type, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  const confirm = (msg: string) => new Promise<boolean>(resolve => {
    setConfirmState({ msg, resolve });
  });

  const value: AppCtx = {
    user, loading, login, logout, refresh, refreshMe: refresh,
    theme, toggleTheme: () => setTheme(t => t === 'light' ? 'dark' : 'light'),
    uiTheme, setUiTheme,
    toasts, toast, confirm, messName,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* toasts */}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 no-print">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2 rounded-lg shadow-lg text-sm text-white ${
            t.type === 'success' ? 'bg-emerald-600' : t.type === 'error' ? 'bg-red-600' : 'bg-brand-600'}`}>
            {t.text}
          </div>
        ))}
      </div>
      {/* confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 no-print" onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>
          <div className="card p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm mb-4">{confirmState.msg}</p>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>Cancel</button>
              <button className="btn-danger" onClick={() => { confirmState.resolve(true); setConfirmState(null); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
