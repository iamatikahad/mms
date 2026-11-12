import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Pagination, Badge, SearchBox } from '../../components/ui';
import { api, fmtDate, fmtMoney, downloadCSV } from '../../api';
import { useApp } from '../../store';

export default function Bazar() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [q, setQ] = useState({ search: '', category: '', month: '', page: 1 });
  const [data, setData] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/bazar', { params: { search: q.search, category: q.category, month: q.month, page: q.page, pageSize: 20 } });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);
  React.useEffect(() => {
    api.get('/bazar/categories').then(r => setCats(r.data.rows)).catch(() => {});
    api.get('/members', { params: { pageSize: 100 } }).then(r => setMembers(r.data.rows)).catch(() => {});
  }, []);

  const total = Number(form.quantity || 0) * Number(form.unitPrice || 0);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        itemName: form.ITEM_NAME || form.itemName,
        category: form.CATEGORY || form.category,
        purchaseDate: form.PURCHASE_DATE || form.purchaseDate,
        purchasedByMemberId: (form.purchasedByMemberId || form.PURCHASED_BY_MEMBER_ID) ? Number(form.purchasedByMemberId || form.PURCHASED_BY_MEMBER_ID) : null,
        quantity: Number(form.QUANTITY ?? form.quantity ?? 1),
        unit: form.UNIT || form.unit,
        unitPrice: Number(form.UNIT_PRICE ?? form.unitPrice ?? 0),
        description: form.DESCRIPTION || form.description,
      };
      if (modal === 'create') await api.post('/bazar', payload);
      else await api.put(`/bazar/${modal.BAZAR_ID}`, payload);
      toast('success', t('saved')); setModal(null); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const reverse = async (r: any) => {
    const reason = window.prompt(t('reason'));
    if (reason === null) return;
    await api.post(`/bazar/${r.BAZAR_ID}/reverse`, { reason });
    toast('success', t('reversed')); load();
  };

  const cols = [
    { key: 'PURCHASE_DATE', label: t('purchaseDate'), render: (r: any) => fmtDate(r.PURCHASE_DATE) },
    { key: 'ITEM_NAME', label: t('itemName') },
    { key: 'CATEGORY', label: t('category') },
    { key: 'QUANTITY', label: t('quantity'), render: (r: any) => `${r.QUANTITY} ${r.UNIT || ''}` },
    { key: 'UNIT_PRICE', label: t('unitPrice'), render: (r: any) => fmtMoney(r.UNIT_PRICE) },
    { key: 'TOTAL_PRICE', label: t('totalPrice'), render: (r: any) => <b>{fmtMoney(r.TOTAL_PRICE)}</b> },
    { key: 'PURCHASED_BY_NAME', label: t('purchasedBy') },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
    { key: 'actions', label: t('actions'), render: (r: any) => r.STATUS === 'ACTIVE' && (
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setForm({ ...r, purchasedByMemberId: r.MEMBER_ID }); setModal(r); }}>{t('edit')}</button>
        <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={() => reverse(r)}>{t('reverse')}</button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('bazar')}</h1>
        <SearchBox value={q.search} onChange={v => setQ({ ...q, search: v, page: 1 })} />
        <Select value={q.category} onChange={e => setQ({ ...q, category: e.target.value, page: 1 })} className="!w-44">
          <option value="">{t('category')}</option>
          {cats.map(c => <option key={c.EXPENSE_CATEGORY_ID} value={c.CATEGORY_NAME}>{c.CATEGORY_NAME}</option>)}
        </Select>
        <Input type="month" value={q.month} onChange={e => setQ({ ...q, month: e.target.value, page: 1 })} className="!w-40" />
        <button className="btn-secondary" onClick={() => downloadCSV('bazar', data?.rows || [])}>{t('export')}</button>
        <button className="btn-primary" onClick={() => { setForm({ purchaseDate: new Date().toISOString().slice(0, 10), quantity: 1 }); setModal('create'); }}>+ {t('addExpense')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <>
          <DataTable columns={cols} rows={data?.rows || []} />
          <Pagination page={q.page} pageSize={20} total={data?.total || 0} onPage={p => setQ({ ...q, page: p })} />
        </>}
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('addExpense') : t('edit')} wide>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label={t('itemName')} required><Input value={form.ITEM_NAME || form.itemName || ''} onChange={e => setForm({ ...form, ITEM_NAME: e.target.value })} /></Field>
          <Field label={t('category')}><Select value={form.CATEGORY || form.category || ''} onChange={e => setForm({ ...form, CATEGORY: e.target.value })}>
            <option value="">—</option>{cats.map(c => <option key={c.EXPENSE_CATEGORY_ID} value={c.CATEGORY_NAME}>{c.CATEGORY_NAME}</option>)}
          </Select></Field>
          <Field label={t('purchaseDate')} required><Input type="date" value={form.PURCHASE_DATE ? String(form.PURCHASE_DATE).slice(0, 10) : (form.purchaseDate || '')} onChange={e => setForm({ ...form, PURCHASE_DATE: e.target.value, purchaseDate: e.target.value })} /></Field>
          <Field label={t('purchasedBy')}><Select value={form.purchasedByMemberId || ''} onChange={e => setForm({ ...form, purchasedByMemberId: e.target.value })}>
            <option value="">—</option>{members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
          </Select></Field>
          <Field label={t('quantity')}><Input type="number" step="0.001" value={form.QUANTITY ?? form.quantity ?? 1} onChange={e => setForm({ ...form, QUANTITY: e.target.value, quantity: e.target.value })} /></Field>
          <Field label={t('unit')}><Input value={form.UNIT || form.unit || ''} onChange={e => setForm({ ...form, UNIT: e.target.value })} /></Field>
          <Field label={t('unitPrice')} required><Input type="number" step="0.01" value={form.UNIT_PRICE ?? form.unitPrice ?? ''} onChange={e => setForm({ ...form, UNIT_PRICE: e.target.value, unitPrice: e.target.value })} /></Field>
          <Field label={t('totalPrice')}><Input value={fmtMoney(total)} disabled /></Field>
          <Field label={t('description')}><Input value={form.DESCRIPTION || form.description || ''} onChange={e => setForm({ ...form, DESCRIPTION: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
