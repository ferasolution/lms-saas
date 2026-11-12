import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { SectionSelect } from '../../components/school';
import { Avatar, Badge, Button, Checkbox, EmptyState, Field, IconButton, Modal, PageHeader, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, download } from '../../lib/api';
import { useStructure } from '../../lib/school';
import { date } from '../../lib/format';

const STATUS_TABS = [
    { value: 'active', label: 'Current' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'withdrawn', label: 'Withdrawn' },
    { value: 'graduated', label: 'Graduated' },
];
const RELATIONS = ['mother', 'father', 'guardian', 'grandparent', 'sibling', 'other'];

export default function Students() {
    const { tenant, isOffice } = useOutletContext();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [structure] = useStructure(tenant);
    const [rows, setRows] = useState(null);
    const [meta, setMeta] = useState(null);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [adding, setAdding] = useState(false);
    const [moving, setMoving] = useState(false);
    const [logins, setLogins] = useState(null);
    const status = params.get('status') || 'active';
    const section = params.get('section') || '';
    const openId = params.get('student');

    const load = useCallback(() => {
        const qs = new URLSearchParams({ status, per_page: '200' });
        if (section) qs.set('section_id', section);
        if (search.trim()) qs.set('search', search.trim());
        return api(`school/students?${qs}`, { tenant }).then((r) => { setRows(r.data); setMeta(r.meta); });
    }, [tenant, status, section, search]);

    useEffect(() => { const t = setTimeout(() => { load(); setSelected(new Set()); }, 200); return () => clearTimeout(t); }, [load]);

    const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
    const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    return (
        <div>
            <PageHeader title="Students" description={meta ? `${meta.total} ${status === 'active' ? 'current' : status} students` : 'Your school’s student records.'}
                actions={isOffice && <>
                    <Button variant="secondary" icon="download" onClick={() => download(`school/exports/students.csv?status=${status}${section ? `&section_id=${section}` : ''}`, tenant, 'students.csv').catch((e) => toast(e.message, 'error'))}>Export</Button>
                    <Button icon="plus" onClick={() => setAdding(true)}>Admit student</Button>
                </>} />

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <SectionSelect structure={structure} value={section ? Number(section) : ''} onChange={(v) => setParam('section', v ? String(v) : '')} allowAll className="w-full sm:w-64" />
                <label className="relative w-full sm:w-72">
                    <span className="sr-only">Search students</span>
                    <Icon name="search" size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-pencil" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or admission no."
                        className="h-10 w-full rounded-lg border border-rule bg-white pr-3 pl-10 focus:border-ink focus:outline-none" />
                </label>
            </div>

            {isOffice && <Tabs className="mt-4" value={status} onChange={(v) => setParam('status', v === 'active' ? '' : v)} tabs={STATUS_TABS} />}

            {selected.size > 0 && (
                <div className="sticky top-2 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-ink-deep px-4 py-3 text-white shadow-lg">
                    <p className="font-bold">{selected.size} selected</p>
                    <Button size="sm" variant="secondary" onClick={() => setMoving(true)}>Move or promote</Button>
                    <button type="button" className="ml-auto text-sm font-bold text-white/80 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
            )}

            <div className="mt-4">
                {rows === null ? <Skeleton className="h-64 rounded-2xl" /> : rows.length === 0 ? (
                    <EmptyState icon="users" title={search || section ? 'No matching students' : 'No students yet'}
                        action={isOffice && !search && !section ? <Button icon="plus" onClick={() => setAdding(true)}>Admit student</Button> : null}>
                        {search || section ? 'Try another class or search.' : 'Admit students one by one, accept them from Admissions, or import a spreadsheet from People.'}
                    </EmptyState>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-rule bg-white">
                        <table className="w-full text-left">
                            <thead className="border-b border-rule bg-paper/60 text-sm text-pencil">
                                <tr>
                                    {isOffice && <th className="w-10 px-4 py-3"><Checkbox label={<span className="sr-only">Select all</span>} checked={selected.size === rows.length} onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
                                    <th className="px-4 py-3 font-bold">Student</th>
                                    <th className="hidden px-4 py-3 font-bold md:table-cell">Admission no.</th>
                                    <th className="hidden px-4 py-3 font-bold sm:table-cell">Class</th>
                                    <th className="hidden px-4 py-3 font-bold lg:table-cell">Parents</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rule">
                                {rows.map((r) => (
                                    <tr key={r.id} className="transition hover:bg-paper/60">
                                        {isOffice && <td className="px-4 py-3"><Checkbox label={<span className="sr-only">Select {r.name}</span>} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>}
                                        <td className="px-4 py-3">
                                            <button type="button" onClick={() => setParam('student', String(r.id))} className="flex items-center gap-3 text-left">
                                                <Avatar name={r.name} size={36} />
                                                <span className="min-w-0">
                                                    <span className="block font-bold text-graphite hover:text-ink">{r.name}</span>
                                                    <span className="block truncate text-sm text-pencil sm:hidden">{r.section?.label ?? 'No class'}</span>
                                                    <span className="hidden truncate text-sm text-pencil sm:block">{r.roll_no ? `Roll ${r.roll_no}` : r.email}</span>
                                                </span>
                                            </button>
                                        </td>
                                        <td className="hidden px-4 py-3 font-mono text-sm text-graphite md:table-cell">{r.admission_no}</td>
                                        <td className="hidden px-4 py-3 sm:table-cell">{r.section ? r.section.label : <Badge tone="warning">No class</Badge>}</td>
                                        <td className="hidden px-4 py-3 text-sm text-graphite lg:table-cell">{r.guardians.map((g) => g.name).join(', ') || <span className="text-pencil">—</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {adding && <AdmitStudent tenant={tenant} structure={structure} defaultSection={section} onClose={() => setAdding(false)}
                onDone={(r) => { setAdding(false); load(); if (r.logins?.length) setLogins(r.logins); else toast('Student admitted'); }} />}
            {moving && <MoveDialog tenant={tenant} structure={structure} ids={[...selected]} onClose={() => setMoving(false)}
                onDone={(n) => { setMoving(false); setSelected(new Set()); toast(`${n} students updated`); load(); }} />}
            {logins && <LoginsDialog logins={logins} onClose={() => setLogins(null)} />}
            {openId && <StudentPanel tenant={tenant} id={openId} structure={structure} isOffice={isOffice} onClose={() => setParam('student', '')} onChanged={load} onLogins={setLogins} />}
        </div>
    );
}

export function LoginsDialog({ logins, onClose }) {
    function downloadCsv() {
        const csv = 'name,email,role,password\n' + logins.map((p) => [p.name, p.email, p.role, p.password].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: 'new-logins.csv' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    return (
        <Modal open onClose={onClose} title="Accounts created" description="Share each sign-in privately. Passwords are shown only now."
            footer={<><Button variant="secondary" icon="download" onClick={downloadCsv}>Download</Button><Button onClick={onClose}>Done</Button></>}>
            <ul className="divide-y divide-rule rounded-xl border border-rule">
                {logins.map((l) => (
                    <li key={l.email} className="px-4 py-3">
                        <p className="flex items-center gap-2 font-bold text-graphite">{l.name} <Badge>{l.role}</Badge></p>
                        <p className="mt-1 text-sm text-pencil">Email <span className="font-mono text-graphite">{l.email}</span></p>
                        <p className="text-sm text-pencil">Password <span className="font-mono text-graphite">{l.password}</span></p>
                    </li>
                ))}
            </ul>
        </Modal>
    );
}

function AdmitStudent({ tenant, structure, defaultSection, onClose, onDone }) {
    const [form, setForm] = useState({ name: '', email: '', class_section_id: defaultSection ? Number(defaultSection) : '', roll_no: '', date_of_birth: '', gender: '', address: '', emergency_contact: '', medical_notes: '' });
    const [guardian, setGuardian] = useState({ name: '', email: '', phone: '', relation: 'mother' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const setG = (k) => (e) => setGuardian({ ...guardian, [k]: e.target.value });

    async function save() {
        setBusy(true);
        setError(null);
        const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
        if (guardian.name || guardian.email) body.guardians = [guardian];
        try {
            onDone(await api('school/students', { method: 'POST', tenant, body }));
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <SlideOver open onClose={onClose} title="Admit a student" description="Creates the student’s sign-in and links a parent account."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Admit student</Button></>}>
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
                {error && !Object.keys(error.errors ?? {}).length && <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin">{error.message}</p>}
                <Field label="Full name" name="name" error={error} value={form.name} onChange={set('name')} />
                <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                    <Field label="Class">
                        <SectionSelect structure={structure} value={form.class_section_id} onChange={(v) => setForm({ ...form, class_section_id: v })} allowAll allLabel="Not placed yet" />
                    </Field>
                    <Field label="Roll no." name="roll_no" error={error} value={form.roll_no} onChange={set('roll_no')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Date of birth" name="date_of_birth" type="date" error={error} value={form.date_of_birth} onChange={set('date_of_birth')} />
                    <Field label="Gender" name="gender" as="select" error={error} value={form.gender} onChange={set('gender')}>
                        <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
                    </Field>
                </div>
                <Field label="Student email (optional)" name="email" type="email" error={error} value={form.email} onChange={set('email')} hint="Leave empty for young children; we create a sign-in name for them." />

                <fieldset className="space-y-4 rounded-xl border border-rule bg-white p-4">
                    <legend className="px-1 font-bold text-ink-deep">Parent or guardian</legend>
                    <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                        <Field label="Name" name="guardians.0.name" error={error} value={guardian.name} onChange={setG('name')} />
                        <Field label="Relation" as="select" value={guardian.relation} onChange={setG('relation')}>
                            {RELATIONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                        </Field>
                    </div>
                    <Field label="Email" name="guardians.0.email" type="email" error={error} value={guardian.email} onChange={setG('email')} hint="If this parent already has an account here (a sibling), we link to it." />
                    <Field label="Phone" name="guardians.0.phone" error={error} value={guardian.phone} onChange={setG('phone')} />
                </fieldset>

                <details className="rounded-xl border border-rule bg-white p-4">
                    <summary className="cursor-pointer font-bold text-ink-deep">More details</summary>
                    <div className="mt-4 space-y-4">
                        <Field label="Address" name="address" as="textarea" rows={2} error={error} value={form.address} onChange={set('address')} />
                        <Field label="Emergency contact" name="emergency_contact" error={error} value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="Name and phone" />
                        <Field label="Medical or learning notes" name="medical_notes" as="textarea" rows={2} error={error} value={form.medical_notes} onChange={set('medical_notes')} hint="Visible to staff and the family only." />
                    </div>
                </details>
            </form>
        </SlideOver>
    );
}

function MoveDialog({ tenant, structure, ids, onClose, onDone }) {
    const [mode, setMode] = useState('move');
    const [to, setTo] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function go() {
        setBusy(true);
        try {
            const body = mode === 'move' ? { student_ids: ids, to_section_id: to } : { student_ids: ids, status: mode };
            const r = await api('school/students/promote', { method: 'POST', tenant, body });
            onDone(r.moved);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={`Update ${ids.length} students`}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={mode === 'move' && !to} onClick={go}>Apply</Button></>}>
            <div className="space-y-3">
                {[['move', 'Move to another class', 'For promotion to the next grade or a section change.'], ['graduated', 'Mark as graduated', 'They leave the current roll and can no longer sign in.'], ['withdrawn', 'Mark as withdrawn', 'Left the school.']].map(([v, l, h]) => (
                    <label key={v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${mode === v ? 'border-ink bg-ink-50/50' : 'border-rule'}`}>
                        <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="mt-1 accent-[var(--color-ink)]" />
                        <span><span className="block font-bold text-graphite">{l}</span><span className="text-sm text-pencil">{h}</span></span>
                    </label>
                ))}
                {mode === 'move' && <SectionSelect structure={structure} value={to} onChange={setTo} />}
                {error && <p className="text-margin">{error}</p>}
            </div>
        </Modal>
    );
}

function StudentPanel({ tenant, id, structure, isOffice, onClose, onChanged, onLogins }) {
    const toast = useToast();
    const [s, setS] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [addingParent, setAddingParent] = useState(false);

    const load = useCallback(() => api(`school/students/${id}`, { tenant }).then((d) => {
        setS(d);
        setForm({ name: d.name, class_section_id: d.section?.id ?? '', roll_no: d.roll_no ?? '', admission_no: d.admission_no, date_of_birth: d.date_of_birth ?? '', gender: d.gender ?? '', address: d.address ?? '', emergency_contact: d.emergency_contact ?? '', medical_notes: d.medical_notes ?? '', status: d.status });
    }).catch((e) => { toast(e.message, 'error'); onClose(); }), [id, tenant]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [load]);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api(`school/students/${id}`, { method: 'PATCH', tenant, body: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])) });
            toast('Record saved');
            setEditing(false);
            load();
            onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    async function unlink(g) {
        await api(`school/students/${id}/guardians/${g.id}`, { method: 'DELETE', tenant }).catch((e) => toast(e.message, 'error'));
        load();
    }

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const att = s?.attendance;
    const pct = att?.days ? Math.round((att.present / att.days) * 100) : null;

    return (
        <SlideOver open onClose={onClose} title={s?.name ?? 'Student'} description={s ? `${s.admission_no} · ${s.section?.label ?? 'No class'}` : ''}
            footer={editing ? <><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>
                : isOffice ? <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>Edit record</Button> : null}>
            {!s ? <Skeleton className="h-64" /> : editing ? (
                <div className="space-y-4">
                    <Field label="Full name" name="name" error={error} value={form.name} onChange={set('name')} />
                    <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                        <Field label="Class"><SectionSelect structure={structure} value={form.class_section_id} onChange={(v) => setForm({ ...form, class_section_id: v })} allowAll allLabel="Not placed" /></Field>
                        <Field label="Roll no." name="roll_no" error={error} value={form.roll_no} onChange={set('roll_no')} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Admission no." name="admission_no" error={error} value={form.admission_no} onChange={set('admission_no')} />
                        <Field label="Status" name="status" as="select" error={error} value={form.status} onChange={set('status')}>
                            {['active', 'suspended', 'withdrawn', 'graduated', 'alumni'].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
                        </Field>
                        <Field label="Date of birth" name="date_of_birth" type="date" error={error} value={form.date_of_birth} onChange={set('date_of_birth')} />
                        <Field label="Gender" name="gender" as="select" error={error} value={form.gender} onChange={set('gender')}>
                            <option value="">Not given</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
                        </Field>
                    </div>
                    <Field label="Address" name="address" as="textarea" rows={2} error={error} value={form.address} onChange={set('address')} />
                    <Field label="Emergency contact" name="emergency_contact" error={error} value={form.emergency_contact} onChange={set('emergency_contact')} />
                    <Field label="Medical or learning notes" name="medical_notes" as="textarea" rows={3} error={error} value={form.medical_notes} onChange={set('medical_notes')} />
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-white p-3 ring-1 ring-rule"><p className="font-display text-2xl font-bold text-ink-deep">{pct === null ? '—' : `${pct}%`}</p><p className="text-xs text-pencil">Attendance, 90 days</p></div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-rule"><p className="font-display text-2xl font-bold text-margin">{att?.absent ?? 0}</p><p className="text-xs text-pencil">Days absent</p></div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-rule"><p className="font-display text-2xl font-bold text-ink-deep">{(s.homework.submitted ?? 0) + (s.homework.checked ?? 0)}</p><p className="text-xs text-pencil">Homework handed in</p></div>
                    </div>

                    <dl className="divide-y divide-rule rounded-xl bg-white ring-1 ring-rule">
                        {[
                            ['Status', <Badge key="s" tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge>],
                            ['Roll no.', s.roll_no], ['Date of birth', s.date_of_birth && date(s.date_of_birth)], ['Gender', s.gender],
                            ['Admitted', s.admitted_on && date(s.admitted_on)], ['Sign-in email', s.email], ['Address', s.address],
                            ['Emergency contact', s.emergency_contact], ['Previous school', s.previous_school], ['Notes', s.medical_notes],
                        ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5 text-sm"><dt className="text-pencil">{k}</dt><dd className="whitespace-pre-line text-graphite">{v}</dd></div>
                        ))}
                    </dl>

                    <section>
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-ink-deep">Parents and guardians</h3>
                            {isOffice && <Button size="sm" variant="ghost" icon="plus" onClick={() => setAddingParent(true)}>Add</Button>}
                        </div>
                        <ul className="mt-2 space-y-2">
                            {s.guardians.length === 0 && <li className="rounded-xl border border-dashed border-rule px-4 py-4 text-sm text-pencil">No parent linked yet.</li>}
                            {s.guardians.map((g) => (
                                <li key={g.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-rule">
                                    <Avatar name={g.name} size={34} />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-graphite">{g.name} <span className="text-sm font-normal text-pencil">· {g.relation}</span></p>
                                        <p className="truncate text-sm text-pencil">{g.email}{g.phone ? ` · ${g.phone}` : ''}</p>
                                    </div>
                                    {isOffice && <IconButton icon="x" label={`Unlink ${g.name}`} onClick={() => unlink(g)} />}
                                </li>
                            ))}
                        </ul>
                    </section>

                    {s.section && (
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" icon="check2" as={Link} to={`/${tenant}/attendance?section=${s.section.id}`}>Class attendance</Button>
                            <Button size="sm" variant="secondary" icon="diary" as={Link} to={`/${tenant}/diary?section=${s.section.id}`}>Class diary</Button>
                        </div>
                    )}
                </div>
            )}
            {addingParent && <AddParent tenant={tenant} studentId={id} onClose={() => setAddingParent(false)} onDone={(r) => { setAddingParent(false); load(); onChanged(); if (r.login) onLogins([{ ...r.login, name: 'Parent', role: 'parent' }]); else toast('Parent linked'); }} />}
        </SlideOver>
    );
}

function AddParent({ tenant, studentId, onClose, onDone }) {
    const [g, setG] = useState({ name: '', email: '', phone: '', relation: 'mother' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setG({ ...g, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try { onDone(await api(`school/students/${studentId}/guardians`, { method: 'POST', tenant, body: g })); } catch (err) { setError(err); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title="Link a parent or guardian"
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Link parent</Button></>}>
            <div className="space-y-4">
                {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                    <Field label="Name" name="name" error={error} value={g.name} onChange={set('name')} />
                    <Field label="Relation" as="select" value={g.relation} onChange={set('relation')}>{RELATIONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</Field>
                </div>
                <Field label="Email" name="email" type="email" error={error} value={g.email} onChange={set('email')} />
                <Field label="Phone" name="phone" error={error} value={g.phone} onChange={set('phone')} />
            </div>
        </Modal>
    );
}

