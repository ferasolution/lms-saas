import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Badge, Button, ConfirmDialog, EmptyState, Field, IconButton, Modal, PageHeader, Skeleton, Tabs, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useStructure } from '../../lib/school';
import { date } from '../../lib/format';

const COLORS = ['#2f5bd3', '#1f8a5b', '#c2410c', '#7c3aed', '#be185d', '#0e7490', '#a16207', '#4b5563'];

export default function Academics() {
    const { tenant } = useOutletContext();
    const toast = useToast();
    const [s, reload] = useStructure(tenant);
    const [tab, setTab] = useState('classes');
    const [modal, setModal] = useState(null);
    const [confirm, setConfirm] = useState(null);

    async function run(fn, ok) {
        try {
            await fn();
            if (ok) toast(ok);
            await reload();
            return true;
        } catch (err) {
            toast(err.message, 'error');
            return false;
        }
    }

    return (
        <div>
            <PageHeader title="Classes & subjects" description="Your school’s structure: classes and their sections, subjects, who teaches what, and academic years."
                actions={tab === 'classes' ? <Button icon="plus" onClick={() => setModal({ type: 'class' })}>Add class</Button>
                    : tab === 'subjects' ? <Button icon="plus" onClick={() => setModal({ type: 'subject' })}>Add subject</Button>
                        : <Button icon="plus" onClick={() => setModal({ type: 'year' })}>Add year</Button>} />

            <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[
                { value: 'classes', label: 'Classes', icon: 'grid', count: s?.classes.length },
                { value: 'subjects', label: 'Subjects', icon: 'book', count: s?.subjects.length },
                { value: 'years', label: 'Academic years', icon: 'calendar' },
            ]} />

            <div className="mt-6">
                {!s ? <Skeleton className="h-64 rounded-2xl" /> : tab === 'classes' ? (
                    s.classes.length === 0 ? (
                        <EmptyState icon="grid" title="Add your first class" action={<Button icon="plus" onClick={() => setModal({ type: 'class' })}>Add class</Button>}>
                            Create classes like “Grade 1” or “Year 7” with sections A, B, C. Students, attendance, the diary and timetables all hang off these.
                        </EmptyState>
                    ) : (
                        <div className="space-y-5">
                            {s.classes.map((c) => (
                                <section key={c.id} className="rounded-2xl border border-rule bg-white">
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
                                        <div>
                                            <h2 className="text-lg font-bold">{c.name}</h2>
                                            <p className="text-sm text-pencil">{c.sections.length} {c.sections.length === 1 ? 'section' : 'sections'} · {c.sections.reduce((n, x) => n + x.students_count, 0)} students</p>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button size="sm" variant="secondary" icon="plus" onClick={() => setModal({ type: 'section', classId: c.id, className: c.name })}>Section</Button>
                                            <IconButton icon="edit" label={`Rename ${c.name}`} onClick={() => setModal({ type: 'class', item: c })} />
                                            <IconButton icon="trash" label={`Delete ${c.name}`} onClick={() => setConfirm({
                                                title: `Delete ${c.name}?`, body: 'Its sections, timetables and diary entries are removed too.',
                                                go: () => run(() => api(`school/classes/${c.id}`, { method: 'DELETE', tenant }), 'Class deleted'),
                                            })} />
                                        </div>
                                    </div>
                                    <ul className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                                        {c.sections.map((sec) => (
                                            <li key={sec.id} className="rounded-xl bg-paper/40 p-4 ring-1 ring-rule">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="font-display text-xl font-bold text-ink-deep">{sec.label}</p>
                                                        <p className="text-sm text-pencil">
                                                            {sec.students_count}{sec.capacity ? ` / ${sec.capacity}` : ''} students{sec.room ? ` · ${sec.room}` : ''}
                                                        </p>
                                                    </div>
                                                    <IconButton icon="edit" label={`Edit ${sec.label}`} onClick={() => setModal({ type: 'section', classId: c.id, className: c.name, item: sec })} />
                                                </div>
                                                <p className="mt-3 flex items-center gap-2 text-sm">
                                                    <Icon name="user" size={16} className="text-pencil" />
                                                    {sec.class_teacher ? <span className="text-graphite">Class teacher: <b>{sec.class_teacher.name}</b></span> : <span className="text-pencil">No class teacher</span>}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-1.5">
                                                    {sec.subjects.map((x) => (
                                                        <span key={x.id} className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-graphite ring-1 ring-rule" title={x.teacher ? `Taught by ${x.teacher.name}` : 'No teacher yet'}>
                                                            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: x.color ?? '#9aa3b5' }} />{x.name}
                                                            {!x.teacher && <span className="ml-1 text-margin">•</span>}
                                                        </span>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setModal({ type: 'allocate', section: sec })} className="mt-3 text-sm font-bold text-ink hover:underline">
                                                    {sec.subjects.length ? 'Subjects and teachers' : 'Assign subjects'}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )
                ) : tab === 'subjects' ? (
                    s.subjects.length === 0 ? (
                        <EmptyState icon="book" title="No subjects yet" action={<Button icon="plus" onClick={() => setModal({ type: 'subject' })}>Add subject</Button>}>
                            Add Mathematics, English, Science… then assign them to sections with a teacher.
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                            {s.subjects.map((x) => {
                                const where = s.sections.filter((sec) => sec.subjects.some((y) => y.subject_id === x.id));
                                return (
                                    <li key={x.id} className="flex items-center gap-4 px-5 py-3.5">
                                        <span className="h-8 w-1.5 rounded-full" style={{ background: x.color ?? '#9aa3b5' }} />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-graphite">{x.name}{x.code && <span className="ml-2 text-sm font-normal text-pencil">{x.code}</span>}</p>
                                            <p className="truncate text-sm text-pencil">{where.length ? `Taught in ${where.map((w) => w.label).join(', ')}` : 'Not assigned to a class yet'}</p>
                                        </div>
                                        <IconButton icon="edit" label={`Edit ${x.name}`} onClick={() => setModal({ type: 'subject', item: x })} />
                                        <IconButton icon="trash" label={`Delete ${x.name}`} onClick={() => setConfirm({
                                            title: `Delete ${x.name}?`, body: 'It is removed from every class timetable and diary filter.',
                                            go: () => run(() => api(`school/subjects/${x.id}`, { method: 'DELETE', tenant }), 'Subject deleted'),
                                        })} />
                                    </li>
                                );
                            })}
                        </ul>
                    )
                ) : (
                    s.years.length === 0 ? (
                        <EmptyState icon="calendar" title="Set your academic year" action={<Button icon="plus" onClick={() => setModal({ type: 'year' })}>Add year</Button>}>
                            For example 2026–27, from August to June.
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                            {s.years.map((y) => (
                                <li key={y.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-graphite">{y.name}</p>
                                        <p className="text-sm text-pencil">{date(y.starts_on)} – {date(y.ends_on)}</p>
                                    </div>
                                    {y.is_current ? <Badge tone="success" dot>Current</Badge> : (
                                        <Button size="sm" variant="secondary" onClick={() => run(() => api(`school/years/${y.id}`, { method: 'PATCH', tenant, body: { is_current: true } }), `${y.name} is now current`)}>Make current</Button>
                                    )}
                                    <IconButton icon="trash" label={`Delete ${y.name}`} onClick={() => setConfirm({
                                        title: `Delete ${y.name}?`, body: 'Only the year is removed; students and records stay.',
                                        go: () => run(() => api(`school/years/${y.id}`, { method: 'DELETE', tenant }), 'Year deleted'),
                                    })} />
                                </li>
                            ))}
                        </ul>
                    )
                )}
            </div>

            {modal?.type === 'class' && <ClassModal tenant={tenant} item={modal.item} onClose={() => setModal(null)} onDone={async (msg) => { setModal(null); toast(msg); await reload(); }} />}
            {modal?.type === 'section' && <SectionModal tenant={tenant} {...modal} teachers={s?.teachers ?? []} onClose={() => setModal(null)} onDone={async (msg) => { setModal(null); toast(msg); await reload(); }}
                onDelete={(sec) => { setModal(null); setConfirm({ title: `Delete ${sec.label}?`, body: 'Only possible when no students are in it.', go: () => run(() => api(`school/sections/${sec.id}`, { method: 'DELETE', tenant }), 'Section deleted') }); }} />}
            {modal?.type === 'subject' && <SubjectModal tenant={tenant} item={modal.item} onClose={() => setModal(null)} onDone={async (msg) => { setModal(null); toast(msg); await reload(); }} />}
            {modal?.type === 'year' && <YearModal tenant={tenant} onClose={() => setModal(null)} onDone={async (msg) => { setModal(null); toast(msg); await reload(); }} />}
            {modal?.type === 'allocate' && <AllocateModal tenant={tenant} section={modal.section} subjects={s.subjects} teachers={s.teachers} onClose={() => setModal(null)} onDone={async () => { setModal(null); toast('Subjects saved'); await reload(); }} />}

            <ConfirmDialog open={!!confirm} title={confirm?.title} confirmLabel="Delete" danger onClose={() => setConfirm(null)}
                onConfirm={async () => { const c = confirm; setConfirm(null); await c.go(); }}>
                {confirm?.body}
            </ConfirmDialog>
        </div>
    );
}

function useSave(onDone) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function save(fn, msg) {
        setBusy(true);
        setError(null);
        try {
            await fn();
            onDone(msg);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }
    return { busy, error, save };
}

function ErrorLine({ error }) {
    if (!error || Object.keys(error.errors ?? {}).length) return null;
    return <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin" role="alert">{error.message}</p>;
}

function ClassModal({ tenant, item, onClose, onDone }) {
    const [name, setName] = useState(item?.name ?? '');
    const [sections, setSections] = useState('A, B');
    const { busy, error, save } = useSave(onDone);
    const submit = () => save(() => item
        ? api(`school/classes/${item.id}`, { method: 'PATCH', tenant, body: { name } })
        : api('school/classes', { method: 'POST', tenant, body: { name, sections: sections.split(',').map((x) => x.trim()).filter(Boolean) } }),
    item ? 'Class renamed' : `${name} added`);

    return (
        <Modal open onClose={onClose} title={item ? `Rename ${item.name}` : 'Add a class'}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={submit}>{item ? 'Save' : 'Add class'}</Button></>}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <ErrorLine error={error} />
                <Field label="Class name" name="name" error={error} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 5, Year 7, Class 10" />
                {!item && <Field label="Sections" name="sections" error={error} value={sections} onChange={(e) => setSections(e.target.value)} hint="Separate with commas. You can add more later." />}
            </form>
        </Modal>
    );
}

function SectionModal({ tenant, classId, className, item, teachers, onClose, onDone, onDelete }) {
    const [form, setForm] = useState({ name: item?.name ?? '', capacity: item?.capacity ?? '', room: item?.room ?? '', class_teacher_id: item?.class_teacher?.id ?? '' });
    const { busy, error, save } = useSave(onDone);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const body = { name: form.name, capacity: form.capacity ? Number(form.capacity) : null, room: form.room || null, class_teacher_id: form.class_teacher_id ? Number(form.class_teacher_id) : null };
    const submit = () => save(() => item
        ? api(`school/sections/${item.id}`, { method: 'PATCH', tenant, body })
        : api(`school/classes/${classId}/sections`, { method: 'POST', tenant, body }), item ? 'Section saved' : 'Section added');

    return (
        <Modal open onClose={onClose} title={item ? `Edit ${item.label}` : `New section in ${className}`}
            footer={<>
                {item && <Button variant="ghost" className="mr-auto text-margin" onClick={() => onDelete(item)}>Delete section</Button>}
                <Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={submit}>Save</Button>
            </>}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <ErrorLine error={error} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Section name" name="name" error={error} value={form.name} onChange={set('name')} placeholder="A" />
                    <Field label="Room (optional)" name="room" error={error} value={form.room} onChange={set('room')} placeholder="Room 12" />
                </div>
                <Field label="Class teacher" name="class_teacher_id" as="select" error={error} value={form.class_teacher_id} onChange={set('class_teacher_id')}
                    hint="Takes attendance and approves leave for this section.">
                    <option value="">No class teacher</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Field>
                <Field label="Capacity (optional)" name="capacity" type="number" min="1" error={error} value={form.capacity} onChange={set('capacity')} className="sm:w-48" />
            </form>
        </Modal>
    );
}

function SubjectModal({ tenant, item, onClose, onDone }) {
    const [form, setForm] = useState({ name: item?.name ?? '', code: item?.code ?? '', color: item?.color ?? COLORS[0] });
    const { busy, error, save } = useSave(onDone);
    const submit = () => save(() => api(item ? `school/subjects/${item.id}` : 'school/subjects', { method: item ? 'PATCH' : 'POST', tenant, body: { ...form, code: form.code || null } }),
        item ? 'Subject saved' : `${form.name} added`);

    return (
        <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'Add a subject'}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={submit}>Save</Button></>}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <ErrorLine error={error} />
                <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                    <Field label="Subject" name="name" error={error} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mathematics" />
                    <Field label="Code (optional)" name="code" error={error} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MATH" />
                </div>
                <Field label="Colour on the timetable">
                    <div className="flex flex-wrap gap-2">
                        {COLORS.map((c) => (
                            <button key={c} type="button" aria-label={c} aria-pressed={form.color === c} onClick={() => setForm({ ...form, color: c })}
                                className={`h-8 w-8 rounded-full ring-offset-2 transition ${form.color === c ? 'ring-2 ring-ink-deep' : ''}`} style={{ background: c }} />
                        ))}
                    </div>
                </Field>
            </form>
        </Modal>
    );
}

function YearModal({ tenant, onClose, onDone }) {
    const y = new Date().getFullYear();
    const [form, setForm] = useState({ name: `${y}–${String(y + 1).slice(2)}`, starts_on: `${y}-08-15`, ends_on: `${y + 1}-06-15`, is_current: true });
    const { busy, error, save } = useSave(onDone);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const submit = () => save(() => api('school/years', { method: 'POST', tenant, body: form }), 'Academic year added');
    return (
        <Modal open onClose={onClose} title="Add an academic year"
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={submit}>Add year</Button></>}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <Field label="Name" name="name" error={error} value={form.name} onChange={set('name')} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Starts" name="starts_on" type="date" error={error} value={form.starts_on} onChange={set('starts_on')} />
                    <Field label="Ends" name="ends_on" type="date" error={error} value={form.ends_on} onChange={set('ends_on')} />
                </div>
            </form>
        </Modal>
    );
}

function AllocateModal({ tenant, section, subjects, teachers, onClose, onDone }) {
    const [rows, setRows] = useState(section.subjects.map((x) => ({ subject_id: x.subject_id, teacher_id: x.teacher?.id ?? '' })));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const used = new Set(rows.map((r) => Number(r.subject_id)));

    useEffect(() => { setError(null); }, [rows]);

    async function save() {
        setBusy(true);
        try {
            await api(`school/sections/${section.id}/subjects`, { method: 'PUT', tenant, body: { subjects: rows.filter((r) => r.subject_id).map((r) => ({ subject_id: Number(r.subject_id), teacher_id: r.teacher_id ? Number(r.teacher_id) : null })) } });
            onDone();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const sel = 'h-10 w-full rounded-lg border border-rule bg-white px-3 focus:border-ink focus:outline-none';

    return (
        <Modal open onClose={onClose} size="lg" title={`Subjects in ${section.label}`} description="Each subject’s teacher can take attendance, post diary entries and see these students."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save subjects</Button></>}>
            {subjects.length === 0 ? <p className="text-pencil">Add subjects on the Subjects tab first.</p> : (
                <div className="space-y-2">
                    {rows.map((r, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                            <select aria-label="Subject" className={sel} value={r.subject_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, subject_id: e.target.value } : x)))}>
                                <option value="">Choose subject…</option>
                                {subjects.map((x) => <option key={x.id} value={x.id} disabled={used.has(x.id) && Number(r.subject_id) !== x.id}>{x.name}</option>)}
                            </select>
                            <select aria-label="Teacher" className={sel} value={r.teacher_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, teacher_id: e.target.value } : x)))}>
                                <option value="">No teacher yet</option>
                                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <IconButton icon="x" label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))} />
                        </div>
                    ))}
                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button size="sm" variant="secondary" icon="plus" onClick={() => setRows([...rows, { subject_id: '', teacher_id: '' }])}>Add a subject</Button>
                        {rows.length === 0 && <Button size="sm" variant="ghost" onClick={() => setRows(subjects.map((x) => ({ subject_id: x.id, teacher_id: '' })))}>Add all {subjects.length} subjects</Button>}
                    </div>
                    {error && <p className="text-margin" role="alert">{error}</p>}
                </div>
            )}
        </Modal>
    );
}
