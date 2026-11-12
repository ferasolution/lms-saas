import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageHeader, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { dateTime, relative } from '../../lib/format';

const CATS = { general: 'General', academic: 'Academic', fees: 'Fees', technical: 'Portal / technical', transport: 'Transport', facilities: 'Facilities', other: 'Other' };
const STATUS = { open: ['Open', 'warning'], in_progress: ['In progress', 'draft'], resolved: ['Resolved', 'success'], closed: ['Closed', 'neutral'] };
const PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

export default function Helpdesk() {
    const { tenant } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const [status, setStatus] = useState('active');
    const [d, setD] = useState(null);
    const [creating, setCreating] = useState(false);
    const open = Number(params.get('t')) || null;
    const load = useCallback(() => api(`school/helpdesk?status=${status}`, { tenant }).then(setD), [tenant, status]);
    useEffect(() => { load(); }, [load]);

    return (
        <div>
            <PageHeader title="Help desk" description={d?.can_manage ? 'Requests from families and staff. Assign, reply and resolve.' : 'Ask the school for help. You’ll get a notification when someone replies.'}
                actions={<Button icon="plus" onClick={() => setCreating(true)}>New request</Button>} />
            <Tabs className="mt-6" value={status} onChange={setStatus} tabs={[{ value: 'active', label: 'Active' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }]} />
            <div className="mt-4">
                {!d ? <Skeleton className="h-48 rounded-2xl" /> : d.data.length === 0 ? <EmptyState icon="inbox" title="No requests here">{status === 'active' ? 'All caught up.' : 'Nothing yet.'}</EmptyState> : (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {d.data.map((t) => (
                            <li key={t.id}>
                                <button type="button" onClick={() => setParams({ t: String(t.id) })} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-paper/60">
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-bold text-graphite">{t.subject}</span>
                                        <span className="text-sm text-pencil">#{t.id} · {CATS[t.category]} · {t.user?.name} · {relative(t.updated_at)}{t.assignee ? ` · with ${t.assignee.name}` : ''}</span>
                                    </span>
                                    {['high', 'urgent'].includes(t.priority) && <Badge tone="danger">{PRIORITY[t.priority]}</Badge>}
                                    <Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {open && <TicketPanel tenant={tenant} id={open} manage={d?.can_manage} onClose={() => setParams({})} onChanged={load} />}
            {creating && <NewTicket tenant={tenant} onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); load(); setParams({ t: String(id) }); }} />}
        </div>
    );
}

function TicketPanel({ tenant, id, manage, onClose, onChanged }) {
    const toast = useToast();
    const [t, setT] = useState(null);
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => api(`school/helpdesk/${id}`, { tenant }).then(setT).catch(() => onClose()), [tenant, id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [load]);
    async function reply() {
        setBusy(true);
        try { await api(`school/helpdesk/${id}/replies`, { method: 'POST', tenant, body: { body } }); setBody(''); load(); onChanged(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
    }
    async function patch(b, msg) {
        try { await api(`school/helpdesk/${id}`, { method: 'PATCH', tenant, body: b }); toast(msg); load(); onChanged(); } catch (e) { toast(e.message, 'error'); }
    }
    return (
        <SlideOver open onClose={onClose} title={t?.subject ?? 'Request'} description={t ? `#${t.id} · ${CATS[t.category]} · opened ${dateTime(t.created_at)}` : ''}
            footer={t && t.status !== 'closed' && <div className="flex w-full gap-2">
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Write a reply…" aria-label="Reply" className="flex-1 rounded-lg border border-rule px-3 py-2" />
                <Button busy={busy} disabled={!body.trim()} onClick={reply}>Reply</Button>
            </div>}>
            {!t ? <Skeleton className="h-64" /> : (
                <div className="space-y-5">
                    {manage && (
                        <div className="grid grid-cols-1 gap-3 rounded-xl bg-white p-4 ring-1 ring-rule sm:grid-cols-3">
                            <Field label="Status" as="select" value={t.status} onChange={(e) => patch({ status: e.target.value }, 'Status updated')}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Field>
                            <Field label="Priority" as="select" value={t.priority} onChange={(e) => patch({ priority: e.target.value }, 'Priority updated')}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Field>
                            <Field label="Assigned to" as="select" value={t.assignee?.id ?? ''} onChange={(e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null }, 'Assigned')}><option value="">Nobody</option>{t.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Field>
                        </div>
                    )}
                    {!manage && <Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>}
                    <ol className="space-y-3">
                        {t.replies.map((r) => (
                            <li key={r.id} className="flex gap-3">
                                <Avatar name={r.user?.name} size={32} />
                                <div className="min-w-0 flex-1 rounded-xl bg-white p-3 ring-1 ring-rule">
                                    <p className="text-sm"><b className="text-graphite">{r.user?.name}</b> <span className="text-pencil">· {relative(r.at)}</span></p>
                                    <p className="mt-1 whitespace-pre-line text-graphite">{r.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                    {!manage && t.status === 'resolved' && <p className="text-sm text-pencil">Marked as resolved. Reply if you still need help and it will reopen.</p>}
                </div>
            )}
        </SlideOver>
    );
}

function NewTicket({ tenant, onClose, onDone }) {
    const [f, setF] = useState({ subject: '', category: 'general', priority: 'normal', body: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try { const r = await api('school/helpdesk', { method: 'POST', tenant, body: f }); onDone(r.id); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title="New request" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Send request</Button></>}>
            <div className="space-y-4">
                <Field label="What do you need help with?" name="subject" error={error} value={f.subject} onChange={set('subject')} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Topic" as="select" value={f.category} onChange={set('category')}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Field>
                    <Field label="How urgent?" as="select" value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Field>
                </div>
                <Field label="Details" name="body" as="textarea" rows={5} error={error} value={f.body} onChange={set('body')} />
            </div>
        </Modal>
    );
}
