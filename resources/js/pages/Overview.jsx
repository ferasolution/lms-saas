import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import { Badge, Button, Skeleton, useToast } from '../components/ui';
import CourseCover from '../components/CourseCover';

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

export default function Overview() {
    const { me, tenant, isAdmin, canTeach } = useOutletContext();
    const [stats, setStats] = useState(null);
    const toast = useToast();

    useEffect(() => {
        api('dashboard', { tenant }).then(setStats).catch(() => setStats({ courses: { total: 0, published: 0, draft: 0 }, enrollments: 0, recent_courses: [] }));
    }, [tenant]);

    const firstName = me.user.name.split(' ')[0];
    const signInLink = `${window.location.origin}/${tenant}/login`;
    const students = stats?.people?.student ?? 0;
    const teachers = (stats?.people?.instructor ?? 0) + (stats?.people?.admin ?? 0);

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(signInLink);
            toast('Sign-in link copied');
        } catch {
            toast('Could not copy. Select the link and copy it.', 'error');
        }
    }

    const steps = isAdmin && stats ? [
        { done: true, label: 'Create your institute' },
        { done: stats.courses.total > 0, label: 'Add your first course', to: `/${tenant}/courses?new=1` },
        { done: stats.courses.published > 0, label: 'Publish a course', to: `/${tenant}/courses` },
        { done: students > 0, label: 'Add a student', to: `/${tenant}/people?new=1` },
    ] : [];
    const remaining = steps.filter((s) => !s.done).length;

    return (
        <div>
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-pencil">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{greeting()}, {firstName}</h1>
                </div>
                {canTeach && (
                    <Button as={Link} to={`/${tenant}/courses?new=1`} icon="plus">New course</Button>
                )}
            </header>

            {/* Getting started — only until every step is done */}
            {isAdmin && stats && remaining > 0 && (
                <section className="margin-line mt-8 overflow-hidden rounded-2xl border border-rule bg-white" aria-labelledby="gs">
                    <div className="ruled-faint px-6 py-6 pl-8 sm:px-8 sm:pl-10">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 id="gs" className="text-xl font-bold">Get your institute ready</h2>
                            <p className="text-sm text-pencil">{steps.length - remaining} of {steps.length} done</p>
                        </div>
                        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                            {steps.map((s, i) => (
                                <li key={s.label}>
                                    {s.done || !s.to ? (
                                        <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-pencil">
                                            <span className="grid h-7 w-7 place-items-center rounded-full bg-leaf text-white"><Icon name="check" size={16} strokeWidth={2.5} /></span>
                                            <span className="line-through decoration-pencil/40">{s.label}</span>
                                        </span>
                                    ) : (
                                        <Link to={s.to} className="group flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 ring-1 ring-rule transition hover:ring-ink/40">
                                            <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-ink/25 font-bold text-ink">{i + 1}</span>
                                            <span className="flex-1 font-bold text-graphite">{s.label}</span>
                                            <Icon name="arrowRight" size={18} className="text-pencil transition group-hover:translate-x-0.5 group-hover:text-ink" />
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>
            )}

            {/* Numbers */}
            <section className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Summary">
                <Stat icon="book" label={canTeach ? 'Courses' : 'Courses available'} value={stats?.courses.total} sub={canTeach && stats ? `${stats.courses.published} published · ${stats.courses.draft} draft` : null} />
                {canTeach && <Stat icon="sparkle" label="Enrolments" value={stats?.enrollments} sub="Across your courses" />}
                {isAdmin && <Stat icon="users" label="Students" value={stats ? students : undefined} sub="Can sign in now" />}
                {isAdmin && <Stat icon="academy" label="Teaching staff" value={stats ? teachers : undefined} sub="Admins and instructors" />}
                {!canTeach && <Stat icon="sparkle" label="Your enrolments" value={stats?.enrollments} />}
            </section>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <section className="min-w-0 rounded-2xl border border-rule bg-white" aria-labelledby="recent">
                    <div className="flex items-center justify-between border-b border-rule px-6 py-4">
                        <h2 id="recent" className="text-lg font-bold">{canTeach ? 'Recent courses' : 'Latest courses'}</h2>
                        <Link to={`/${tenant}/courses`} className="text-sm font-bold text-ink hover:underline">View all</Link>
                    </div>
                    {!stats ? (
                        <div className="space-y-4 p-6">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
                    ) : stats.recent_courses.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <p className="font-bold text-graphite">{canTeach ? 'No courses yet' : 'Nothing published yet'}</p>
                            <p className="mt-1 text-pencil">{canTeach ? 'Your newest courses will show up here.' : 'Courses appear here once your institute publishes them.'}</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-rule">
                            {stats.recent_courses.map((c) => (
                                <li key={c.id}>
                                    <Link to={`/${tenant}/courses`} className="flex items-center gap-4 px-6 py-3.5 transition hover:bg-ink-50/50">
                                        <CourseCover course={c} className="h-12 w-16 shrink-0 rounded-md" compact />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-bold text-graphite">{c.title}</p>
                                            <p className="truncate text-sm text-pencil">{c.instructor?.name ?? 'No instructor'} · {c.enrollments_count ?? 0} enrolled</p>
                                        </div>
                                        <Badge tone={c.status} dot>{c.status[0].toUpperCase() + c.status.slice(1)}</Badge>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {isAdmin && (
                    <aside className="space-y-4">
                        <div className="rounded-2xl border border-rule bg-white p-5">
                            <h2 className="text-lg font-bold">Your sign-in page</h2>
                            <p className="mt-1 text-sm text-pencil">Send this link to teachers and students.</p>
                            <div className="mt-3 flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
                                <Icon name="globe" size={16} className="text-ink" />
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-deep">{signInLink.replace(/^https?:\/\//, '')}</span>
                            </div>
                            <Button variant="secondary" size="sm" icon="copy" className="mt-3 w-full" onClick={copyLink}>Copy link</Button>
                        </div>
                        <div className="rounded-2xl border border-rule bg-white p-5">
                            <h2 className="text-lg font-bold">Quick add</h2>
                            <div className="mt-3 grid gap-2">
                                <Link to={`/${tenant}/people?new=1&role=student`} className="flex items-center gap-3 rounded-lg px-3 py-2 font-bold text-graphite hover:bg-ink-50"><Icon name="users" size={18} className="text-ink" />Add a student</Link>
                                <Link to={`/${tenant}/people?new=1&role=instructor`} className="flex items-center gap-3 rounded-lg px-3 py-2 font-bold text-graphite hover:bg-ink-50"><Icon name="academy" size={18} className="text-ink" />Add an instructor</Link>
                                <Link to={`/${tenant}/courses?new=1`} className="flex items-center gap-3 rounded-lg px-3 py-2 font-bold text-graphite hover:bg-ink-50"><Icon name="book" size={18} className="text-ink" />Create a course</Link>
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
}

function Stat({ icon, label, value, sub }) {
    return (
        <div className="rounded-2xl border border-rule bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm text-pencil sm:text-base">
                <Icon name={icon} size={18} />
                <span className="font-bold">{label}</span>
            </div>
            {value === undefined ? <Skeleton className="mt-3 h-9 w-16" /> : (
                <p className="mt-2 font-display text-3xl font-bold tabular-nums text-ink-deep sm:text-4xl">{value}</p>
            )}
            {sub && <p className="mt-1 hidden text-sm text-pencil sm:block">{sub}</p>}
        </div>
    );
}
