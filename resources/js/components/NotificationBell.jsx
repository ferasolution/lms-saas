import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import Icon from './Icon';

const ICON = {
    announcement: 'flag', platform: 'flag', review: 'sparkle', question: 'quiz', reply: 'quiz',
    submission: 'file', graded: 'check', payment: 'receipt', payment_approved: 'check', payment_rejected: 'alert',
    certificate: 'award', billing: 'wallet',
};

/** The bell: unread count, a dropdown list, and links into the app. Polls once a minute. */
export default function NotificationBell({ tenant, align = 'left', dark = false }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [data, setData] = useState({ unread: 0, data: [] });
    const ref = useRef(null);

    const load = useCallback(() => api('notifications', { tenant }).then(setData).catch(() => {}), [tenant]);

    useEffect(() => {
        load();
        const t = setInterval(() => document.visibilityState === 'visible' && load(), 60000);
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => {
        if (!open) return;
        const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
        const esc = (e) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
    }, [open]);

    async function readAll() {
        const r = await api('notifications/read', { method: 'POST', tenant, body: {} }).catch(() => null);
        if (r) setData((d) => ({ unread: 0, data: d.data.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) }));
    }

    function openItem(n) {
        setOpen(false);
        if (!n.read_at) {
            api('notifications/read', { method: 'POST', tenant, body: { ids: [n.id] } }).then((r) => setData((d) => ({ unread: r.unread, data: d.data.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) }))).catch(() => {});
        }
        if (n.url) navigate(`/${tenant}${n.url === '/' ? '' : n.url}`);
    }

    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open}
                className={`relative grid h-9 w-9 place-items-center rounded-lg transition ${dark ? 'text-white hover:bg-white/10' : 'text-pencil hover:bg-ink-50 hover:text-ink-deep'}`}>
                <Icon name="bell" size={20} />
                {data.unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-margin px-1 text-[11px] font-bold text-white tabular-nums">
                        {data.unread > 9 ? '9+' : data.unread}
                    </span>
                )}
            </button>
            {open && (
                <div className={`z-50 overflow-hidden rounded-2xl border border-rule bg-white shadow-2xl animate-[pop_.12s_ease-out] ${align === 'right'
                    ? 'fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96'
                    : 'absolute left-0 mt-2 w-96'}`}>
                    <div className="flex items-center justify-between border-b border-rule px-4 py-3">
                        <p className="font-bold text-ink-deep">Notifications</p>
                        {data.unread > 0 && <button type="button" onClick={readAll} className="text-sm font-bold text-ink hover:underline">Mark all as read</button>}
                    </div>
                    <ul className="max-h-[60vh] overflow-y-auto">
                        {data.data.length === 0 ? (
                            <li className="px-4 py-10 text-center text-pencil">You’re all caught up.</li>
                        ) : data.data.map((n) => (
                            <li key={n.id}>
                                <button type="button" onClick={() => openItem(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-paper ${n.read_at ? '' : 'bg-ink-50/50'}`}>
                                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${n.type.includes('rejected') ? 'bg-margin/10 text-margin' : n.type.includes('approved') || n.type === 'graded' || n.type === 'certificate' ? 'bg-leaf-50 text-leaf' : 'bg-ink-50 text-ink'}`}>
                                        <Icon name={ICON[n.type] ?? 'bell'} size={16} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={`block text-[15px] leading-snug ${n.read_at ? 'text-graphite' : 'font-bold text-ink-deep'}`}>{n.title}</span>
                                        {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-pencil">{n.body}</span>}
                                        <span className="mt-1 block text-xs text-pencil">{relative(n.created_at)}</span>
                                    </span>
                                    {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-margin" aria-label="Unread" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
