import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, session } from '../lib/api';
import { date } from '../lib/format';
import Icon from '../components/Icon';
import AuthShell, { AsideList } from '../components/AuthShell';
import { Badge, Button, EmptyState, Field, IconButton, Logo, Menu, Skeleton, Tabs, useToast } from '../components/ui';

const KEY = '__platform';
const call = (path, opts = {}) => api(`platform/${path}`, { ...opts, token: session.token(KEY) });
const TYPE = { school: 'School', academy: 'Academy', corporate: 'Company' };

export function PlatformLogin() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await api('platform/login', { method: 'POST', body: form });
            session.save(KEY, r.token);
            navigate('/platform');
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell aside={<AsideList title="Platform console" items={['Every institute on Fera Learn', 'Trials, plans and suspensions', 'Growth at a glance']} />}>
            <h1 className="text-3xl font-extrabold">Owner sign in</h1>
            <p className="mt-2 text-pencil">For the people who run Fera Learn itself.</p>
            <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
                <Field label="Email" name="email" type="email" error={error} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" autoFocus />
                <Field label="Password" name="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
                {error?.status === 429 && <p className="text-margin">Too many attempts. Wait a minute.</p>}
                <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
            </form>
        </AuthShell>
    );
}

export default function PlatformConsole() {
    const navigate = useNavigate();
    const toast = useToast();
    const [me, setMe] = useState(null);
    const [stats, setStats] = useState(null);
    const [tenants, setTenants] = useState(null);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!session.token(KEY)) { navigate('/platform/login', { replace: true }); return; }
        call('me').then(setMe).catch(() => { session.clear(KEY); navigate('/platform/login', { replace: true }); });
    }, [navigate]);

    const load = useCallback(() => {
        const qs = new URLSearchParams();
        if (status) qs.set('status', status);
        if (search.trim()) qs.set('search', search.trim());
        call(`tenants?${qs}`).then((r) => setTenants(r.data));
        call('stats').then(setStats);
    }, [status, search]);

    useEffect(() => {
        if (!me) return;
        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
    }, [me, load]);

    async function update(t, body, msg) {
        try {
            await call(`tenants/${t.id}`, { method: 'PATCH', body });
            toast(msg);
            load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function signOut() {
        session.clear(KEY);
        navigate('/platform/login');
    }

    if (!me) return <div className="p-10"><Skeleton className="h-10 w-64" /></div>;

    return (
        <div className="min-h-screen bg-paper">
            <header className="border-b border-rule bg-white">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
                    <div className="flex items-center gap-3">
                        <Logo to="/platform" />
                        <span className="hidden rounded-full bg-ink-deep px-2.5 py-0.5 text-xs font-bold text-white sm:inline">Console</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="hidden text-sm text-pencil sm:inline">{me.user.email}</span>
                        <IconButton icon="logout" label="Sign out" onClick={signOut} />
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
                <h1 className="text-3xl font-extrabold sm:text-4xl">Platform</h1>

                <section className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Summary">
                    <Big label="Institutes" value={stats?.tenants.total} sub={stats ? `${stats.tenants.new_30_days} new in 30 days` : null} />
                    <Big label="Students" value={stats?.students} sub={stats ? `${stats.users} people in total` : null} />
                    <Big label="Courses" value={stats?.courses} sub={stats ? `${stats.enrollments} enrolments` : null} />
                    <Big label="Certificates" value={stats?.certificates} />
                </section>

                {stats && (
                    <section className="mt-4 flex flex-wrap gap-2 text-sm">
                        <Badge tone="trial">{stats.tenants.trial} on trial</Badge>
                        <Badge tone="published">{stats.tenants.active} active</Badge>
                        <Badge tone="danger">{stats.tenants.suspended} suspended</Badge>
                        {Object.entries(stats.tenants.by_type ?? {}).map(([t, n]) => <Badge key={t}>{n} {TYPE[t] ?? t}</Badge>)}
                    </section>
                )}

                <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <Tabs value={status} onChange={setStatus} tabs={[
                        { value: '', label: 'All' }, { value: 'trial', label: 'Trial' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' },
                    ]} className="border-b-0" />
                    <label className="relative block sm:w-72">
                        <span className="sr-only">Search institutes</span>
                        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-pencil" />
                        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or address"
                            className="h-11 w-full rounded-lg border border-rule bg-white pr-3 pl-10 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                    </label>
                </div>

                <div className="mt-4">
                    {tenants === null ? <Skeleton className="h-64 rounded-2xl" /> : tenants.length === 0 ? (
                        <EmptyState icon="building" title="No institutes found" />
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-rule bg-white">
                            <table className="w-full text-left">
                                <thead className="hidden border-b border-rule bg-paper text-sm text-pencil md:table-header-group">
                                    <tr>
                                        <th className="px-5 py-3 font-bold">Institute</th>
                                        <th className="px-5 py-3 font-bold">Type</th>
                                        <th className="px-5 py-3 font-bold">People</th>
                                        <th className="px-5 py-3 font-bold">Courses</th>
                                        <th className="px-5 py-3 font-bold">Status</th>
                                        <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-rule">
                                    {tenants.map((t) => (
                                        <tr key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 md:table-row md:px-0">
                                            <td className="min-w-0 basis-[calc(100%-3rem)] md:basis-auto md:px-5 md:py-3.5">
                                                <p className="truncate font-bold text-graphite">{t.name}</p>
                                                <p className="truncate text-sm text-pencil">/{t.slug} · since {date(t.created_at)}</p>
                                            </td>
                                            <td className="text-pencil md:px-5">{TYPE[t.type] ?? t.type}</td>
                                            <td className="text-pencil tabular-nums md:px-5">{t.users_count} people</td>
                                            <td className="text-pencil tabular-nums md:px-5">{t.courses_count} courses</td>
                                            <td className="md:px-5">
                                                <Badge tone={t.status === 'active' ? 'published' : t.status === 'suspended' ? 'danger' : 'trial'} dot>
                                                    {t.status === 'trial' && t.trial_ends_at ? `Trial to ${date(t.trial_ends_at, { day: 'numeric', month: 'short' })}` : t.status[0].toUpperCase() + t.status.slice(1)}
                                                </Badge>
                                            </td>
                                            <td className="ml-auto md:px-5 md:text-right">
                                                <Menu label={`Actions for ${t.name}`} items={[
                                                    { label: 'Open sign-in page', icon: 'external', onClick: () => window.open(`/${t.slug}/login`, '_blank') },
                                                    t.status !== 'active' && { label: 'Activate', icon: 'check', onClick: () => update(t, { status: 'active' }, `${t.name} activated`) },
                                                    t.status === 'trial' && { label: 'Extend trial 14 days', icon: 'clock', onClick: () => update(t, { trial_ends_at: new Date(Math.max(Date.now(), new Date(t.trial_ends_at ?? Date.now()).getTime()) + 14 * 86400000).toISOString() }, 'Trial extended') },
                                                    t.status !== 'suspended' && { label: 'Suspend', icon: 'lock', danger: true, onClick: () => update(t, { status: 'suspended' }, `${t.name} suspended`) },
                                                ]} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <p className="mt-8 text-center text-sm text-pencil"><Link to="/" className="hover:text-ink">Back to the website</Link></p>
            </main>
        </div>
    );
}

function Big({ label, value, sub }) {
    return (
        <div className="rounded-2xl border border-rule bg-white p-4 sm:p-5">
            <p className="text-sm text-pencil">{label}</p>
            {value === undefined ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-1 font-display text-3xl font-bold text-ink-deep tabular-nums sm:text-4xl">{value}</p>}
            {sub && <p className="mt-1 text-sm text-pencil">{sub}</p>}
        </div>
    );
}
