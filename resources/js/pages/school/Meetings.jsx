import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Avatar, Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, Skeleton, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { shortDate, today, useStructure } from '../../lib/school';

const BOOKING = { booked: ['Booked', 'draft'], done: ['Done', 'success'], missed: ['Missed', 'danger'], cancelled: ['Cancelled', 'neutral'] };

export default function Meetings() {
    const { tenant, isOffice, isParent, me } = useOutletContext();
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [creating, setCreating] = useState(false);
    const [notes, setNotes] = useState(null);
    const load = useCallback(() => api('school/meetings', { tenant }).then((r) => setRows(r.data)), [tenant]);
    useEffect(() => { load(); }, [load]);

    async function book(e, teacher, slot) {
        try { await api(`school/meetings/${e.id}/book`, { method: 'POST', tenant, body: { teacher_id: teacher.id, slot } }); toast(`Booked ${slot} with ${teacher.name}`); load(); } catch (err) { toast(err.message, 'error'); }
    }
    async function setBooking(b, body, msg) {
        try { await api(`school/meeting-bookings/${b.id}`, { method: 'PATCH', tenant, body }); toast(msg); load(); } catch (err) { toast(err.message, 'error'); }
    }

    return (
        <div>
            <PageHeader title="Parent-teacher meetings" description={isParent ? 'Pick a time with each of your child’s teachers.' : 'Meeting days, bookings and notes.'}
                actions={isOffice && <Button icon="plus" onClick={() => setCreating(true)}>New meeting day</Button>} />
            <div className="mt-6 space-y-5">
                {rows === null ? <Skeleton className="h-48 rounded-2xl" /> : rows.length === 0 ? <EmptyState icon="users" title="No meeting days scheduled">{isOffice ? 'Create one and parents can book times with teachers.' : 'You’ll be notified when the school schedules one.'}</EmptyState> : rows.map((e) => {
                    const mine = e.bookings.filter((b) => isParent ? true : b.teacher?.id === me.user.id || isOffice);
                    return (
                        <section key={e.id} className="rounded-2xl border border-rule bg-white">
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
                                <div><h2 className="text-xl font-bold">{e.title}</h2><p className="text-sm text-graphite">{shortDate(e.date, { weekday: 'long', month: 'long', day: 'numeric' })} · {e.starts_at}–{e.ends_at} · {e.mode === 'online' ? 'Online video call' : e.location ?? 'At school'}</p></div>
                                {isOffice && <IconButton icon="trash" label="Delete meeting day" onClick={async () => { await api(`school/meetings/${e.id}`, { method: 'DELETE', tenant }); load(); }} />}
                            </div>
                            {mine.length > 0 && (
                                <ul className="divide-y divide-rule border-b border-rule">
                                    {mine.map((b) => (
                                        <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                            <span className="w-14 font-bold text-ink-deep tabular-nums">{b.slot}</span>
                                            <Avatar name={isParent ? b.teacher?.name : b.parent?.name} size={32} />
                                            <span className="min-w-0 flex-1"><b className="text-graphite">{isParent ? b.teacher?.name : b.parent?.name}</b>{b.student && <span className="text-sm text-pencil"> · about {b.student.name}</span>}{b.notes && <span className="block truncate text-sm text-pencil">{b.notes}</span>}</span>
                                            {b.meeting_url && b.status === 'booked' && <Button size="sm" variant="secondary" as="a" href={b.meeting_url} target="_blank" rel="noreferrer">Join call</Button>}
                                            <Badge tone={BOOKING[b.status][1]}>{BOOKING[b.status][0]}</Badge>
                                            {isParent && b.status === 'booked' && <Button size="sm" variant="ghost" onClick={() => setBooking(b, { status: 'cancelled' }, 'Cancelled')}>Cancel</Button>}
                                            {!isParent && b.status === 'booked' && <><Button size="sm" variant="ghost" onClick={() => setBooking(b, { status: 'missed' }, 'Marked as missed')}>Missed</Button><Button size="sm" onClick={() => setNotes(b)}>Done + notes</Button></>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {isParent && (
                                <div className="space-y-4 p-5">
                                    {e.teachers.length === 0 && <p className="text-pencil">None of your child’s teachers are taking bookings on this day.</p>}
                                    {e.teachers.map((t) => {
                                        const booked = e.bookings.some((b) => b.teacher?.id === t.id && b.status === 'booked');
                                        return (
                                            <div key={t.id}>
                                                <p className="font-bold text-graphite">{t.name}{booked && <span className="ml-2 text-sm font-normal text-leaf">✓ booked</span>}</p>
                                                {!booked && (
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {t.slots.map((s) => (
                                                            <button key={s.time} type="button" disabled={s.taken} onClick={() => book(e, t, s.time)}
                                                                className={`rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums ring-1 ${s.taken ? 'cursor-not-allowed bg-paper text-rule ring-rule line-through' : 'bg-white text-ink ring-ink/30 hover:bg-ink hover:text-white'}`}>{s.time}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {!isParent && mine.length === 0 && <p className="px-5 py-6 text-pencil">No bookings yet.</p>}
                        </section>
                    );
                })}
            </div>
            {creating && <NewPtm tenant={tenant} onClose={() => setCreating(false)} onDone={() => { setCreating(false); toast('Meeting day created · parents notified'); load(); }} />}
            {notes && <NotesDialog booking={notes} onClose={() => setNotes(null)} onSave={(n) => { setBooking(notes, { status: 'done', notes: n || null }, 'Saved'); setNotes(null); }} />}
        </div>
    );
}

function NotesDialog({ booking, onClose, onSave }) {
    const [n, setN] = useState(booking.notes ?? '');
    return (
        <Modal open onClose={onClose} title={`Meeting with ${booking.parent?.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(n)}>Mark as done</Button></>}>
            <Field label="Notes and follow-ups (only staff see these)" as="textarea" rows={5} value={n} onChange={(e) => setN(e.target.value)} />
        </Modal>
    );
}

function NewPtm({ tenant, onClose, onDone }) {
    const [s] = useStructure(tenant);
    const [f, setF] = useState({ title: 'Parent-teacher meetings', date: today(), starts_at: '15:00', ends_at: '18:00', slot_minutes: 10, mode: 'in_person', location: '' });
    const [teachers, setTeachers] = useState(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const flip = (id) => { const n = new Set(teachers); if (n.has(id)) n.delete(id); else n.add(id); setTeachers(n); };
    async function save() {
        setBusy(true);
        setError(null);
        try { await api('school/meetings', { method: 'POST', tenant, body: { ...f, slot_minutes: Number(f.slot_minutes), location: f.location || null, teacher_ids: [...teachers] } }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} size="lg" title="New meeting day" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!teachers.size} onClick={save}>Create and notify parents</Button></>}>
            <div className="space-y-4">
                <Field label="Title" name="title" error={error} value={f.title} onChange={set('title')} />
                <div className="grid gap-4 sm:grid-cols-4">
                    <Field label="Date" name="date" type="date" error={error} value={f.date} onChange={set('date')} />
                    <Field label="From" name="starts_at" type="time" error={error} value={f.starts_at} onChange={set('starts_at')} />
                    <Field label="To" name="ends_at" type="time" error={error} value={f.ends_at} onChange={set('ends_at')} />
                    <Field label="Minutes each" name="slot_minutes" type="number" min="5" max="60" error={error} value={f.slot_minutes} onChange={set('slot_minutes')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="How" as="select" value={f.mode} onChange={set('mode')}><option value="in_person">In person</option><option value="online">Online video call</option></Field>
                    {f.mode === 'in_person' && <Field label="Where" value={f.location} onChange={set('location')} placeholder="Main hall" />}
                </div>
                <Field label="Teachers taking bookings">
                    <div className="flex flex-wrap gap-1.5">
                        <button type="button" className="rounded-full px-3 py-1 text-sm font-bold text-ink ring-1 ring-ink/30" onClick={() => setTeachers(new Set(s?.teachers.map((t) => t.id)))}>All</button>
                        {s?.teachers.map((t) => <button key={t.id} type="button" aria-pressed={teachers.has(t.id)} onClick={() => flip(t.id)} className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${teachers.has(t.id) ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{t.name}</button>)}
                    </div>
                </Field>
            </div>
        </Modal>
    );
}
