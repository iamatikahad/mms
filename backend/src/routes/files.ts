import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import oracledb from 'oracledb';
import { q, q1, tx } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { config } from '../config';

export const filesRouter = Router();
filesRouter.use(authMiddleware);

const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('FILE_TYPE_NOT_ALLOWED'));
  },
});

filesRouter.post('/upload', requirePerm('bazar.manage', 'bills.manage', 'deposits.manage', 'members.manage'), upload.single('file'), async (req, res, next) => {
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

filesRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await q1<any>(`SELECT * FROM UPLOADED_FILES WHERE FILE_ID=:1`, [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

    // Authorization: files attached to chat messages are only visible to
    // participants of that conversation (GROUP = any active user, DIRECT =
    // participants + admins). Unattached uploads: uploader or admin only.
    const isAdmin = req.user!.roleName === 'SUPER_ADMIN' || req.user!.roleName === 'ADMIN';
    const refs = await q<any>(
      `SELECT m.CONVERSATION_ID, c.CONVERSATION_TYPE, m.SENDER_ID, m.DELETED_AT
       FROM MESSAGES m JOIN CONVERSATIONS c ON c.CONVERSATION_ID=m.CONVERSATION_ID
       WHERE m.FILE_ID=:1`, [Number(req.params.id)]);
    if (refs.length) {
      let allowed = isAdmin;
      if (!allowed) {
        for (const r of refs) {
          if (r.CONVERSATION_TYPE === 'GROUP') { allowed = true; break; }
          const part = await q1<{ C: number }>(
            `SELECT COUNT(*) C FROM CONVERSATION_PARTICIPANTS WHERE CONVERSATION_ID=:1 AND USER_ID=:2`,
            [r.CONVERSATION_ID, req.user!.userId]);
          if (Number(part?.C ?? 0) > 0) { allowed = true; break; }
        }
      }
      if (!allowed) return res.status(403).json({ error: 'FORBIDDEN' });
      // deleted-for-everyone messages: block the attachment too
      if (refs.every(r => r.DELETED_AT)) return res.status(404).json({ error: 'NOT_FOUND' });
    } else {
      // profile photos are visible to all authenticated users
      const prof = await q1<{ C: number }>(
        `SELECT COUNT(*) C FROM MEMBERS WHERE PROFILE_IMAGE_FILE_ID=:1`, [Number(req.params.id)]);
      const own = Number(row.UPLOADED_BY) === req.user!.userId;
      if (!isAdmin && !own && Number(prof?.C ?? 0) === 0) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const filePath = path.join(uploadDir, row.STORED_NAME);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'FILE_MISSING' });
    res.setHeader('Content-Type', row.MIME_TYPE || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
});
