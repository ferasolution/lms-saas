import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import CourseCover from '../components/CourseCover';
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, Menu, SlideOver, Skeleton, useToast } from '../components/ui';

const TABS = [
    { value: '', label: 'All' },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Drafts' },
    { value: 'archived', label: 'Archived' },
];

const LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export const formatPrice = (c) => {
    if (c.is_free || Number(c.price) === 0) return 'Free';
    const amount = Number(c.sale_price ?? c.price);
    return `${c.currency} ${amount.toLocaleString()}`;
};

const titleCase = (s) => s[0].toUpperCase() + s.slice(1);

export default function Courses() {
    const { tenant, canTeach, isAdmin, me } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const toast = useToast();

    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [courses, setCourses] = useState(null);
    const [editing, setEditing] = useState(params.get('new') ? {} : null);
    const [deleting, setDeleting] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setQuery(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(() => {
        const qs = new URLSearchParams({ per_page: '60' });
        if (status) qs.set('status', status);
        if (query) qs.set('search', query);
        return api(`courses?${qs}`, { tenant }).then((r) => setCourses(r.data));
    }, [tenant, status, query]);

    useEffect(() => { load(); }, [load]);

    function closeEditor() {
        setEditing(null);
        if (params.get('new')) setParams({}, { replace: true });
    }

    const canManage = (c) => isAdmin || (canTeach && c.instructor?.id === me.user.id);

    async function setCourseStatus(course, next) {
        try {
            await api(`courses/${course.id}`, { method: 'PATCH', tenant, body: { status: next } });
            toast(next === 'published' ? 'Course published' : next === 'archived' ? 'Course archived' : 'Moved to drafts');
            load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function confirmDelete() {
        setBusy(true);
        try {
            await api(`courses/${deleting.id}`, { method: 'DELETE', tenant });
            toast('Course deleted');
            setDeleting(null);
            load();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold sm:text-4xl">{canTeach ? 'Courses' : 'Browse courses'}</h1>
                    <p className="mt-1 text-pencil">
                        {canTeach ? 'Create courses, then publish them when they are ready for students.' : 'Everything your institute has published.'}
                    </p>
                </div>
                {canTeach && <Button icon="plus" onClick={() => setEditing({})}>New course</Button>}
            </header>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {canTeach ? (
                    <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-rule" role="tablist" aria-label="Filter by status">
                        {TABS.map((t) => (
                            <button key={t.value} role="tab" aria-selected={status === t.value} onClick={() => setStatus(t.value)}
                                className={`rounded-lg px-3.5 py-1.5 text-[15px] font-bold whitespace-nowrap transition ${status === t.value ? 'bg-ink text-white' : 'text-pencil hover:text-ink-deep'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                ) : <span />}
                <label className="relative block sm:w-72">
                    <span className="sr-only">Search courses</span>
                    <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-pencil" />
                    <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title"
                        className="h-11 w-full rounded-lg border border-rule bg-white pr-3 pl-10 placeholder:text-pencil/70 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                </label>
            </div>

            <div className="mt-6">
                {courses === null ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="overflow-hidden rounded-2xl border border-rule bg-white">
                                <Skeleton className="h-36 rounded-none" />
                                <div className="space-y-2 p-5"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
                            </div>
                        ))}
                    </div>
                ) : courses.length === 0 ? (
                    query || status ? (
                        <EmptyState icon="search" title="No matching courses">Try another word, or switch to “All”.</EmptyState>
                    ) : canTeach ? (
                        <EmptyState icon="book" title="Create your first course" action={<Button icon="plus" onClick={() => setEditing({})}>New course</Button>}>
                            Start with a title and a short description. Lessons and quizzes come next.
                        </EmptyState>
                    ) : (
                        <EmptyState icon="book" title="No courses yet">Courses will appear here as soon as your institute publishes them.</EmptyState>
                    )
                ) : (
                    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {courses.map((c) => (
                            <li key={c.id} className="group flex flex-col overflow-hidden rounded-2xl border border-rule bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(18,40,95,.35)]">
                                <button type="button" className="text-left" onClick={() => canManage(c) && setEditing(c)} disabled={!canManage(c)} aria-label={`Edit ${c.title}`}>
                                    <CourseCover course={c} className="h-36 w-full" />
                                </button>
                                <div className="flex flex-1 flex-col p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            {canTeach && <Badge tone={c.status} dot>{titleCase(c.status)}</Badge>}
                                            <h3 className="mt-2 text-lg leading-snug font-bold">{c.title}</h3>
                                        </div>
                                        {canManage(c) && (
                                            <Menu label={`Actions for ${c.title}`} items={[
                                                { label: 'Edit details', icon: 'edit', onClick: () => setEditing(c) },
                                                c.status !== 'published' && { label: 'Publish', icon: 'eye', onClick: () => setCourseStatus(c, 'published') },
                                                c.status === 'published' && { label: 'Unpublish', icon: 'eyeOff', onClick: () => setCourseStatus(c, 'draft') },
                                                c.status !== 'archived' && { label: 'Archive', icon: 'lock', onClick: () => setCourseStatus(c, 'archived') },
                                                { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleting(c) },
                                            ]} />
                                        )}
                                    </div>
                                    {c.short_description && <p className="mt-1.5 line-clamp-2 text-pencil">{c.short_description}</p>}
                                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule pt-4 text-sm">
                                        <span className="flex items-center gap-1.5 text-pencil">
                                            <Icon name="users" size={16} />{c.enrollments_count ?? 0} enrolled
                                        </span>
                                        <span className="font-display font-bold text-ink-deep">
                                            {c.sale_price && !c.is_free && <span className="mr-1.5 font-sans text-pencil line-through">{Number(c.price).toLocaleString()}</span>}
                                            {formatPrice(c)}
                                        </span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <CourseEditor
                open={editing !== null}
                course={editing}
                tenant={tenant}
                onClose={closeEditor}
                onSaved={(msg) => { closeEditor(); toast(msg); load(); }}
            />

            <ConfirmDialog
                open={!!deleting}
                title="Delete this course?"
                confirmLabel="Delete course"
                busy={busy}
                onConfirm={confirmDelete}
                onClose={() => setDeleting(null)}
            >
                <strong className="text-graphite">{deleting?.title}</strong> will be removed for everyone, including enrolled students.
            </ConfirmDialog>
        </div>
    );
}

function CourseEditor({ open, course, tenant, onClose, onSaved }) {
    const isNew = !course?.id;
    const blank = { title: '', short_description: '', description: '', level: 'beginner', is_free: true, price: '', sale_price: '' };
    const [form, setForm] = useState(blank);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setForm(course?.id ? {
            title: course.title ?? '',
            short_description: course.short_description ?? '',
            description: course.description ?? '',
            level: course.level ?? 'beginner',
            is_free: course.is_free || Number(course.price) === 0,
            price: Number(course.price) ? String(Number(course.price)) : '',
            sale_price: course.sale_price ? String(Number(course.sale_price)) : '',
        } : blank);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, course]);

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    async function save(nextStatus) {
        setBusy(nextStatus ?? 'save');
        setError(null);
        const body = {
            title: form.title,
            short_description: form.short_description || null,
            description: form.description || null,
            level: form.level,
            is_free: form.is_free,
            price: form.is_free ? 0 : Number(form.price || 0),
            sale_price: form.is_free || !form.sale_price ? null : Number(form.sale_price),
            ...(nextStatus ? { status: nextStatus } : {}),
        };
        try {
            await api(isNew ? 'courses' : `courses/${course.id}`, { method: isNew ? 'POST' : 'PATCH', tenant, body });
            onSaved(isNew ? (nextStatus === 'published' ? 'Course published' : 'Draft saved') : 'Changes saved');
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <SlideOver
            open={open}
            onClose={onClose}
            title={isNew ? 'New course' : 'Edit course'}
            description={isNew ? 'You can add sections, lessons and quizzes after saving.' : null}
            footer={isNew ? (
                <>
                    <Button variant="secondary" busy={busy === 'draft'} onClick={() => save('draft')}>Save draft</Button>
                    <Button busy={busy === 'published'} onClick={() => save('published')}>Publish</Button>
                </>
            ) : (
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button busy={busy === 'save'} onClick={() => save()}>Save changes</Button>
                </>
            )}
        >
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(isNew ? 'draft' : undefined); }} noValidate>
                {error && !Object.keys(error.errors).length && (
                    <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin" role="alert">{error.message}</p>
                )}
                <Field label="Title" name="title" error={error} value={form.title} onChange={set('title')} placeholder="e.g. Spoken English for Beginners" />
                <Field label="Short description" name="short_description" error={error} value={form.short_description} onChange={set('short_description')}
                    hint="One line shown on the course card." maxLength={500} />
                <Field label="Full description" name="description" as="textarea" rows={5} error={error} value={form.description} onChange={set('description')}
                    placeholder="What will students learn? Who is it for?" />
                <Field label="Level" name="level" error={error}>
                    <div className="grid grid-cols-3 gap-2">
                        {Object.entries(LEVELS).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setForm({ ...form, level: value })} aria-pressed={form.level === value}
                                className={`h-11 rounded-lg border text-[15px] font-bold transition ${form.level === value ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule bg-white text-pencil hover:border-ink/30'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </Field>

                <div className="rounded-xl border border-rule bg-white p-4">
                    <Checkbox label="Free course" hint="Anyone in your institute can enrol without paying." checked={form.is_free}
                        onChange={(v) => setForm({ ...form, is_free: v })} />
                    {!form.is_free && (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <Field label="Price (PKR)" name="price" type="number" min="0" inputMode="numeric" error={error} value={form.price} onChange={set('price')} />
                            <Field label="Sale price (optional)" name="sale_price" type="number" min="0" inputMode="numeric" error={error} value={form.sale_price} onChange={set('sale_price')} />
                        </div>
                    )}
                </div>
                <button type="submit" className="hidden" />
            </form>
        </SlideOver>
    );
}
