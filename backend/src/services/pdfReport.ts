import path from 'path';
import { q1 } from '../db';
import { clobText } from '../db';
import type { ReportResult } from '../routes/reportData';

const CREDIT = 'Developed & Maintained by Atikahad';
const FALLBACK_NAME = 'The Attic 712';

const FONTS = path.resolve(__dirname, '../../assets/fonts');
const fontDescriptors = {
  MessFont: {
    normal: path.join(FONTS, 'nirmala-ui-regular.ttf'),
    bold: path.join(FONTS, 'nirmala-ui-bold.ttf'),
    italics: path.join(FONTS, 'nirmala-ui-regular.ttf'),
    bolditalics: path.join(FONTS, 'nirmala-ui-bold.ttf'),
  },
};

export async function getMessName(): Promise<string> {
  try {
    const row = await q1<{ SETTING_VALUE: any }>(
      `SELECT SETTING_VALUE FROM SYSTEM_SETTINGS WHERE SETTING_KEY='app.mess_name'`);
    const v = await clobText(row?.SETTING_VALUE);
    return v && v.trim() ? v.replace(/^"|"$/g, '').trim() : FALLBACK_NAME;
  } catch {
    return FALLBACK_NAME;
  }
}

// ---------- labels ----------
const LABELS: Record<string, { en: string; bn: string }> = {
  MEAL_DATE: { en: 'Date', bn: 'তারিখ' }, MEAL_TYPE: { en: 'Meal', bn: 'খাবার' },
  MEMBER_CODE: { en: 'Code', bn: 'কোড' }, FULL_NAME: { en: 'Member Name', bn: 'সদস্যের নাম' },
  REGULAR_QTY: { en: 'Regular Qty', bn: 'নিয়মিত সংখ্যা' }, TOTAL_QTY: { en: 'Total Qty', bn: 'মোট সংখ্যা' },
  MEMBERS_EATING: { en: 'Members', bn: 'সদস্য' }, HOST_CODE: { en: 'Host Code', bn: 'হোস্ট কোড' },
  HOST_NAME: { en: 'Host Member', bn: 'হোস্ট সদস্য' }, GUEST_QTY: { en: 'Guest Qty', bn: 'অতিথি সংখ্যা' },
  NOTES: { en: 'Notes', bn: 'নোট' }, STATUS: { en: 'Status', bn: 'অবস্থা' },
  PURCHASE_DATE: { en: 'Purchase Date', bn: 'কেনার তারিখ' }, ITEM_NAME: { en: 'Item', bn: 'জিনিস' },
  CATEGORY: { en: 'Category', bn: 'ক্যাটাগরি' }, CATEGORY_NAME: { en: 'Category', bn: 'ক্যাটাগরি' },
  QUANTITY: { en: 'Qty', bn: 'পরিমাণ' }, UNIT: { en: 'Unit', bn: 'একক' },
  UNIT_PRICE: { en: 'Unit Price', bn: 'একক মূল্য' }, TOTAL_PRICE: { en: 'Total Price', bn: 'মোট মূল্য' },
  PURCHASED_BY: { en: 'Purchased By', bn: 'ক্রয়কারী' },
  DEPOSIT_DATE: { en: 'Deposit Date', bn: 'জমার তারিখ' }, AMOUNT: { en: 'Amount', bn: 'টাকা' },
  PAYMENT_METHOD: { en: 'Method', bn: 'পদ্ধতি' }, TRANSACTION_REF: { en: 'Ref', bn: 'রেফ' },
  CHARGE_DATE: { en: 'Charge Date', bn: 'চার্জের তারিখ' }, DESCRIPTION: { en: 'Description', bn: 'বিবরণ' },
  REFERENCE: { en: 'Reference', bn: 'রেফারেন্স' }, BILL_DATE: { en: 'Bill Date', bn: 'বিলের তারিখ' },
  PAYMENT_STATUS: { en: 'Payment', bn: 'পেমেন্ট' }, ALLOCATED_MEMBERS: { en: 'Members', bn: 'সদস্য' },
  TOTAL_ALLOCATED: { en: 'Allocated', bn: 'বরাদ্দ' }, CNT: { en: 'Count', bn: 'সংখ্যা' }, QTY: { en: 'Qty', bn: 'পরিমাণ' },
  TOTAL: { en: 'Total', bn: 'মোট' }, LUNCH: { en: 'Lunch', bn: 'দুপুর' }, DINNER: { en: 'Dinner', bn: 'রাত' },
  // member balance breakdown (camelCase)
  memberId: { en: 'Member ID', bn: 'সদস্য আইডি' }, fullName: { en: 'Member Name', bn: 'সদস্যের নাম' },
  memberCode: { en: 'Code', bn: 'কোড' }, regularMeals: { en: 'Regular Meals', bn: 'নিয়মিত খাবার' },
  guestMeals: { en: 'Guest Meals', bn: 'অতিথি খাবার' }, totalMeals: { en: 'Total Meals', bn: 'মোট খাবার' },
  foodCost: { en: 'Food Cost', bn: 'খাবারের খরচ' }, billAllocation: { en: 'Bill Share', bn: 'বিল ভাগ' },
  otherCharges: { en: 'Other Charges', bn: 'অন্যান্য চার্জ' }, totalPayable: { en: 'Total Payable', bn: 'মোট প্রদেয়' },
  totalDeposits: { en: 'Total Deposits', bn: 'মোট জমা' }, balance: { en: 'Balance', bn: 'ব্যালেন্স' },
  // financials
  month: { en: 'Month', bn: 'মাস' }, foodExpense: { en: 'Food Expense', bn: 'খাবারের খরচ' },
  totalBills: { en: 'Bills Total', bn: 'বিল মোট' }, mealRate: { en: 'Meal Rate', bn: 'খাবারের রেট' },
  mealCount: { en: 'Meal Count', bn: 'খাবারের সংখ্যা' },
};

const REPORT_TITLES: Record<string, { en: string; bn: string }> = {
  'daily-meals': { en: 'Daily Meal Report', bn: 'দৈনিক খাবার রিপোর্ট' },
  'monthly-meals': { en: 'Monthly Meal Report', bn: 'মাসিক খাবার রিপোর্ট' },
  'member-meals': { en: 'Member-wise Meal Report', bn: 'সদস্য অনুযায়ী খাবার রিপোর্ট' },
  'guest-meals': { en: 'Guest Meal Report', bn: 'অতিথি খাবার রিপোর্ট' },
  'bazar': { en: 'Bazar Expense Report', bn: 'বাজার খরচ রিপোর্ট' },
  'food-expense': { en: 'Food Expense Report', bn: 'খাবারের খরচ রিপোর্ট' },
  'monthly-bills': { en: 'Monthly Bill Report', bn: 'মাসিক বিল রিপোর্ট' },
  'bill-categories': { en: 'Bill Category Report', bn: 'বিল ক্যাটাগরি রিপোর্ট' },
  'deposits': { en: 'Deposit Report', bn: 'জমা রিপোর্ট' },
  'member-balances': { en: 'Member Balance Report', bn: 'সদস্য ব্যালেন্স রিপোর্ট' },
  'outstanding': { en: 'Outstanding Balance Report', bn: 'বাকি ব্যালেন্স রিপোর্ট' },
  'advances': { en: 'Advance Balance Report', bn: 'অগ্রিম ব্যালেন্স রিপোর্ট' },
  'monthly-summary': { en: 'Monthly Financial Summary', bn: 'মাসিক আর্থিক সারসংক্ষেপ' },
  'closing-report': { en: 'Monthly Closing Report', bn: 'মাসিক ক্লোজিং রিপোর্ট' },
  // member reports
  'meals': { en: 'My Meal Report', bn: 'আমার খাবার রিপোর্ট' },
  'guests': { en: 'My Guest Meal Report', bn: 'আমার অতিথি খাবার রিপোর্ট' },
  'charges': { en: 'My Charges Report', bn: 'আমার চার্জ রিপোর্ট' },
  'bills': { en: 'My Bill Report', bn: 'আমার বিল রিপোর্ট' },
  'summary': { en: 'My Monthly Summary', bn: 'আমার মাসিক সারসংক্ষেপ' },
};

const MONEY_RE = /AMOUNT|TOTAL(?!_QTY|_MEALS)|COST|PAYABLE|DEPOSIT|BALANCE|RATE|SHARE|CHARGES|PRICE|ALLOCATED|ALLOCATION|EXPENSE|BILLS/i;
const NOT_MONEY_RE = /QTY|COUNT|MEALS$|MEALS_EATING|MEMBERS|EATING|MEMBER_ID|ID$/i;
const isMoneyKey = (k: string) => MONEY_RE.test(k) && !NOT_MONEY_RE.test(k);

function fmtMoney(v: any): string {
  const n = Number(v);
  if (!isFinite(n)) return String(v ?? '');
  return `৳ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCell(key: string, v: any, money = isMoneyKey(key)): string {
  if (v === null || v === undefined) return '';
  if (money && typeof v === 'number') return fmtMoney(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toLocaleString('en-US');
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function label(key: string, lang: string): string {
  const l = LABELS[key];
  if (l) return l[lang === 'bn' ? 'bn' : 'en'];
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function kvRows(obj: any, lang: string): any[][] {
  return Object.entries(obj || {}).map(([k, v]) => [
    { text: label(k, lang), bold: true },
    { text: isMoneyKey(k) && typeof v === 'number' ? fmtMoney(v) : String(v ?? ''), alignment: isMoneyKey(k) ? 'right' : 'left' },
  ]);
}

/** Build a pdfmake docDefinition from a ReportResult. */
export function buildDocDefinition(opts: {
  messName: string; reportType: string; lang?: string;
  period?: string; data: ReportResult; memberName?: string;
}): any {
  const lang = opts.lang === 'bn' ? 'bn' : 'en';
  const title = (REPORT_TITLES[opts.reportType] || { en: opts.reportType, bn: opts.reportType })[lang];
  const now = new Date();
  const genStr = now.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' (Asia/Dhaka)';

  const content: any[] = [
    { text: opts.messName, style: 'messName' },
    { text: title, style: 'reportTitle' },
    {
      text: [
        opts.period ? `${lang === 'bn' ? 'মাস' : 'Period'}: ${opts.period}` : '',
        opts.memberName ? ` · ${opts.memberName}` : '',
        ` · ${lang === 'bn' ? 'প্রস্তুত' : 'Generated'}: ${genStr}`,
      ].filter(Boolean).join(''),
      style: 'meta', margin: [0, 2, 0, 10],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#94a3b8' }], margin: [0, 0, 0, 10] },
  ];

  const d = opts.data;

  // financial summary block
  if (d.financials) {
    content.push({ text: lang === 'bn' ? 'আর্থিক সারসংক্ষেপ' : 'Financial Summary', style: 'sectionTitle', margin: [0, 4, 0, 4] });
    content.push({
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          ['Meal Rate', 'Food Expense', 'Bills Total', 'Deposits Total'].map(h => ({ text: h, style: 'th' })),
          [
            { text: fmtMoney(d.financials.mealRate), style: 'tdRight' },
            { text: fmtMoney(d.financials.foodExpense), style: 'tdRight' },
            { text: fmtMoney(d.financials.totalBills ?? d.financials.totalBillsAmount), style: 'tdRight' },
            { text: fmtMoney(d.financials.totalDeposits), style: 'tdRight' },
          ],
        ],
      },
      layout: 'lightLines', margin: [0, 0, 0, 10],
    });
  }
  if (d.totals) {
    content.push({
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          ['Food Cost', 'Bill Share', 'Other Charges', 'Total Payable'].map(h => ({ text: h, style: 'th' })),
          [
            { text: fmtMoney(d.totals.foodCost), style: 'tdRight' },
            { text: fmtMoney(d.totals.billAllocation), style: 'tdRight' },
            { text: fmtMoney(d.totals.otherCharges), style: 'tdRight' },
            { text: fmtMoney(d.totals.totalPayable), style: 'tdRight' },
          ],
          ['Total Deposits', 'Balance', '', ''].map((h, i) => ({ text: h, style: 'th' })),
          [
            { text: fmtMoney(d.totals.totalDeposits), style: 'tdRight' },
            { text: fmtMoney(d.totals.balance), style: d.totals.balance < 0 ? 'tdRightNeg' : 'tdRight' },
            '', '',
          ],
        ],
      },
      layout: 'lightLines', margin: [0, 0, 0, 10],
    });
  }
  if (d.summary) {
    content.push({
      table: {
        widths: ['*', '*', '*'],
        body: [
          ['Food Expense', 'Total Meals', 'Meal Rate'].map(h => ({ text: h, style: 'th' })),
          [
            { text: fmtMoney(d.summary.foodExpense), style: 'tdRight' },
            { text: String(d.summary.totalMeals ?? ''), style: 'tdRight' },
            { text: fmtMoney(d.summary.mealRate), style: 'tdRight' },
          ],
        ],
      },
      layout: 'lightLines', margin: [0, 0, 0, 10],
    });
  }

  // main table
  if (Array.isArray(d.rows) && d.rows.length) {
    const keys = d.columns && d.columns.length ? d.columns : Object.keys(d.rows[0]);
    const wide = keys.length > 7;
    // bare 'TOTAL' is a count in meal reports but money in expense reports — decide per table
    const totalIsCount = ['REGULAR_QTY', 'TOTAL_QTY', 'LUNCH', 'DINNER', 'GUEST_QTY'].some(k => keys.includes(k));
    const money = (k: string) => k === 'TOTAL' ? !totalIsCount : isMoneyKey(k);
    const body: any[][] = [
      keys.map(k => ({ text: label(k, lang), style: wide ? 'thSm' : 'th' })),
      ...d.rows.map(r => keys.map(k => ({
        text: fmtCell(k, r[k], money(k)),
        style: money(k) ? (wide ? 'tdRightSm' : 'tdRight') : (wide ? 'tdSm' : 'td'),
        alignment: money(k) ? 'right' : undefined,
      }))),
    ];
    content.push({
      table: { headerRows: 1, widths: keys.map(() => '*'), body },
      layout: 'lightLines',
    });
    content.push({ text: `${lang === 'bn' ? 'মোট রেকর্ড' : 'Total records'}: ${d.rows.length}`, style: 'meta', margin: [0, 6, 0, 0] });
  } else if (Array.isArray(d.members) && d.members.length && typeof d.members[0] === 'object') {
    // closing-report member snapshot
    const keys = ['fullName', 'totalMeals', 'foodCost', 'billAllocation', 'otherCharges', 'totalPayable', 'totalDeposits', 'balance'];
    const wide2 = true;
    const body: any[][] = [
      keys.map(k => ({ text: label(k, lang), style: 'thSm' })),
      ...d.members.map((m: any) => keys.map(k => ({
        text: k === 'fullName' ? String(m[k] ?? '') : fmtCell(k, m[k]),
        style: k === 'fullName' ? 'tdSm' : 'tdRightSm',
        alignment: k === 'fullName' ? undefined : 'right',
      }))),
    ];
    content.push({ table: { headerRows: 1, widths: keys.map(() => '*'), body }, layout: 'lightLines' });
  } else if (typeof d.members === 'number') {
    content.push({ text: `${lang === 'bn' ? 'সদস্য সংখ্যা' : 'Members'}: ${d.members}`, style: 'meta', margin: [0, 10, 0, 0] });
  } else if (d.member) {
    content.push({
      table: { widths: [200, '*'], body: kvRows(d.member, lang) },
      layout: 'lightLines', margin: [0, 0, 0, 10],
    });
  } else {
    content.push({ text: lang === 'bn' ? 'কোন ডেটা নেই' : 'No data available for this period.', style: 'meta', margin: [0, 20, 0, 0] });
  }

  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 55, 45],
    defaultStyle: { font: 'MessFont', fontSize: 9, color: '#1e293b' },
    styles: {
      messName: { fontSize: 16, bold: true, color: '#1d4ed8', margin: [0, 0, 0, 2] },
      reportTitle: { fontSize: 12, bold: true, color: '#334155' },
      meta: { fontSize: 8, color: '#64748b' },
      sectionTitle: { fontSize: 10, bold: true, color: '#334155' },
      th: { bold: true, fontSize: 8, fillColor: '#e2e8f0', color: '#0f172a', margin: [3, 3, 3, 3] },
      td: { fontSize: 8, margin: [3, 2, 3, 2] },
      tdRight: { fontSize: 8, margin: [3, 2, 3, 2], alignment: 'right' },
      tdRightNeg: { fontSize: 8, margin: [3, 2, 3, 2], alignment: 'right', color: '#dc2626' },
      thSm: { bold: true, fontSize: 7, fillColor: '#e2e8f0', color: '#0f172a', margin: [2, 2, 2, 2] },
      tdSm: { fontSize: 7, margin: [2, 1.5, 2, 1.5] },
      tdRightSm: { fontSize: 7, margin: [2, 1.5, 2, 1.5], alignment: 'right' },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: CREDIT, style: 'meta', width: '*' },
        { text: `${lang === 'bn' ? 'পৃষ্ঠা' : 'Page'} ${currentPage} / ${pageCount}`, style: 'meta', width: 'auto', alignment: 'center' },
        { text: genStr, style: 'meta', width: 'auto', alignment: 'right' },
      ],
      margin: [40, 5, 40, 0],
    }),
    content,
  };
}
