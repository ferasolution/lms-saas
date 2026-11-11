import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, fieldError } from '../lib/api';

const STATUS_STYLE = {
    published: 'text-ink',
    draft: 'text-pencil',
    archived: 'text-pencil line-through',
};

export default function Courses() {
    const { tenant, canTeach } = useOutletContext();
    const [courses, setCourses] = useState(null);
    const [adding, setAdding] = useState(false);

    const load = useCallback(() => {
        api('courses?per_page=50', { tenant }).then(setCourses);
    }, [tenant]);

    useEffect(load, [load]);

    async function setStatus(course, status) {
        await api(`courses/${course.id}`, { method: 'PATCH', tenant, body: { status } });
        load();
    }

    return (
        <div className="max-w-4xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-3xl font-bold">Courses</h1>
                {canTeach && !adding && <button className="btn-ink" onClick={() => setAdding(true)}>Add a course</button>}
            </div>

            {adding && <NewCourse tenant={tenant} onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}

            {courses === null && <p className="mt-8 text-pencil" role="status">Loading courses…</p>}

            {courses?.data.length === 0 && !adding && (
                <p className="mt-8 text-pencil">
                    {canTeach ? 'No courses yet. Add one to get started.' : 'No published courses yet.'}
                </p>
            )}

            {courses?.data.length > 0 && (
                <table className="mt-8 w-full text-left">
                    <thead>
                        <tr className="border-b-2 border-ink/20 text-sm text-pencil">
                            <th className="py-2 font-bold">Title</th>
                            <th className="hidden py-2 font-bold sm:table-cell">Instructor</th>
                            <th className="py-2 font-bold">Students</th>
                            <th className="py-2 font-bold">Status</th>
                            {canTeach && <th className="py-2"><span className="sr-only">Actions</span></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {courses.data.map((c) => (
                            <tr key={c.id} className="border-b border-rule">
                                <td className="py-3 pr-4">
                                    <span className="font-bold text-graphite">{c.title}</span>
                                    {c.short_description && <span className="block text-sm text-pencil">{c.short_description}</span>}
                                </td>
                                <td className="hidden py-3 pr-4 text-pencil sm:table-cell">{c.instructor?.name ?? '—'}</td>
                                <td className="py-3 pr-4 tabular-nums">{c.enrollments_count ?? 0}</td>
                                <td className={`py-3 pr-4 capitalize ${STATUS_STYLE[c.status]}`}>{c.status}</td>
                                {canTeach && (
                                    <td className="py-3 text-right">
                                        {c.status === 'draft' && (
                                            <button className="text-ink underline" onClick={() => setStatus(c, 'published')}>Publish</button>
                                        )}
                                        {c.status === 'published' && (
                                            <button className="text-pencil underline" onClick={() => setStatus(c, 'draft')}>Unpublish</button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function NewCourse({ tenant, onDone, onCancel }) {
    const [form, setForm] = useState({ title: '', short_description: '', is_free: true, price: 0 });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('courses', { method: 'POST', tenant, body: { ...form, price: form.is_free ? 0 : Number(form.price) } });
            onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="mt-6 max-w-xl space-y-4 rounded-lg border border-rule bg-white p-6" noValidate>
            <h2 className="text-xl font-bold">New course</h2>
            <div>
                <label className="label" htmlFor="title">Title</label>
                <input id="title" className="field" value={form.title} autoFocus
                    onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                {fieldError(error, 'title') && <p className="error">{fieldError(error, 'title')}</p>}
            </div>
            <div>
                <label className="label" htmlFor="short_description">Short description</label>
                <input id="short_description" className="field" value={form.short_description}
                    onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 py-2.5">
                    <input type="checkbox" className="accent-ink" checked={form.is_free}
                        onChange={(e) => setForm({ ...form, is_free: e.target.checked })} />
                    Free course
                </label>
                {!form.is_free && (
                    <div>
                        <label className="label" htmlFor="price">Price (PKR)</label>
                        <input id="price" type="number" min="0" className="field w-40" value={form.price}
                            onChange={(e) => setForm({ ...form, price: e.target.value })} />
                        {fieldError(error, 'price') && <p className="error">{fieldError(error, 'price')}</p>}
                    </div>
                )}
            </div>
            <p className="text-sm text-pencil">The course is saved as a draft. Publish it when lessons are ready.</p>
            <div className="flex gap-3">
                <button className="btn-ink" disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>
                <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}
