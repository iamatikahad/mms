import { Router } from 'express';
import path from 'path';
import { authMiddleware, requirePerm, requireRole } from '../middleware';
import { getAdminReport, getMemberReport } from './reportData';
import { getMessName, buildDocDefinition } from '../services/pdfReport';
import { monthOf } from '../db';
import { toDateOnly } from '../util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake/src/printer');
const printer = new PdfPrinter({
  MessFont: {
    normal: path.resolve(__dirname, '../../assets/fonts/nirmala-ui-regular.ttf'),
    bold: path.resolve(__dirname, '../../assets/fonts/nirmala-ui-bold.ttf'),
    italics: path.resolve(__dirname, '../../assets/fonts/nirmala-ui-regular.ttf'),
    bolditalics: path.resolve(__dirname, '../../assets/fonts/nirmala-ui-bold.ttf'),
  },
});

export const pdfRouter = Router();
pdfRouter.use(authMiddleware);

function sendPdf(res: any, docDefinition: any, filename: string) {
  const doc = printer.createPdfKitDocument(docDefinition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
}

// Admin PDF: /api/pdf/admin/:type?month=&from=&to=&memberId=&lang=
pdfRouter.get('/admin/:type', requirePerm('reports.view'), async (req, res, next) => {
  try {
    if (req.user!.roleName === 'MEMBER') return res.status(403).json({ error: 'FORBIDDEN' });
    const type = req.params.type;
    const month = String(req.query.month || monthOf(new Date()));
    const data = await getAdminReport(type, {
      month,
      memberId: req.query.memberId ? Number(req.query.memberId) : null,
      from: req.query.from ? toDateOnly(String(req.query.from)) : null,
      to: req.query.to ? toDateOnly(String(req.query.to)) : null,
    });
    const [messName] = await Promise.all([getMessName()]);
    const dd = buildDocDefinition({
      messName, reportType: type, lang: String(req.query.lang || 'en'),
      period: month, data,
    });
    sendPdf(res, dd, `${type}-${month}.pdf`);
  } catch (e: any) {
    if (e?.status === 404) return res.status(404).json({ error: 'UNKNOWN_REPORT' });
    next(e);
  }
});

// Member PDF: /api/pdf/my/:type?month=&lang=
pdfRouter.get('/my/:type', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const type = req.params.type;
    const month = String(req.query.month || monthOf(new Date()));
    const data = await getMemberReport(type, memberId, month);
    const messName = await getMessName();
    const dd = buildDocDefinition({
      messName, reportType: type, lang: String(req.query.lang || 'en'),
      period: month, data,
      memberName: data.member?.fullName || (req.user as any).fullName || req.user!.username,
    });
    sendPdf(res, dd, `my-${type}-${month}.pdf`);
  } catch (e: any) {
    if (e?.status === 404) return res.status(404).json({ error: 'UNKNOWN_REPORT' });
    next(e);
  }
});
