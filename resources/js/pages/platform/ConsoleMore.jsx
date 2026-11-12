import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Avatar, Badge, Button, EmptyState, Field, Menu, Modal, PageHeader, Skeleton, Tabs, useToast } from '../../components/ui';
import { ActivityList, call, exportCsv, dateTime, Kpi, money, moneyList, Panel, PAYMENT_METHODS, relative, SearchBox, useDebounced, usd } from './shared';
import ResetPasswordDialog from '../../components/ResetPasswordDialog';
import { OrderBadge, SubBadge } from './ConsoleTenants';

const METHOD = Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([k, v]) => [k, v.label]));
const ROLE = { admin: 'Admin', instructor: 'Instructor', student: 'Student', parent: 'Parent', manager: 'Manager' };

/* ------------------------------------------------------------ plan payments */

export function ConsoleSubscriptions() {
    const { refreshBadges } = useOutletContext();
    const toast = useToast();
    const [status, setStatus] = useState('pending');
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [note, setNote] = useState('');

    const load = useCallback(() => call(`subscriptions?status=${status}`).then(setData), [status]);
    useEffect(() => { setData(null); load(); }, [load]);

    async function act(s, action) {
        setBusy(s.id);
        try {
            await call(`subscriptions/${s.id}/${action}`, { method: 'POST', body: action === 'reject' ? { note: note || null } : undefined });
            toast(action === 'approve' ? `${s.tenant?.name} is now on ${s.plan?.name}` : 'Payment rejected');
            setRejecting(null);
            setNote('');
            load();
            refreshBadges();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(null);
        }
    }

    return (
        <div>
            <PageHeader title="Plan payments" description="Institutes paying you for Basic or Pro. Check the transaction in your account, then approve to upgrade them." />
            <div className="mt-6 grid grid-cols-3 gap-3">
                <Kpi label="Waiting" value={data?.summary.pending} tone="amber" />
                <Kpi label="Approved" value={data?.summary.active} />
                <Kpi label="Revenue" value={data ? usd(data.summary.revenue) : undefined} />
            </div>
            <Tabs className="mt-8" value={status} onChange={setStatus} tabs={[
                { value: 'pending', label: 'To review', count: data?.summary.pending }, { value: 'active', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
            ]} />
            <div className="mt-6">
                {!data ? <Skeleton className="h-40 rounded-2xl" /> : data.data.length === 0 ? (
                    <EmptyState icon="wallet" title={status === 'pending' ? 'Nothing to review' : 'Nothing here yet'}>
                        {status === 'pending' ? 'When an institute pays for a plan from its Billing page, it shows up here.' : null}
                    </EmptyState>
                ) : (
                    <ul className="space-y-3">
                        {data.data.map((s) => (
                            <li key={s.id} className="flex flex-col gap-4 rounded-2xl border border-rule bg-white p-5 lg:flex-row lg:items-center">
                                <div className="min-w-0 flex-1">
                                    <Link to={`/platform/institutes/${s.tenant?.id}`} className="font-bold text-ink-deep hover:underline">{s.tenant?.name}</Link>
                                    <p className="text-sm text-pencil">{s.plan?.name} × {s.months} month{s.months > 1 ? 's' : ''} · requested by {s.requester?.name ?? '—'} · {dateTime(s.created_at)}</p>
                                    {s.note && <p className="mt-1 text-sm text-graphite">“{s.note}”</p>}
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm lg:w-[26rem]">
                                    <div><p className="text-pencil">Amount</p><p className="font-display text-lg font-bold text-ink-deep">{usd(s.amount)}</p></div>
                                    <div><p className="text-pencil">Method</p><p className="text-graphite">{METHOD[s.payment_method] ?? s.payment_method}</p></div>
                                    <div><p className="text-pencil">Reference</p><p className="font-mono font-bold break-all text-graphite">{s.payment_reference}</p></div>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    {s.status === 'pending' ? (
                                        <>
                                            <Button variant="secondary" size="sm" onClick={() => { setRejecting(s); setNote(''); }}>Reject</Button>
                                            <Button size="sm" icon="check" busy={busy === s.id} onClick={() => act(s, 'approve')}>Approve</Button>
                                        </>
                                    ) : <SubBadge status={s.status} />}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <Modal open={!!rejecting} onClose={() => setRejecting(null)} size="sm" title="Reject this payment?"
                description={rejecting ? `${rejecting.tenant?.name} · ${usd(rejecting.amount)} · ref ${rejecting.payment_reference}` : ''}
                footer={<><Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button><Button variant="danger" busy={busy === rejecting?.id} onClick={() => act(rejecting, 'reject')}>Reject payment</Button></>}>
                <Field label="Reason (shown to the institute)" as="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No payment found with this transaction ID" />
            </Modal>
        </div>
    );
}

/* ------------------------------------------------------------ student payments */

export function ConsolePayments() {
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const q = useDebounced(search);
    const [data, setData] = useState(null);

    useEffect(() => {
        const qs = new URLSearchParams();
        if (status) qs.set('status', status);
        if (q.trim()) qs.set('search', q.trim());
        call(`payments?${qs}`).then(setData);
    }, [status, q]);

    return (
        <div>
            <PageHeader title="Student payments" description="Course fees paid to institutes, across the whole platform. Institutes approve these themselves." />
            <div className="mt-6 grid grid-cols-3 gap-3">
                <Kpi label="Pending at institutes" value={data?.summary.pending} tone="amber" />
                <Kpi label="Approved" value={data?.summary.paid} />
                <Kpi label="Total collected" value={data ? moneyList(data.summary.volume) : undefined} />
            </div>
            <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <Tabs value={status} onChange={setStatus} className="border-b-0" tabs={[
                    { value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }, { value: 'failed', label: 'Not received' },
                ]} />
                <SearchBox value={search} onChange={setSearch} placeholder="Student name, email or reference" className="lg:w-80" />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-white">
                {!data ? <div className="p-5"><Skeleton className="h-48" /></div> : data.data.length === 0 ? <p className="p-8 text-center text-pencil">No payments found.</p> : (
                    <table className="w-full min-w-[52rem] text-left">
                        <thead className="border-b border-rule bg-paper text-sm text-pencil">
                            <tr>{['Student', 'Institute', 'Course', 'Amount', 'Method / reference', 'Sent', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-rule">
                            {data.data.map((o) => (
                                <tr key={o.id}>
                                    <td className="px-4 py-3"><p className="font-bold text-graphite">{o.user?.name}</p><p className="text-sm text-pencil">{o.user?.email}</p></td>
                                    <td className="px-4 py-3"><Link to={`/platform/institutes/${o.tenant?.id}`} className="font-bold text-ink hover:underline">{o.tenant?.name}</Link></td>
                                    <td className="max-w-56 truncate px-4 py-3 text-graphite">{o.course?.title}</td>
                                    <td className="px-4 py-3 font-bold text-ink-deep">{money(o.total, o.currency)}</td>
                                    <td className="px-4 py-3 text-sm"><p className="text-pencil">{METHOD[o.payment_method] ?? o.payment_method}</p><p className="font-mono text-graphite">{o.payment_reference}</p></td>
                                    <td className="px-4 py-3 text-sm text-pencil">{dateTime(o.created_at)}</td>
                                    <td className="px-4 py-3"><OrderBadge status={o.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------ users */

export function ConsoleUsers() {
    const toast = useToast();
    const [resetting, setResetting] = useState(null);
    const [reload, setReload] = useState(0);
    const [role, setRole] = useState('');
    const [search, setSearch] = useState('');
    const q = useDebounced(search);
    const [data, setData] = useState(null);

    useEffect(() => {
        const qs = new URLSearchParams();
        if (role) qs.set('role', role);
        if (q.trim()) qs.set('search', q.trim());
        call(`users?${qs}`).then(setData);
    }, [role, q, reload]);

    async function setAccess(u, active) {
        try {
            await call(`users/${u.id}`, { method: 'PATCH', body: { is_active: active } });
            toast(active ? `${u.name} can sign in again` : `${u.name} can no longer sign in`);
            setReload((n) => n + 1);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    const total = data ? Object.values(data.roles).reduce((a, b) => a + Number(b), 0) : null;

    return (
        <div>
            <PageHeader title="Users" description="Everyone with an account at any institute."
                actions={<Button variant="secondary" icon="download" onClick={() => exportCsv('exports/users.csv', 'users.csv')}>Export CSV</Button>} />
            <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <Tabs value={role} onChange={setRole} className="border-b-0" tabs={[
                    { value: '', label: 'Everyone', count: total },
                    ...Object.entries(ROLE).map(([v, l]) => ({ value: v, label: `${l}s`, count: data ? Number(data.roles[v] ?? 0) : null })),
                ]} />
                <SearchBox value={search} onChange={setSearch} placeholder="Name or email" className="lg:w-72" />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-white">
                {!data ? <div className="p-5"><Skeleton className="h-48" /></div> : data.data.length === 0 ? <p className="p-8 text-center text-pencil">No users found.</p> : (
                    <table className="w-full min-w-[48rem] text-left">
                        <thead className="border-b border-rule bg-paper text-sm text-pencil">
                            <tr>{['Name', 'Institute', 'Role', 'Last sign-in', 'Joined', 'Access', ''].map((h, i) => <th key={i} className="px-4 py-3 font-bold">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-rule">
                            {data.data.map((u) => (
                                <tr key={u.id}>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={u.name} size={34} />
                                            <div className="min-w-0"><p className="truncate font-bold text-graphite">{u.name}</p><p className="truncate text-sm text-pencil">{u.email}</p></div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3"><Link to={`/platform/institutes/${u.tenant?.id}`} className="font-bold text-ink hover:underline">{u.tenant?.name}</Link></td>
                                    <td className="px-4 py-3"><Badge>{ROLE[u.role] ?? u.role}</Badge></td>
                                    <td className="px-4 py-3 text-pencil">{relative(u.last_login_at)}</td>
                                    <td className="px-4 py-3 text-pencil">{dateTime(u.created_at)}</td>
                                    <td className="px-4 py-3">{u.is_active ? <Badge tone="published" dot>Active</Badge> : <Badge tone="danger" dot>Disabled</Badge>}</td>
                                    <td className="px-4 py-3 text-right">
                                        <Menu label={`Actions for ${u.name}`} items={[
                                            { label: 'Reset password', icon: 'lock', onClick: () => setResetting(u) },
                                            u.is_active
                                                ? { label: 'Disable access', icon: 'x', danger: true, onClick: () => setAccess(u, false) }
                                                : { label: 'Restore access', icon: 'check', onClick: () => setAccess(u, true) },
                                        ]} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {data && data.meta.total > data.data.length && <p className="mt-3 text-sm text-pencil">Showing the newest {data.data.length} of {data.meta.total}. Search to find someone specific.</p>}
            <ResetPasswordDialog open={!!resetting} person={resetting} signInUrl={resetting?.tenant ? `${window.location.origin}/${resetting.tenant.slug}/login` : null}
                onClose={() => setResetting(null)}
                reset={async () => (await call(`users/${resetting.id}/reset-password`, { method: 'POST' })).password} />
        </div>
    );
}

/* ------------------------------------------------------------ activity */

export function ConsoleActivity() {
    const navigate = useNavigate();
    const [action, setAction] = useState('');
    const [items, setItems] = useState(null);
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState(null);

    useEffect(() => {
        const qs = new URLSearchParams({ page: String(page) });
        if (action) qs.set('action', action);
        call(`activity?${qs}`).then((r) => { setItems((prev) => (page === 1 ? r.data : [...(prev ?? []), ...r.data])); setMeta(r.meta); });
    }, [action, page]);

    return (
        <div>
            <PageHeader title="Activity" description="Sign-ups, sign-ins, courses, payments and support access across the platform." />
            <Tabs className="mt-6" value={action} onChange={(a) => { setAction(a); setPage(1); setItems(null); }} tabs={[
                { value: '', label: 'Everything' }, { value: 'tenant', label: 'Institutes' }, { value: 'auth', label: 'Sign-ins' },
                { value: 'course', label: 'Courses' }, { value: 'order', label: 'Student payments' }, { value: 'subscription', label: 'Plan payments' }, { value: 'support', label: 'Support access' },
            ]} />
            <Panel className="mt-6">
                <ActivityList items={items} onTenant={(t) => navigate(`/platform/institutes/${t.id}`)} />
                {meta && meta.page < meta.last_page && (
                    <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setPage(page + 1)}>Load more</Button></div>
                )}
            </Panel>
        </div>
    );
}

/* ------------------------------------------------------------ system health */

const CHECKS = [
    ['database', 'Database', 'layers'],
    ['migrations', 'Database updates', 'upload'],
    ['cache', 'Cache', 'sparkle'],
    ['storage', 'Files and disk', 'file'],
    ['queue', 'Background jobs', 'clock'],
    ['errors', 'Errors (last 24 h)', 'alert'],
    ['app', 'App configuration', 'settings'],
];

export function ConsoleHealth() {
    const [h, setH] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => { setBusy(true); return call('health').then(setH).finally(() => setBusy(false)); }, []);
    useEffect(() => { load(); }, [load]);

    const c = h?.checks;
    const allOk = c && Object.values(c).every((x) => x.ok);

    return (
        <div>
            <PageHeader title="System health" description={h ? `Checked ${relative(h.checked_at).toLowerCase()}` : 'Checking…'}
                actions={<Button variant="secondary" icon="clock" busy={busy} onClick={load}>Check again</Button>} />

            {c && (
                <div className={`mt-6 flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ${allOk ? 'bg-leaf-50 text-leaf ring-leaf/20' : 'bg-amber-50 text-amber-900 ring-amber-600/20'}`}>
                    <Icon name={allOk ? 'shield' : 'alert'} size={24} />
                    <p className="text-lg font-bold">{allOk ? 'Everything is running normally.' : 'Some things need a look.'}</p>
                </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {CHECKS.map(([key, label, icon]) => {
                    const x = c?.[key];
                    return (
                        <section key={key} className="rounded-2xl border border-rule bg-white p-5">
                            <div className="flex items-center justify-between gap-3">
                                <p className="flex items-center gap-2 font-bold text-graphite"><Icon name={icon} size={18} className="text-pencil" />{label}</p>
                                {x ? (x.ok ? <Badge tone="published" dot>OK</Badge> : <Badge tone="danger" dot>Check</Badge>) : <Skeleton className="h-6 w-12" />}
                            </div>
                            {x && <div className="mt-3 space-y-1 text-sm text-pencil"><HealthDetail k={key} x={x} /></div>}
                        </section>
                    );
                })}
            </div>

            {c?.errors?.recent?.length > 0 && (
                <Panel title="Recent errors" className="mt-6" padded={false}>
                    <ul className="divide-y divide-rule">
                        {c.errors.recent.map((e, i) => (
                            <li key={i} className="px-5 py-3">
                                <p className="text-xs text-pencil">{e.at} · {e.level}</p>
                                <p className="mt-0.5 font-mono text-sm break-all text-graphite">{e.message}</p>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}
        </div>
    );
}

function HealthDetail({ k, x }) {
    if (x.error) return <p className="text-margin">{x.error}</p>;
    const L = ({ a, b }) => <p className="flex justify-between gap-3"><span>{a}</span><span className="text-right font-bold text-graphite">{b}</span></p>;
    if (k === 'database') return <><L a="Type" b={x.driver} /><L a="Response time" b={`${x.latency_ms} ms`} /><L a="Size" b={x.size_mb !== null ? `${x.size_mb} MB` : '—'} /></>;
    if (k === 'migrations') return <><L a="Applied" b={x.ran} /><L a="Waiting" b={x.pending.length} /><p className="truncate" title={x.latest}>Latest: {x.latest}</p></>;
    if (k === 'cache') return <L a="Store" b={x.store} />;
    if (k === 'storage') return <><L a="Uploaded files" b={`${x.uploads.files} (${x.uploads.mb} MB)`} /><L a="Disk free" b={x.disk_free_gb !== null ? `${x.disk_free_gb} of ${x.disk_total_gb} GB` : '—'} /><L a="Public link" b={x.public_link ? 'Yes' : 'Missing'} /><L a="Folders writable" b={Object.values(x.writable).every(Boolean) ? 'Yes' : 'No'} /></>;
    if (k === 'queue') return <><L a="Connection" b={x.connection} /><L a="Waiting" b={x.waiting} /><L a="Failed" b={x.failed} /></>;
    if (k === 'errors') return <L a="Logged recently" b={x.recent.length} />;
    if (k === 'app') {
        const missing = Object.entries(x.extensions).filter(([, v]) => !v).map(([n]) => n);
        return <><L a="PHP / Laravel" b={`${x.php} / ${x.laravel}`} /><L a="Environment" b={x.environment} /><L a="Debug mode" b={x.debug ? 'On (turn off)' : 'Off'} /><L a="Auto-deploy" b={x.deploy_hook ? 'Ready' : 'Not set'} />{missing.length > 0 && <p className="text-margin">Missing PHP extensions: {missing.join(', ')}</p>}</>;
    }
    return null;
}

/* ------------------------------------------------------------ settings */

export function ConsoleSettings() {
    const toast = useToast();
    const [form, setForm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        call('settings').then((s) => setForm({
            bank: s.payments?.bank ?? '', paypal: s.payments?.paypal ?? '', wise: s.payments?.wise ?? '', card: s.payments?.card ?? '', instructions: s.payments?.instructions ?? '',
            email: s.support?.email ?? '', phone: s.support?.phone ?? '',
        }));
    }, []);

    if (!form) return <Skeleton className="h-64 rounded-2xl" />;
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const err = (k) => error?.errors?.[k]?.[0];

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await call('settings', { method: 'PUT', body: {
                payments: { bank: form.bank || null, paypal: form.paypal || null, wise: form.wise || null, card: form.card || null, instructions: form.instructions || null },
                support: { email: form.email || null, phone: form.phone || null },
            } });
            toast('Settings saved');
        } catch (er) {
            setError(er);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={save} className="max-w-3xl" noValidate>
            <PageHeader title="Settings" description="How institutes pay you, and how they reach you." />
            <Panel title="Where institutes pay you" className="mt-8">
                <div className="space-y-5">
                    <p className="text-pencil">Shown on every institute’s Billing page when they upgrade.</p>
                    <Field label="Bank transfer" as="textarea" rows={4} value={form.bank} onChange={set('bank')} error={err('payments.bank')}
                        placeholder={'Bank name\nAccount name\nAccount number / IBAN\nRouting number or SWIFT'} />
                    <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="PayPal" value={form.paypal} onChange={set('paypal')} error={err('payments.paypal')} placeholder="billing@ferasolution.com" />
                        <Field label="Wise" value={form.wise} onChange={set('wise')} error={err('payments.wise')} placeholder="billing@ferasolution.com or @ferasolution" />
                    </div>
                    <Field label="Card payment link" type="url" value={form.card} onChange={set('card')} error={err('payments.card')} placeholder="https://buy.stripe.com/…"
                        hint="Optional. A Stripe, Square or PayPal payment link for card payments." />
                    <Field label="Instructions" as="textarea" rows={2} value={form.instructions} onChange={set('instructions')} placeholder="e.g. Put your institute’s address in the payment reference." />
                </div>
            </Panel>
            <Panel title="Support contact" className="mt-6">
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Email" type="email" value={form.email} onChange={set('email')} error={err('support.email')} />
                    <Field label="Phone / WhatsApp" value={form.phone} onChange={set('phone')} error={err('support.phone')} />
                </div>
            </Panel>
            <Button type="submit" className="mt-6" busy={busy} icon="check">Save settings</Button>
        </form>
    );
}
