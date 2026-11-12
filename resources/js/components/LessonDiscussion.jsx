import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import { Avatar, Button, IconButton, Skeleton, useToast } from './ui';

/** Questions and answers under a lesson. One level of replies. */
export default function LessonDiscussion({ lessonId, tenant }) {
    const toast = useToast();
    const [items, setItems] = useState(null);
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [replyTo, setReplyTo] = useState(null);

    const load = useCallback(() => api(`lessons/${lessonId}/comments`, { tenant }).then((r) => setItems(r.data)).catch(() => setItems(false)), [lessonId, tenant]);
    useEffect(() => { setItems(null); setReplyTo(null); load(); }, [load]);

    async function post(text, parentId) {
        setBusy(true);
        try {
            await api(`lessons/${lessonId}/comments`, { method: 'POST', tenant, body: { body: text, parent_id: parentId ?? null } });
            if (!parentId) setBody('');
            setReplyTo(null);
            await load();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    async function remove(c) {
        await api(`comments/${c.id}`, { method: 'DELETE', tenant }).catch((err) => toast(err.message, 'error'));
        load();
    }

    if (items === false) return null;

    return (
        <section className="mt-12" aria-labelledby="qa">
            <h2 id="qa" className="text-xl font-bold">Questions and discussion</h2>
            <p className="mt-1 text-pencil">Stuck on something? Ask here — your teacher and classmates can answer.</p>

            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (body.trim()) post(body.trim()); }}>
                <label htmlFor="qa-new" className="sr-only">Ask a question</label>
                <textarea id="qa-new" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} placeholder="Ask a question about this lesson…"
                    className="block w-full rounded-xl border border-rule bg-white px-4 py-3 placeholder:text-pencil/70 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                <div className="mt-2 flex justify-end">
                    <Button type="submit" size="sm" icon="message" busy={busy && !replyTo} disabled={!body.trim()}>Post question</Button>
                </div>
            </form>

            {items === null ? <Skeleton className="mt-4 h-24 rounded-xl" /> : items.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-rule px-4 py-6 text-center text-pencil">No questions yet.</p>
            ) : (
                <ul className="mt-4 space-y-3">
                    {items.map((c) => (
                        <li key={c.id} className="rounded-2xl border border-rule bg-white p-4 sm:p-5">
                            <Comment c={c} onDelete={remove} />
                            {c.replies.length > 0 && (
                                <ul className="mt-3 space-y-3 border-l-2 border-ink-50 pl-4 sm:ml-12">
                                    {c.replies.map((r) => <li key={r.id}><Comment c={r} onDelete={remove} small /></li>)}
                                </ul>
                            )}
                            {replyTo === c.id ? (
                                <ReplyBox busy={busy} onCancel={() => setReplyTo(null)} onSend={(t) => post(t, c.id)} />
                            ) : (
                                <button type="button" onClick={() => setReplyTo(c.id)} className="mt-2 text-sm font-bold text-ink hover:underline sm:ml-12">Reply</button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function Comment({ c, onDelete, small }) {
    return (
        <div className="flex gap-3">
            <Avatar name={c.user?.name} size={small ? 30 : 36} />
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <strong className="text-graphite">{c.user?.name}</strong>
                    {c.is_teacher && <span className="rounded-full bg-ink px-2 py-px text-xs font-bold text-white">Teacher</span>}
                    <span className="text-pencil">{relative(c.created_at)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-line text-graphite">{c.body}</p>
            </div>
            {c.can_delete && <IconButton icon="trash" label="Delete" onClick={() => onDelete(c)} />}
        </div>
    );
}

function ReplyBox({ busy, onSend, onCancel }) {
    const [text, setText] = useState('');
    return (
        <form className="mt-3 sm:ml-12" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSend(text.trim()); }}>
            <textarea autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your reply" maxLength={3000}
                className="block w-full rounded-lg border border-rule px-3 py-2 focus:border-ink focus:outline-none" />
            <div className="mt-2 flex gap-2">
                <Button type="submit" size="sm" busy={busy} disabled={!text.trim()}>Reply</Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
        </form>
    );
}
