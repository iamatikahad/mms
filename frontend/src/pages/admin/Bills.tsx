import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Pagination, Badge } from '../../components/ui';
import { api, fmtDate, fmtMoney, downloadCSV } from '../../api';
import { useApp } from '../../store';

export default function Bills() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [q, setQ] = useState({ month: '', page: 1 });
  const [data, setData] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [payForm, setPayForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/bills', { params: { month: q.month, page: q.page, pageSize: 50 } });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);
  React.useEffect(() => {
    api.get('/bills/categories').then(r => setCats(r.data.rows)).catch(() => {});
    api.get('/members', { params: { pageSize: 100 } }).then(r => setMembers(r.data.rows)).catch(() => {});
  }, []);

  const openDetail = async (id: number) => {
    const r = await api.get(`/bills/${id}`);
    setDetail(r.data);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        billMonth: form.billMonth || form.BILL_MONTH,
        billCategoryId: Number(form.billCategoryId || form.BILL_CATEGORY_ID),
        amount: Number(form.amount ?? form.AMOUNT),
        billDate: form.billDate || (form.BILL_DATE ? String(form.BILL_DATE).slice(0, 10) : undefined),
        dueDate: form.dueDate || (form.DUE_DATE ? String(form.DUE_DATE).slice(0, 10) : undefined),
        description: form.description ?? form.DESCRIPTION,
        memberIds: form.memberIds,
      };
      if (modal === 'create') await api.post('/bills', payload);
      else await api.put(`/bills/${modal.BILL_ID}`, payload);
      toast('success', t('saved')); setModal(null); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const savePayment = async () => {
    setBusy(true);
    try {
      await api.post(`/bills/${detail.bill.BILL_ID}/payments`, {
        paymentDate: payForm.paymentDate, amount: Number(payForm.amount),
        paymentMethod: payForm.paymentMethod, transactionRef: payForm.transactionRef, description: payForm.description,
      });
      toast('success', t('saved'));
      openDetail(detail.bill.BILL_ID); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const toggleAlloc = async (billId: number, memberId: number, isEligible: number) => {
    const reason = isEligible ? null : window.prompt(t('reason'));
    if (!isEligible && reason === null) return;
    await api.put(`/bills/${billId}/allocations/${memberId}`, { isEligible: !isEligible, exclusionReason: reason });
    openDetail(billId); load();
  };

  const cols = [
    { key: 'BILL_MONTH', label: t('month') },
    { key: 'CATEGORY_NAME', label: t('billCategory') },
    { key: 'AMOUNT', label: t('amount'), render: (r: any) => fmtMoney(r.AMOUNT) },
    { key: 'BILL_DATE', label: t('billDate'), render: (r: any) => fmtDate(r.BILL_DATE) },
    { key: 'PAYMENT_STATUS', label: t('paymentStatus'), render: (r: any) => <Badge color={r.PAYMENT_STATUS === 'PAID' ? 'green' : r.PAYMENT_STATUS === 'PARTIAL' ? 'amber' : 'red'}>{t(r.PAYMENT_STATUS.toLowerCase())}</Badge> },
    { key: 'ALLOC_COUNT', label: t('memberWise'), render: (r: any) => `${r.ALLOC_COUNT} · ${fmtMoney(r.ALLOC_SUM)}` },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
    { key: 'actions', label: t('actions'), render: (r: any) => (
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => openDetail(r.BILL_ID)}>{t('view' as any) || 'View'}</button>
        {r.STATUS === 'ACTIVE' && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setForm({ ...r, memberIds: undefined }); setModal(r); }}>{t('edit')}</button>}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('monthlyBills')}</h1>
        <Input type="month" value={q.month} onChange={e => setQ({ ...q, month: e.target.value, page: 1 })} className="!w-40" />
        <button className="btn-secondary" onClick={() => downloadCSV('bills', data?.rows || [])}>{t('export')}</button>
        <button className="btn-primary" onClick={() => { setForm({ billMonth: q.month || new Date().toISOString().slice(0, 7) }); setModal('create'); }}>+ {t('addBill')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <>
          <DataTable columns={cols} rows={data?.rows || []} />
          <Pagination page={q.page} pageSize={50} total={data?.total || 0} onPage={p => setQ({ ...q, page: p })} />
        </>}
      </Card>

      {/* bill form */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('addBill') : t('edit')} wide>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label={t('month')} required><Input type="month" value={form.billMonth || form.BILL_MONTH || ''} onChange={e => setForm({ ...form, billMonth: e.target.value })} /></Field>
          <Field label={t('billCategory')} required><Select value={form.billCategoryId || form.BILL_CATEGORY_ID || ''} onChange={e => setForm({ ...form, billCategoryId: e.target.value })}>
            <option value="">—</option>{cats.map(c => <option key={c.BILL_CATEGORY_ID} value={c.BILL_CATEGORY_ID}>{c.CATEGORY_NAME}</option>)}
          </Select></Field>
          <Field label={t('amount')} required><Input type="number" step="0.01" value={form.amount ?? form.AMOUNT ?? ''} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label={t('billDate')}><Input type="date" value={form.billDate || (form.BILL_DATE ? String(form.BILL_DATE).slice(0, 10) : '')} onChange={e => setForm({ ...form, billDate: e.target.value })} /></Field>
          <Field label={t('dueDate')}><Input type="date" value={form.dueDate || (form.DUE_DATE ? String(form.DUE_DATE).slice(0, 10) : '')} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label={t('description')}><Input value={form.description ?? form.DESCRIPTION ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-slate-500 mt-2">Allocation: equal among eligible members (exact reconciliation). Leave member selection empty for all eligible.</p>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>

      {/* bill detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`${t('monthlyBills')} — ${detail?.bill?.BILL_MONTH}`} wide>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-slate-500">{t('billCategory')}:</span> <b>{detail.bill.CATEGORY_NAME}</b></div>
              <div><span className="text-slate-500">{t('amount')}:</span> <b>{fmtMoney(detail.bill.AMOUNT)}</b></div>
              <div><span className="text-slate-500">{t('paymentStatus')}:</span> <Badge color={detail.bill.PAYMENT_STATUS === 'PAID' ? 'green' : 'amber'}>{t(detail.bill.PAYMENT_STATUS.toLowerCase())}</Badge></div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2">{t('memberWise')} ({t('billShare')})</h4>
              <table className="w-full">
                <thead><tr><th className="th">{t('fullName')}</th><th className="th text-right">{t('amount')}</th><th className="th">{t('status')}</th><th className="th"></th></tr></thead>
                <tbody>
                  {detail.allocations.map((a: any) => (
                    <tr key={a.ALLOCATION_ID} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="td">{a.FULL_NAME} <span className="text-xs text-slate-400">{a.MEMBER_CODE}</span>{a.EXCLUSION_REASON && <div className="text-xs text-red-500">{a.EXCLUSION_REASON}</div>}</td>
                      <td className="td text-right">{fmtMoney(a.ALLOCATED_AMOUNT)}</td>
                      <td className="td"><Badge color={Number(a.IS_ELIGIBLE) ? 'green' : 'red'}>{Number(a.IS_ELIGIBLE) ? t('active') : t('excluded')}</Badge></td>
                      <td className="td"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => toggleAlloc(detail.bill.BILL_ID, a.MEMBER_ID, Number(a.IS_ELIGIBLE))}>{Number(a.IS_ELIGIBLE) ? 'Exclude' : 'Include'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2">Payments</h4>
              <table className="w-full mb-2">
                <tbody>
                  {detail.payments.map((p: any) => (
                    <tr key={p.PAYMENT_ID} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="td">{fmtDate(p.PAYMENT_DATE)}</td><td className="td">{p.PAYMENT_METHOD}</td>
                      <td className="td text-right">{fmtMoney(p.AMOUNT)}</td><td className="td">{p.TRANSACTION_REF}</td>
                    </tr>
                  ))}
                  {!detail.payments.length && <tr><td className="td text-slate-400">{t('noData')}</td></tr>}
                </tbody>
              </table>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                <Field label={t('date')}><Input type="date" value={payForm.paymentDate || ''} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} /></Field>
                <Field label={t('amount')}><Input type="number" step="0.01" value={payForm.amount || ''} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></Field>
                <Field label={t('paymentMethod')}><Select value={payForm.paymentMethod || 'CASH'} onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}>
                  {['CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'OTHER'].map(m => <option key={m} value={m}>{t(m.toLowerCase())}</option>)}
                </Select></Field>
                <Field label={t('transactionRef')}><Input value={payForm.transactionRef || ''} onChange={e => setPayForm({ ...payForm, transactionRef: e.target.value })} /></Field>
                <button className="btn-primary" disabled={busy} onClick={savePayment}>{t('add')}</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
