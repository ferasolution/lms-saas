import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Announcements from '../../components/Announcements';
import Icon from '../../components/Icon';
import { TodayList } from '../../components/school';
import { Avatar, Button, EmptyState, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { ATTENDANCE, DIARY_KINDS, dueLabel, shortDate } from '../../lib/school';

function Tile({ to, icon, label, value, sub, tone = 'text-ink-deep' }) {
    const body = (
        <>
            <p className="flex items-center gap-2 text-sm font-bold text-pencil"><Icon name={icon} size={16} />{label}</p>
            {value === undefined ? <Skeleton className="mt-2 h-8 w-16" /> : <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${tone}`}>{value}</p>}
            {sub && <p className="mt-0.5 text-sm text-pencil">{sub}</p>}
        </>
    );
    return to
        ? <Link to={to} className="rounded-2xl border border-rule bg-white p-5 transition hover:border-ink/40">{body}</Link>
        : <div className="rounded-2xl border border-rule bg-white p-5">{body}</div>;
}

/** School office: the day at a glance. */
export function OfficeToday({ tenant }) {
    const [d, setD] = useState(null);
    useEffect(() => { api('school/overview', { tenant }).then(setD).catch(() => setD(false)); }, [tenant]);
    if (d === false) return null;
    const t = `/${tenant}`;
    return (
        <section aria-label="School today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile to={`${t}/students`} icon="users" label="Students" value={d?.students} sub={d ? (d.unplaced ? `${d.unplaced} not in a class` : `${d.sections} sections · ${d.teachers} teachers`) : null} />
            <Tile to={`${t}/attendance?tab=today`} icon="check2" label="Present today" value={d ? (d.attendance.percent === null ? '—' : `${d.attendance.percent}%`) : undefined}
                sub={d ? (d.attendance.pending_sections ? `${d.attendance.pending_sections} registers not taken` : `${d.attendance.absent} absent`) : null} tone={d?.attendance.percent !== null && d?.attendance.percent < 85 ? 'text-margin' : 'text-ink-deep'} />
            <Tile to={`${t}/admissions`} icon="inbox" label="Applications" value={d?.admissions} sub="Waiting for a decision" />
            <Tile to={`${t}/attendance?tab=leave`} icon="calendar" label="Leave requests" value={d?.leave_pending} sub="Waiting for approval" />
        </section>
    );
}

/** Teacher: today's periods and what needs doing. */
export function TeacherDay({ tenant }) {
    const [d, setD] = useState(null);
    useEffect(() => { api('school/teacher-day', { tenant }).then(setD).catch(() => setD(false)); }, [tenant]);
    if (d === false) return null;
    const t = `/${tenant}`;
    return (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-rule bg-white p-5">
                <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Your classes today</h2><Link to={`${t}/timetable`} className="text-sm font-bold text-ink hover:underline">Week</Link></div>
                <div className="mt-2">{d ? <TodayList periods={d.today} empty="No periods on your timetable today." /> : <Skeleton className="h-24" />}</div>
            </div>
            <div className="space-y-3">
                {!d ? <Skeleton className="h-40 rounded-2xl" /> : (
                    <>
                        {d.attendance_pending.length > 0 ? (
                            <div className="rounded-2xl border border-amber-600/25 bg-amber-50 p-4">
                                <p className="font-bold text-amber-900">Register not taken</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {d.attendance_pending.map((s) => <Button key={s.id} size="sm" variant="secondary" as={Link} to={`${t}/attendance?section=${s.id}`}>{s.label}</Button>)}
                                </div>
                            </div>
                        ) : <div className="rounded-2xl border border-rule bg-white p-4 text-graphite"><Icon name="check" size={16} className="mr-1 inline text-leaf" />All your registers are taken.</div>}
                        <Link to={`${t}/diary`} className="flex items-center gap-3 rounded-2xl border border-rule bg-white p-4 hover:border-ink/40">
                            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-50 text-ink"><Icon name="diary" size={20} /></span>
                            <span className="flex-1"><b className="text-graphite">{d.homework_to_check}</b> <span className="text-pencil">homework {d.homework_to_check === 1 ? 'hand-in' : 'hand-ins'} to check</span></span>
                            <Icon name="chevronRight" size={18} className="text-pencil" />
                        </Link>
                        {d.leave_pending > 0 && (
                            <Link to={`${t}/attendance?tab=leave`} className="flex items-center gap-3 rounded-2xl border border-rule bg-white p-4 hover:border-ink/40">
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-50 text-ink"><Icon name="inbox" size={20} /></span>
                                <span className="flex-1"><b className="text-graphite">{d.leave_pending}</b> <span className="text-pencil">leave {d.leave_pending === 1 ? 'request' : 'requests'} to review</span></span>
                                <Icon name="chevronRight" size={18} className="text-pencil" />
                            </Link>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

function ChildCard({ c, tenant, self = false, bus }) {
    const t = `/${tenant}`;
    const att = c.today_attendance;
    return (
        <article className="overflow-hidden rounded-2xl border border-rule bg-white">
            <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
                {!self && <Avatar name={c.name} size={44} />}
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold">{self ? 'Your day' : c.name}</h2>
                    <p className="text-sm text-pencil">{c.section?.label ?? 'No class yet'}{c.class_teacher ? ` · Class teacher ${c.class_teacher.name}` : ''}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-pencil">Today</p>
                    {att ? <span className={`rounded px-2 py-0.5 text-sm font-bold ${ATTENDANCE[att].soft}`}>{ATTENDANCE[att].label}</span> : <span className="text-sm text-pencil">Not marked</span>}
                </div>
            </div>
            <div className="grid grid-cols-1 divide-y divide-rule md:grid-cols-2 md:divide-x md:divide-y-0">
                <div className="p-5">
                    <div className="flex items-center justify-between"><h3 className="font-bold text-ink-deep">Timetable today</h3><Link to={`${t}/timetable`} className="text-sm font-bold text-ink hover:underline">Week</Link></div>
                    <div className="mt-1"><TodayList periods={c.today.map((p) => ({ ...p, teacher: p.teacher }))} empty="No classes today." /></div>
                </div>
                <div className="space-y-5 p-5">
                    <div>
                        <div className="flex items-center justify-between"><h3 className="font-bold text-ink-deep">Homework due</h3><Link to={`${t}/diary`} className="text-sm font-bold text-ink hover:underline">Diary</Link></div>
                        {c.homework_due.length === 0 ? <p className="mt-2 text-pencil">Nothing outstanding.</p> : (
                            <ul className="mt-2 space-y-1.5">
                                {c.homework_due.map((h) => <li key={h.id} className="flex items-center justify-between gap-3"><span className="truncate text-graphite">{h.title}</span><span className="shrink-0 text-sm font-bold text-amber-800">{dueLabel(h.due_on).replace('Due ', '')}</span></li>)}
                            </ul>
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold text-ink-deep">Latest in the diary</h3>
                        {c.diary.length === 0 ? <p className="mt-2 text-pencil">No entries yet.</p> : (
                            <ul className="mt-2 space-y-1.5">
                                {c.diary.slice(0, 4).map((e) => (
                                    <li key={e.id} className="flex items-center gap-2 text-sm">
                                        <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${DIARY_KINDS[e.kind].tone}`}>{DIARY_KINDS[e.kind].label}</span>
                                        <span className="min-w-0 flex-1 truncate text-graphite">{e.subject ? `${e.subject}: ` : ''}{e.title}</span>
                                        <span className="shrink-0 text-pencil">{shortDate(e.date, { month: 'short', day: 'numeric' })}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {bus?.route && (
                        <div className="rounded-xl bg-paper px-4 py-3 text-sm">
                            <p className="font-bold text-graphite">Bus: {bus.route.name}{bus.route.vehicle ? ` · ${bus.route.vehicle}` : ''}</p>
                            <p className="text-pencil">{bus.stop ? `Stop ${bus.stop}` : ''}{(() => { const s = bus.route.stops.find((x) => x.name === bus.stop); return s?.pickup ? ` · pickup ${s.pickup}` : ''; })()}{bus.route.driver_name ? ` · driver ${bus.route.driver_name}${bus.route.driver_phone ? ` (${bus.route.driver_phone})` : ''}` : ''}</p>
                        </div>
                    )}
                    <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3">
                        <span className="text-sm text-pencil">Attendance, last 30 days</span>
                        <Link to={`${t}/attendance`} className="font-display text-xl font-bold text-ink-deep tabular-nums hover:underline">{c.attendance.percent === null ? '—' : `${c.attendance.percent}%`}</Link>
                    </div>
                </div>
            </div>
        </article>
    );
}

/** Parent home: one card per child. */
export function FamilyHome({ me, tenant }) {
    const [children, setChildren] = useState(null);
    const [buses, setBuses] = useState([]);
    useEffect(() => {
        api('school/family', { tenant }).then((r) => setChildren(r.children)).catch(() => setChildren([]));
        api('school/transport/mine', { tenant }).then((r) => setBuses(r.data)).catch(() => {});
    }, [tenant]);
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div>
            <header>
                <p className="text-pencil">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{hello}, {me.user.name.split(' ')[0]}</h1>
            </header>
            <div className="mt-8 space-y-5">
                {children === null ? <Skeleton className="h-72 rounded-2xl" /> : children.length === 0 ? (
                    <EmptyState icon="family" title="No children linked yet">Ask the school office to link your account to your child’s record. Then you’ll see their timetable, homework and attendance here.</EmptyState>
                ) : children.map((c) => <ChildCard key={c.id} c={c} tenant={tenant} bus={buses.find((b) => b.student?.id === c.id)} />)}
            </div>
            <div className="mt-8"><Announcements tenant={tenant} limit={3} compact /></div>
        </div>
    );
}

/** Student home: their own school day, if they have a school record. */
export function StudentToday({ tenant }) {
    const [me, setMe] = useState(null);
    useEffect(() => { api('school/family', { tenant }).then((r) => setMe(r.children[0] ?? false)).catch(() => setMe(false)); }, [tenant]);
    if (!me) return null;
    return <div className="mt-8"><ChildCard c={me} tenant={tenant} self /></div>;
}
