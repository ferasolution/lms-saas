import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { dateTime, duration, LESSON_TYPES, videoEmbed } from '../lib/format';
import Icon from '../components/Icon';
import RichText from '../components/RichText';
import QuizRunner from '../components/QuizRunner';
import AssignmentPanel from '../components/AssignmentPanel';
import LessonDiscussion from '../components/LessonDiscussion';
import { Button, EmptyState, IconButton, Progress, Skeleton, useToast } from '../components/ui';

export default function Player() {
    const { tenant } = useOutletContext();
    const { courseId, lessonId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [outline, setOutline] = useState(false);
    const [busy, setBusy] = useState(false);
    const [celebrate, setCelebrate] = useState(null);

    const load = useCallback(() => api(`courses/${courseId}/curriculum`, { tenant }).then(setData).catch(setError), [courseId, tenant]);
    useEffect(() => { load(); }, [load]);

    const flat = useMemo(() => (data?.sections ?? []).flatMap((s) => s.lessons.map((l) => ({ ...l, sectionTitle: s.title }))), [data]);
    const index = lessonId ? flat.findIndex((l) => String(l.id) === lessonId) : -1;
    const fallback = flat.findIndex((l) => !l.completed && !l.locked);
    const current = flat[index >= 0 ? index : fallback >= 0 ? fallback : 0];
    const pos = current ? flat.indexOf(current) : -1;
    const prev = flat.slice(0, pos).reverse().find((l) => !l.locked);
    const next = flat.slice(pos + 1).find((l) => !l.locked);

    useEffect(() => { setOutline(false); window.scrollTo(0, 0); }, [current?.id]);

    if (error) return <div className="p-8"><EmptyState icon="lock" title="You can’t open this course">{error.message}</EmptyState></div>;
    if (!data) return <div className="space-y-4 p-8"><Skeleton className="h-10 w-80" /><Skeleton className="aspect-video max-w-4xl rounded-2xl" /></div>;
    if (!current) {
        return (
            <div className="p-8">
                <EmptyState icon="layers" title="No lessons yet" action={<Button as={Link} to={`/${tenant}/courses/${courseId}`}>Back to course</Button>}>
                    This course doesn’t have any lessons yet.
                </EmptyState>
            </div>
        );
    }

    const enrolled = data.enrollment && data.enrollment.status !== 'cancelled';
    const progress = data.enrollment?.progress_percent ?? 0;
    const go = (l) => navigate(`/${tenant}/learn/${courseId}/${l.id}`);

    function onProgress(p) {
        if (!p) return;
        setData((d) => ({ ...d, enrollment: d.enrollment ? { ...d.enrollment, progress_percent: p.progress_percent, status: p.status } : d.enrollment }));
        if (p.status === 'completed' && data.enrollment?.status !== 'completed') setCelebrate(p);
        load();
    }

    async function complete() {
        if (current.completed || !enrolled) {
            if (next) go(next);
            return;
        }
        setBusy(true);
        try {
            const p = await api(`lessons/${current.id}/complete`, { method: 'POST', tenant });
            onProgress(p);
            if (p.status !== 'completed' && next) go(next);
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    const outlineList = (
        <nav aria-label="Course contents" className="pb-6">
            {data.sections.map((s, si) => (
                <div key={s.id}>
                    <p className="px-5 pt-5 pb-2 text-sm font-bold text-pencil">{si + 1}. {s.title}</p>
                    <ul>
                        {s.lessons.map((l) => {
                            const t = LESSON_TYPES[l.type] ?? LESSON_TYPES.text;
                            const active = l.id === current.id;
                            return (
                                <li key={l.id}>
                                    <button type="button" disabled={l.locked} onClick={() => go(l)} aria-current={active ? 'true' : undefined}
                                        className={`relative flex w-full items-start gap-3 px-5 py-2.5 text-left transition ${active ? 'bg-ink-50' : 'enabled:hover:bg-paper'} disabled:opacity-50`}>
                                        {active && <span className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-margin" />}
                                        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${l.completed ? 'bg-leaf text-white' : active ? 'border-2 border-ink text-ink' : 'border border-rule text-pencil'}`}>
                                            {l.completed ? <Icon name="check" size={13} strokeWidth={3} /> : l.locked ? <Icon name="lock" size={12} /> : <Icon name={t.icon} size={13} />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className={`block text-[15px] leading-snug ${active ? 'font-bold text-ink-deep' : 'text-graphite'}`}>{l.title}</span>
                                            <span className="text-xs text-pencil">{t.label}{duration(l.duration_seconds) ? ` · ${duration(l.duration_seconds)}` : ''}</span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );

    return (
        <div className="min-h-screen bg-paper">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-rule bg-white px-3 sm:px-5">
                <IconButton icon="x" label="Close player" onClick={() => navigate(`/${tenant}/courses/${courseId}`)} />
                <p className="min-w-0 flex-1 truncate font-display font-bold text-ink-deep">{data.course.title}</p>
                {enrolled && (
                    <div className="hidden w-48 items-center gap-3 sm:flex">
                        <Progress value={progress} className="flex-1" label="Course progress" />
                        <span className="text-sm font-bold text-ink-deep tabular-nums">{progress}%</span>
                    </div>
                )}
                {!enrolled && data.can_manage && <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-800">Preview mode</span>}
                <Button variant="secondary" size="sm" icon="layers" className="lg:hidden" onClick={() => setOutline(true)}>Contents</Button>
            </header>

            <div className="lg:grid lg:grid-cols-[20rem_1fr]">
                <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] overflow-y-auto border-r border-rule bg-white lg:block">{outlineList}</aside>

                {outline && (
                    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Course contents">
                        <div className="absolute inset-0 bg-ink-deep/30" onClick={() => setOutline(false)} />
                        <aside className="absolute inset-y-0 left-0 w-[20rem] max-w-[88vw] overflow-y-auto bg-white shadow-2xl animate-[slide-in-left_.2s_ease-out]">
                            <div className="flex items-center justify-between border-b border-rule px-5 py-4">
                                <span className="font-bold">Contents</span>
                                <IconButton icon="x" label="Close" onClick={() => setOutline(false)} />
                            </div>
                            {outlineList}
                        </aside>
                    </div>
                )}

                <main className="min-w-0">
                    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 lg:py-10">
                        {celebrate && <Celebration tenant={tenant} code={celebrate.certificate_code} course={data.course} onClose={() => setCelebrate(null)} />}

                        <p className="text-sm font-bold text-pencil">{current.sectionTitle} · Lesson {pos + 1} of {flat.length}</p>
                        <h1 className="mt-1 text-2xl leading-tight font-extrabold sm:text-3xl">{current.title}</h1>
                        {current.summary && <p className="mt-2 text-lg text-pencil">{current.summary}</p>}

                        <div className="mt-6">
                            <LessonBody lesson={current} tenant={tenant} enrolled={enrolled} courseId={courseId} onProgress={onProgress} />
                        </div>

                        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-rule pt-6 sm:flex-row sm:items-center sm:justify-between">
                            {prev ? <Button variant="ghost" icon="chevronLeft" onClick={() => go(prev)}>Previous</Button> : <span />}
                            {current.type !== 'quiz' && current.type !== 'assignment' && !current.locked && (
                                enrolled && !current.completed ? (
                                    <Button size="lg" busy={busy} icon="check" onClick={complete}>{next ? 'Complete and continue' : 'Complete lesson'}</Button>
                                ) : next ? (
                                    <Button size="lg" iconRight="chevronRight" onClick={() => go(next)}>Next lesson</Button>
                                ) : null
                            )}
                            {(current.type === 'quiz' || current.type === 'assignment') && next && (current.completed || !enrolled) && <Button size="lg" iconRight="chevronRight" onClick={() => go(next)}>Next lesson</Button>}
                        </div>

                        {!current.locked && (enrolled || data.can_manage) && <LessonDiscussion key={current.id} lessonId={current.id} tenant={tenant} />}
                    </div>
                </main>
            </div>
        </div>
    );
}

function LessonBody({ lesson, tenant, enrolled, courseId, onProgress }) {
    if (lesson.locked) {
        const drip = lesson.locked_reason?.startsWith('drip:');
        return (
            <EmptyState icon="lock" title={drip ? 'This lesson opens soon' : 'Enrol to open this lesson'}
                action={!drip && <Button as={Link} to={`/${tenant}/courses/${courseId}`}>Go to course page</Button>}>
                {drip ? `It unlocks on ${dateTime(lesson.locked_reason.slice(5))}.` : 'Preview lessons are free; the rest open when you enrol.'}
            </EmptyState>
        );
    }

    if (lesson.type === 'video') {
        const embed = videoEmbed(lesson.video_url);
        return (
            <>
                {embed?.kind === 'iframe' && (
                    <div className="aspect-video overflow-hidden rounded-2xl bg-ink-deep shadow-lg">
                        <iframe src={embed.src} title={lesson.title} className="h-full w-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
                    </div>
                )}
                {embed?.kind === 'video' && <video src={embed.src} controls className="aspect-video w-full rounded-2xl bg-ink-deep" />}
                {embed?.kind === 'link' && (
                    <a href={embed.src} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-rule bg-white p-5 font-bold text-ink hover:border-ink">
                        <Icon name="play" />Open the video<Icon name="external" size={16} />
                    </a>
                )}
                {!embed && <p className="text-pencil">The video for this lesson hasn’t been added yet.</p>}
                {lesson.content && <RichText text={lesson.content} className="mt-8" />}
            </>
        );
    }

    if (lesson.type === 'pdf') {
        return (
            <>
                {lesson.file_path ? (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-white p-4">
                            <span className="flex min-w-0 items-center gap-3">
                                <span className="grid h-10 w-10 place-items-center rounded-lg bg-margin/10 text-margin"><Icon name="file" /></span>
                                <span className="truncate font-bold text-graphite">{decodeURIComponent(lesson.file_path.split('/').pop())}</span>
                            </span>
                            <Button variant="secondary" size="sm" icon="download" as="a" href={lesson.file_path} target="_blank" rel="noreferrer">Download</Button>
                        </div>
                        <iframe src={lesson.file_path} title={lesson.title} className="mt-4 hidden h-[75vh] w-full rounded-2xl border border-rule bg-white md:block" />
                    </>
                ) : <p className="text-pencil">The file for this lesson hasn’t been added yet.</p>}
                {lesson.content && <RichText text={lesson.content} className="mt-8" />}
            </>
        );
    }

    if (lesson.type === 'live') {
        const start = lesson.live_starts_at ? new Date(lesson.live_starts_at) : null;
        const soon = start && start.getTime() - Date.now() < 15 * 60 * 1000;
        return (
            <>
                <div className="margin-line rounded-2xl border border-rule bg-white p-6 pl-8">
                    <p className="flex items-center gap-2 font-bold text-pencil"><Icon name="calendar" size={18} />Live class</p>
                    <p className="mt-2 font-display text-2xl font-bold text-ink-deep">{start ? dateTime(start) : 'Time to be announced'}</p>
                    {lesson.live_url ? (
                        <Button className="mt-5" icon="external" as="a" href={lesson.live_url} target="_blank" rel="noreferrer" variant={soon ? 'primary' : 'secondary'}>
                            {soon ? 'Join now' : 'Open meeting link'}
                        </Button>
                    ) : <p className="mt-3 text-pencil">The meeting link will appear here.</p>}
                </div>
                {lesson.content && <RichText text={lesson.content} className="mt-8" />}
            </>
        );
    }

    if (lesson.type === 'assignment') {
        return <AssignmentPanel key={lesson.id} lesson={lesson} tenant={tenant} enrolled={enrolled} onProgress={onProgress} />;
    }

    if (lesson.type === 'quiz' && lesson.quiz) {
        return <QuizRunner key={lesson.quiz.id} quizId={lesson.quiz.id} tenant={tenant} canTake={enrolled} onProgress={onProgress} />;
    }

    return lesson.content ? <RichText text={lesson.content} /> : <p className="text-pencil">This lesson is empty for now.</p>;
}

function Celebration({ tenant, code, course, onClose }) {
    return (
        <div className="relative mb-8 overflow-hidden rounded-2xl bg-ink-deep p-6 text-white sm:p-8" role="status">
            <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(255,255,255,.08) 31px, rgba(255,255,255,.08) 32px)' }} aria-hidden />
            <div className="absolute inset-y-0 left-6 w-[2px] bg-margin sm:left-8" aria-hidden />
            <div className="relative pl-6 sm:pl-8">
                <Icon name="award" size={36} className="text-white" />
                <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">You finished {course.title}!</h2>
                <p className="mt-2 text-white/75">Every lesson is done. {code ? 'Your certificate is ready.' : ''}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                    {code && <Button variant="secondary" icon="award" as={Link} to={`/${tenant}/certificates/${code}`}>View certificate</Button>}
                    <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>Keep reviewing</Button>
                </div>
            </div>
        </div>
    );
}
