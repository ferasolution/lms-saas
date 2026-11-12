import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import CourseCover from '../components/CourseCover';
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, IconButton, Menu, Modal, SlideOver, Skeleton, useToast } from '../components/ui';
import Stars from '../components/Stars';
import { money } from '../lib/format';

const TABS = [
    { value: '', label: 'All' },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Drafts' },
    { value: 'archived', label: 'Archived' },
];

const LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export const formatPrice = (c) => {
    if (c.is_free || Number(c.price) === 0) return 'Free';
    return money(Number(c.sale_price ?? c.price), c.currency);
};

const titleCase = (s) => s[0].toUpperCase() + s.slice(1);

export default function Courses() {
    const { tenant, canTeach, isAdmin, me } = useOutletContext();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const toast = useToast();

    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [courses, setCourses] = useState(null);
    const [editing, setEditing] = useState(params.get('new') ? {} : null);
    const [deleting, setDeleting] = useState(null);
    const [busy, setBusy] = useState(false);
    const [categories, setCategories] = useState([]);
    const [filters, setFilters] = useState({ category_id: '', level: '', price: '', sort: '' });
    const [managingCats, setManagingCats] = useState(false);

    const loadCategories = useCallback(() => api('categories', { tenant }).then((r) => setCategories(r.data)).catch(() => {}), [tenant]);
    useEffect(() => { loadCategories(); }, [loadCategories]);

    useEffect(() => {
        const t = setTimeout(() => setQuery(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(() => {
        const qs = new URLSearchParams({ per_page: '60' });
        if (status) qs.set('status', status);
        if (query) qs.set('search', query);
        Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
        return api(`courses?${qs}`, { tenant }).then((r) => setCourses(r.data));
    }, [tenant, status, query, filters]);
    const filtered = Object.values(filters).some(Boolean);

    async function duplicate(course) {
        try {
            const copy = await api(`courses/${course.id}/duplicate`, { method: 'POST', tenant });
            toast('Copy created as a draft');
            navigate(`/${tenant}/courses/${copy.id}`);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

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

            <div className="mt-4 flex flex-wrap items-center gap-2">
                {(categories.length > 0 || isAdmin) && (
                    <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Category">
                        {[{ id: '', name: 'All topics' }, ...categories].map((c) => (
                            <button key={c.id} type="button" onClick={() => setFilters({ ...filters, category_id: String(c.id) })} aria-pressed={filters.category_id === String(c.id)}
                                className={`rounded-full px-3.5 py-1.5 text-sm font-bold whitespace-nowrap ring-1 transition ${filters.category_id === String(c.id) ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule hover:ring-ink/40'}`}>
                                {c.name}{c.courses_count !== undefined && c.id !== '' ? <span className="ml-1.5 opacity-60">{c.courses_count}</span> : null}
                            </button>
                        ))}
                        {isAdmin && (
                            <button type="button" onClick={() => setManagingCats(true)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap text-ink hover:bg-ink-50">
                                <Icon name={categories.length ? 'edit' : 'plus'} size={14} />{categories.length ? 'Edit topics' : 'Add topics'}
                            </button>
                        )}
                    </div>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                    <FilterSelect label="Level" value={filters.level} onChange={(v) => setFilters({ ...filters, level: v })}
                        options={[['', 'Any level'], ...Object.entries(LEVELS)]} />
                    <FilterSelect label="Price" value={filters.price} onChange={(v) => setFilters({ ...filters, price: v })}
                        options={[['', 'Free and paid'], ['free', 'Free'], ['paid', 'Paid']]} />
                    <FilterSelect label="Sort" value={filters.sort} onChange={(v) => setFilters({ ...filters, sort: v })}
                        options={[['', 'Newest'], ['popular', 'Most popular'], ['rating', 'Highest rated'], ['title', 'A to Z']]} />
                </div>
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
                    query || status || filtered ? (
                        <EmptyState icon="search" title="No matching courses"
                            action={filtered ? <Button variant="secondary" onClick={() => setFilters({ category_id: '', level: '', price: '', sort: '' })}>Clear filters</Button> : null}>
                            Try another word or fewer filters.
                        </EmptyState>
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
                            <li key={c.id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-rule bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(18,40,95,.35)]">
                                <Link to={`/${tenant}/courses/${c.id}`} tabIndex={-1} aria-hidden>
                                    <CourseCover course={c} className="h-36 w-full" />
                                </Link>
                                <div className="flex flex-1 flex-col p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            {canTeach && <Badge tone={c.status} dot>{titleCase(c.status)}</Badge>}
                                            <h3 className="mt-2 text-lg leading-snug font-bold">
                                                <Link to={`/${tenant}/courses/${c.id}`} className="after:absolute after:inset-0 hover:underline">{c.title}</Link>
                                            </h3>
                                        </div>
                                        {canManage(c) && (
                                            <div className="relative z-10"><Menu label={`Actions for ${c.title}`} items={[
                                                { label: 'Open course builder', icon: 'layers', onClick: () => navigate(`/${tenant}/courses/${c.id}`) },
                                                { label: 'Quick edit', icon: 'edit', onClick: () => setEditing(c) },
                                                { label: 'Duplicate', icon: 'copy', onClick: () => duplicate(c) },
                                                c.status !== 'published' && { label: 'Publish', icon: 'eye', onClick: () => setCourseStatus(c, 'published') },
                                                c.status === 'published' && { label: 'Unpublish', icon: 'eyeOff', onClick: () => setCourseStatus(c, 'draft') },
                                                c.status !== 'archived' && { label: 'Archive', icon: 'lock', onClick: () => setCourseStatus(c, 'archived') },
                                                { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleting(c) },
                                            ]} /></div>
                                        )}
                                    </div>
                                    {c.short_description && <p className="mt-1.5 line-clamp-2 text-pencil">{c.short_description}</p>}
                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-pencil">
                                        {c.rating ? <span className="flex items-center gap-1.5"><Stars value={c.rating} size={14} /><b className="text-graphite">{c.rating.toFixed(1)}</b> ({c.reviews_count})</span> : null}
                                        {c.category && <span>{c.category.name}</span>}
                                        {c.level && <span>{LEVELS[c.level]}</span>}
                                    </div>
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

            <CategoryManager open={managingCats} onClose={() => setManagingCats(false)} tenant={tenant} categories={categories}
                onChanged={() => { loadCategories(); load(); }} />

            <CourseEditor
                open={editing !== null}
                course={editing}
                categories={categories}
                tenant={tenant}
                onClose={closeEditor}
                onSaved={(msg, created) => {
                    closeEditor();
                    toast(msg);
                    if (created) navigate(`/${tenant}/courses/${created.id}`); else load();
                }}
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

function CourseEditor({ open, course, categories = [], tenant, onClose, onSaved }) {
    const isNew = !course?.id;
    const blank = { title: '', short_description: '', description: '', level: 'beginner', is_free: true, price: '', sale_price: '', category_id: '' };
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
            category_id: course.category?.id ? String(course.category.id) : '',
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
            category_id: form.category_id ? Number(form.category_id) : null,
            ...(nextStatus ? { status: nextStatus } : {}),
        };
        try {
            const saved = await api(isNew ? 'courses' : `courses/${course.id}`, { method: isNew ? 'POST' : 'PATCH', tenant, body });
            onSaved(isNew ? 'Course created. Now add your lessons.' : 'Changes saved', isNew ? saved : null);
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
            description={isNew ? 'Start with the basics. Lessons and quizzes come next, and you publish when it’s ready.' : null}
            footer={isNew ? (
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button busy={busy === 'draft'} iconRight="arrowRight" onClick={() => save('draft')}>Create and add lessons</Button>
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
                {categories.length > 0 && (
                    <Field label="Topic" name="category_id" as="select" error={error} value={form.category_id} onChange={set('category_id')}>
                        <option value="">No topic</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Field>
                )}
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
                            <Field label="Price" name="price" type="number" min="0" inputMode="numeric" error={error} value={form.price} onChange={set('price')} />
                            <Field label="Sale price (optional)" name="sale_price" type="number" min="0" inputMode="numeric" error={error} value={form.sale_price} onChange={set('sale_price')} />
                        </div>
                    )}
                </div>
                <button type="submit" className="hidden" />
            </form>
        </SlideOver>
    );
}

function FilterSelect({ label, value, onChange, options }) {
    return (
        <label className="relative">
            <span className="sr-only">{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className={`h-9 appearance-none rounded-lg border bg-white pr-8 pl-3 text-sm font-bold focus:border-ink focus:outline-none ${value ? 'border-ink text-ink-deep' : 'border-rule text-graphite'}`}>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Icon name="chevronDown" size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-pencil" />
        </label>
    );
}

function CategoryManager({ open, onClose, tenant, categories, onChanged }) {
    const toast = useToast();
    const [name, setName] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [renaming, setRenaming] = useState(null);

    useEffect(() => { if (open) { setName(''); setError(null); setRenaming(null); } }, [open]);

    async function add(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('categories', { method: 'POST', tenant, body: { name } });
            setName('');
            onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    async function rename(c) {
        try {
            await api(`categories/${c.id}`, { method: 'PATCH', tenant, body: { name: renaming.name } });
            setRenaming(null);
            onChanged();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function remove(c) {
        try {
            await api(`categories/${c.id}`, { method: 'DELETE', tenant });
            toast('Topic removed');
            onChanged();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="Course topics" description="Group courses so students can filter the catalog."
            footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
            <form onSubmit={add} className="flex items-start gap-2">
                <div className="flex-1"><Field label="New topic" name="name" error={error && (error.errors?.name?.[0] ?? error.message)} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" /></div>
                <Button type="submit" busy={busy} className="mt-7" disabled={!name.trim()}>Add</Button>
            </form>
            <ul className="mt-5 divide-y divide-rule rounded-xl border border-rule">
                {categories.length === 0 && <li className="px-4 py-6 text-center text-pencil">No topics yet.</li>}
                {categories.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                        {renaming?.id === c.id ? (
                            <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); rename(c); }}>
                                <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} aria-label="Topic name"
                                    className="h-9 flex-1 rounded-lg border border-rule px-3 focus:border-ink focus:outline-none" />
                                <Button size="sm" type="submit">Save</Button>
                            </form>
                        ) : (
                            <>
                                <span className="flex-1 font-bold text-graphite">{c.name}</span>
                                <span className="text-sm text-pencil">{c.courses_count ?? 0} courses</span>
                                <IconButton icon="edit" label={`Rename ${c.name}`} onClick={() => setRenaming({ id: c.id, name: c.name })} />
                                <IconButton icon="trash" label={`Remove ${c.name}`} onClick={() => remove(c)} />
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </Modal>
    );
}
