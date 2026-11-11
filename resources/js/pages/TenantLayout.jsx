import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, session } from '../lib/api';
import Icon from '../components/Icon';
import { Avatar, IconButton, Skeleton } from '../components/ui';

const TYPE_LABEL = { school: 'School', academy: 'Academy', corporate: 'Company' };
const ROLE_LABEL = { admin: 'Admin', instructor: 'Instructor', student: 'Student', parent: 'Parent', manager: 'Manager' };

export default function TenantLayout() {
    const { tenant } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [me, setMe] = useState(null);
    const [drawer, setDrawer] = useState(false);

    useEffect(() => {
        if (!session.token(tenant)) {
            navigate(`/${tenant}/login`, { replace: true });
            return;
        }
        api('auth/me', { tenant })
            .then(setMe)
            .catch(() => {
                session.clear(tenant);
                navigate(`/${tenant}/login`, { replace: true });
            });
    }, [tenant, navigate]);

    useEffect(() => setDrawer(false), [location.pathname]);

    async function signOut() {
        await api('auth/logout', { method: 'POST', tenant }).catch(() => {});
        session.clear(tenant);
        navigate(`/${tenant}/login`);
    }

    if (!me) return <ShellSkeleton />;

    const isAdmin = me.user.role === 'admin';
    const canTeach = isAdmin || me.user.role === 'instructor';
    const links = [
        { to: `/${tenant}`, label: 'Overview', icon: 'home', end: true },
        { to: `/${tenant}/courses`, label: canTeach ? 'Courses' : 'Browse courses', icon: 'book' },
        ...(isAdmin ? [{ to: `/${tenant}/people`, label: 'People', icon: 'users' }] : []),
    ];
    const trialDays = me.tenant.status === 'trial' && me.tenant.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(me.tenant.trial_ends_at) - Date.now()) / 86400000))
        : null;

    const sidebar = (
        <div className="flex h-full flex-col">
            <div className="px-5 pt-6 pb-5">
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-white">
                        <Icon name={me.tenant.type === 'school' ? 'school' : me.tenant.type === 'corporate' ? 'building' : 'academy'} size={20} />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate font-display text-[17px] font-bold leading-tight text-ink-deep">{me.tenant.name}</p>
                        <p className="text-sm text-pencil">{TYPE_LABEL[me.tenant.type]}</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 space-y-1 px-3" aria-label="Main">
                {links.map((l) => (
                    <NavLink key={l.to} to={l.to} end={l.end}
                        className={({ isActive }) =>
                            `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold transition-colors ${isActive
                                ? 'bg-ink-50 text-ink-deep before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-margin'
                                : 'text-pencil hover:bg-ink-50/60 hover:text-ink-deep'}`}>
                        <Icon name={l.icon} size={20} />
                        {l.label}
                    </NavLink>
                ))}
            </nav>

            {trialDays !== null && (
                <div className="mx-3 mb-3 rounded-xl border border-rule bg-white p-4">
                    <p className="text-sm font-bold text-graphite">Free trial</p>
                    <p className="text-sm text-pencil">{trialDays} {trialDays === 1 ? 'day' : 'days'} left on the {me.tenant.plan?.name ?? 'Free'} plan</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-50">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (trialDays / 14) * 100)}%` }} />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3 border-t border-rule px-5 py-4">
                <Avatar name={me.user.name} size={36} />
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-graphite">{me.user.name}</p>
                    <p className="text-sm text-pencil">{ROLE_LABEL[me.user.role] ?? me.user.role}</p>
                </div>
                <IconButton icon="logout" label="Sign out" onClick={signOut} />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
            {/* Desktop sidebar */}
            <aside className="sticky top-0 hidden h-screen border-r border-rule bg-white lg:block">{sidebar}</aside>

            {/* Mobile top bar + drawer */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
                <IconButton icon="menu" label="Open menu" onClick={() => setDrawer(true)} />
                <p className="truncate px-3 font-display font-bold text-ink-deep">{me.tenant.name}</p>
                <Avatar name={me.user.name} size={32} />
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

            <main className="min-w-0">
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
                    <Outlet context={{ me, tenant, isAdmin, canTeach }} />
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
