import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Badge, Spinner } from '../../components/ui';
import { api, fmtDate } from '../../api';
import { useApp } from '../../store';

export default function MyNotifications() {
  const { t } = useTranslation();
  const { toast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/notifications/my');
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const markRead = async (id: number) => { await api.post(`/notifications/my/${id}/read`); load(); };
  const markAll = async () => { await api.post('/notifications/my/read-all'); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('notificationsTitle')}</h1>
        <button className="btn-secondary" onClick={markAll}>{t('markAllRead')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.rows?.map((n: any) => (
              <div key={n.NOTIFICATION_ID} className={`py-3 px-2 flex gap-3 ${n.IS_READ ? 'opacity-60' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${n.IS_READ ? 'bg-slate-300' : 'bg-brand-500'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{n.TITLE}</b>
                    <Badge color="blue">{n.NOTIF_TYPE}</Badge>
                    <span className="text-xs text-slate-400">{fmtDate(n.CREATED_AT)}</span>
                  </div>
                  {n.MESSAGE && <div className="text-sm text-slate-600 dark:text-slate-300">{n.MESSAGE}</div>}
                </div>
                {!Number(n.IS_READ) && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => markRead(n.NOTIFICATION_ID)}>{t('markAllRead')}</button>}
              </div>
            ))}
            {!data?.rows?.length && <div className="text-center text-slate-400 py-10">{t('noData')}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}
