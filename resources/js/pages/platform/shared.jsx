import { useEffect, useState } from 'react';
import { api, download, session } from '../../lib/api';
import { date, dateTime, money, moneyList, PAYMENT_METHODS, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, Skeleton } from '../../components/ui';

export const KEY = '__platform';
export const call = (path, opts = {}) => api(`platform/${path}`, { ...opts, token: session.token(KEY) });
export const TYPE = { school: 'School', academy: 'Academy', corporate: 'Company' };
export const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export { date, dateTime, money, moneyList, PAYMENT_METHODS, relative };

export function StatusBadge({ tenant }) {
    if (tenant.status === 'suspended') return <Badge tone="danger" dot>Suspended</Badge>;
    if (tenant.status === 'trial') {
        const ended = tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date();
        return <Badge tone={ended ? 'neutral' : 'trial'} dot>{ended ? 'Trial ended' : `Trial to ${date(tenant.trial_ends_at, { day: 'numeric', month: 'short' })}`}</Badge>;
    }
    return <Badge tone="published" dot>Active</Badge>;
}

export function PlanBadge({ name, source }) {
    if (!name) return <span className="text-pencil">—</span>;
    const tone = source === 'paid' ? 'draft' : source === 'trial' ? 'trial' : 'neutral';
    return <Badge tone={tone}>{name}{source === 'trial' ? ' (trial)' : ''}</Badge>;
}

export function Kpi({ label, value, sub, icon, tone }) {
    return (
        <div className="rounded-2xl border border-rule bg-white p-4 sm:p-5">
            <p className="flex items-center gap-2 text-sm text-pencil">{icon && <Icon name={icon} size={16} />}{label}</p>
            {value === undefined ? <Skeleton className="mt-2 h-9 w-20" /> : (
                <p className={`mt-1.5 font-display text-3xl font-bold tabular-nums ${tone === 'amber' && Number(value) > 0 ? 'text-amber-700' : 'text-ink-deep'}`}>{value}</p>
            )}
            {sub && <div className="mt-1 text-sm text-pencil">{sub}</div>}
        </div>
    );
}

export function Panel({ title, action, children, className = '', padded = true }) {
    return (
        <section className={`min-w-0 rounded-2xl border border-rule bg-white ${className}`}>
            {(title || action) && (
                <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
                    <h2 className="text-lg font-bold">{title}</h2>
                    {action}
                </div>
            )}
            <div className={padded ? 'p-5' : ''}>{children}</div>
        </section>
    );
}

/** Small accessible bar chart. data: [{ label, value, title? }] */
export function Bars({ data, height = 140, format = (v) => v, labelEvery = 1 }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <figure>
            <div className="flex items-end gap-[3px]" style={{ height }} role="img"
                aria-label={data.map((d) => `${d.title ?? d.label}: ${format(d.value)}`).join(', ')}>
                {data.map((d, i) => (
                    <div key={i} className="group relative flex h-full flex-1 items-end">
                        <div className={`w-full rounded-t-[3px] transition-colors ${d.value ? 'bg-ink group-hover:bg-ink-deep' : 'bg-ink-50'}`}
                            style={{ height: `${Math.max(d.value ? 6 : 3, (d.value / max) * 100)}%` }} />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-ink-deep px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
                            {d.title ?? d.label}: <strong>{format(d.value)}</strong>
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-2 flex gap-[3px] text-[11px] text-pencil">
                {data.map((d, i) => <span key={i} className="flex-1 truncate text-center">{i % labelEvery === 0 ? d.label : ''}</span>)}
            </div>
        </figure>
    );
}

const ACTION_ICON = {
    'tenant.registered': 'building', 'auth.login': 'user', 'course.created': 'book', 'course.published': 'eye',
    'order.submitted': 'receipt', 'order.approved': 'check', 'subscription.requested': 'wallet', 'subscription.approved': 'check',
    'subscription.rejected': 'x', 'tenant.updated': 'settings', 'support.impersonate': 'shield', 'user.created': 'users', 'platform.settings': 'settings',
};

export function ActivityList({ items, showTenant = true, onTenant }) {
    if (!items) return <Skeleton className="h-40" />;
    if (!items.length) return <p className="py-6 text-center text-pencil">Nothing yet.</p>;
    return (
        <ol className="space-y-0.5">
            {items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-paper">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${a.action.startsWith('support') ? 'bg-amber-50 text-amber-700' : a.action.includes('approved') ? 'bg-leaf-50 text-leaf' : 'bg-ink-50 text-ink'}`}>
                        <Icon name={ACTION_ICON[a.action] ?? 'flag'} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-snug text-graphite">{a.description}</p>
                        <p className="mt-0.5 text-xs text-pencil">
                            {relative(a.created_at)}
                            {showTenant && a.tenant && <> · <button type="button" onClick={() => onTenant?.(a.tenant)} className="font-bold text-ink hover:underline">{a.tenant.name}</button></>}
                            {a.ip && <> · {a.ip}</>}
                        </p>
                    </div>
                </li>
            ))}
        </ol>
    );
}

export function SearchBox({ value, onChange, placeholder, className = '' }) {
    return (
        <label className={`relative block ${className}`}>
            <span className="sr-only">{placeholder}</span>
            <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-pencil" />
            <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="h-11 w-full rounded-lg border border-rule bg-white pr-3 pl-10 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
        </label>
    );
}

export function useDebounced(value, ms = 250) {
    const [v, setV] = useState(value);
    useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
    return v;
}


/** Download one of the console's CSV exports with the owner token. */
export const exportCsv = (path, name) => download(`platform/${path}`, null, name, session.token(KEY));
