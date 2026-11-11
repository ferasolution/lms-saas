import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, session } from '../lib/api';

const TYPE_LABEL = { school: 'School', academy: 'Academy', corporate: 'Company' };

export default function TenantLayout() {
    const { tenant } = useParams();
    const navigate = useNavigate();
    const [me, setMe] = useState(null);

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

    async function signOut() {
        await api('auth/logout', { method: 'POST', tenant }).catch(() => {});
        session.clear(tenant);
        navigate(`/${tenant}/login`);
    }

    if (!me) {
        return <p className="p-10 text-pencil" role="status">Opening your institute…</p>;
    }

    const isAdmin = me.user.role === 'admin';
    const canTeach = isAdmin || me.user.role === 'instructor';
    const links = [
        { to: `/${tenant}`, label: 'Overview', end: true },
        { to: `/${tenant}/courses`, label: 'Courses' },
        ...(isAdmin ? [{ to: `/${tenant}/people`, label: 'People' }] : []),
    ];

    const trialDays = me.tenant.status === 'trial' && me.tenant.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(me.tenant.trial_ends_at) - Date.now()) / 86400000))
        : null;

    return (
        <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
            <aside className="border-b border-rule bg-white md:min-h-screen md:border-r md:border-b-0">
                <div className="flex items-center justify-between gap-4 px-5 py-5 md:block">
                    <div>
                        <p className="font-display text-lg leading-tight font-bold text-ink-deep">{me.tenant.name}</p>
                        <p className="text-sm text-pencil">{TYPE_LABEL[me.tenant.type]}</p>
                    </div>
                    <button onClick={signOut} className="text-sm text-pencil underline md:hidden">Sign out</button>
                </div>
                <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
                    {links.map((l) => (
                        <NavLink key={l.to} to={l.to} end={l.end}
                            className={({ isActive }) =>
                                `rounded-md px-3 py-2 whitespace-nowrap ${isActive ? 'bg-ink text-white' : 'text-graphite hover:bg-ink/5'}`}>
                            {l.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="mt-auto hidden px-5 py-6 md:block">
                    <p className="font-bold text-graphite">{me.user.name}</p>
                    <p className="text-sm text-pencil capitalize">{me.user.role}</p>
                    <button onClick={signOut} className="mt-3 text-sm text-pencil underline hover:text-ink">Sign out</button>
                </div>
            </aside>

            <main className="margin-line min-w-0 px-6 py-8 pl-8 sm:px-10 sm:pl-12">
                {trialDays !== null && (
                    <p className="mb-6 text-sm text-pencil">
                        Free trial: {trialDays} {trialDays === 1 ? 'day' : 'days'} left.
                    </p>
                )}
                <Outlet context={{ me, tenant, isAdmin, canTeach }} />
            </main>
        </div>
    );
}
