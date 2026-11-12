import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, dhakaToday } from '../api';
import { useApp } from '../store';
import { getSocket } from '../socket';
import { playMessageSound, playWelcomeSound, playConfirmSound, playReminderSound, soundPrefs, notifPrefs } from '../sound';
import { Spinner } from '../components/ui';
import { CHAT_THEMES, resolveTheme } from '../chatThemes';

const EMOJIS = ['😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','😜','🤔','😴','😢','😭','😡','👍','👎','👏','🙌','🙏','💪','🤝','✌️','❤️','🧡','💛','💚','💙','💜','🖤','💔','✨','⭐','🔥','🎉','🎊','💯','✅','❌','⚽','🏏','🎮','🍽️','☕','🍵','🥗','🍛','🎂','🌙','☀️','🌈','🚀','💡','📌','🗳️','💬','📷','📎','🎁','🏆','💰','😇','🥳','🤗','👋'];
const QUICK_REACT = ['👍','❤️','😂','😮','😢','🙏','🔥','🎉'];
const ATTACH_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,.doc,.docx,.xls,.xlsx';

function fmtTime(ts: any) {
  try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }); }
  catch { return ''; }
}
function fmtDay(ts: any) {
  try {
    const day = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
    const y = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
    if (day === y) return 'today';
    if (day === new Date(Date.now() + 6 * 3600e3 - 864e5).toISOString().slice(0, 10)) return 'yesterday';
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' });
  } catch { return ''; }
}
function fmtListTime(ts: any) {
  try {
    const day = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
    const y = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
    if (day === y) return fmtTime(ts);
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' });
  } catch { return ''; }
}
function isImage(mime?: string | null) { return !!mime && mime.startsWith('image/'); }
function initials(name?: string) { return (name || '?').trim()[0]?.toUpperCase() || '?'; }

// ================= theme picker =================
function ThemePicker({ theme, onSave, onClose }: { theme: any; onSave: (t: any) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<any>({ themeKey: theme?.themeKey || 'whatsapp', custom: { ...(theme?.custom || {}) }, overrides: { ...(theme?.overrides || {}) } });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = resolveTheme(draft.themeKey, draft.custom);

  const setCustom = (patch: any) => setDraft((d: any) => ({ ...d, custom: { ...d.custom, ...patch } }));
  const uploadWallpaper = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await api.post('/chat/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCustom({ bg: { type: 'image', value: `/api/files/${r.data.fileId}` } });
    } catch { /* ignore */ } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{t('chatTheme')}</h3>
          <button className="btn-ghost !px-2" onClick={onClose}>✕</button>
        </div>

        {/* live preview */}
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 mb-4">
          <div className="h-36 relative flex flex-col" style={{ background: preview.vars['--wa-bg'] }}>
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: preview.vars['--wa-header'] }}>
              <span className="wa-avatar" style={{ background: preview.vars['--wa-accent'], color: '#fff' }}>M</span>
              <div><div className="text-xs font-semibold" style={{ color: preview.vars['--wa-text'] }}>Preview</div><div className="text-[10px]" style={{ color: preview.vars['--wa-sub'] }}>online</div></div>
            </div>
            <div className="flex-1 flex items-end p-2 gap-2">
              <div className="wa-bubble in text-[11px]" style={{ background: preview.vars['--wa-in'], color: preview.vars['--wa-text'] }}>Incoming message</div>
              <div className="wa-bubble out text-[11px] ml-auto" style={{ background: preview.vars['--wa-out'], color: preview.vars['--wa-text'] }}>Outgoing ✓✓</div>
            </div>
          </div>
        </div>

        <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{t('themePresets')}</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-5">
          {CHAT_THEMES.map(th => (
            <button key={th.key}
              className={`rounded-xl border-2 p-1.5 text-left transition ${draft.themeKey === th.key && !draft.custom.bg ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'}`}
              onClick={() => setDraft((d: any) => ({ ...d, themeKey: th.key, custom: {} }))}>
              <div className="h-10 rounded-lg mb-1 flex overflow-hidden">
                <div className="flex-1" style={{ background: th.bg }} />
                <div className="w-1/3 flex flex-col gap-0.5 p-1">
                  <div className="h-2 rounded-sm" style={{ background: th.bubbleIn }} />
                  <div className="h-2 rounded-sm ml-auto" style={{ background: th.bubbleOut }} />
                </div>
              </div>
              <div className="text-[10px] font-medium text-slate-600 dark:text-slate-300 truncate">{th.name}</div>
            </button>
          ))}
        </div>

        <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{t('themeCustom')}</div>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <label className="text-xs text-slate-500">{t('wallpaper')}
            <div className="flex gap-1.5 mt-1">
              {(['none','solid','gradient','image'] as const).map(k => (
                <button key={k} className={`flex-1 text-[10px] py-1 rounded-lg border ${draft.custom.bg?.type === k || (!draft.custom.bg && k === 'none') ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-700' : 'border-slate-200 dark:border-slate-700'}`}
                  onClick={() => setCustom({ bg: k === 'none' ? null : { type: k, value: draft.custom.bg?.value || (k === 'solid' ? '#efeae2' : 'linear-gradient(135deg,#667eea,#764ba2)') } })}>
                  {t('bg' + k[0].toUpperCase() + k.slice(1))}
                </button>
              ))}
            </div>
          </label>
          {draft.custom.bg && draft.custom.bg.type !== 'image' && (
            <label className="text-xs text-slate-500">{t('bgColor')}
              <input type="color" className="w-full h-8 mt-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
                value={/^#/.test(draft.custom.bg.value || '') ? draft.custom.bg.value : '#efeae2'}
                onChange={e => setCustom({ bg: { ...draft.custom.bg, value: e.target.value } })} />
            </label>
          )}
          {draft.custom.bg?.type === 'image' && (
            <div className="text-xs text-slate-500">{t('wallpaper')}
              <div className="flex gap-1.5 mt-1">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadWallpaper(e.target.files[0])} />
                <button className="btn-secondary !py-1 text-xs flex-1" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? '…' : t('uploadWallpaper')}</button>
                <button className="btn-ghost !py-1 text-xs" onClick={() => setCustom({ bg: null })}>{t('reset')}</button>
              </div>
            </div>
          )}
          <label className="text-xs text-slate-500">{t('bubbleInColor')}
            <input type="color" className="w-full h-8 mt-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
              value={/^#/.test(draft.custom.bubbleIn || '') ? draft.custom.bubbleIn : '#ffffff'}
              onChange={e => setCustom({ bubbleIn: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{t('bubbleOutColor')}
            <input type="color" className="w-full h-8 mt-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
              value={/^#/.test(draft.custom.bubbleOut || '') ? draft.custom.bubbleOut : '#d9fdd3'}
              onChange={e => setCustom({ bubbleOut: e.target.value })} />
          </label>
        </div>

        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => { setDraft({ themeKey: 'whatsapp', custom: {}, overrides: {} }); }}>{t('resetTheme')}</button>
          <button className="btn-primary flex-1" onClick={() => { onSave(draft); onClose(); }}>{t('save')}</button>
        </div>
      </div>
    </div>
  );
}

// ================= main =================
export default function Chat() {
  const { t } = useTranslation();
  const { user, toast, confirm } = useApp();
  const myId = user?.userId;
  const isAdmin = user?.role !== 'MEMBER';

  const [convs, setConvs] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ fileId: number; name: string; mime: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [reactFor, setReactFor] = useState<number | null>(null);
  const [convMenu, setConvMenu] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [convFilter, setConvFilter] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [soundOn, setSoundOn] = useState(soundPrefs.soundOn);
  const [muted, setMuted] = useState(soundPrefs.muted);
  const [theme, setTheme] = useState<any>({ themeKey: 'whatsapp', custom: null, overrides: {} });
  const [themeOpen, setThemeOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const latestIdRef = useRef(0);
  const typingSentRef = useRef(0);
  activeIdRef.current = activeId;

  const activeConv = convs.find(c => c.conversationId === activeId) || null;
  const convThemeKey = activeId ? theme?.overrides?.[String(activeId)] : undefined;
  const resolved = resolveTheme(theme?.themeKey || 'whatsapp', theme?.custom, convThemeKey);
  const V = resolved.vars;

  const scrollBottom = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

  const loadConversations = useCallback(async () => {
    try {
      const r = await api.get('/chat/conversations');
      setConvs(r.data.conversations || []);
    } catch { /* ignore */ } finally { setLoadingConvs(false); }
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      const r = await api.get('/chat/members');
      setMembers((r.data.members || []).filter((m: any) => Number(m.USER_ID) !== myId));
    } catch { /* ignore */ }
  }, [myId]);

  const loadTheme = useCallback(async () => {
    try { const r = await api.get('/chat/theme'); setTheme(r.data.theme || {}); } catch { /* ignore */ }
  }, []);

  const saveTheme = async (draft: any) => {
    try { const r = await api.put('/chat/theme', draft); setTheme(r.data.theme || draft); } catch { toast('error', 'ERROR'); }
  };

  const saveConvTheme = async (themeKey: string | null) => {
    const overrides = { ...(theme?.overrides || {}) };
    if (themeKey) overrides[String(activeId)] = themeKey; else delete overrides[String(activeId)];
    await saveTheme({ themeKey: theme?.themeKey || 'whatsapp', custom: theme?.custom || {}, overrides });
  };

  const toggleConvMute = async () => {
    if (!activeConv) return;
    const next = !activeConv.muted;
    try {
      await api.post(`/chat/conversations/${activeConv.conversationId}/mute`, { muted: next });
      setConvs(prev => prev.map(c => c.conversationId === activeConv.conversationId ? { ...c, muted: next } : c));
      toast('success', next ? t('muted') : t('unmuted'));
    } catch { toast('error', 'ERROR'); }
    setConvMenu(false);
  };

  const loadMessages = useCallback(async (convId: number, before?: number) => {
    setLoadingMsgs(true);
    try {
      const r = await api.get(`/chat/conversations/${convId}/messages`, { params: { limit: 50, ...(before ? { before } : {}) } });
      const msgs = r.data.messages || [];
      setMessages(prev => {
        if (before) {
          const ids = new Set(prev.map(m => m.id));
          return [...msgs.filter((m: any) => !ids.has(m.id)), ...prev];
        }
        return msgs;
      });
      const latest = r.data.latestId || msgs[msgs.length - 1]?.id || 0;
      latestIdRef.current = Math.max(latestIdRef.current, latest);
      if (!before) scrollBottom();
      markRead(convId, latest || latestIdRef.current);
    } catch { /* ignore */ } finally { setLoadingMsgs(false); }
  }, []);

  const markRead = useCallback((convId: number, upTo: number) => {
    if (!upTo) return;
    api.post(`/chat/conversations/${convId}/read`, { upToMessageId: upTo }).catch(() => {});
    const s = getSocket();
    if (s.connected) s.emit('messages_read', { conversationId: convId, upToMessageId: upTo });
    setConvs(prev => prev.map(c => c.conversationId === convId ? { ...c, unread: 0 } : c));
  }, []);

  useEffect(() => {
    notifPrefs.load(); loadConversations(); loadMembers(); loadTheme();
    const todayKey = `chat_opened_${user?.userId}_${dhakaToday()}`;
    if (!localStorage.getItem(todayKey)) {
      localStorage.setItem(todayKey, '1');
      setTimeout(() => { playWelcomeSound(); toast('info', `${t('chatWelcomeTitle')} — ${t('chatWelcomeMsg')}`); }, 600);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const s = getSocket();
    const onPresenceList = (p: any) => setOnlineUsers(new Set(p.online || []));
    const onPresence = (p: any) => setOnlineUsers(prev => {
      const n = new Set(prev);
      if (p.online) n.add(p.userId); else n.delete(p.userId);
      return n;
    });
    const convMuted = (cid: number) => convs.find(c => c.conversationId === cid)?.muted;
    const onNew = (m: any) => {
      if (activeIdRef.current === m.conversationId) {
        setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        if (m.senderId !== myId) {
          if (!convMuted(m.conversationId) && notifPrefs.get('messageSound', soundPrefs.soundOn) && !soundPrefs.muted) playMessageSound();
          const s2 = getSocket();
          if (s2.connected) s2.emit('message_delivered', { messageId: m.id });
          if (!document.hidden) markRead(m.conversationId, m.id);
        }
        scrollBottom();
      } else if (m.senderId !== myId) {
        if (!convMuted(m.conversationId) && notifPrefs.get('chatNotify', true)) {
          if (soundPrefs.soundOn && !soundPrefs.muted) playMessageSound();
          toast('info', `${t('newMessage')}: ${m.senderName}`);
        }
        loadConversations();
      }
    };
    const onUpdated = (m: any) => setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x));
    const onDeleted = (p: any) => {
      setMessages(prev => prev.map(x => x.id === p.messageId ? { ...x, deletedForEveryone: true, body: null, file: null } : x));
      if (activeIdRef.current === p.conversationId) loadConversations();
    };
    const onDeletedForMe = (p: any) => {
      setMessages(prev => prev.filter(x => x.id !== p.messageId));
      if (activeIdRef.current === p.conversationId) loadConversations();
    };
    const onReact = (m: any) => setMessages(prev => prev.map(x => x.id === m.id ? { ...x, reactions: m.reactions } : x));
    const onTyping = (p: any) => {
      if (p.userId === myId || p.conversationId !== activeIdRef.current) return;
      setTypingUsers(prev => new Map(prev).set(p.conversationId + ':' + p.userId, p.name || ''));
      setTimeout(() => setTypingUsers(prev => {
        const n = new Map(prev); n.delete(p.conversationId + ':' + p.userId); return n;
      }), 4000);
    };
    const onStopTyping = (p: any) => setTypingUsers(prev => {
      const n = new Map(prev); n.delete(p.conversationId + ':' + p.userId); return n;
    });
    const onChatMsg = (p: any) => {
      if (p.conversationId !== activeIdRef.current) {
        if (!convMuted(p.conversationId) && notifPrefs.get('chatNotify', true)) {
          if (soundPrefs.soundOn && !soundPrefs.muted) playMessageSound();
          toast('info', `${p.fromName}: ${(p.message?.body || '📎').slice(0, 80)}`);
        }
        loadConversations();
      }
    };
    const onAppNotify = (p: any) => {
      toast('info', `${p.title}: ${p.message}`);
      if (notifPrefs.get('mealReminder', true)) playReminderSound();
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(p.title || 'Notification', { body: p.message || '', icon: '/favicon.svg' });
        }
      } catch { /* ignore */ }
    };
    const onRead = (p: any) => {
      if (p.userId === myId) return;
      setMessages(prev => prev.map(x => x.mine && x.conversationId === p.conversationId
        ? { ...x, readAt: x.readAt || new Date().toISOString(), deliveredAt: x.deliveredAt || new Date().toISOString() } : x));
    };
    s.on('presence_list', onPresenceList); s.on('presence', onPresence);
    s.on('new_message', onNew); s.on('message_updated', onUpdated);
    s.on('message_deleted', onDeleted); s.on('message_deleted_for_me', onDeletedForMe);
    s.on('reaction_update', onReact); s.on('typing', onTyping); s.on('stop_typing', onStopTyping);
    s.on('chat_message', onChatMsg); s.on('app_notify', onAppNotify); s.on('read_update', onRead);
    return () => {
      s.off('presence_list', onPresenceList); s.off('presence', onPresence);
      s.off('new_message', onNew); s.off('message_updated', onUpdated);
      s.off('message_deleted', onDeleted); s.off('message_deleted_for_me', onDeletedForMe);
      s.off('reaction_update', onReact); s.off('typing', onTyping);
      s.off('stop_typing', onStopTyping); s.off('chat_message', onChatMsg);
      s.off('app_notify', onAppNotify); s.off('read_update', onRead);
    };
  }, [myId, toast, t, loadConversations, markRead, convs]); // eslint-disable-line

  const selectConv = (id: number) => {
    setActiveId(id); setMessages([]); setMobileView('chat'); setSearchResults(null); setSearchQ(''); setConvMenu(false);
    const s = getSocket();
    if (s.connected) s.emit('join_conversation', { conversationId: id });
    loadMessages(id);
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el || el.scrollTop > 60 || loadingMsgs) return;
    const oldest = messages[0]?.id;
    if (oldest && activeId) loadMessages(activeId, oldest);
  };

  const openDirect = async (targetUserId: number) => {
    try {
      const r = await api.post('/chat/conversations/direct', { userId: targetUserId });
      setShowNewChat(false); setMemberQuery('');
      await loadConversations();
      selectConv(r.data.conversationId);
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  const send = async () => {
    const body = editing ? String(editing.body ?? '') : text;
    if (editing) {
      const b = body.trim();
      if (!b || b === editing.body) { setEditing(null); return; }
      const s = getSocket();
      try {
        if (s.connected) {
          const ack: any = await new Promise(res => s.emit('edit_message', { messageId: editing.id, body: b }, res));
          if (!ack?.ok) throw new Error(ack?.error || 'ERROR');
        } else {
          const r = await api.put(`/chat/messages/${editing.id}`, { body: b });
          setMessages(prev => prev.map(x => x.id === editing.id ? { ...x, ...r.data.message } : x));
        }
        playConfirmSound(); setEditing(null);
      } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
      return;
    }
    const tx = text.trim();
    if ((!tx && !pendingFile?.fileId) || sending || !activeId) return;
    setSending(true);
    const payload = { conversationId: activeId, body: tx || undefined, fileId: pendingFile?.fileId || undefined, replyToId: replyTo?.id || undefined };
    try {
      const s = getSocket();
      if (s.connected) {
        const ack: any = await new Promise(res => s.emit('send_message', payload, res));
        if (!ack?.ok) throw new Error(ack?.error || 'ERROR');
        if (ack.message && !messages.some(x => x.id === ack.message.id)) {
          setMessages(prev => prev.some(x => x.id === ack.message.id) ? prev : [...prev, ack.message]);
        }
      } else {
        const r = await api.post(`/chat/conversations/${activeId}/messages`, payload);
        setMessages(prev => prev.some(x => x.id === r.data.message.id) ? prev : [...prev, r.data.message]);
      }
      setText(''); setPendingFile(null); setReplyTo(null); playConfirmSound(); scrollBottom();
      loadConversations();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setSending(false); }
  };

  const pickFile = async (f: File) => {
    const okMime = /^(image\/|application\/pdf|text\/)/.test(f.type) || /\.(docx?|xlsx?|txt|pdf)$/i.test(f.name);
    if (!okMime) { toast('error', t('fileTypeNotAllowed')); return; }
    if (f.size > 5 * 1024 * 1024) { toast('error', t('fileTooLarge')); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await api.post('/chat/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPendingFile({ fileId: r.data.fileId, name: f.name, mime: f.type, url: isImage(f.type) ? URL.createObjectURL(f) : `/api/files/${r.data.fileId}` });
    } catch (e: any) { toast('error', e?.response?.data?.error || 'UPLOAD_FAILED'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const doDelete = async (m: any, scope: 'me' | 'everyone') => {
    setMenuFor(null);
    if (scope === 'everyone') {
      const ok = await confirm(t('confirmDeleteEveryone'));
      if (!ok) return;
    }
    try {
      await api.delete(`/chat/messages/${m.id}${scope === 'me' ? '?scope=me' : ''}`);
      if (scope === 'me') setMessages(prev => prev.filter(x => x.id !== m.id));
      else setMessages(prev => prev.map(x => x.id === m.id ? { ...x, deletedForEveryone: true, body: null, file: null } : x));
      loadConversations();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  const doReact = async (m: any, emoji: string) => {
    setReactFor(null);
    try {
      const s = getSocket();
      if (s.connected) {
        const ack: any = await new Promise(res => s.emit('react', { messageId: m.id, emoji }, res));
        if (!ack?.ok) throw new Error(ack?.error || 'ERROR');
      } else {
        const r = await api.post(`/chat/messages/${m.id}/react`, { emoji });
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, reactions: r.data.message.reactions } : x));
      }
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  const copyMsg = (m: any) => { navigator.clipboard?.writeText(m.body || '').then(() => toast('success', t('saved'))).catch(() => {}); setMenuFor(null); };

  const runSearch = async () => {
    if (!searchQ.trim()) { setSearchResults(null); return; }
    try {
      const r = await api.get('/chat/conversations/' + activeId + '/messages', { params: { q: searchQ, limit: 30 } });
      setSearchResults(r.data.messages || []);
    } catch { setSearchResults([]); }
  };

  const toggleSound = () => { const v = !soundOn; setSoundOn(v); soundPrefs.soundOn = v; };
  const toggleMute = () => { const v = !muted; setMuted(v); soundPrefs.muted = v; };

  const filteredMembers = members.filter(m =>
    !memberQuery || String(m.FULL_NAME || m.USERNAME || '').toLowerCase().includes(memberQuery.toLowerCase()) ||
    String(m.MEMBER_CODE || '').toLowerCase().includes(memberQuery.toLowerCase()));
  const filteredConvs = convs.filter(c => !convFilter || (c.title || '').toLowerCase().includes(convFilter.toLowerCase()));
  const typingInConv = [...typingUsers.entries()].filter(([k]) => k.startsWith(String(activeId) + ':')).map(([, v]) => v);

  const statusText = activeConv?.isGroup ? t('communityChat') :
    typingInConv.length ? typingInConv.join(', ') :
    (activeConv?.otherOnline ?? onlineUsers.has(activeConv?.otherUserId)) ? `🟢 ${t('online')}` : `⚪ ${t('offline')}`;

  // ---------- sidebar ----------
  const sidebar = (
    <div className="wa-sidebar" style={{ background: V['--wa-composer'] }}>
      <div className="wa-sidehead">
        <span className="wa-avatar" style={{ background: V['--wa-accent'], color: '#fff' }}>{initials(user?.fullName || user?.username)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: V['--wa-text'] }}>{user?.fullName || user?.username}</div>
          <div className="text-[10px]" style={{ color: V['--wa-sub'] }}>{user?.role || ''}</div>
        </div>
        <button className="wa-cbtn !w-8 !h-8" style={{ color: V['--wa-sub'] }} onClick={() => setThemeOpen(true)} title={t('chatTheme')}>🎨</button>
        <button className="wa-cbtn !w-8 !h-8" style={{ color: V['--wa-sub'] }} onClick={toggleSound} title={soundOn ? t('soundOff') : t('soundOn')}>{soundOn ? '🔔' : '🔕'}</button>
        <button className="wa-cbtn !w-8 !h-8" style={{ color: V['--wa-sub'] }} onClick={toggleMute} title={muted ? t('unmute') : t('mute')}>{muted ? '🔇' : '🔊'}</button>
        <button className="wa-cbtn !w-8 !h-8" style={{ color: V['--wa-sub'] }} onClick={() => setShowNewChat(o => !o)} title={t('newChat')}>✏️</button>
      </div>

      {showNewChat && (
        <div className="px-3 pb-2 space-y-1.5">
          <input className="wa-search !m-0" style={{ background: V['--wa-in'] }} placeholder={t('searchMembers')} value={memberQuery} onChange={e => setMemberQuery(e.target.value)} autoFocus />
          <div className="max-h-44 overflow-y-auto rounded-lg" style={{ background: V['--wa-in'] }}>
            {filteredMembers.map(m => (
              <button key={m.USER_ID} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                style={{ color: V['--wa-text'] }} onClick={() => openDirect(Number(m.USER_ID))}>
                <span className="wa-avatar !w-8 !h-8 text-xs" style={{ background: V['--wa-accent'], color: '#fff' }}>{initials(m.FULL_NAME || m.USERNAME)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.FULL_NAME || m.USERNAME}</span>
                  <span className="block text-[10px]" style={{ color: V['--wa-sub'] }}>{m.MEMBER_CODE} {onlineUsers.has(Number(m.USER_ID)) ? `· ${t('online')}` : ''}</span>
                </span>
              </button>
            ))}
            {filteredMembers.length === 0 && <div className="text-xs p-3" style={{ color: V['--wa-sub'] }}>{t('noData')}</div>}
          </div>
        </div>
      )}

      <div className="wa-search">
        <span>🔍</span>
        <input placeholder={t('search')} value={convFilter} onChange={e => setConvFilter(e.target.value)} style={{ color: V['--wa-text'] }} />
      </div>

      <div className="wa-convlist">
        {loadingConvs && <Spinner />}
        {!loadingConvs && filteredConvs.length === 0 && <div className="text-sm p-4 text-center" style={{ color: V['--wa-sub'] }}>{t('noConversations')}</div>}
        {filteredConvs.map(c => {
          const active = c.conversationId === activeId;
          const online = c.isGroup ? null : c.otherOnline ?? onlineUsers.has(c.otherUserId);
          return (
            <button key={c.conversationId} onClick={() => selectConv(c.conversationId)} className={`wa-conv ${active ? 'active' : ''}`}>
              <span className="wa-avatar" style={{ background: c.isGroup ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : V['--wa-accent'], color: '#fff' }}>
                {c.isGroup ? '👥' : initials(c.otherName || c.title)}
                {!c.isGroup && online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2" style={{ borderColor: V['--wa-composer'] }} />}
              </span>
              <span className="meta">
                <span className="name"><span className="truncate">{c.title}</span><span className="time">{c.lastMessage ? fmtListTime(c.lastMessage.at) : ''}</span></span>
                <span className="prev">
                  <span className="truncate flex items-center gap-1">
                    {c.muted && <span title={t('muted')}>🔕</span>}
                    {c.lastMessage?.preview || '—'}
                  </span>
                  {c.unread > 0 && <span className="wa-badge">{c.unread > 99 ? '99+' : c.unread}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ---------- chat pane ----------
  const chatPane = !activeConv ? (
    <div className="wa-pane" style={{ background: V['--wa-bg'] }}>
      <div className="hidden md:flex flex-1 items-center justify-center text-sm" style={{ color: V['--wa-sub'] }}>{t('startChat')}</div>
      <div className="md:hidden flex-1" />
    </div>
  ) : (
    <div className={`wa-pane ${mobileView === 'chat' ? 'on' : ''}`} style={{ background: V['--wa-bg'] }}>
      {/* header */}
      <div className="wa-chathead relative">
        <button className="wa-cbtn md:hidden !w-8 !h-8" style={{ color: V['--wa-sub'] }} onClick={() => setMobileView('list')}>←</button>
        <span className="wa-avatar relative" style={{ background: activeConv.isGroup ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : V['--wa-accent'], color: '#fff' }}>
          {activeConv.isGroup ? '👥' : initials(activeConv.otherName || activeConv.title)}
          {!activeConv.isGroup && (activeConv.otherOnline ?? onlineUsers.has(activeConv.otherUserId)) &&
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2" style={{ borderColor: V['--wa-header'] }} />}
        </span>
        <div className="who">
          <div className="n truncate">{activeConv.title}</div>
          <div className={`s ${typingInConv.length ? 'italic' : ''}`} style={{ color: typingInConv.length ? V['--wa-accent'] : V['--wa-sub'] }}>{statusText}</div>
        </div>
        <button className="wa-cbtn !w-8 !h-8" style={{ color: V['--wa-sub'] }} onClick={() => { setSearchOpen(o => !o); setSearchResults(null); }} title={t('searchMessages')}>🔍</button>
        <button className="wa-cbtn !w-8 !h-8" style={{ color: V['--wa-sub'] }} onClick={() => setConvMenu(o => !o)} title="⋮">⋮</button>
        {convMenu && (
          <div className="wa-menu">
            <button onClick={toggleConvMute}>{activeConv.muted ? '🔔' : '🔕'} {activeConv.muted ? t('unmute') : t('mute')}</button>
            <button onClick={() => { setConvMenu(false); setThemeOpen(true); }}>🎨 {t('chatTheme')}</button>
            {!activeConv.isGroup && (
              <div className="px-3 py-1.5">
                <div className="text-[10px] font-semibold uppercase" style={{ color: V['--wa-sub'] }}>{t('themeForThisChat')}</div>
                <select className="w-full mt-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5"
                  value={convThemeKey || ''} onChange={e => { saveConvTheme(e.target.value || null); setConvMenu(false); }}>
                  <option value="">{t('useGlobalTheme')}</option>
                  {CHAT_THEMES.map(th => <option key={th.key} value={th.key}>{th.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {searchOpen && (
        <div className="px-3 py-2 border-b" style={{ background: V['--wa-header'], borderColor: 'rgba(0,0,0,.06)' }}>
          <div className="flex gap-2">
            <input className="wa-search !m-0 flex-1" style={{ background: V['--wa-in'] }} placeholder={t('searchMessages')} value={searchQ}
              onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
            <button className="btn-secondary !py-1.5" onClick={runSearch}>{t('search')}</button>
          </div>
          {searchResults && (
            <div className="max-h-48 overflow-y-auto mt-2 space-y-1">
              {searchResults.length === 0 && <div className="text-xs p-1" style={{ color: V['--wa-sub'] }}>{t('noData')}</div>}
              {searchResults.map(m => (
                <button key={m.id} className="w-full text-left px-2 py-1.5 rounded-lg text-xs"
                  style={{ background: V['--wa-in'], color: V['--wa-text'] }}
                  onClick={() => { setSearchResults(null); setSearchOpen(false); }}>
                  <span className="font-semibold">{m.senderName}:</span> {(m.body || '📎').slice(0, 100)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* messages */}
      <div ref={listRef} onScroll={onScroll} className="wa-msgs">
        {loadingMsgs && <Spinner />}
        {!loadingMsgs && messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm" style={{ color: V['--wa-sub'] }}>{t('noData')}</div>
        )}
        {messages.map((m, i) => {
          const mine = m.mine;
          const prev = messages[i - 1];
          const showDay = !prev || fmtDay(prev.createdAt) !== fmtDay(m.createdAt);
          const grouped = prev && prev.senderId === m.senderId && !showDay && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000);
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="wa-day"><span>{fmtDay(m.createdAt) === 'today' ? t('today') : fmtDay(m.createdAt) === 'yesterday' ? t('yesterday') : fmtDay(m.createdAt)}</span></div>}
              <div className={`wa-row group ${mine ? 'me' : ''} ${grouped ? '-mt-0.5' : ''}`}>
                <div className={`wa-bubble ${mine ? 'out' : 'in'}`} style={mine ? { background: V['--wa-out'], color: V['--wa-text'] } : { background: V['--wa-in'], color: V['--wa-text'] }}>
                  {/* hover actions */}
                  <div className={`wa-actions ${menuFor === m.id || reactFor === m.id ? 'open' : ''} ${mine ? 'left-0' : 'right-0'}`}>
                    <button onClick={() => setReactFor(reactFor === m.id ? null : m.id)} title="😊">😊</button>
                    <button onClick={() => { setReplyTo(m); setEditing(null); }} title={t('reply')}>↩</button>
                    {mine && <button onClick={() => { setEditing(m); setReplyTo(null); }} title={t('edit')}>✏️</button>}
                    <button onClick={() => copyMsg(m)} title={t('copy')}>📋</button>
                    <button onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} title="⋯">⋯</button>
                  </div>
                  {reactFor === m.id && (
                    <div className={`absolute -top-9 ${mine ? 'left-0' : 'right-0'} z-30 flex gap-0.5 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 px-1.5 py-1`}>
                      {QUICK_REACT.map(e => <button key={e} className="text-base hover:scale-125 transition" onClick={() => doReact(m, e)}>{e}</button>)}
                    </div>
                  )}
                  {menuFor === m.id && (
                    <div className="absolute top-7 z-30 card !p-1.5 !rounded-xl shadow-lg text-xs whitespace-nowrap bg-white dark:bg-slate-800">
                      <button className="block w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => doDelete(m, 'me')}>🗑 {t('deleteForMe')}</button>
                      {(mine || isAdmin) && !m.deletedForEveryone && (
                        <button className="block w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-red-500" onClick={() => doDelete(m, 'everyone')}>🗑 {t('deleteForEveryone')}</button>
                      )}
                    </div>
                  )}

                  {!mine && activeConv.isGroup && <div className="sender" style={{ color: V['--wa-accent'] }}>{m.senderName}</div>}
                  {m.replyTo && (
                    <div className="wa-quote">
                      <div className="qn">{m.replyTo.senderName}</div>
                      <div className="truncate opacity-80">{m.replyTo.preview}</div>
                    </div>
                  )}

                  {m.deletedForEveryone ? (
                    <div className="italic text-xs opacity-70">🚫 {t('messageDeleted')}{m.deletedByName ? ` · ${m.deletedByName}` : ''}</div>
                  ) : editing?.id === m.id ? (
                    <div className="space-y-1">
                      <textarea className="wa-composer !p-0 !bg-transparent" style={{ color: V['--wa-text'] }} value={editing.body || ''} autoFocus rows={2}
                        onChange={e => setEditing({ ...editing, body: e.target.value })} />
                      <div className="flex gap-1 justify-end">
                        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(null)}>{t('cancel')}</button>
                        <button className="btn-primary !px-2 !py-1 text-xs" onClick={send}>{t('save')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                      {m.file && isImage(m.file.mime) && (
                        <img src={m.file.url} alt={m.file.name || 'img'} loading="lazy"
                          className="mt-1 rounded-lg max-h-60 cursor-zoom-in object-cover" onClick={() => setLightbox(m.file.url)} />
                      )}
                      {m.file && !isImage(m.file.mime) && (
                        <a href={m.file.url} target="_blank" rel="noreferrer"
                          className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs bg-black/5">
                          <span>📄</span><span className="truncate max-w-[180px]">{m.file.name || t('fileSent')}</span>
                        </a>
                      )}
                    </>
                  )}

                  {m.reactions?.length > 0 && (
                    <div className="wa-reactions">
                      {m.reactions.map((r: any) => (
                        <button key={r.emoji} onClick={() => doReact(m, r.emoji)} className={`wa-react ${r.mine ? 'mine' : ''}`}>
                          {r.emoji} {r.count}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="meta">
                    {m.editedAt && !m.deletedForEveryone && <span>{t('edited')}</span>}
                    <span>{fmtTime(m.createdAt)}</span>
                    {mine && !activeConv.isGroup && !m.deletedForEveryone && (
                      <span title={m.readAt ? t('read') : m.deliveredAt ? t('delivered') : t('sent')}>
                        {m.readAt ? '✓✓' : m.deliveredAt ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        {typingInConv.length > 0 && (
          <div className="text-xs italic px-2" style={{ color: V['--wa-sub'] }}>{typingInConv.join(', ')} {t('typing')}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* reply preview */}
      {replyTo && (
        <div className="px-3 py-1.5 border-t flex items-center gap-2" style={{ background: V['--wa-composer'], borderColor: 'rgba(0,0,0,.06)' }}>
          <div className="flex-1 border-l-2 pl-2 text-xs" style={{ borderColor: V['--wa-accent'], color: V['--wa-sub'] }}>
            <div className="font-semibold" style={{ color: V['--wa-accent'] }}>{replyTo.senderName}</div>
            <div className="truncate">{(replyTo.body || '📎').slice(0, 80)}</div>
          </div>
          <button className="wa-cbtn !w-7 !h-7" style={{ color: V['--wa-sub'] }} onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

      {/* file preview */}
      {pendingFile && (
        <div className="px-3 py-2 border-t flex items-center gap-2" style={{ background: V['--wa-composer'], borderColor: 'rgba(0,0,0,.06)' }}>
          {isImage(pendingFile.mime) ? <img src={pendingFile.url} className="h-12 w-12 object-cover rounded-lg" alt="" /> : <span className="text-2xl">📄</span>}
          <span className="text-xs flex-1 truncate" style={{ color: V['--wa-sub'] }}>{pendingFile.name}</span>
          <button className="wa-cbtn !w-7 !h-7" style={{ color: V['--wa-sub'] }} onClick={() => setPendingFile(null)}>✕</button>
        </div>
      )}

      {/* composer */}
      <div className="wa-composer">
        <div className="relative">
          <button className="wa-cbtn !w-9 !h-9 !text-xl" style={{ color: V['--wa-sub'] }} onClick={() => setEmojiOpen(o => !o)}>😀</button>
          {emojiOpen && (
            <div className="wa-emoji-panel">
              {EMOJIS.map(e => (
                <button key={e} className="hover:bg-slate-100 dark:hover:bg-slate-700 rounded" onClick={() => { setText(x => x + e); setEmojiOpen(false); }}>{e}</button>
              ))}
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} className="hidden" onChange={e => e.target.files?.[0] && pickFile(e.target.files[0])} />
        <button className="wa-cbtn !w-9 !h-9 !text-xl" disabled={uploading} onClick={() => fileRef.current?.click()} title={t('attachFile')} style={{ color: V['--wa-sub'] }}>
          {uploading ? '⏳' : '📎'}
        </button>
        <div className="box">
          <textarea
            value={editing ? (editing.body || '') : text}
            onChange={e => {
              if (editing) setEditing({ ...editing, body: e.target.value });
              else {
                setText(e.target.value);
                const now = Date.now();
                if (now - typingSentRef.current > 3000) {
                  typingSentRef.current = now;
                  getSocket().connected && getSocket().emit('typing', { conversationId: activeId });
                }
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t('typeMessage')}
            rows={1}
          />
        </div>
        <button className="wa-cbtn send !w-10 !h-10 !text-lg" disabled={sending || uploading || (!editing && !text.trim() && !pendingFile?.fileId)} onClick={send}>
          {sending ? '…' : editing ? '✓' : '➤'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="wa-root" style={V as any}>
      <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex`} style={{ display: mobileView === 'list' ? 'flex' : undefined }}>{sidebar}</div>
      <div className={`${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0`}>{chatPane}</div>

      {themeOpen && <ThemePicker theme={theme} onSave={saveTheme} onClose={() => setThemeOpen(false)} />}
      {lightbox && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="preview" className="max-h-full max-w-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
