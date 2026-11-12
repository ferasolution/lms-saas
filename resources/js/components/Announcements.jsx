import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import Icon from './Icon';
import { Badge, Button, Field, IconButton, Modal, Skeleton, Toggle, useToast } from './ui';

const AUDIENCE = { everyone: 'Everyone', students: 'Students', teachers: 'Teachers', admins: 'Admins' };

/** List of announcements with an optional "Post" button. Pass courseId for one course. */
export default function Announcements({ tenant, courseId, canPost, title = 'Announcements', limit, compact = false }) {
    const toast = useToast();
    const [items, setItems] = useState(null);
    const [posting, setPosting] = useState(false);

    const load = useCallback(() => api(`announcements${courseId ? `?course_id=${courseId}` : ''}`, { tenant })
        .then((r) => setItems(r.data)).catch(() => setItems([])), [tenant, courseId]);
    useEffect(() => { load(); }, [load]);

    async function remove(a) {
        await api(`announcements/${a.id}`, { method: 'DELETE', tenant }).catch((e) => toast(e.message, 'error'));
        toast('Announcement removed');
        load();
    }

    const shown = limit ? (items ?? []).slice(0, limit) : items ?? [];

    return (
        <section className="rounded-2xl border border-rule bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
                <h2 className="text-lg font-bold">{title}</h2>
                {canPost && <Button size="sm" icon="plus" onClick={() => setPosting(true)}>Post</Button>}
            </div>
            {items === null ? <div className="p-5"><Skeleton className="h-20" /></div> : shown.length === 0 ? (
                <p className="px-5 py-8 text-center text-pencil">{canPost ? 'Nothing posted yet. Share news, reminders or schedule changes here.' : 'No announcements yet.'}</p>
            ) : (
                <ul className="divide-y divide-rule">
                    {shown.map((a) => (
                        <li key={a.id} className={`px-5 py-4 ${a.platform ? 'bg-ink-50/40' : ''}`}>
                            <div className="flex items-start gap-3">
                                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${a.platform ? 'bg-ink text-white' : a.pinned ? 'bg-margin/10 text-margin' : 'bg-ink-50 text-ink'}`}>
                                    <Icon name="flag" size={16} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-bold text-ink-deep">{a.title}</p>
                                        {a.pinned && <Badge tone="danger">Pinned</Badge>}
                                        {a.platform && <Badge tone="draft">From Fera EduSphere</Badge>}
                                        {a.course && !courseId && <Badge>{a.course.title}</Badge>}
                                    </div>
                                    <p className={`mt-1 whitespace-pre-line text-graphite ${compact ? 'line-clamp-3' : ''}`}>{a.body}</p>
                                    <p className="mt-1.5 text-xs text-pencil">
                                        {a.author?.name} · {relative(a.created_at)}{!a.course && !a.platform && a.audience !== 'everyone' ? ` · to ${AUDIENCE[a.audience].toLowerCase()}` : ''}
                                    </p>
                                </div>
                                {a.can_delete && <IconButton icon="trash" label="Remove announcement" onClick={() => remove(a)} />}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <PostDialog open={posting} onClose={() => setPosting(false)} tenant={tenant} courseId={courseId}
                onPosted={() => { setPosting(false); toast('Posted and sent as a notification'); load(); }} />
        </section>
    );
}

function PostDialog({ open, onClose, tenant, courseId, onPosted }) {
    const [form, setForm] = useState({ title: '', body: '', audience: 'everyone', pinned: false });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (open) { setForm({ title: '', body: '', audience: 'everyone', pinned: false }); setError(null); } }, [open]);

    async function post() {
        setBusy(true);
        setError(null);
        try {
            await api('announcements', { method: 'POST', tenant, body: { ...form, course_id: courseId ?? null } });
            onPosted();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title={courseId ? 'Announce to this course' : 'Post an announcement'}
            description={courseId ? 'Everyone enrolled gets a notification.' : 'Shows on the dashboard and sends a notification.'}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={post}>Post announcement</Button></>}>
            <div className="space-y-4">
                <Field label="Title" name="title" error={error} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Midterm quiz opens Friday" />
                <Field label="Message" name="body" as="textarea" rows={5} error={error} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                {!courseId && (
                    <Field label="Who should see it?">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {Object.entries(AUDIENCE).map(([v, l]) => (
                                <button key={v} type="button" onClick={() => setForm({ ...form, audience: v })} aria-pressed={form.audience === v}
                                    className={`rounded-lg border py-2 text-sm font-bold ${form.audience === v ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule text-pencil'}`}>{l}</button>
                            ))}
                        </div>
                    </Field>
                )}
                <Toggle label="Pin to the top" checked={form.pinned} onChange={(v) => setForm({ ...form, pinned: v })} />
            </div>
        </Modal>
    );
}
