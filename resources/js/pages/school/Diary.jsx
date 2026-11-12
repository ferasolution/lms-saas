import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import RichText from '../../components/RichText';
import { SectionSelect } from '../../components/school';
import { Avatar, Badge, Button, Checkbox, EmptyState, Field, FileDrop, IconButton, Modal, PageHeader, SlideOver, Skeleton, useToast } from '../../components/ui';
import { api, upload } from '../../lib/api';
import { DIARY_KINDS, dueLabel, shortDate, today, useStructure } from '../../lib/school';
import { dateTime } from '../../lib/format';

export default function Diary() {
    const ctx = useOutletContext();
    return ctx.isStaff ? <StaffDiary {...ctx} /> : <FamilyDiary {...ctx} />;
}

function groupByDate(entries) {
    const out = [];
    for (const e of entries) {
        const last = out[out.length - 1];
        if (last && last.date === e.date) last.items.push(e); else out.push({ date: e.date, items: [e] });
    }
    return out;
}

function KindPill({ kind }) {
    const k = DIARY_KINDS[kind];
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${k.tone}`}><Icon name={k.icon} size={12} />{k.label}</span>;
}

function DayHeader({ d }) {
    const label = d === today() ? 'Today' : shortDate(d, { weekday: 'long', month: 'long', day: 'numeric' });
    return <h2 className="sticky top-0 z-10 -mx-1 bg-paper/95 px-1 py-2 text-sm font-bold text-pencil backdrop-blur">{label}</h2>;
}

function StaffDiary({ tenant, isOffice, me }) {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [structure] = useStructure(tenant);
    const [entries, setEntries] = useState(null);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(null);
    const section = params.get('section') || '';

    const load = useCallback(() => {
        const qs = new URLSearchParams({ limit: '100' });
        if (section) qs.set('section_id', section);
        return api(`school/diary?${qs}`, { tenant }).then((r) => setEntries(r.data));
    }, [tenant, section]);
    useEffect(() => { setEntries(null); load(); }, [load]);

    async function remove(e) {
        await api(`school/diary/${e.id}`, { method: 'DELETE', tenant }).catch((err) => toast(err.message, 'error'));
        toast('Entry deleted');
        load();
    }

    const hasSections = structure?.sections.some((s) => s.mine);

    return (
        <div>
            <PageHeader title="Diary & homework" description="Post what was covered today, homework, tests and notices. Students and parents get a notification."
                actions={hasSections && <Button icon="plus" onClick={() => setEditing({ class_section_id: section ? Number(section) : '' })}>New entry</Button>} />

            <div className="mt-6">
                <SectionSelect structure={structure} onlyMine={!isOffice} allowAll allLabel={isOffice ? 'All classes' : 'All my classes'} value={section ? Number(section) : ''}
                    onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('section', String(v)); else p.delete('section'); setParams(p, { replace: true }); }} className="w-full sm:w-72" />
            </div>

            <div className="mt-6">
                {entries === null || !structure ? <Skeleton className="h-64 rounded-2xl" /> : !hasSections ? (
                    <EmptyState icon="diary" title="No classes assigned">You can post in the diary once you teach a section. The school office assigns classes under Classes & subjects.</EmptyState>
                ) : entries.length === 0 ? (
                    <EmptyState icon="diary" title="Nothing in the diary yet" action={<Button icon="plus" onClick={() => setEditing({ class_section_id: section ? Number(section) : '' })}>New entry</Button>}>
                        Start with today’s classwork or tonight’s homework.
                    </EmptyState>
                ) : (
                    <div className="space-y-6">
                        {groupByDate(entries).map((g) => (
                            <section key={g.date}>
                                <DayHeader d={g.date} />
                                <ul className="mt-2 space-y-3">
                                    {g.items.map((e) => (
                                        <li key={e.id} className="rounded-2xl border border-rule bg-white p-5" style={e.subject?.color ? { boxShadow: `inset 4px 0 0 ${e.subject.color}` } : undefined}>
                                            <div className="flex flex-wrap items-start gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <KindPill kind={e.kind} />
                                                        <span className="text-sm font-bold text-graphite">{e.section?.label}</span>
                                                        {e.subject && <span className="text-sm text-pencil">· {e.subject.name}</span>}
                                                    </div>
                                                    <p className="mt-1.5 text-lg font-bold text-ink-deep">{e.title}</p>
                                                    {e.body && <RichText text={e.body} className="mt-1 line-clamp-4 text-graphite" />}
                                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-pencil">
                                                        {e.due_on && <span className="font-bold text-amber-800">{dueLabel(e.due_on)}</span>}
                                                        {e.attachment && <a href={e.attachment} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-ink hover:underline"><Icon name="file" size={14} />Attachment</a>}
                                                        <span>{e.teacher?.name}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {e.accepts_submissions && (
                                                        <Button size="sm" variant="secondary" onClick={() => setOpen(e)}>
                                                            {e.submissions_count}/{e.class_size} handed in
                                                        </Button>
                                                    )}
                                                    {e.can_edit && <IconButton icon="edit" label="Edit" onClick={() => setEditing(e)} />}
                                                    {e.can_edit && <IconButton icon="trash" label="Delete" onClick={() => remove(e)} />}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>

            {editing && <EntryForm tenant={tenant} structure={structure} entry={editing} isOffice={isOffice} me={me} onClose={() => setEditing(null)}
                onSaved={(created) => { setEditing(null); toast(created ? 'Posted · students and parents notified' : 'Entry updated'); load(); }} />}
            {open && <Submissions tenant={tenant} entry={open} onClose={() => { setOpen(null); load(); }} />}
        </div>
    );
}

function EntryForm({ tenant, structure, entry, isOffice, onClose, onSaved }) {
    const isNew = !entry.id;
    const [form, setForm] = useState({
        class_section_id: entry.section?.id ?? entry.class_section_id ?? '',
        subject_id: entry.subject?.id ?? '',
        kind: entry.kind ?? 'homework',
        title: entry.title ?? '',
        body: entry.body ?? '',
        attachment: entry.attachment ?? '',
        date: entry.date ?? today(),
        due_on: entry.due_on ?? '',
        accepts_submissions: entry.accepts_submissions ?? false,
        max_marks: entry.max_marks ?? '',
        notify: true,
    });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const section = structure.sections.find((s) => s.id === Number(form.class_section_id));
    const subjects = section ? section.subjects : [];

    async function onFile(f) {
        setUploading(true);
        try { const r = await upload(f, f.type === 'application/pdf' ? 'pdf' : 'image', tenant); setForm((x) => ({ ...x, attachment: r.url })); } catch (e) { setError({ message: e.message, errors: {} }); } finally { setUploading(false); }
    }

    async function save() {
        setBusy(true);
        setError(null);
        const body = {
            ...form,
            class_section_id: form.class_section_id ? Number(form.class_section_id) : null,
            subject_id: form.subject_id ? Number(form.subject_id) : null,
            attachment: form.attachment || null,
            due_on: form.due_on || null,
            max_marks: form.accepts_submissions && form.max_marks ? Number(form.max_marks) : null,
        };
        if (!isNew) delete body.notify;
        try {
            await api(isNew ? 'school/diary' : `school/diary/${entry.id}`, { method: isNew ? 'POST' : 'PATCH', tenant, body });
            onSaved(isNew);
        } catch (e) {
            setError(e);
        } finally {
            setBusy(false);
        }
    }

    return (
        <SlideOver open onClose={onClose} title={isNew ? 'New diary entry' : 'Edit entry'}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={uploading} onClick={save}>{isNew ? 'Post' : 'Save'}</Button></>}>
            <div className="space-y-5">
                {error && !Object.keys(error.errors ?? {}).length && <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin">{error.message}</p>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(DIARY_KINDS).map(([k, v]) => (
                        <button key={k} type="button" aria-pressed={form.kind === k} onClick={() => setForm({ ...form, kind: k, accepts_submissions: k === 'homework' ? form.accepts_submissions : false })}
                            className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-sm font-bold ${form.kind === k ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule bg-white text-pencil'}`}>
                            <Icon name={v.icon} size={20} />{v.label}
                        </button>
                    ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Class"><SectionSelect structure={structure} onlyMine={!isOffice} value={form.class_section_id} onChange={(v) => setForm({ ...form, class_section_id: v, subject_id: '' })} /></Field>
                    <Field label="Subject" name="subject_id" as="select" error={error} value={form.subject_id} onChange={set('subject_id')}>
                        <option value="">General</option>
                        {subjects.map((x) => <option key={x.subject_id} value={x.subject_id}>{x.name}</option>)}
                    </Field>
                </div>
                <Field label="Title" name="title" error={error} value={form.title} onChange={set('title')}
                    placeholder={{ homework: 'e.g. Exercise 4.2, questions 1–10', classwork: 'e.g. Chapter 4: Fractions', test: 'e.g. Spelling test on Friday', notice: 'e.g. Bring art supplies tomorrow' }[form.kind]} />
                <Field label="Details" name="body" as="textarea" rows={5} error={error} value={form.body} onChange={set('body')} hint="Topics covered, instructions, pages, materials to bring." />
                <Field label="Attachment (optional)">
                    <FileDrop kind="any" value={form.attachment} uploading={uploading} onUpload={onFile} onClear={() => setForm({ ...form, attachment: '' })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Date" name="date" type="date" error={error} value={form.date} onChange={set('date')} />
                    {(form.kind === 'homework' || form.kind === 'test') && <Field label={form.kind === 'test' ? 'Test date' : 'Due'} name="due_on" type="date" error={error} value={form.due_on} min={form.date} onChange={set('due_on')} />}
                </div>
                {form.kind === 'homework' && (
                    <div className="space-y-3 rounded-xl border border-rule bg-white p-4">
                        <Checkbox label="Students hand this in online" hint="They upload a photo or PDF, or type their answer. You check it here." checked={form.accepts_submissions} onChange={(v) => setForm({ ...form, accepts_submissions: v })} />
                        {form.accepts_submissions && <Field label="Marked out of (optional)" name="max_marks" type="number" min="1" error={error} value={form.max_marks} onChange={set('max_marks')} className="sm:w-48" />}
                    </div>
                )}
                {isNew && <Checkbox label="Notify students and parents" checked={form.notify} onChange={(v) => setForm({ ...form, notify: v })} />}
            </div>
        </SlideOver>
    );
}

function Submissions({ tenant, entry, onClose }) {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [checking, setChecking] = useState(null);
    const load = useCallback(() => api(`school/diary/${entry.id}/submissions`, { tenant }).then(setData), [tenant, entry.id]);
    useEffect(() => { load(); }, [load]);

    const handed = data?.students.filter((s) => s.submission).length ?? 0;

    return (
        <SlideOver open onClose={onClose} title={entry.title} description={`${entry.section?.label} · ${handed} of ${data?.students.length ?? '…'} handed in`}>
            {!data ? <Skeleton className="h-64" /> : (
                <ul className="divide-y divide-rule overflow-hidden rounded-xl bg-white ring-1 ring-rule">
                    {data.students.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                            <Avatar name={s.name} size={32} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-bold text-graphite">{s.name}</p>
                                <p className="text-xs text-pencil">{s.submission ? `Handed in ${dateTime(s.submission.submitted_at)}` : 'Not handed in'}</p>
                            </div>
                            {!s.submission ? <Badge>Missing</Badge>
                                : s.submission.status === 'checked' ? <button type="button" onClick={() => setChecking(s)}><Badge tone="success">{s.submission.marks !== null ? `${s.submission.marks}${entry.max_marks ? `/${entry.max_marks}` : ''}` : 'Checked'}</Badge></button>
                                    : s.submission.status === 'redo' ? <button type="button" onClick={() => setChecking(s)}><Badge tone="danger">Redo</Badge></button>
                                        : <Button size="sm" onClick={() => setChecking(s)}>Check</Button>}
                        </li>
                    ))}
                </ul>
            )}
            {checking && <CheckDialog tenant={tenant} entry={entry} student={checking} onClose={() => setChecking(null)} onDone={() => { setChecking(null); toast('Saved · student and parents notified'); load(); }} />}
        </SlideOver>
    );
}

function CheckDialog({ tenant, entry, student, onClose, onDone }) {
    const sub = student.submission;
    const [marks, setMarks] = useState(sub.marks ?? '');
    const [feedback, setFeedback] = useState(sub.feedback ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function save(status) {
        setBusy(true);
        setError(null);
        try {
            await api(`school/homework/${sub.id}`, { method: 'PATCH', tenant, body: { status, marks: marks === '' ? null : Number(marks), feedback: feedback || null } });
            onDone();
        } catch (e) {
            setError(e);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} size="lg" title={student.name} description={`Handed in ${dateTime(sub.submitted_at)}`}
            footer={<><Button variant="secondary" onClick={() => save('redo')} busy={busy}>Ask to redo</Button><Button busy={busy} onClick={() => save('checked')}>Mark as checked</Button></>}>
            <div className="space-y-4">
                {sub.body && <div className="max-h-64 overflow-y-auto rounded-xl bg-paper p-4 whitespace-pre-line text-graphite ring-1 ring-rule">{sub.body}</div>}
                {sub.file_path && (/\.(png|jpe?g|webp)$/i.test(sub.file_path)
                    ? <a href={sub.file_path} target="_blank" rel="noreferrer"><img src={sub.file_path} alt="Submitted work" className="max-h-80 rounded-xl ring-1 ring-rule" /></a>
                    : <a href={sub.file_path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-bold text-ink hover:underline"><Icon name="file" size={18} />Open the attached file</a>)}
                <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
                    <Field label={entry.max_marks ? `Marks / ${entry.max_marks}` : 'Marks (optional)'} name="marks" type="number" min="0" max={entry.max_marks ?? undefined} error={error} value={marks} onChange={(e) => setMarks(e.target.value)} />
                    <Field label="Feedback" name="feedback" as="textarea" rows={3} error={error} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                </div>
            </div>
        </Modal>
    );
}

function FamilyDiary({ tenant, isParent, me }) {
    const [entries, setEntries] = useState(null);
    const [family, setFamily] = useState([]);
    const [filter, setFilter] = useState('all');
    const [handing, setHanding] = useState(null);
    const load = useCallback(() => api('school/diary?limit=100', { tenant }).then((r) => setEntries(r.data)), [tenant]);
    useEffect(() => { load(); api('school/family', { tenant }).then((r) => setFamily(r.children)).catch(() => {}); }, [load, tenant]);

    const names = useMemo(() => Object.fromEntries(family.map((c) => [c.id, c.name])), [family]);
    const shown = (entries ?? []).filter((e) => filter === 'all' || (filter === 'homework' ? e.kind === 'homework' : e.kind === filter));

    return (
        <div>
            <PageHeader title="Diary & homework" description={isParent ? 'What your children covered in class, their homework and upcoming tests.' : 'What you covered in class, homework and upcoming tests.'} />
            <div className="mt-6 flex flex-wrap gap-1.5">
                {[['all', 'Everything'], ['homework', 'Homework'], ['test', 'Tests'], ['classwork', 'Classwork'], ['notice', 'Notices']].map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${filter === v ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{l}</button>
                ))}
            </div>
            <div className="mt-6">
                {entries === null ? <Skeleton className="h-64 rounded-2xl" /> : shown.length === 0 ? (
                    <EmptyState icon="diary" title="Nothing here yet">Teachers’ diary entries will show up here, and you’ll get a notification.</EmptyState>
                ) : (
                    <div className="space-y-6">
                        {groupByDate(shown).map((g) => (
                            <section key={g.date}>
                                <DayHeader d={g.date} />
                                <ul className="mt-2 space-y-3">
                                    {g.items.map((e) => (
                                        <li key={e.id} className="rounded-2xl border border-rule bg-white p-5" style={e.subject?.color ? { boxShadow: `inset 4px 0 0 ${e.subject.color}` } : undefined}>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <KindPill kind={e.kind} />
                                                {e.subject && <span className="text-sm font-bold text-graphite">{e.subject.name}</span>}
                                                {isParent && family.length > 1 && <span className="text-sm text-pencil">· {e.children.map((c) => names[c.student_id]?.split(' ')[0]).join(', ')}</span>}
                                            </div>
                                            <p className="mt-1.5 text-lg font-bold text-ink-deep">{e.title}</p>
                                            {e.body && <RichText text={e.body} className="mt-1 text-graphite" />}
                                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-pencil">
                                                {e.due_on && <span className="font-bold text-amber-800">{e.kind === 'test' ? `Test on ${shortDate(e.due_on)}` : dueLabel(e.due_on)}</span>}
                                                {e.attachment && <a href={e.attachment} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-ink hover:underline"><Icon name="file" size={14} />Attachment</a>}
                                                <span>{e.teacher?.name}</span>
                                            </div>
                                            {e.accepts_submissions && (
                                                <div className="mt-3 space-y-2 border-t border-rule pt-3">
                                                    {e.children.map((c) => {
                                                        const s = c.submission;
                                                        return (
                                                            <div key={c.student_id} className="flex flex-wrap items-center gap-3">
                                                                {isParent && <span className="font-bold text-graphite">{names[c.student_id]}</span>}
                                                                {!s ? <Badge tone="warning">Not handed in</Badge>
                                                                    : s.status === 'checked' ? <Badge tone="success">Checked{s.marks !== null ? ` · ${s.marks}${e.max_marks ? `/${e.max_marks}` : ''}` : ''}</Badge>
                                                                        : s.status === 'redo' ? <Badge tone="danger">Teacher asked to redo</Badge> : <Badge tone="draft">Handed in</Badge>}
                                                                {s?.feedback && <span className="text-sm text-graphite">“{s.feedback}”</span>}
                                                                {(!s || s.status !== 'checked') && (
                                                                    <Button size="sm" variant={s ? 'ghost' : 'primary'} className="ml-auto" onClick={() => setHanding({ entry: e, student_id: c.student_id, submission: s })}>
                                                                        {s ? 'Update work' : 'Hand in'}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>
            {handing && <HandIn tenant={tenant} {...handing} isParent={isParent} childName={names[handing.student_id] ?? me.user.name} onClose={() => setHanding(null)} onDone={() => { setHanding(null); load(); }} />}
        </div>
    );
}

function HandIn({ tenant, entry, student_id, submission, isParent, childName, onClose, onDone }) {
    const toast = useToast();
    const [body, setBody] = useState(submission?.body ?? '');
    const [file, setFile] = useState(submission?.file_path ?? '');
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function onFile(f) {
        setUploading(true);
        try { const r = await upload(f, f.type === 'application/pdf' ? 'pdf' : 'image', tenant); setFile(r.url); } catch (e) { toast(e.message, 'error'); } finally { setUploading(false); }
    }

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api(`school/diary/${entry.id}/submit`, { method: 'POST', tenant, body: { student_id, body: body || null, file_path: file || null } });
            toast('Handed in');
            onDone();
        } catch (e) {
            setError(e);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={`Hand in: ${entry.title}`} description={isParent ? `On behalf of ${childName}` : dueLabel(entry.due_on)}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={uploading || (!body.trim() && !file)} onClick={save}>Hand in</Button></>}>
            <div className="space-y-4">
                {error && <p className="text-margin">{error.message}</p>}
                <Field label="Photo or PDF of the work">
                    <FileDrop kind="any" value={file} uploading={uploading} onUpload={onFile} onClear={() => setFile('')} hint="Take a clear photo of each page, or upload a PDF." />
                </Field>
                <Field label="Or type the answer" as="textarea" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
        </Modal>
    );
}
