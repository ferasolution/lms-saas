import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { session } from '../../lib/api';
import Icon from '../../components/Icon';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Field, Modal, PageHeader, Progress, Skeleton, Tabs, useToast } from '../../components/ui';
import { ActivityList, call, date, dateTime, money, Panel, PlanBadge, relative, SearchBox, StatusBadge, TYPE, useDebounced, usd } from './shared';

export function ConsoleTenants() {
    const [status, setStatus] = useState('');
    const [type, setType] = useState('');
    const [search, setSearch] = useState('');
    const q = useDebounced(search);
    const [rows, setRows] = useState(null);
    const [meta, setMeta] = useState(null);

    useEffect(() => {
        const qs = new URLSearchParams();
        if (status) qs.set('status', status);
        if (type) qs.set('type', type);
        if (q.trim()) qs.set('search', q.trim());
        call(`tenants?${qs}`).then((r) => { setRows(r.data); setMeta(r.meta); });
    }, [status, type, q]);

    return (
        <div>
            <PageHeader title="Institutes" description={meta ? `${meta.total} registered` : 'Everyone who has signed up.'} />
            <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <Tabs value={status} onChange={setStatus} className="border-b-0" tabs={[
                    { value: '', label: 'All' }, { value: 'trial', label: 'Trial' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' },
                ]} />
                <div className="flex gap-2">
                    <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"
                        className="h-11 rounded-lg border border-rule bg-white px-3 font-bold text-graphite focus:border-ink focus:outline-none">
                        <option value="">All types</option>
                        {Object.entries(TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <SearchBox value={search} onChange={setSearch} placeholder="Search name or address" className="w-full lg:w-72" />
                </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-white">
                {rows === null ? <div className="p-5"><Skeleton className="h-64" /></div> : rows.length === 0 ? (
                    <div className="p-8"><EmptyState icon="building" title="No institutes found" /></div>
                ) : (
                    <table className="w-full min-w-[56rem] text-left">
                        <thead className="border-b border-rule bg-paper text-sm text-pencil">
                            <tr>
                                {['Institute', 'Type', 'Plan', 'Students', 'Courses', 'Last sign-in', 'Joined', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-rule">
                            {rows.map((t) => (
                                <tr key={t.id} className="hover:bg-paper/70">
                                    <td className="px-4 py-3">
                                        <Link to={`/platform/institutes/${t.id}`} className="font-bold text-ink-deep hover:underline">{t.name}</Link>
                                        <p className="text-sm text-pencil">/{t.slug}</p>
                                    </td>
                                    <td className="px-4 py-3 text-pencil">{TYPE[t.type] ?? t.type}</td>
                                    <td className="px-4 py-3"><PlanBadge name={t.effective_plan} source={t.plan_source} /></td>
                                    <td className="px-4 py-3 tabular-nums">{t.students_count}</td>
                                    <td className="px-4 py-3 tabular-nums">{t.courses_count}</td>
                                    <td className="px-4 py-3 text-pencil">{relative(t.last_login_at)}</td>
                                    <td className="px-4 py-3 text-pencil">{date(t.created_at)}</td>
                                    <td className="px-4 py-3"><StatusBadge tenant={t} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export function ConsoleTenant() {
    const { id } = useParams();
    const toast = useToast();
    const [d, setD] = useState(null);
    const [tab, setTab] = useState('overview');
    const [planOpen, setPlanOpen] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => call(`tenants/${id}`).then(setD), [id]);
    useEffect(() => { load(); }, [load]);

    async function patch(body, msg) {
        setBusy(true);
        try {
            setD(await call(`tenants/${id}`, { method: 'PATCH', body }));
            toast(msg);
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
            setConfirm(null);
        }
    }

    async function supportSignIn() {
        try {
            const r = await call(`tenants/${id}/impersonate`, { method: 'POST' });
            session.save(r.slug, r.token);
            window.open(`/${r.slug}`, '_blank', 'noopener');
            toast(`Opened as ${r.admin.name} for 2 hours`);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    if (!d) return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-64 rounded-2xl" /></div>;
    const t = d.tenant;
    const limit = (used, max) => (max ? Math.min(100, (used / max) * 100) : 0);

    return (
        <div>
            <Link to="/platform/institutes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-pencil hover:text-ink"><Icon name="arrowLeft" size={16} />All institutes</Link>

            <header className="flex flex-col gap-5 rounded-2xl border border-rule bg-white p-5 sm:p-6 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                    {t.settings?.logo_url
                        ? <img src={t.settings.logo_url} alt="" className="h-14 w-14 rounded-xl object-contain ring-1 ring-rule" />
                        : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-ink text-white"><Icon name={t.type === 'school' ? 'school' : t.type === 'corporate' ? 'building' : 'academy'} size={26} /></span>}
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><StatusBadge tenant={t} /><PlanBadge name={d.effective.plan?.name} source={d.effective.source} /></div>
                        <h1 className="mt-1.5 truncate text-2xl font-extrabold sm:text-3xl">{t.name}</h1>
                        <p className="text-pencil">{TYPE[t.type]} · /{t.slug} · joined {date(t.created_at)}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" icon="shield" onClick={supportSignIn}>Open as admin</Button>
                    <Button variant="secondary" icon="wallet" onClick={() => setPlanOpen(true)}>Change plan</Button>
                    {t.status === 'suspended'
                        ? <Button icon="check" busy={busy} onClick={() => patch({ status: 'active' }, 'Institute reactivated')}>Reactivate</Button>
                        : <Button variant="danger" icon="lock" onClick={() => setConfirm('suspend')}>Suspend</Button>}
                </div>
            </header>

            <Tabs className="mt-8" value={tab} onChange={setTab} tabs={[
                { value: 'overview', label: 'Overview' },
                { value: 'courses', label: 'Courses', count: d.courses.length },
                { value: 'payments', label: 'Payments', count: d.orders.pending || null },
                { value: 'billing', label: 'Plan history', count: d.subscriptions.length },
                { value: 'activity', label: 'Activity' },
            ]} />

            <div className="mt-6">
                {tab === 'overview' && (
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[['Students', d.roles.student ?? 0], ['Teachers', d.roles.instructor ?? 0], ['Enrolments', d.enrollments], ['Certificates', d.certificates]].map(([l, v]) => (
                                    <div key={l} className="rounded-2xl border border-rule bg-white p-4"><p className="text-sm text-pencil">{l}</p><p className="font-display text-3xl font-bold text-ink-deep tabular-nums">{v}</p></div>
                                ))}
                            </div>
                            <Panel title="Usage against plan">
                                <div className="space-y-4">
                                    {[
                                        ['Students', d.usage.students, d.effective.plan?.max_students],
                                        ['Courses', d.usage.courses, d.effective.plan?.max_courses],
                                        ['Storage (MB)', d.usage.storage_mb, d.effective.plan?.storage_mb],
                                    ].map(([l, used, max]) => (
                                        <div key={l}>
                                            <div className="mb-1.5 flex justify-between text-sm"><span className="font-bold text-graphite">{l}</span><span className="text-pencil tabular-nums">{used} / {max ?? 'Unlimited'}</span></div>
                                            <Progress value={limit(used, max)} label={l} />
                                        </div>
                                    ))}
                                </div>
                            </Panel>
                            <Panel title="Admins" padded={false}>
                                <ul className="divide-y divide-rule">
                                    {d.admins.map((a) => (
                                        <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                                            <Avatar name={a.name} size={36} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-bold text-graphite">{a.name}</p>
                                                <p className="truncate text-sm text-pencil">{a.email}{a.phone ? ` · ${a.phone}` : ''}</p>
                                            </div>
                                            <span className="text-sm text-pencil">Last sign-in {relative(a.last_login_at).toLowerCase()}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Panel>
                        </div>
                        <div className="space-y-6">
                            <Panel title="Plan">
                                <dl className="space-y-3 text-[15px]">
                                    <Row label="Current">{d.effective.plan?.name ?? '—'} {d.effective.source === 'trial' && <span className="text-pencil">(trial)</span>}</Row>
                                    <Row label={d.effective.source === 'trial' ? 'Trial ends' : 'Renews / ends'}>{d.effective.ends_at ? date(d.effective.ends_at) : 'No end date'}</Row>
                                    <Row label="Paid plan">{t.plan?.name ?? 'None'}</Row>
                                    <Row label="Fees collected">{money(d.orders.paid_total)}</Row>
                                </dl>
                            </Panel>
                            <Panel title="Contact">
                                <dl className="space-y-3 text-[15px]">
                                    <Row label="Support email">{t.settings?.support_email || '—'}</Row>
                                    <Row label="Support phone">{t.settings?.support_phone || '—'}</Row>
                                    <Row label="Sign-in page"><a href={`/${t.slug}/login`} target="_blank" rel="noreferrer" className="font-bold text-ink hover:underline">/{t.slug}/login</a></Row>
                                </dl>
                            </Panel>
                        </div>
                    </div>
                )}

                {tab === 'courses' && (
                    <Panel padded={false}>
                        {d.courses.length === 0 ? <p className="p-6 text-pencil">No courses yet.</p> : (
                            <ul className="divide-y divide-rule">
                                {d.courses.map((c) => (
                                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                        <span className="min-w-0 flex-1 truncate font-bold text-graphite">{c.title}</span>
                                        <span className="text-sm text-pencil">{c.enrollments_count} enrolled</span>
                                        <span className="w-28 text-right text-sm text-graphite">{c.is_free || Number(c.price) === 0 ? 'Free' : money(c.sale_price ?? c.price, c.currency)}</span>
                                        <Badge tone={c.status} dot>{c.status}</Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                )}

                {tab === 'payments' && (
                    <Panel padded={false}>
                        {d.orders.recent.length === 0 ? <p className="p-6 text-pencil">No student payments yet.</p> : (
                            <ul className="divide-y divide-rule">
                                {d.orders.recent.map((o) => (
                                    <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-bold text-graphite">{o.user?.name}</span>
                                            <span className="block truncate text-sm text-pencil">{o.course?.title}</span>
                                        </span>
                                        <span className="font-mono text-sm text-graphite">{o.payment_reference}</span>
                                        <span className="w-28 text-right font-bold text-ink-deep">{money(o.total, o.currency)}</span>
                                        <OrderBadge status={o.status} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                )}

                {tab === 'billing' && (
                    <Panel padded={false}>
                        {d.subscriptions.length === 0 ? <p className="p-6 text-pencil">This institute hasn’t paid for a plan yet.</p> : (
                            <ul className="divide-y divide-rule">
                                {d.subscriptions.map((s) => (
                                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                                        <span className="min-w-0 flex-1 font-bold text-graphite">{s.plan?.name} × {s.months} month{s.months > 1 ? 's' : ''}</span>
                                        <span className="text-sm text-pencil">{dateTime(s.created_at)}</span>
                                        <span className="font-mono text-sm">{s.payment_reference}</span>
                                        <span className="w-24 text-right font-bold text-ink-deep">{usd(s.amount)}</span>
                                        <SubBadge status={s.status} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                )}

                {tab === 'activity' && <Panel><ActivityList items={d.activity} showTenant={false} /></Panel>}
            </div>

            <PlanDialog open={planOpen} onClose={() => setPlanOpen(false)} d={d}
                onSave={(body) => { setPlanOpen(false); patch(body, 'Plan updated'); }} />

            <ConfirmDialog open={confirm === 'suspend'} title={`Suspend ${t.name}?`} confirmLabel="Suspend institute" busy={busy}
                onConfirm={() => patch({ status: 'suspended' }, 'Institute suspended')} onClose={() => setConfirm(null)}>
                Nobody at this institute can sign in until you reactivate it. Their data stays as it is.
            </ConfirmDialog>
        </div>
    );
}

function Row({ label, children }) {
    return <div className="flex justify-between gap-4"><dt className="text-pencil">{label}</dt><dd className="text-right font-bold text-graphite">{children}</dd></div>;
}

export function OrderBadge({ status }) {
    return status === 'paid' ? <Badge tone="published" dot>Paid</Badge> : status === 'pending' ? <Badge tone="trial" dot>Pending</Badge> : <Badge tone="danger" dot>Not received</Badge>;
}

export function SubBadge({ status }) {
    return status === 'active' ? <Badge tone="published" dot>Approved</Badge> : status === 'pending' ? <Badge tone="trial" dot>Pending</Badge> : <Badge tone="danger" dot>Rejected</Badge>;
}

function PlanDialog({ open, onClose, d, onSave }) {
    const t = d.tenant;
    const [planId, setPlanId] = useState('');
    const [ends, setEnds] = useState('');
    const [trial, setTrial] = useState('');

    useEffect(() => {
        if (!open) return;
        setPlanId(t.plan?.id ? String(t.plan.id) : '');
        setEnds(t.plan_ends_at ? t.plan_ends_at.slice(0, 10) : '');
        setTrial(t.trial_ends_at ? t.trial_ends_at.slice(0, 10) : '');
    }, [open, t]);

    return (
        <Modal open={open} onClose={onClose} title="Change plan" description="For deals agreed outside the app, or to fix a mistake. Changes are logged."
            footer={<>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={() => onSave({
                    plan_id: planId ? Number(planId) : null,
                    plan_ends_at: ends || null,
                    trial_ends_at: trial || null,
                    ...(planId && ends && new Date(ends) > new Date() && t.status === 'trial' ? { status: 'active' } : {}),
                })}>Save plan</Button>
            </>}>
            <div className="space-y-5">
                <Field label="Paid plan">
                    <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="h-11 w-full rounded-lg border border-rule bg-white px-3 focus:border-ink focus:outline-none">
                        <option value="">None (Free plan after trial)</option>
                        {d.plans.filter((p) => Number(p.price_monthly) > 0).map((p) => <option key={p.id} value={p.id}>{p.name} · {usd(p.price_monthly)}/month</option>)}
                    </select>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Paid plan ends" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
                    <Field label="Trial ends" type="date" value={trial} onChange={(e) => setTrial(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                    {[1, 3, 12].map((m) => (
                        <button key={m} type="button" onClick={() => { const x = new Date(); x.setMonth(x.getMonth() + m); setEnds(x.toISOString().slice(0, 10)); }}
                            className="rounded-full bg-ink-50 px-3 py-1 text-sm font-bold text-ink hover:bg-ink/10">Plan ends in {m} month{m > 1 ? 's' : ''}</button>
                    ))}
                    <button type="button" onClick={() => { const x = new Date(); x.setDate(x.getDate() + 14); setTrial(x.toISOString().slice(0, 10)); }}
                        className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-800 hover:bg-amber-100">Trial +14 days from today</button>
                </div>
            </div>
        </Modal>
    );
}
