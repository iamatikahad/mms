import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { q1 } from './db';
import type { AuthUser } from './middleware';
import {
  getConversation, canAccessConversation, createMessage, editMessage, deleteMessage,
  toggleReaction, markRead, markDelivered, ensureParticipant, getPrefs, isMuted,
} from './services/chat';
import { notify } from './services/notify';

let io: Server | null = null;
export function getIo() { return io; }

// presence: userId -> set of socket ids
const online = new Map<number, Set<string>>();
export function isUserOnline(userId: number): boolean {
  const s = online.get(userId);
  return !!s && s.size > 0;
}
export function onlineUserIds(): number[] {
  return [...online.entries()].filter(([, s]) => s.size > 0).map(([id]) => id);
}

async function loadSocketUser(uid: number): Promise<AuthUser | null> {
  const row = await q1<any>(
    `SELECT u.USER_ID, u.USERNAME, r.ROLE_NAME, u.STATUS,
            (SELECT MEMBER_ID FROM MEMBERS m WHERE m.USER_ID = u.USER_ID AND m.STATUS='ACTIVE') MEMBER_ID
     FROM USERS u JOIN ROLES r ON r.ROLE_ID = u.ROLE_ID
     WHERE u.USER_ID = :1`, [uid]);
  if (!row || row.STATUS !== 'ACTIVE') return null;
  return {
    userId: row.USER_ID,
    username: row.USERNAME,
    roleName: row.ROLE_NAME,
    memberId: row.MEMBER_ID ?? null,
    permissions: new Set(),
  };
}

const chatUser = (u: AuthUser) => ({ userId: u.userId, username: u.username, roleName: u.roleName, memberId: u.memberId });

async function convFor(socket: Socket, convId: number) {
  const conv = await getConversation(convId);
  if (!conv) return null;
  if (!(await canAccessConversation(conv, chatUser(socket.data.user)))) return null;
  return conv;
}

/** After a message is created: emit to conversation room + personal notify for offline DM participants. */
export async function fanoutMessage(conv: any, payload: any, senderId: number) {
  if (!io) return;
  const convId = Number(conv.CONVERSATION_ID);
  io.to(`conv:${convId}`).emit('new_message', payload);

  if (conv.CONVERSATION_TYPE === 'DIRECT') {
    const { q } = await import('./db');
    const others = await q<{ USER_ID: number }>(
      `SELECT USER_ID FROM CONVERSATION_PARTICIPANTS WHERE CONVERSATION_ID=:1 AND USER_ID<>:2`, [convId, senderId]);
    for (const p of others) {
      const uid = Number(p.USER_ID);
      // personal toast event (client decides sound/toast based on prefs + visibility)
      io.to(`user:${uid}`).emit('chat_message', {
        conversationId: convId, message: payload,
        fromName: payload.senderName,
      });
      if (!isUserOnline(uid) && !(await isMuted(uid, convId))) {
        const prefs = await getPrefs(uid);
        if (prefs.chatNotify) {
          await notify(uid, 'New Message', `${payload.senderName}: ${(payload.body || '📎').slice(0, 120)}`, 'CHAT');
        }
      }
    }
  }
}

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: config.clientUrl, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie || '';
      const token = raw.split(';').map(s => s.trim()).find(s => s.startsWith(`${config.cookieName}=`))
        ?.slice(config.cookieName.length + 1)
        || (socket.handshake.auth?.token as string | undefined);
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const uid = (jwt.verify(token, config.jwtSecret) as any).uid;
      const user = await loadSocketUser(uid);
      if (!user) return next(new Error('UNAUTHENTICATED'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthUser;
    const uid = user.userId;

    // presence
    if (!online.has(uid)) online.set(uid, new Set());
    const wasOffline = online.get(uid)!.size === 0;
    online.get(uid)!.add(socket.id);
    socket.join(`user:${uid}`);
    if (wasOffline) io!.emit('presence', { userId: uid, online: true });
    socket.emit('presence_list', { online: onlineUserIds() });

    socket.on('join_conversation', async (payload: any, cb?: any) => {
      try {
        const conv = await convFor(socket, Number(payload?.conversationId));
        if (!conv) return cb?.({ ok: false, error: 'FORBIDDEN' });
        await ensureParticipant(Number(conv.CONVERSATION_ID), uid);
        socket.join(`conv:${conv.CONVERSATION_ID}`);
        cb?.({ ok: true });
      } catch { cb?.({ ok: false, error: 'ERROR' }); }
    });

    socket.on('leave_conversation', (payload: any) => {
      socket.leave(`conv:${Number(payload?.conversationId)}`);
    });

    socket.on('send_message', async (payload: any, cb?: any) => {
      try {
        const conv = await convFor(socket, Number(payload?.conversationId));
        if (!conv) return cb?.({ ok: false, error: 'FORBIDDEN' });
        const { payload: msg } = await createMessage(chatUser(user), conv, payload || {});
        await fanoutMessage(conv, msg, uid);
        cb?.({ ok: true, message: msg });
      } catch (e: any) {
        cb?.({ ok: false, error: String(e?.message || 'ERROR') });
      }
    });

    socket.on('typing', (payload: any) => {
      const convId = Number(payload?.conversationId);
      if (!convId) return;
      socket.to(`conv:${convId}`).emit('typing', { conversationId: convId, userId: uid, name: user.username });
    });

    socket.on('stop_typing', (payload: any) => {
      const convId = Number(payload?.conversationId);
      if (!convId) return;
      socket.to(`conv:${convId}`).emit('stop_typing', { conversationId: convId, userId: uid });
    });

    socket.on('message_delivered', async (payload: any) => {
      try { await markDelivered(uid, Number(payload?.messageId)); } catch { /* ignore */ }
    });

    socket.on('messages_read', async (payload: any) => {
      try {
        const conv = await convFor(socket, Number(payload?.conversationId));
        if (!conv) return;
        const upTo = Number(payload?.upToMessageId || 0);
        await markRead(chatUser(user), conv, upTo);
        io!.to(`conv:${conv.CONVERSATION_ID}`).emit('read_update', {
          conversationId: Number(conv.CONVERSATION_ID), userId: uid, upToMessageId: upTo,
        });
      } catch { /* ignore */ }
    });

    socket.on('edit_message', async (payload: any, cb?: any) => {
      try {
        const msg = await editMessage(chatUser(user), Number(payload?.messageId), String(payload?.body ?? ''));
        io!.to(`conv:${msg.conversationId}`).emit('message_updated', msg);
        cb?.({ ok: true, message: msg });
      } catch (e: any) { cb?.({ ok: false, error: String(e?.message || 'ERROR') }); }
    });

    socket.on('delete_message', async (payload: any, cb?: any) => {
      try {
        const scope = payload?.scope === 'me' ? 'me' : 'everyone';
        const result = await deleteMessage(chatUser(user), Number(payload?.messageId), scope);
        const msg = await q1<any>(`SELECT CONVERSATION_ID FROM MESSAGES WHERE MESSAGE_ID=:1`, [Number(payload?.messageId)]);
        if (msg) {
          if (scope === 'everyone') {
            io!.to(`conv:${msg.CONVERSATION_ID}`).emit('message_deleted', { messageId: Number(payload?.messageId), conversationId: Number(msg.CONVERSATION_ID), scope });
          } else {
            socket.emit('message_deleted_for_me', { messageId: Number(payload?.messageId), conversationId: Number(msg.CONVERSATION_ID) });
          }
        }
        cb?.({ ok: true, ...result });
      } catch (e: any) { cb?.({ ok: false, error: String(e?.message || 'ERROR') }); }
    });

    socket.on('react', async (payload: any, cb?: any) => {
      try {
        const id = Number(payload?.messageId);
        const msgRow = await q1<any>(`SELECT CONVERSATION_ID FROM MESSAGES WHERE MESSAGE_ID=:1`, [id]);
        if (!msgRow) return cb?.({ ok: false, error: 'NOT_FOUND' });
        const conv = await convFor(socket, Number(msgRow.CONVERSATION_ID));
        if (!conv) return cb?.({ ok: false, error: 'FORBIDDEN' });
        const msg = await toggleReaction(chatUser(user), conv, id, String(payload?.emoji || ''));
        io!.to(`conv:${conv.CONVERSATION_ID}`).emit('reaction_update', msg);
        cb?.({ ok: true, message: msg });
      } catch (e: any) { cb?.({ ok: false, error: String(e?.message || 'ERROR') }); }
    });

    socket.on('disconnect', () => {
      const set = online.get(uid);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          online.delete(uid);
          io!.emit('presence', { userId: uid, online: false });
        }
      }
    });
  });

  return io;
}
