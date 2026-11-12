import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { pingDb } from './db';
import { authRouter } from './routes/auth';
import { membersRouter } from './routes/members';
import { mealsRouter } from './routes/meals';
import { guestsRouter } from './routes/guests';
import { bazarRouter } from './routes/bazar';
import { billsRouter } from './routes/bills';
import { depositsRouter } from './routes/deposits';
import { chargesRouter } from './routes/charges';
import { dashboardRouter } from './routes/dashboard';
import { reportsRouter } from './routes/reports';
import { flowchartRouter } from './routes/flowchart';
import { closingRouter } from './routes/closing';
import { notificationsRouter } from './routes/notifications';
import { adminsRouter } from './routes/admins';
import { auditRouter } from './routes/auditlogs';
import { settingsRouter } from './routes/settings';
import { filesRouter } from './routes/files';
import { profileRouter } from './routes/profile';
import { createServer } from 'http';
import { initSocket } from './socket';
import { chatRouter } from './routes/chat';
import { pollsRouter } from './routes/polls';
import { pdfRouter } from './routes/pdf';
import { startReminderScheduler } from './services/reminders';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Cloudflare Tunnel / reverse proxy: real client IP + https detection
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await pingDb();
    res.json({ ok: true, db: 'connected' });
  } catch (e: any) {
    res.status(503).json({ ok: false, db: 'disconnected', error: String(e?.message || e) });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/members', membersRouter);
app.use('/api/meals', mealsRouter);
app.use('/api/guests', guestsRouter);
app.use('/api/bazar', bazarRouter);
app.use('/api/bills', billsRouter);
app.use('/api/deposits', depositsRouter);
app.use('/api/charges', chargesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/flowchart', flowchartRouter);
app.use('/api/closing', closingRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admins', adminsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/files', filesRouter);
app.use('/api/profile', profileRouter);
app.use('/api/pdf', pdfRouter);
app.use('/api/chat', chatRouter);
app.use('/api/polls', pollsRouter);

// error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = err?.status || (err?.code === 'ORA-00001' ? 409 : 500);
  const code = err?.code;
  if (code === 'FILE_TYPE_NOT_ALLOWED') return res.status(400).json({ error: 'FILE_TYPE_NOT_ALLOWED' });
  const safe = typeof err?.message === 'string' && /^[A-Z0-9_]+$/.test(err.message) ? err.message : 'INTERNAL_ERROR';
  if (safe === 'FILE_TYPE_NOT_ALLOWED') return res.status(400).json({ error: safe });
  res.status(status).json({ error: safe });
});

// serve built frontend in production
const clientDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (e) => { if (e) next(); });
});

const server = createServer(app);
initSocket(server);
startReminderScheduler();
server.listen(config.port, () => {
  console.log(`Mess backend listening on http://localhost:${config.port}`);
});
