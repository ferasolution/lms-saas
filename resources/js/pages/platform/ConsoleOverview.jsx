import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Skeleton } from '../../components/ui';
import { ActivityList, Bars, call, date, Kpi, money, Panel, StatusBadge, TYPE, usd } from './shared';

export default function ConsoleOverview() {
    const navigate = useNavigate();
    const [o, setO] = useState(null);
    useEffect(() => { call('overview').then(setO); }, []);

    const openTenant = (t) => navigate(`/platform/institutes/${t.id}`);
    const pending = (o?.revenue.pending_subscriptions ?? 0) + (o?.revenue.pending_orders ?? 0);

    return (
        <div>
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-pencil">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Platform overview</h1>
                </div>
            </header>

            {o && pending > 0 && (
                <div className="mt-6 flex flex-col items-start gap-2 rounded-xl bg-amber-50 sm:flex-row sm:items-center sm:gap-3 px-4 py-3 text-amber-900 ring-1 ring-amber-600/20">
                    <Icon name="alert" size={18} />
                    <span className="flex-1">
                        {o.revenue.pending_subscriptions > 0 && <><strong>{o.revenue.pending_subscriptions}</strong> plan payment{o.revenue.pending_subscriptions === 1 ? '' : 's'} waiting for you. </>}
                        {o.revenue.pending_orders > 0 && <><strong>{o.revenue.pending_orders}</strong> student payment{o.revenue.pending_orders === 1 ? '' : 's'} waiting at institutes.</>}
                    </span>
                    {o.revenue.pending_subscriptions > 0 && <Link to="/platform/subscriptions" className="font-bold underline">Review plan payments</Link>}
                </div>
            )}

            <section className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key numbers">
                <Kpi icon="building" label="Institutes" value={o?.tenants.total}
                    sub={o && <>{o.tenants.active} active · {o.tenants.trial} trial · {o.tenants.suspended} suspended</>} />
                <Kpi icon="wallet" label="Paying institutes" value={o?.tenants.paying} sub={o && `${o.tenants.new_30_days} new sign-ups in 30 days`} />
                <Kpi icon="sparkle" label="Your revenue" value={o ? usd(o.revenue.subscriptions_total) : undefined} sub={o && `${usd(o.revenue.subscriptions_month)} this month`} />
                <Kpi icon="receipt" label="Fees collected by institutes" value={o ? money(o.revenue.institute_fees_total) : undefined} sub={o && `${money(o.revenue.institute_fees_month)} this month`} />
                <Kpi icon="users" label="Students" value={o?.people.students} sub={o && `${o.people.teachers} teachers · ${o.people.users} people in total`} />
                <Kpi icon="user" label="Active in last 7 days" value={o?.people.active_7_days} sub="Signed in at least once" />
                <Kpi icon="book" label="Courses" value={o?.learning.courses} sub={o && `${o.learning.published} published · ${o.learning.enrollments} enrolments`} />
                <Kpi icon="award" label="Certificates issued" value={o?.learning.certificates} />
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Panel title="New institutes, last 30 days">
                    {o ? <Bars data={o.signups.map((d) => ({ label: d.date.slice(8), title: date(d.date), value: d.count }))} labelEvery={5} /> : <Skeleton className="h-36" />}
                </Panel>
                <Panel title="Plan revenue, last 6 months">
                    {o ? <Bars data={o.revenue_series.map((m) => ({ label: m.label, value: m.amount }))} format={usd} /> : <Skeleton className="h-36" />}
                </Panel>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <Panel title="Recent activity" action={<Link to="/platform/activity" className="text-sm font-bold text-ink hover:underline">All activity</Link>}>
                    <ActivityList items={o?.activity} onTenant={openTenant} />
                </Panel>
                <div className="space-y-6">
                    <Panel title="Trials ending this week" padded={false}>
                        {!o ? <div className="p-5"><Skeleton className="h-24" /></div> : o.trials_ending.length === 0 ? (
                            <p className="p-5 text-pencil">No trials end in the next 7 days.</p>
                        ) : (
                            <ul className="divide-y divide-rule">
                                {o.trials_ending.map((t) => (
                                    <li key={t.id}>
                                        <Link to={`/platform/institutes/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-paper">
                                            <span className="min-w-0">
                                                <span className="block truncate font-bold text-graphite">{t.name}</span>
                                                <span className="text-sm text-pencil">{TYPE[t.type]}</span>
                                            </span>
                                            <span className="text-sm font-bold text-amber-700">{date(t.trial_ends_at, { day: 'numeric', month: 'short' })}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title="Biggest institutes" padded={false}>
                        {!o ? <div className="p-5"><Skeleton className="h-24" /></div> : (
                            <ul className="divide-y divide-rule">
                                {o.top_tenants.map((t) => (
                                    <li key={t.id}>
                                        <Link to={`/platform/institutes/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-bold text-graphite">{t.name}</span>
                                                <span className="text-sm text-pencil">{t.students_count} students · {t.courses_count} courses</span>
                                            </span>
                                            <StatusBadge tenant={t} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>
        </div>
    );
}
