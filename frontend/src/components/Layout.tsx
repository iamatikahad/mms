import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { api } from '../api';
import { Badge } from './ui';
import Logo from './Logo';
import { getSocket } from '../socket';
import { playMessageSound, playReminderSound, soundPrefs, notifPrefs } from '../sound';

interface NavItem { to: string; label: string; icon: string; perm?: string }

const adminNav: NavItem[] = [
  { to: '/admin', label: 'dashboard', icon: '📊' },
  { to: '/admin/members', label: 'memberManagement', icon: '👥', perm: 'members.view' },
  { to: '/admin/meals', label: 'mealManagement', icon: '🍽️', perm: 'meals.view' },
  { to: '/admin/meal-requests', label: 'mealRequests', icon: '📋', perm: 'meals.view' },
  { to: '/admin/guests', label: 'guestMeals', icon: '🧑‍🤝‍🧑', perm: 'guests.manage' },
  { to: '/admin/bazar', label: 'bazar', icon: '🛒', perm: 'bazar.manage' },
  { to: '/admin/deposits', label: 'deposits', icon: '💰', perm: 'deposits.manage' },
  { to: '/admin/expenses', label: 'expenses', icon: '🧾', perm: 'expenses.manage' },
  { to: '/admin/bills', label: 'monthlyBills', icon: '🧮', perm: 'bills.manage' },
  { to: '/admin/reports', label: 'reports', icon: '📈', perm: 'reports.view' },
  { to: '/admin/chat', label: 'communityChat', icon: '💬' },
  { to: '/admin/polls', label: 'polls', icon: '🗳️' },
  { to: '/admin/flowchart', label: 'flowchart', icon: '🔀', perm: 'flowchart.view' },
  { to: '/admin/closing', label: 'monthlyClosing', icon: '🔒', perm: 'closing.view' },
  { to: '/admin/notifications', label: 'notifications', icon: '🔔', perm: 'notifications.manage' },
  { to: '/admin/admins', label: 'adminManagement', icon: '🛡️', perm: 'admins.manage' },
  { to: '/admin/audit', label: 'auditLogs', icon: '📜', perm: 'audit.view' },
  { to: '/admin/settings', label: 'settings', icon: '⚙️', perm: 'settings.manage' },
  { to: '/admin/profile', label: 'profile', icon: '👤' },
];

const memberNav: NavItem[] = [
  { to: '/member', label: 'myDashboard', icon: '📊' },
  { to: '/member/meals', label: 'mealRequest', icon: '🍽️' },
  { to: '/member/chat', label: 'communityChat', icon: '💬' },
  { to: '/member/polls', label: 'polls', icon: '🗳️' },
  { to: '/member/expenses', label: 'myExpenses', icon: '🧾' },
  { to: '/member/reports', label: 'myReports', icon: '📈' },
  { to: '/member/notifications', label: 'notifications', icon: '🔔' },
  { to: '/member/profile', label: 'myProfile', icon: '👤' },
];

export default function Layout() {
  const { user, logout, theme, toggleTheme, messName } = useApp();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const onChatPage = location.pathname.endsWith('/chat');
  const isAdmin = user?.role !== 'MEMBER';
  const nav = isAdmin ? adminNav : memberNav;
  const base = isAdmin ? '/admin' : '/member';

  useEffect(() => {
    const load = () => api.get('/notifications/my').then(r => setUnread(r.data.unread)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  // unread chat total (group + DMs) — poll + socket-driven refresh
  useEffect(() => {
    if (!user) return;
    const load = () => api.get('/chat/unread').then(r => setChatUnread(r.data.total || 0)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [user]);

  // global chat socket: unread badge + notification sound/toast + app notifications
  useEffect(() => {
    if (!user) return;
    notifPrefs.load();
    const s = getSocket();
    const bump = () => api.get('/chat/unread').then(r => setChatUnread(r.data.total || 0)).catch(() => {});
    const onMsg = (m: any) => {
      if (m.senderId === user.userId || m.SENDER_ID === user.userId) return;
      if (!onChatPage) {
        bump();
        if (notifPrefs.get('chatNotify', true)) {
          if (soundPrefs.soundOn && !soundPrefs.muted) playMessageSound();
        }
      }
    };
    const onChatMsg = (p: any) => {
      if (p.message?.senderId === user.userId) return;
      bump();
      if (!onChatPage && notifPrefs.get('chatNotify', true)) {
        if (soundPrefs.soundOn && !soundPrefs.muted) playMessageSound();
        // toast handled by Chat page when open; here just badge+sound
      }
    };
    const onAppNotify = (p: any) => {
      // meal reminders & system pushes
      if (notifPrefs.get('mealReminder', true) && soundPrefs.soundOn && !soundPrefs.muted) playReminderSound();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(p.title || 'Notification', { body: p.message || '', icon: '/favicon.svg' }); } catch { /* ignore */ }
      }
    };
    s.on('new_message', onMsg);
    s.on('chat_message', onChatMsg);
    s.on('app_notify', onAppNotify);
    return () => { s.off('new_message', onMsg); s.off('chat_message', onChatMsg); s.off('app_notify', onAppNotify); };
  }, [user, onChatPage]);

  // reset chat badge when opening chat
  useEffect(() => {
    if (onChatPage) setChatUnread(0);
  }, [onChatPage]);

  const visible = nav.filter(n => !n.perm || user?.role === 'SUPER_ADMIN' || user?.permissions.includes(n.perm));

  const Sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col items-center gap-1.5">
          <Logo size={120} />
          <div className="text-center min-w-0">
            <div className="font-extrabold text-slate-900 dark:text-white truncate">{messName}</div>
            <div className="text-[11px] text-slate-500 truncate">{user?.fullName} · {user?.role}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {visible.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === base}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 font-medium'
                         : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <span className="w-5 text-center">{n.icon}</span>{t(n.label)}
            {n.to.endsWith('/chat') && chatUnread > 0 && <Badge color="red">{chatUnread}</Badge>}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 leading-tight">
        Developed & Maintained by Atikahad
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex relative">
      {/* site-wide animated background */}
      <div className="app-bg" aria-hidden="true">
        <div className="app-blob app-blob-1" />
        <div className="app-blob app-blob-2" />
        <div className="app-blob app-blob-3" />
      </div>
      {/* desktop sidebar */}
      <aside className="hidden md:block w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        {Sidebar}
      </aside>
      {/* mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-900 shadow-xl">{Sidebar}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* topbar */}
        <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 px-4 h-14">
            <button className="btn-ghost md:hidden !px-2" onClick={() => setOpen(true)}>☰</button>
            <div className="md:hidden flex items-center gap-2">
              <Logo size={44} />
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate max-w-[40vw]">{messName}</span>
            </div>
            <div className="hidden md:flex-1" />
            <div className="md:hidden flex-1" />
            {/* language switcher */}
            <button className="btn-ghost !px-3" onClick={() => i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn')}>
              {i18n.language === 'bn' ? t('english') : t('bangla')}
            </button>
            <button className="btn-ghost !px-3" onClick={toggleTheme} title={theme === 'light' ? t('darkMode') : t('lightMode')}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button className="btn-ghost !px-3 relative" onClick={() => navigate(`${base}/notifications`)}>
              🔔 {unread > 0 && <Badge color="red">{unread}</Badge>}
            </button>
            <button className="btn-ghost !px-3" onClick={logout}>{t('logout')}</button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
