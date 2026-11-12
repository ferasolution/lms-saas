import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, session } from '../lib/api';
import { applyBrand, resetBrand } from '../lib/brand';
import Icon from '../components/Icon';
import { Avatar, IconButton, Skeleton } from '../components/ui';
import NotificationBell from '../components/NotificationBell';
import SearchPalette from '../components/SearchPalette';

const TYPE_LABEL = { school: 'School', academy: 'Academy', corporate: 'Company' };
const ROLE_LABEL = { admin: 'Admin', instructor: 'Instructor', student: 'Student', parent: 'Parent', manager: 'Manager' };

export default function TenantLayout() {
    const { tenant } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [me, setMe] = useState(null);
    const [pending, setPending] = useState(0);
    const [drawer, setDrawer] = useState(false);
    const [searching, setSearching] = useState(false);

    // Ctrl/Cmd+K opens search from anywhere.
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching((v) => !v); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const refresh = useCallback(() => api('auth/me', { tenant }).then((m) => {
        setMe(m);
        applyBrand(m.tenant.settings?.brand);
        return m;
    }), [tenant]);

    useEffect(() => {
        if (!session.token(tenant)) {
            navigate(`/${tenant}/login`, { replace: true });
            return;
        }
        refresh().catch(() => {
            session.clear(tenant);
            navigate(`/${tenant}/login`, { replace: true });
        });
        return () => resetBrand();
    }, [tenant, navigate, refresh]);

    // Pending payments badge for admins; refreshed on navigation.
    useEffect(() => {
        if (me?.user.role !== 'admin') return;
        api('orders?status=pending', { tenant }).then((r) => setPending(r.summary.pending)).catch(() => {});
    }, [me?.user.role, tenant, location.pathname]);

    useEffect(() => setDrawer(false), [location.pathname]);

    async function signOut() {
        await api('auth/logout', { method: 'POST', tenant }).catch(() => {});
        session.clear(tenant);
        navigate(`/${tenant}/login`);
    }

    if (!me) return <ShellSkeleton />;

    const role = me.user.role;
    const isAdmin = role === 'admin';
    const canTeach = isAdmin || role === 'instructor';
    const isOffice = isAdmin || role === 'manager';
    const isStaff = isOffice || role === 'instructor';
    const isParent = role === 'parent';
    const isStudent = role === 'student';
    const ctx = { me, tenant, isAdmin, canTeach, isOffice, isStaff, isParent, isStudent, refresh };

    // The lesson player takes the whole screen.
    if (location.pathname.includes(`/${tenant}/learn/`)) {
        return <Outlet context={ctx} />;
    }

    const t = `/${tenant}`;
    const groups = [
        { links: [
            { to: t, label: 'Overview', icon: 'home', end: true },
        ] },
        isStaff && { label: 'School', links: [
            { to: `${t}/students`, label: 'Students', icon: 'users' },
            { to: `${t}/attendance`, label: 'Attendance', icon: 'check2' },
            { to: `${t}/diary`, label: 'Diary & homework', icon: 'diary' },
            { to: `${t}/timetable`, label: 'Timetable', icon: 'calendar' },
            { to: `${t}/exams`, label: 'Exams & results', icon: 'quiz' },
            isOffice && { to: `${t}/fees`, label: 'Fees', icon: 'wallet' },
            isOffice && { to: `${t}/admissions`, label: 'Admissions', icon: 'inbox' },
            isOffice && { to: `${t}/academics`, label: 'Classes & subjects', icon: 'grid' },
        ] },
        (isParent || isStudent) && { label: 'School', links: [
            { to: `${t}/diary`, label: 'Diary & homework', icon: 'diary' },
            { to: `${t}/timetable`, label: 'Timetable', icon: 'calendar' },
            { to: `${t}/attendance`, label: isParent ? 'Attendance & leave' : 'Attendance', icon: 'check2' },
            { to: `${t}/exams`, label: 'Exams & results', icon: 'quiz' },
            { to: `${t}/fees`, label: 'Fees', icon: 'wallet' },
        ] },
        { label: 'Learning', links: [
            isStudent && { to: `${t}/my`, label: 'My learning', icon: 'play' },
            { to: `${t}/courses`, label: canTeach ? 'Courses' : 'Browse courses', icon: 'book' },
            canTeach && { to: `${t}/grading`, label: 'Grading', icon: 'clipboard' },
            isStudent && { to: `${t}/certificates`, label: 'Certificates', icon: 'award' },
        ] },
        isAdmin && { label: 'Manage', links: [
            { to: `${t}/people`, label: 'People', icon: 'users' },
            { to: `${t}/payments`, label: 'Payments', icon: 'receipt', badge: pending },
            { to: `${t}/billing`, label: 'Billing', icon: 'wallet' },
            { to: `${t}/settings`, label: 'Settings', icon: 'settings' },
        ] },
    ].filter(Boolean).map((g) => ({ ...g, links: g.links.filter(Boolean) }));

    const trialDays = me.tenant.status === 'trial' && me.tenant.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(me.tenant.trial_ends_at) - Date.now()) / 86400000))
        : null;
    const logo = me.tenant.settings?.logo_url;

    const sidebar = (
        <div className="flex h-full flex-col">
            <div className="px-5 pt-6 pb-5">
                <div className="flex items-center gap-3">
                    {logo ? (
                        <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain ring-1 ring-rule" />
                    ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-white">
                            <Icon name={me.tenant.type === 'school' ? 'school' : me.tenant.type === 'corporate' ? 'building' : 'academy'} size={20} />
                        </span>
                    )}
                    <div className="min-w-0">
                        <p className="truncate font-display text-[17px] leading-tight font-bold text-ink-deep">{me.tenant.name}</p>
                        <p className="text-sm text-pencil">{TYPE_LABEL[me.tenant.type]}</p>
                    </div>
                </div>
                <div className="mt-5 flex items-center gap-2">
                    <button type="button" onClick={() => setSearching(true)}
                        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-rule bg-paper px-3 text-left text-pencil transition hover:border-ink/40">
                        <Icon name="search" size={16} />
                        <span className="flex-1 truncate text-sm">Search</span>
                        <kbd className="hidden rounded border border-rule bg-white px-1.5 text-[11px] lg:inline">Ctrl K</kbd>
                    </button>
                    <div className="hidden lg:block"><NotificationBell tenant={tenant} /></div>
                </div>
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-3" aria-label="Main">
                {groups.map((g, gi) => (
                    <div key={gi} className="space-y-1">
                        {g.label && <p className="px-3 pb-1 text-xs font-bold text-pencil/80">{g.label}</p>}
                        {g.links.map((l) => (
                            <NavLink key={l.to} to={l.to} end={l.end}
                                className={({ isActive }) =>
                                    `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold transition-colors ${isActive
                                        ? 'bg-ink-50 text-ink-deep before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-margin'
                                        : 'text-pencil hover:bg-ink-50/60 hover:text-ink-deep'}`}>
                                <Icon name={l.icon} size={20} />
                                <span className="flex-1">{l.label}</span>
                                {l.badge > 0 && <span className="rounded-full bg-margin px-2 py-0.5 text-xs font-bold text-white tabular-nums">{l.badge}</span>}
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            {trialDays !== null && isAdmin && (
                <Link to={`/${tenant}/billing`} className="mx-3 mb-3 block rounded-xl border border-rule bg-white p-4 transition hover:border-ink/40">
                    <p className="text-sm font-bold text-graphite">Free trial</p>
                    <p className="text-sm text-pencil">{trialDays} {trialDays === 1 ? 'day' : 'days'} left on the {me.tenant.plan?.name ?? 'Free'} plan</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-50">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (trialDays / 14) * 100)}%` }} />
                    </div>
                </Link>
            )}

            <div className="flex items-center gap-2 border-t border-rule px-3 py-3">
                <Link to={`/${tenant}/profile`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-ink-50/60">
                    <Avatar name={me.user.name} size={36} />
                    <div className="min-w-0">
                        <p className="truncate font-bold text-graphite">{me.user.name}</p>
                        <p className="text-sm text-pencil">{ROLE_LABEL[role] ?? role}</p>
                    </div>
                </Link>
                <IconButton icon="logout" label="Sign out" onClick={signOut} />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
            <aside className="sticky top-0 z-30 hidden h-screen border-r border-rule bg-white lg:block print:hidden">{sidebar}</aside>

            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-white/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
                <IconButton icon="menu" label="Open menu" onClick={() => setDrawer(true)} />
                <p className="min-w-0 flex-1 truncate px-3 font-display font-bold text-ink-deep">{me.tenant.name}</p>
                <IconButton icon="search" label="Search" onClick={() => setSearching(true)} />
                <NotificationBell tenant={tenant} align="right" />
                <Link to={`/${tenant}/profile`} aria-label="Your profile" className="relative">
                    <Avatar name={me.user.name} size={32} />
                    {pending > 0 && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-margin" />}
                </Link>
            </header>
            {drawer && (
                <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
                    <div className="absolute inset-0 bg-ink-deep/30" onClick={() => setDrawer(false)} />
                    <aside className="absolute inset-y-0 left-0 w-[19rem] max-w-[85vw] bg-white shadow-2xl animate-[slide-in-left_.2s_ease-out]">
                        <IconButton icon="x" label="Close menu" className="absolute top-4 right-3" onClick={() => setDrawer(false)} />
                        {sidebar}
                    </aside>
                </div>
            )}

            <SearchPalette open={searching} onClose={() => setSearching(false)} tenant={tenant}
                pages={groups.flatMap((g) => g.links).map((l) => ({ label: l.label, icon: l.icon, to: l.to })).concat([{ label: 'Your profile', icon: 'user', to: `/${tenant}/profile` }])} />

            <main className="min-w-0">
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:px-12 lg:py-10 print:max-w-none print:p-0">
                    <Outlet context={ctx} />
                </div>
            </main>
        </div>
    );
}

function ShellSkeleton() {
    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]" role="status" aria-label="Loading">
            <aside className="hidden border-r border-rule bg-white p-5 lg:block">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-16" /></div>
                </div>
                <div className="mt-8 space-y-3"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
            </aside>
            <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-8 lg:px-12">
                <Skeleton className="h-9 w-64" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
            </div>
        </div>
    );
}

export { ROLE_LABEL, TYPE_LABEL };
