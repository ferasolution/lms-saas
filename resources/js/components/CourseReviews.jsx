import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import Stars, { StarInput } from './Stars';
import { Avatar, Button, Field, IconButton, Skeleton, useToast } from './ui';

/** Rating summary, the viewer's own review form (if enrolled) and the list of reviews. */
export default function CourseReviews({ tenant, courseId, onChange }) {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [form, setForm] = useState({ rating: 0, body: '' });
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => api(`courses/${courseId}/reviews`, { tenant }).then((d) => {
        setData(d);
        setForm({ rating: d.mine?.rating ?? 0, body: d.mine?.body ?? '' });
    }).catch(() => setData(false)), [tenant, courseId]);
    useEffect(() => { load(); }, [load]);

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        try {
            await api(`courses/${courseId}/reviews`, { method: 'POST', tenant, body: { rating: form.rating, body: form.body || null } });
            toast(data.mine ? 'Review updated' : 'Thanks for your review');
            setEditing(false);
            await load();
            onChange?.();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    async function remove(r) {
        await api(`reviews/${r.id}`, { method: 'DELETE', tenant }).then(() => toast('Review removed')).catch((err) => toast(err.message, 'error'));
        load();
        onChange?.();
    }

    if (data === false) return null;
    if (!data) return <Skeleton className="h-40 rounded-2xl" />;

    const showForm = data.can_review && (!data.mine || editing);

    return (
        <section aria-labelledby="reviews">
            <h2 id="reviews" className="text-xl font-bold">Reviews</h2>
            <div className="mt-4 grid gap-6 rounded-2xl border border-rule bg-white p-5 sm:grid-cols-[12rem_1fr] sm:p-6">
                <div>
                    <p className="font-display text-5xl font-extrabold text-ink-deep tabular-nums">{data.average ? data.average.toFixed(1) : '—'}</p>
                    <Stars value={data.average ?? 0} size={18} className="mt-1" />
                    <p className="mt-1 text-sm text-pencil">{data.count} {data.count === 1 ? 'review' : 'reviews'}</p>
                </div>
                <ul className="space-y-1.5 self-center">
                    {Object.entries(data.distribution).sort((a, b) => b[0] - a[0]).map(([stars, n]) => (
                        <li key={stars} className="flex items-center gap-3 text-sm">
                            <span className="w-12 text-pencil">{stars} star</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-50">
                                <span className="block h-full rounded-full bg-[#e8a317]" style={{ width: `${data.count ? (n / data.count) * 100 : 0}%` }} />
                            </span>
                            <span className="w-6 text-right text-pencil tabular-nums">{n}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {showForm && (
                <form onSubmit={save} className="mt-4 space-y-4 rounded-2xl border border-ink/20 bg-ink-50/40 p-5">
                    <p className="font-bold text-ink-deep">{data.mine ? 'Edit your review' : 'How was this course?'}</p>
                    <StarInput value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
                    <Field label="Tell others what you thought (optional)" as="textarea" rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} />
                    <div className="flex gap-2">
                        <Button type="submit" busy={busy} disabled={!form.rating}>{data.mine ? 'Save review' : 'Post review'}</Button>
                        {editing && <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
                    </div>
                </form>
            )}

            {data.data.length > 0 && (
                <ul className="mt-4 divide-y divide-rule rounded-2xl border border-rule bg-white">
                    {data.data.map((r) => (
                        <li key={r.id} className="flex gap-4 px-5 py-4">
                            <Avatar name={r.user?.name} size={36} />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <p className="font-bold text-graphite">{r.user?.name}{data.mine?.id === r.id ? ' (you)' : ''}</p>
                                    <Stars value={r.rating} size={14} />
                                    <span className="text-sm text-pencil">{relative(r.created_at)}</span>
                                </div>
                                {r.body && <p className="mt-1 whitespace-pre-line text-graphite">{r.body}</p>}
                                {data.mine?.id === r.id && !editing && <button type="button" onClick={() => setEditing(true)} className="mt-1 text-sm font-bold text-ink hover:underline">Edit</button>}
                            </div>
                            {r.can_delete && <IconButton icon="trash" label="Delete review" onClick={() => remove(r)} />}
                        </li>
                    ))}
                </ul>
            )}
            {data.data.length === 0 && !showForm && (
                <p className="mt-4 text-pencil">No reviews yet.{!data.can_review ? ' Students can review once they enrol.' : ''}</p>
            )}
        </section>
    );
}
