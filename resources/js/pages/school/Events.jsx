import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, Modal, PageHeader, SlideOver, Skeleton, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { shortDate, today, useStructure } from '../../lib/school';
import { money } from '../../lib/format';

const KINDS = { event: ['Event', 'sparkle'], trip: ['Trip', 'globe'], sports: ['Sports', 'award'], competition: ['Competition', 'star'], holiday: ['Holiday', 'calendar'], meeting: ['Meeting', 'users'], exam: ['Exam', 'quiz'], other: ['Other', 'flag'] };

export default function Events() {
    const { tenant, isStaff, isOffice, isParent, me } = useOutletContext();
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [past, setPast] = useState(false);
    const [editing, setEditing] = useState(null);
    const [responses, setResponses] = useState(null);
    const load = useCallback(() => api(`school/events${past ? '?past=1' : ''}`, { tenant }).then((r) => setRows(r.data)), [tenant, past]);
    useEffect(() => { load(); }, [load]);

    async function respond(e, child, response) {
        try { await api(`school/events/${e.id}/respond`, { method: 'POST', tenant, body: { student_id: child.id, response } }); toast(response === 'yes' ? `${child.name.split(' ')[0]} is going` : 'Thanks for letting us know'); load(); } catch (err) { toast(err.message, 'error'); }
    }

    // Group by month.
    const groups = [];
    for (const e of rows ?? []) {
        const key = e.date.slice(0, 7);
        const g = groups[groups.length - 1];
        if (g && g.key === key) g.items.push(e); else groups.push({ key, items: [e] });
    }

    return (
        <div>
            <PageHeader title="Events & calendar" description="Trips, sports days, competitions, holidays and school events."
                actions={<>
                    <Button variant="ghost" onClick={() => setPast(!past)}>{past ? 'Upcoming only' : 'Show past'}</Button>
                    {isStaff && <Button icon="plus" onClick={() => setEditing({})}>New event</Button>}
                </>} />
            <div className="mt-6 space-y-8">
                {rows === null ? <Skeleton className="h-48 rounded-2xl" /> : rows.length === 0 ? <EmptyState icon="calendar" title="Nothing on the calendar">Upcoming events show up here.</EmptyState> : groups.map((g) => (
                    <section key={g.key}>
                        <h2 className="mb-3 text-sm font-bold text-pencil">{new Date(`${g.key}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
                        <ul className="space-y-3">
                            {g.items.map((e) => {
                                const d = new Date(`${e.date}T12:00:00`);
                                const canEdit = isOffice;
                                return (
                                    <li key={e.id} className="flex gap-4 rounded-2xl border border-rule bg-white p-4 sm:p-5">
                                        <div className="w-14 shrink-0 rounded-xl bg-ink-50 py-2 text-center">
                                            <p className="text-xs font-bold text-ink uppercase">{d.toLocaleDateString(undefined, { month: 'short' })}</p>
                                            <p className="font-display text-2xl font-extrabold text-ink-deep">{d.getDate()}</p>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="inline-flex items-center gap-1 text-sm font-bold text-pencil"><Icon name={KINDS[e.kind][1]} size={14} />{KINDS[e.kind][0]}</span>
                                                {e.needs_consent && <Badge tone="warning">Permission needed</Badge>}
                                                {e.fee ? <Badge>{money(e.fee, me.tenant.settings?.currency ?? 'USD')}</Badge> : null}
                                            </div>
                                            <p className="mt-1 text-lg font-bold text-ink-deep">{e.title}</p>
                                            <p className="text-sm text-graphite">
                                                {shortDate(e.date, { weekday: 'long' })}{e.end_date && e.end_date !== e.date ? ` – ${shortDate(e.end_date)}` : ''}{e.starts_at ? ` · ${e.starts_at}` : ''}{e.location ? ` · ${e.location}` : ''}
                                                {' · '}{e.sections ? e.sections.join(', ') : 'Whole school'}
                                            </p>
                                            {e.description && <p className="mt-2 whitespace-pre-line text-graphite">{e.description}</p>}
                                            {isParent && (e.needs_consent || e.kind !== 'holiday') && e.children?.length > 0 && (
                                                <div className="mt-3 space-y-2 border-t border-rule pt-3">
                                                    {e.children.map((c) => (
                                                        <div key={c.id} className="flex flex-wrap items-center gap-2">
                                                            <span className="font-bold text-graphite">{c.name}</span>
                                                            {c.response && <Badge tone={c.response === 'yes' ? 'success' : 'neutral'}>{c.response === 'yes' ? (e.needs_consent ? 'Permission given' : 'Going') : (e.needs_consent ? 'Not permitted' : 'Not going')}</Badge>}
                                                            <span className="ml-auto flex gap-2">
                                                                <Button size="sm" variant={c.response === 'yes' ? 'primary' : 'secondary'} onClick={() => respond(e, c, 'yes')}>{e.needs_consent ? 'I give permission' : 'Going'}</Button>
                                                                <Button size="sm" variant="ghost" onClick={() => respond(e, c, 'no')}>{e.needs_consent ? 'No' : 'Not going'}</Button>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {isStaff && e.responses && (e.needs_consent || e.responses.yes + e.responses.no > 0) && (
                                                <button type="button" onClick={() => setResponses(e)} className="mt-2 text-sm font-bold text-ink hover:underline">{e.responses.yes} yes · {e.responses.no} no — see replies</button>
                                            )}
                                        </div>
                                        {canEdit && <div className="flex flex-col gap-1"><IconButton icon="edit" label="Edit" onClick={() => setEditing(e)} /><IconButton icon="trash" label="Delete" onClick={async () => { await api(`school/events/${e.id}`, { method: 'DELETE', tenant }); load(); }} /></div>}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
            {editing && <EventForm tenant={tenant} event={editing} onClose={() => setEditing(null)} onDone={(n) => { setEditing(null); toast(n ? 'Event posted · families notified' : 'Saved'); load(); }} />}
            {responses && <Responses tenant={tenant} event={responses} onClose={() => setResponses(null)} />}
        </div>
    );
}

function EventForm({ tenant, event, onClose, onDone }) {
    const [s] = useStructure(tenant);
    const isNew = !event.id;
    const [f, setF] = useState({ title: event.title ?? '', kind: event.kind ?? 'event', date: event.date ?? today(), end_date: event.end_date ?? '', starts_at: event.starts_at ?? '', location: event.location ?? '', description: event.description ?? '', needs_consent: event.needs_consent ?? false, fee: event.fee ?? '' });
    const [sections, setSections] = useState(new Set(event.section_ids ?? []));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const flip = (id) => { const n = new Set(sections); if (n.has(id)) n.delete(id); else n.add(id); setSections(n); };
    async function save() {
        setBusy(true);
        setError(null);
        const body = { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), fee: f.fee ? Number(f.fee) : null, section_ids: sections.size ? [...sections] : null };
        try { await api(isNew ? 'school/events' : `school/events/${event.id}`, { method: isNew ? 'POST' : 'PATCH', tenant, body }); onDone(isNew); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <SlideOver open onClose={onClose} title={isNew ? 'New event' : 'Edit event'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>{isNew ? 'Post event' : 'Save'}</Button></>}>
            <div className="space-y-4">
                <Field label="Title" name="title" error={error} value={f.title} onChange={set('title')} placeholder="e.g. Science fair, Zoo trip, Sports day" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Type" as="select" value={f.kind} onChange={set('kind')}>{Object.entries(KINDS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Field>
                    <Field label="Location" name="location" error={error} value={f.location} onChange={set('location')} />
                    <Field label="Date" name="date" type="date" error={error} value={f.date} onChange={set('date')} />
                    <Field label="Ends (optional)" name="end_date" type="date" error={error} value={f.end_date} onChange={set('end_date')} />
                    <Field label="Time (optional)" name="starts_at" type="time" error={error} value={f.starts_at} onChange={set('starts_at')} />
                    <Field label="Cost (optional)" name="fee" type="number" min="0" error={error} value={f.fee} onChange={set('fee')} />
                </div>
                <Field label="Details" name="description" as="textarea" rows={4} error={error} value={f.description} onChange={set('description')} />
                <Field label="Who it’s for" hint={sections.size ? null : 'Whole school'}>
                    <div className="flex flex-wrap gap-1.5">{s?.sections.map((x) => <button key={x.id} type="button" aria-pressed={sections.has(x.id)} onClick={() => flip(x.id)} className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${sections.has(x.id) ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{x.label}</button>)}</div>
                </Field>
                <Checkbox label="Parents must give permission" hint="Parents answer yes or no for each child, and you see the list." checked={f.needs_consent} onChange={(v) => setF({ ...f, needs_consent: v })} />
            </div>
        </SlideOver>
    );
}

function Responses({ tenant, event, onClose }) {
    const [rows, setRows] = useState(null);
    useEffect(() => { api(`school/events/${event.id}/responses`, { tenant }).then((r) => setRows(r.data)); }, [tenant, event.id]);
    return (
        <Modal open onClose={onClose} title={event.title} description="Replies from parents" footer={<Button onClick={onClose}>Done</Button>}>
            {!rows ? <Skeleton className="h-32" /> : rows.length === 0 ? <p className="text-pencil">No replies yet.</p> : (
                <ul className="divide-y divide-rule">{rows.map((r) => <li key={r.student.id} className="flex items-center justify-between py-2"><span><b>{r.student.name}</b><span className="block text-xs text-pencil">by {r.by}</span></span><Badge tone={r.response === 'yes' ? 'success' : 'danger'}>{r.response === 'yes' ? 'Yes' : 'No'}</Badge></li>)}</ul>
            )}
        </Modal>
    );
}
