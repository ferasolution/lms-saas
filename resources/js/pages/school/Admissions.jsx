import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { SectionSelect } from '../../components/school';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageHeader, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { ADMISSION_STATUS, useStructure } from '../../lib/school';
import { date, dateTime, relative } from '../../lib/format';
import { LoginsDialog } from './Students';

const SOURCES = { online: 'Online form', walk_in: 'Walk-in', phone: 'Phone', referral: 'Referral', event: 'Event', other: 'Other' };

export default function Admissions() {
    const { tenant } = useOutletContext();
    const toast = useToast();
    const [structure] = useStructure(tenant);
    const [status, setStatus] = useState('new');
    const [search, setSearch] = useState('');
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(null);
    const [adding, setAdding] = useState(false);
    const [logins, setLogins] = useState(null);
    const link = `${window.location.origin}/${tenant}/apply`;

    const load = useCallback(() => {
        const qs = new URLSearchParams();
        if (status !== 'all') qs.set('status', status);
        if (search.trim()) qs.set('search', search.trim());
        return api(`school/admissions?${qs}`, { tenant }).then(setData);
    }, [tenant, status, search]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

    async function copy() {
        try { await navigator.clipboard.writeText(link); toast('Application link copied'); } catch { toast('Copy the link from the box', 'error'); }
    }

    return (
        <div>
            <PageHeader title="Admissions" description="Applications and enquiries, from first contact to enrolment."
                actions={<Button icon="plus" onClick={() => setAdding(true)}>Add enquiry</Button>} />

            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-rule bg-white p-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-50 text-ink"><Icon name="globe" size={20} /></span>
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-graphite">Your online application form</p>
                    <p className="truncate text-sm text-pencil">{link}</p>
                </div>
                <Button size="sm" variant="secondary" icon="copy" onClick={copy}>Copy link</Button>
                <Button size="sm" variant="ghost" icon="external" as="a" href={link} target="_blank" rel="noreferrer">Open</Button>
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                <Tabs value={status} onChange={setStatus} tabs={[
                    ...['new', 'reviewing', 'interview', 'accepted', 'waitlisted', 'enrolled', 'rejected'].map((s) => ({ value: s, label: ADMISSION_STATUS[s].label, count: data?.counts[s] || null })),
                    { value: 'all', label: 'All' },
                ]} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, reference" aria-label="Search applications"
                    className="h-10 w-full rounded-lg border border-rule bg-white px-3 focus:border-ink focus:outline-none sm:w-64" />
            </div>

            <div className="mt-4">
                {data === null ? <Skeleton className="h-64 rounded-2xl" /> : data.data.length === 0 ? (
                    <EmptyState icon="inbox" title="Nothing here">{status === 'new' ? 'New applications from your online form and enquiries you add show up here.' : 'No applications with this status.'}</EmptyState>
                ) : (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {data.data.map((a) => (
                            <li key={a.id}>
                                <button type="button" onClick={() => setOpen(a)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-paper/60">
                                    <Avatar name={a.student_name} size={40} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-bold text-graphite">{a.student_name} <span className="font-normal text-pencil">· {a.class?.name ?? 'Any class'}</span></p>
                                        <p className="truncate text-sm text-pencil">{a.guardian_name} · {a.guardian_email}</p>
                                    </div>
                                    <span className="hidden text-right text-sm text-pencil sm:block">{SOURCES[a.source]}<br />{relative(a.created_at)}</span>
                                    <Badge tone={ADMISSION_STATUS[a.status].tone}>{ADMISSION_STATUS[a.status].label}</Badge>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {open && <ApplicationPanel tenant={tenant} app={open} structure={structure} onClose={() => setOpen(null)}
                onChanged={(a) => { setOpen(a); load(); }} onEnrolled={(r) => { setOpen(null); load(); if (r.logins.length) setLogins(r.logins); else toast('Enrolled'); }} />}
            {adding && <EnquiryForm tenant={tenant} structure={structure} onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast('Enquiry added'); setStatus('new'); load(); }} />}
            {logins && <LoginsDialog logins={logins} onClose={() => setLogins(null)} />}
        </div>
    );
}

function ApplicationPanel({ tenant, app, structure, onClose, onChanged, onEnrolled }) {
    const toast = useToast();
    const [note, setNote] = useState(app.decision_note ?? '');
    const [interview, setInterview] = useState(app.interview_at ? app.interview_at.slice(0, 16) : '');
    const [enrolling, setEnrolling] = useState(false);
    const [busy, setBusy] = useState(false);

    async function update(body, msg) {
        setBusy(true);
        try {
            const a = await api(`school/admissions/${app.id}`, { method: 'PATCH', tenant, body });
            toast(msg);
            onChanged(a);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    const done = app.status === 'enrolled';

    return (
        <SlideOver open onClose={onClose} title={app.student_name} description={`Ref ${app.reference} · ${SOURCES[app.source]} · ${dateTime(app.created_at)}`}
            footer={!done && <>
                {app.status !== 'rejected' && <Button variant="secondary" busy={busy} onClick={() => update({ status: 'rejected', decision_note: note || null }, 'Marked as not offered')}>Not offered</Button>}
                {app.status !== 'accepted' && <Button variant="secondary" busy={busy} onClick={() => update({ status: 'accepted', decision_note: note || null }, 'Accepted')}>Accept</Button>}
                <Button icon="check" onClick={() => setEnrolling(true)}>Enrol</Button>
            </>}>
            <div className="space-y-6">
                <div className="flex items-center gap-2"><span className="text-sm text-pencil">Status</span><Badge tone={ADMISSION_STATUS[app.status].tone}>{ADMISSION_STATUS[app.status].label}</Badge></div>
                <dl className="divide-y divide-rule rounded-xl bg-white ring-1 ring-rule">
                    {[
                        ['Applying for', app.class?.name ?? 'Any class'], ['Date of birth', app.date_of_birth && date(app.date_of_birth)], ['Gender', app.gender],
                        ['Previous school', app.previous_school], ['Parent', `${app.guardian_name} (${app.relation})`], ['Email', app.guardian_email], ['Phone', app.guardian_phone],
                        ['Notes', app.notes],
                    ].filter(([, v]) => v).map(([k, v]) => <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5 text-sm"><dt className="text-pencil">{k}</dt><dd className="whitespace-pre-line text-graphite">{v}</dd></div>)}
                </dl>
                {!done && (
                    <>
                        <div className="rounded-xl bg-white p-4 ring-1 ring-rule">
                            <p className="font-bold text-ink-deep">Move along</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {['reviewing', 'interview', 'waitlisted'].filter((s) => s !== app.status).map((s) => (
                                    <Button key={s} size="sm" variant="secondary" busy={busy} onClick={() => update({ status: s }, `Moved to ${ADMISSION_STATUS[s].label}`)}>{ADMISSION_STATUS[s].label}</Button>
                                ))}
                            </div>
                            <div className="mt-4 flex items-end gap-2">
                                <Field label="Interview or test" type="datetime-local" value={interview} onChange={(e) => setInterview(e.target.value)} />
                                <Button size="sm" variant="secondary" className="mb-0.5" disabled={!interview} busy={busy} onClick={() => update({ status: 'interview', interview_at: interview }, 'Interview scheduled')}>Save</Button>
                            </div>
                        </div>
                        <Field label="Notes for the office" as="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (app.decision_note ?? '') && update({ decision_note: note || null }, 'Note saved')} />
                    </>
                )}
                {done && <p className="rounded-xl bg-leaf-50 px-4 py-3 text-graphite">Enrolled. Find {app.student_name} under Students.</p>}
            </div>
            {enrolling && <EnrolDialog tenant={tenant} app={app} structure={structure} onClose={() => setEnrolling(false)} onDone={onEnrolled} />}
        </SlideOver>
    );
}

function EnrolDialog({ tenant, app, structure, onClose, onDone }) {
    const firstMatch = structure?.sections.find((s) => s.class_id === app.class?.id)?.id ?? '';
    const [section, setSection] = useState(firstMatch);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function go() {
        setBusy(true);
        setError(null);
        try { onDone(await api(`school/admissions/${app.id}/enrol`, { method: 'POST', tenant, body: { class_section_id: section, student_email: email || null } })); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={`Enrol ${app.student_name}`} description={`Creates the student record and a parent account for ${app.guardian_email}.`}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!section} onClick={go}>Enrol student</Button></>}>
            <div className="space-y-4">
                {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                <Field label="Class"><SectionSelect structure={structure} value={section} onChange={setSection} /></Field>
                <Field label="Student email (optional)" name="student_email" type="email" error={error} value={email} onChange={(e) => setEmail(e.target.value)} hint="Leave empty and we create a sign-in name." />
            </div>
        </Modal>
    );
}

function EnquiryForm({ tenant, structure, onClose, onDone }) {
    const [f, setF] = useState({ student_name: '', school_class_id: '', date_of_birth: '', guardian_name: '', guardian_email: '', guardian_phone: '', relation: 'mother', source: 'walk_in', notes: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api('school/admissions', { method: 'POST', tenant, body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])) });
            onDone();
        } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <SlideOver open onClose={onClose} title="Add an enquiry" description="For walk-ins, phone calls and referrals."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Add enquiry</Button></>}>
            <div className="space-y-4">
                <Field label="Student’s name" name="student_name" error={error} value={f.student_name} onChange={set('student_name')} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Applying for" name="school_class_id" as="select" error={error} value={f.school_class_id} onChange={set('school_class_id')}>
                        <option value="">Not sure yet</option>
                        {structure?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Field>
                    <Field label="Date of birth" name="date_of_birth" type="date" error={error} value={f.date_of_birth} onChange={set('date_of_birth')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                    <Field label="Parent’s name" name="guardian_name" error={error} value={f.guardian_name} onChange={set('guardian_name')} />
                    <Field label="Relation" as="select" value={f.relation} onChange={set('relation')}>
                        {['mother', 'father', 'guardian', 'grandparent', 'other'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                    </Field>
                </div>
                <Field label="Parent’s email" name="guardian_email" type="email" error={error} value={f.guardian_email} onChange={set('guardian_email')} />
                <Field label="Phone" name="guardian_phone" error={error} value={f.guardian_phone} onChange={set('guardian_phone')} />
                <Field label="How did they reach you?" name="source" as="select" error={error} value={f.source} onChange={set('source')}>
                    {Object.entries(SOURCES).filter(([k]) => k !== 'online').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Field>
                <Field label="Notes" name="notes" as="textarea" rows={3} error={error} value={f.notes} onChange={set('notes')} />
            </div>
        </SlideOver>
    );
}
