import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import oracledb from 'oracledb';
import { q1, tx } from '../db';
import { authMiddleware } from '../middleware';
import { config } from '../config';
import {
  ChatUser, getConversation, canAccessConversation, listConversations, chatMembers,
  getOrCreateDirect, listMessages, createMessage, editMessage, deleteMessage,
  toggleReaction, markRead, markDelivered, searchMessages, unreadTotal,
  getTheme, setTheme, setMute,
  getPrefs, setPrefs, ensureParticipant,
} from '../services/chat';
import { getIo, fanoutMessage } from '../socket';

export const chatRouter = Router();
chatRouter.use(authMiddleware);

const asUser = (req: any): ChatUser => ({
  userId: req.user.userId, username: req.user.username,
  roleName: req.user.roleName, memberId: req.user.memberId,
});

async function convOr404(req: any, res: any) {
  const conv = await getConversation(Number(req.params.id ?? req.params.conversationId));
  if (!conv) { res.status(404).json({ error: 'NOT_FOUND' }); return null; }
  if (!(await canAccessConversation(conv, asUser(req)))) { res.status(403).json({ error: 'FORBIDDEN' }); return null; }
  return conv;
}

function mapErr(e: any, res: any, next: any) {
  const msg = String(e?.message || '');
  if (/^(NOT_FOUND|FORBIDDEN|EMPTY_MESSAGE|BAD_|USER_NOT_FOUND|CANNOT_MESSAGE_SELF|NOT_YOUR_MESSAGE|MESSAGE_DELETED|EDIT_WINDOW_EXPIRED|ALREADY_DELETED|FILE_NOT_FOUND|FILE_NOT_OWNED|FILE_TYPE_NOT_ALLOWED|BAD_REPLY_TARGET|BAD_SCOPE|BAD_EMOJI)$/.test(msg)) {
    const status = msg === 'FORBIDDEN' ? 403 : msg === 'NOT_FOUND' ? 404 : msg === 'EDIT_WINDOW_EXPIRED' ? 410 : 400;
    return res.status(status).json({ error: msg });
  }
  next(e);
}

// ---------- conversations ----------
chatRouter.get('/conversations', async (req, res, next) => {
  try { res.json({ conversations: await listConversations(asUser(req)) }); }
  catch (e) { next(e); }
});

chatRouter.get('/unread', async (req, res, next) => {
  try { res.json({ total: await unreadTotal(asUser(req).userId) }); }
  catch (e) { next(e); }
});

chatRouter.get('/members', async (_req, res, next) => {
  try { res.json({ members: await chatMembers() }); }
  catch (e) { next(e); }
});

chatRouter.post('/conversations/direct', async (req, res, next) => {
  try {
    const target = Number(req.body?.userId);
    if (!target) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const id = await getOrCreateDirect(asUser(req), target);
    res.status(201).json({ conversationId: id });
  } catch (e) { mapErr(e, res, next); }
});

// ---------- messages ----------
chatRouter.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const conv = await convOr404(req, res); if (!conv) return;
    await ensureParticipant(Number(conv.CONVERSATION_ID), req.user!.userId);
    const result = await listMessages(asUser(req), conv, {
      before: req.query.before ? Number(req.query.before) : undefined,
      since: req.query.since ? Number(req.query.since) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      q: req.query.q ? String(req.query.q) : undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

chatRouter.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const conv = await convOr404(req, res); if (!conv) return;
    const { id, payload } = await createMessage(asUser(req), conv, req.body || {});
    await fanoutMessage(conv, payload, req.user!.userId);
    res.status(201).json({ message: payload });
  } catch (e) { mapErr(e, res, next); }
});

chatRouter.put('/messages/:id', async (req, res, next) => {
  try {
    const payload = await editMessage(asUser(req), Number(req.params.id), String(req.body?.body ?? ''));
    getIo()?.to(`conv:${payload.conversationId}`).emit('message_updated', payload);
    res.json({ message: payload });
  } catch (e) { mapErr(e, res, next); }
});

chatRouter.delete('/messages/:id', async (req, res, next) => {
  try {
    const scope = req.query.scope === 'me' ? 'me' : 'everyone';
    const result = await deleteMessage(asUser(req), Number(req.params.id), scope);
    const msg = await q1<any>(`SELECT CONVERSATION_ID FROM MESSAGES WHERE MESSAGE_ID=:1`, [Number(req.params.id)]);
    if (msg) {
      if (scope === 'everyone') {
        getIo()?.to(`conv:${msg.CONVERSATION_ID}`).emit('message_deleted', { messageId: Number(req.params.id), conversationId: Number(msg.CONVERSATION_ID), scope });
      } else {
        getIo()?.to(`user:${req.user!.userId}`).emit('message_deleted_for_me', { messageId: Number(req.params.id), conversationId: Number(msg.CONVERSATION_ID) });
      }
    }
    res.json(result);
  } catch (e) { mapErr(e, res, next); }
});

chatRouter.post('/messages/:id/react', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const msg = await q1<any>(`SELECT CONVERSATION_ID FROM MESSAGES WHERE MESSAGE_ID=:1`, [id]);
    if (!msg) return res.status(404).json({ error: 'NOT_FOUND' });
    const conv = await getConversation(Number(msg.CONVERSATION_ID));
    if (!(await canAccessConversation(conv, asUser(req)))) return res.status(403).json({ error: 'FORBIDDEN' });
    const payload = await toggleReaction(asUser(req), conv, id, String(req.body?.emoji || ''));
    getIo()?.to(`conv:${conv.CONVERSATION_ID}`).emit('reaction_update', payload);
    res.json({ message: payload });
  } catch (e) { mapErr(e, res, next); }
});

chatRouter.post('/conversations/:id/read', async (req, res, next) => {
  try {
    const conv = await convOr404(req, res); if (!conv) return;
    const upTo = Number(req.body?.upToMessageId || req.body?.upTo || 0);
    await markRead(asUser(req), conv, upTo);
    getIo()?.to(`conv:${conv.CONVERSATION_ID}`).emit('read_update', {
      conversationId: Number(conv.CONVERSATION_ID), userId: req.user!.userId, upToMessageId: upTo,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

chatRouter.post('/messages/:id/delivered', async (req, res, next) => {
  try { await markDelivered(req.user!.userId, Number(req.params.id)); res.json({ ok: true }); }
  catch (e) { next(e); }
});

chatRouter.get('/search', async (req, res, next) => {
  try { res.json({ results: await searchMessages(asUser(req), String(req.query.q || '')) }); }
  catch (e) { next(e); }
});

// ---------- notification preferences ----------
chatRouter.get('/prefs', async (req, res, next) => {
  try { res.json({ prefs: await getPrefs(req.user!.userId) }); }
  catch (e) { next(e); }
});
chatRouter.put('/prefs', async (req, res, next) => {
  try { res.json({ prefs: await setPrefs(req.user!.userId, req.body || {}) }); }
  catch (e) { next(e); }
});

// ---------- chat theme (per user) ----------
chatRouter.get('/theme', async (req, res, next) => {
  try { res.json({ theme: await getTheme(req.user!.userId) }); }
  catch (e) { next(e); }
});
chatRouter.put('/theme', async (req, res, next) => {
  try { res.json({ theme: await setTheme(req.user!.userId, req.body || {}) }); }
  catch (e) { next(e); }
});

// ---------- conversation mute ----------
chatRouter.post('/conversations/:id/mute', async (req, res, next) => {
  try {
    const conv = await convOr404(req, res); if (!conv) return;
    res.json(await setMute(req.user!.userId, Number(conv.CONVERSATION_ID), !!req.body?.muted));
  } catch (e) { mapErr(e, res, next); }
});

// ---------- attachment upload (images + common docs, 5MB) ----------
const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });
const ATTACH_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const ATTACH_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx']);
const attachStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `chat-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const attachUpload = multer({
  storage: attachStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ATTACH_MIME.has(file.mimetype) && ATTACH_EXT.has(ext)) cb(null, true);
    else cb(new Error('FILE_TYPE_NOT_ALLOWED'));
  },
});

chatRouter.post('/upload', attachUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE' });
    const outB = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO UPLOADED_FILES (ORIGINAL_NAME, STORED_NAME, MIME_TYPE, SIZE_BYTES, UPLOADED_BY)
         VALUES (:1,:2,:3,:4,:5) RETURNING FILE_ID INTO :6`,
        [req.file!.originalname, req.file!.filename, req.file!.mimetype, req.file!.size, req.user!.userId,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      return Number(outB[0]);
    });
    res.status(201).json({ ok: true, fileId: id, url: `/api/files/${id}` });
  } catch (e: any) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(e);
  }
});
