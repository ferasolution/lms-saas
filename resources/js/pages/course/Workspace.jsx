import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { coursePrice, duration, LESSON_TYPES, titleCase } from '../../lib/format';
import Icon from '../../components/Icon';
import CourseCover from '../../components/CourseCover';
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, Menu, Modal, Tabs, useToast } from '../../components/ui';
import LessonEditor from './LessonEditor';
import StudentsTab from './StudentsTab';
import DetailsTab from './DetailsTab';
import GradingQueue from '../../components/GradingQueue';
import Announcements from '../../components/Announcements';
import CourseReviews from '../../components/CourseReviews';
import Stars from '../../components/Stars';

export default function Workspace({ data, reload, tenant }) {
    const toast = useToast();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || 'curriculum';
    const setTab = (t) => setParams(t === 'curriculum' ? {} : { tab: t }, { replace: true });
    const [busy, setBusy] = useState(false);
    const [copying, setCopying] = useState(false);
    const { course, sections, stats } = data;
    const assignmentCount = sections.reduce((n, s) => n + s.lessons.filter((l) => l.type === 'assignment').length, 0);

    async function duplicate() {
        setCopying(true);
        try {
            const copy = await api(`courses/${course.id}/duplicate`, { method: 'POST', tenant });
            toast('Copy created as a draft');
            navigate(`/${tenant}/courses/${copy.id}`);
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setCopying(false);
        }
    }
    const price = coursePrice(course);
    const quizCount = sections.reduce((n, s) => n + s.lessons.filter((l) => l.type === 'quiz').length, 0);

    async function setStatus(status) {
        if (status === 'published' && stats.lessons === 0) {
            toast('Add at least one lesson before publishing', 'error');
            setTab('curriculum');
            return;
        }
        setBusy(true);
        try {
            await api(`courses/${course.id}`, { method: 'PATCH', tenant, body: { status } });
            toast(status === 'published' ? 'Course published' : 'Moved to drafts');
            await reload();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <Link to={`/${tenant}/courses`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-pencil hover:text-ink">
                <Icon name="arrowLeft" size={16} />All courses
            </Link>

            <header className="flex flex-col gap-5 rounded-2xl border border-rule bg-white p-5 sm:flex-row sm:items-center sm:p-6">
                <CourseCover course={course} className="h-28 w-full shrink-0 rounded-xl sm:h-24 sm:w-40" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={course.status} dot>{titleCase(course.status)}</Badge>
                        <Badge>{titleCase(course.level)}</Badge>
                        <Badge tone={price.free ? 'published' : 'neutral'}>{price.now}</Badge>
                    </div>
                    <h1 className="mt-2 truncate text-2xl font-extrabold sm:text-3xl">{course.title}</h1>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-pencil">
                        <span>{stats.lessons} {stats.lessons === 1 ? 'lesson' : 'lessons'}</span>
                        {duration(stats.duration_seconds) && <span>{duration(stats.duration_seconds)} of video and reading</span>}
                        <span>{quizCount} {quizCount === 1 ? 'quiz' : 'quizzes'}</span>
                        <span>{course.students_count} enrolled</span>
                        {course.rating ? <span className="flex items-center gap-1"><Stars value={course.rating} size={13} />{course.rating.toFixed(1)} ({course.reviews_count})</span> : null}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
                    {course.status === 'published' ? (
                        <Button variant="secondary" icon="eyeOff" busy={busy} onClick={() => setStatus('draft')}>Unpublish</Button>
                    ) : (
                        <Button icon="eye" busy={busy} onClick={() => setStatus('published')}>Publish</Button>
                    )}
                    <Button variant="ghost" icon="play" as={Link} to={`/${tenant}/learn/${course.id}`}>Preview</Button>
                    <Button variant="ghost" icon="copy" busy={copying} onClick={duplicate}>Duplicate</Button>
                </div>
            </header>

            <Tabs className="mt-8" value={tab} onChange={setTab} tabs={[
                { value: 'curriculum', label: 'Curriculum', icon: 'layers' },
                { value: 'students', label: 'Students', icon: 'users', count: course.students_count },
                assignmentCount > 0 && { value: 'grading', label: 'Grading', icon: 'clipboard' },
                { value: 'announcements', label: 'Announcements', icon: 'flag' },
                { value: 'reviews', label: 'Reviews', icon: 'star', count: course.reviews_count || null },
                { value: 'details', label: 'Details', icon: 'edit' },
            ].filter(Boolean)} />

            <div className="mt-6">
                {tab === 'curriculum' && <Curriculum data={data} reload={reload} tenant={tenant} />}
                {tab === 'students' && <StudentsTab course={course} tenant={tenant} onChange={reload} />}
                {tab === 'grading' && <GradingQueue tenant={tenant} courseId={course.id} />}
                {tab === 'announcements' && <Announcements tenant={tenant} courseId={course.id} canPost title="Course announcements" />}
                {tab === 'reviews' && <CourseReviews tenant={tenant} courseId={course.id} />}
                {tab === 'details' && (
                    <DetailsTab course={course} tenant={tenant} onSaved={reload}
                        onDeleted={() => { toast('Course deleted'); navigate(`/${tenant}/courses`); }} />
                )}
            </div>
        </div>
    );
}

/* ---------- Curriculum builder ---------- */

function Curriculum({ data, reload, tenant }) {
    const toast = useToast();
    const navigate = useNavigate();
    const { course, sections } = data;
    const [newSection, setNewSection] = useState('');
    const [adding, setAdding] = useState(false);
    const [renaming, setRenaming] = useState(null);
    const [picker, setPicker] = useState(null); // section id choosing a lesson type
    const [editor, setEditor] = useState(null); // { sectionId, type } or { lesson }
    const [deleting, setDeleting] = useState(null); // { kind, item }
    const [busy, setBusy] = useState(false);

    async function addSection(e) {
        e?.preventDefault();
        if (!newSection.trim()) return;
        setBusy(true);
        try {
            await api(`courses/${course.id}/sections`, { method: 'POST', tenant, body: { title: newSection.trim() } });
            setNewSection('');
            setAdding(false);
            await reload();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    async function rename(section, title) {
        setRenaming(null);
        if (!title.trim() || title === section.title) return;
        await api(`sections/${section.id}`, { method: 'PATCH', tenant, body: { title: title.trim() } }).catch((err) => toast(err.message, 'error'));
        reload();
    }

    async function saveOrder(next) {
        try {
            await api(`courses/${course.id}/order`, {
                method: 'PUT', tenant,
                body: { sections: next.map((s) => ({ id: s.id, lessons: s.lessons.map((l) => l.id) })) },
            });
            await reload();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function moveSection(index, dir) {
        const next = [...sections];
        const target = index + dir;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        saveOrder(next);
    }

    function moveLesson(sIndex, lIndex, dir) {
        const next = sections.map((s) => ({ ...s, lessons: [...s.lessons] }));
        const lessons = next[sIndex].lessons;
        const target = lIndex + dir;
        if (target >= 0 && target < lessons.length) {
            [lessons[lIndex], lessons[target]] = [lessons[target], lessons[lIndex]];
        } else if (target < 0 && sIndex > 0) {
            next[sIndex - 1].lessons.push(lessons.splice(lIndex, 1)[0]);
        } else if (target >= lessons.length && sIndex < next.length - 1) {
            next[sIndex + 1].lessons.unshift(lessons.splice(lIndex, 1)[0]);
        } else {
            return;
        }
        saveOrder(next);
    }

    async function confirmDelete() {
        setBusy(true);
        try {
            const { kind, item } = deleting;
            await api(kind === 'section' ? `sections/${item.id}` : `lessons/${item.id}`, { method: 'DELETE', tenant });
            toast(kind === 'section' ? 'Section deleted' : 'Lesson deleted');
            setDeleting(null);
            await reload();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    function onLessonSaved(lesson, isNew) {
        setEditor(null);
        toast(isNew ? 'Lesson added' : 'Lesson saved');
        reload();
        if (isNew && lesson.type === 'quiz' && lesson.quiz) {
            navigate(`/${tenant}/courses/${course.id}/quiz/${lesson.quiz.id}`);
        }
    }

    if (sections.length === 0 && !adding) {
        return (
            <EmptyState icon="layers" title="Plan your course"
                action={<Button icon="plus" onClick={() => setAdding(true)}>Add the first section</Button>}>
                Group lessons into sections, like chapters in a book. For example “Getting started” or “Week 1”.
            </EmptyState>
        );
    }

    let lessonNumber = 0;

    return (
        <div className="space-y-5">
            {sections.map((section, sIndex) => (
                <section key={section.id} className="overflow-hidden rounded-2xl border border-rule bg-white">
                    <div className="flex items-center gap-3 border-b border-rule bg-paper/60 px-4 py-3 sm:px-5">
                        <span className="text-sm font-bold text-pencil tabular-nums">Section {sIndex + 1}</span>
                        {renaming === section.id ? (
                            <input autoFocus defaultValue={section.title} aria-label="Section title"
                                onBlur={(e) => rename(section, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenaming(null); }}
                                className="h-9 min-w-0 flex-1 rounded-lg border border-ink bg-white px-2 font-display text-lg font-bold text-ink-deep focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                        ) : (
                            <button type="button" onClick={() => setRenaming(section.id)} className="min-w-0 flex-1 truncate text-left font-display text-lg font-bold text-ink-deep hover:underline">
                                {section.title}
                            </button>
                        )}
                        <span className="hidden text-sm text-pencil sm:inline">{section.lessons.length} {section.lessons.length === 1 ? 'lesson' : 'lessons'}</span>
                        <Menu label={`Actions for ${section.title}`} items={[
                            { label: 'Rename', icon: 'edit', onClick: () => setRenaming(section.id) },
                            sIndex > 0 && { label: 'Move up', icon: 'chevronUp', onClick: () => moveSection(sIndex, -1) },
                            sIndex < sections.length - 1 && { label: 'Move down', icon: 'chevronDown', onClick: () => moveSection(sIndex, 1) },
                            { label: 'Delete section', icon: 'trash', danger: true, onClick: () => setDeleting({ kind: 'section', item: section }) },
                        ]} />
                    </div>

                    {section.lessons.length === 0 ? (
                        <p className="px-5 py-6 text-center text-pencil">No lessons in this section yet.</p>
                    ) : (
                        <ol className="divide-y divide-rule">
                            {section.lessons.map((lesson, lIndex) => {
                                lessonNumber += 1;
                                const type = LESSON_TYPES[lesson.type] ?? LESSON_TYPES.text;
                                const first = sIndex === 0 && lIndex === 0;
                                const last = sIndex === sections.length - 1 && lIndex === section.lessons.length - 1;
                                return (
                                    <li key={lesson.id} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50/40 sm:px-5">
                                        <span className="w-6 text-right text-sm text-pencil tabular-nums">{lessonNumber}</span>
                                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${lesson.type === 'quiz' ? 'bg-amber-50 text-amber-700' : 'bg-ink-50 text-ink'}`}>
                                            <Icon name={type.icon} size={18} />
                                        </span>
                                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditor({ lesson })}>
                                            <span className="block truncate font-bold text-graphite group-hover:text-ink-deep">{lesson.title}</span>
                                            <span className="flex flex-wrap gap-x-3 text-sm text-pencil">
                                                <span>{type.label}</span>
                                                {lesson.type === 'quiz' && lesson.quiz && (
                                                    <span className={lesson.quiz.questions_count ? '' : 'font-bold text-amber-700'}>
                                                        {lesson.quiz.questions_count ? `${lesson.quiz.questions_count} questions` : 'No questions yet'}
                                                    </span>
                                                )}
                                                {duration(lesson.duration_seconds) && <span>{duration(lesson.duration_seconds)}</span>}
                                                {lesson.is_preview && <span className="font-bold text-leaf">Free preview</span>}
                                                {lesson.drip_days ? <span>Opens on day {lesson.drip_days}</span> : null}
                                            </span>
                                        </button>
                                        {lesson.type === 'quiz' && lesson.quiz && (
                                            <Button variant="secondary" size="sm" as={Link} to={`/${tenant}/courses/${course.id}/quiz/${lesson.quiz.id}`} className="hidden sm:inline-flex">
                                                Questions
                                            </Button>
                                        )}
                                        <div className="hidden items-center sm:flex">
                                            <IconButton icon="chevronUp" label="Move up" onClick={() => moveLesson(sIndex, lIndex, -1)} disabled={first} className="disabled:opacity-30" />
                                            <IconButton icon="chevronDown" label="Move down" onClick={() => moveLesson(sIndex, lIndex, 1)} disabled={last} className="disabled:opacity-30" />
                                        </div>
                                        <Menu label={`Actions for ${lesson.title}`} items={[
                                            { label: 'Edit lesson', icon: 'edit', onClick: () => setEditor({ lesson }) },
                                            lesson.type === 'quiz' && lesson.quiz && { label: 'Edit questions', icon: 'quiz', onClick: () => navigate(`/${tenant}/courses/${course.id}/quiz/${lesson.quiz.id}`) },
                                            !first && { label: 'Move up', icon: 'chevronUp', onClick: () => moveLesson(sIndex, lIndex, -1) },
                                            !last && { label: 'Move down', icon: 'chevronDown', onClick: () => moveLesson(sIndex, lIndex, 1) },
                                            { label: 'Delete lesson', icon: 'trash', danger: true, onClick: () => setDeleting({ kind: 'lesson', item: lesson }) },
                                        ]} />
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    <div className="border-t border-dashed border-rule px-4 py-2.5 sm:px-5">
                        <button type="button" onClick={() => setPicker(section.id)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 font-bold text-ink hover:bg-ink-50">
                            <Icon name="plus" size={18} />Add lesson
                        </button>
                    </div>
                </section>
            ))}

            {adding ? (
                <form onSubmit={addSection} className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-ink/30 bg-white p-4 sm:flex-row">
                    <input autoFocus value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Section title, e.g. Week 1: Foundations" aria-label="Section title"
                        className="h-11 min-w-0 flex-1 rounded-lg border border-rule px-3 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                    <div className="flex gap-2">
                        <Button type="submit" busy={busy}>Add section</Button>
                        <Button variant="ghost" onClick={() => { setAdding(false); setNewSection(''); }}>Cancel</Button>
                    </div>
                </form>
            ) : (
                <button type="button" onClick={() => setAdding(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rule py-4 font-bold text-pencil transition hover:border-ink/40 hover:text-ink">
                    <Icon name="plus" size={18} />Add section
                </button>
            )}

            <Modal open={picker !== null} onClose={() => setPicker(null)} title="Add a lesson" description="What kind of lesson is it?">
                <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(LESSON_TYPES).map(([value, t]) => (
                        <button key={value} type="button" onClick={() => { setEditor({ sectionId: picker, type: value }); setPicker(null); }}
                            className="flex items-start gap-3 rounded-xl border border-rule p-3.5 text-left transition hover:border-ink hover:bg-ink-50/50">
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${value === 'quiz' ? 'bg-amber-50 text-amber-700' : 'bg-ink-50 text-ink'}`}><Icon name={t.icon} /></span>
                            <span>
                                <span className="block font-bold text-graphite">{t.label}</span>
                                <span className="block text-sm text-pencil">{t.hint}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Modal>

            <LessonEditor open={editor !== null} {...(editor ?? {})} tenant={tenant} onClose={() => setEditor(null)} onSaved={onLessonSaved} />

            <ConfirmDialog open={!!deleting} busy={busy} onClose={() => setDeleting(null)} onConfirm={confirmDelete}
                title={deleting?.kind === 'section' ? 'Delete this section?' : 'Delete this lesson?'}
                confirmLabel={deleting?.kind === 'section' ? 'Delete section' : 'Delete lesson'}>
                {deleting?.kind === 'section'
                    ? <>All {deleting.item.lessons.length} lessons in <strong className="text-graphite">{deleting.item.title}</strong> will be deleted too.</>
                    : <><strong className="text-graphite">{deleting?.item.title}</strong> and students’ progress on it will be removed.</>}
            </ConfirmDialog>
        </div>
    );
}
