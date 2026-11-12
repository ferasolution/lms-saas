import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { session } from '../../lib/api';
import Icon from '../../components/Icon';
import { Avatar, IconButton, Logo, Skeleton } from '../../components/ui';
import { call, KEY } from './shared';

const NAV = [
    { to: '/platform', label: 'Overview', icon: 'chart', end: true },
    { to: '/platform/institutes', label: 'Institutes', icon: 'building' },
    { to: '/platform/subscriptions', label: 'Plan payments', icon: 'wallet', badge: 'subs' },
    { to: '/platform/payments', label: 'Student payments', icon: 'receipt', badge: 'orders' },
    { to: '/platform/users', label: 'Users', icon: 'users' },
    { to: '/platform/activity', label: 'Activity', icon: 'flag' },
    { to: '/platform/health', label: 'System health', icon: 'shield' },
    { to: '/platform/settings', label: 'Settings', icon: 'settings' },
];

export default function ConsoleLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [me, setMe] = useState(null);
    const [badges, setBadges] = useState({});
    const [drawer, setDrawer] = useState(false);

    useEffect(() => {
        if (!session.token(KEY)) { navigate('/platform/login', { replace: true }); return; }
        call('me').then((r) => setMe(r.user)).catch(() => { session.clear(KEY); navigate('/platform/login', { replace: true }); });
    }, [navigate]);

    const refreshBadges = useCallback(() => {
        call('overview').then((o) => setBadges({ subs: o.revenue.pending_subscriptions, orders: o.revenue.pending_orders })).catch(() => {});
    }, []);
    useEffect(() => { if (me) refreshBadges(); }, [me, location.pathname, refreshBadges]);
    useEffect(() => setDrawer(false), [location.pathname]);

    function signOut() {
        session.clear(KEY);
        navigate('/platform/login');
    }

    if (!me) return <div className="p-10"><Skeleton className="h-10 w-64" /></div>;

    const sidebar = (
        <div className="flex h-full flex-col bg-[#0d1d4a] text-white">
            <div className="flex items-center gap-2 px-5 pt-6 pb-6">
                <Logo to="/platform" className="[&_span:last-child]:text-white" />
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold">Owner</span>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Console">
                {NAV.map((l) => (
                    <NavLink key={l.to} to={l.to} end={l.end}
                        className={({ isActive }) => `relative flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold transition ${isActive
                            ? 'bg-white/12 text-white before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-[#e5484d]'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                        <Icon name={l.icon} size={19} />
                        <span className="flex-1">{l.label}</span>
                        {badges[l.badge] > 0 && <span className="rounded-full bg-[#e5484d] px-2 py-0.5 text-xs tabular-nums">{badges[l.badge]}</span>}
                    </NavLink>
                ))}
            </nav>
            <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
                <Avatar name={me.name} size={34} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{me.name}</p>
                    <p className="truncate text-xs text-white/50">{me.email}</p>
                </div>
                <IconButton icon="logout" label="Sign out" onClick={signOut} className="text-white/60 hover:bg-white/10 hover:text-white" />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[16rem_1fr]">
            <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
            <header className="sticky top-0 z-30 flex items-center justify-between bg-[#0d1d4a] px-4 py-3 text-white lg:hidden">
                <IconButton icon="menu" label="Open menu" onClick={() => setDrawer(true)} className="text-white hover:bg-white/10" />
                <span className="font-display font-bold">Owner console</span>
                <span className="w-9" />
            </header>
            {drawer && (
                <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
                    <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl animate-[slide-in-left_.2s_ease-out]">{sidebar}</aside>
                </div>
            )}
            <main className="min-w-0">
                <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 lg:py-10">
                    <Outlet context={{ me, refreshBadges }} />
                </div>
            </main>
        </div>
    );
}
