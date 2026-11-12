import { Router } from 'express';
import { authMiddleware, requirePerm, requireRole } from '../middleware';
import { monthOf } from '../db';
import { toDateOnly } from '../util';
import { getAdminReport, getMemberReport } from './reportData';

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);

// ---------- ADMIN REPORTS ----------
reportsRouter.get('/admin/:type', requirePerm('reports.view'), async (req, res, next) => {
  try {
    if (req.user!.roleName === 'MEMBER') return res.status(403).json({ error: 'FORBIDDEN' });
    const result = await getAdminReport(req.params.type, {
      month: String(req.query.month || monthOf(new Date())),
      memberId: req.query.memberId ? Number(req.query.memberId) : null,
      from: req.query.from ? toDateOnly(String(req.query.from)) : null,
      to: req.query.to ? toDateOnly(String(req.query.to)) : null,
    });
    res.json(result);
  } catch (e: any) {
    if (e?.status === 404) return res.status(404).json({ error: 'UNKNOWN_REPORT' });
    next(e);
  }
});

// ---------- MEMBER REPORTS (own data only) ----------
reportsRouter.get('/my/:type', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const result = await getMemberReport(req.params.type, memberId, String(req.query.month || monthOf(new Date())));
    res.json(result);
  } catch (e: any) {
    if (e?.status === 404) return res.status(404).json({ error: 'UNKNOWN_REPORT' });
    next(e);
  }
});
