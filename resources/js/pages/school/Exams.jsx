import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { SectionSelect } from '../../components/school';
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, Modal, PageHeader, Progress, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, download } from '../../lib/api';
import { shortDate, useStructure } from '../../lib/school';

const KINDS = { term: 'Term exam', midterm: 'Midterm', final: 'Final exam', monthly: 'Monthly test', weekly: 'Weekly test', entrance: 'Entrance test', other: 'Other' };
const STATUS = {
    draft: { label: 'Draft', tone: 'neutral', hint: 'Only staff can see it.' },
    scheduled: { label: 'Date sheet published', tone: 'draft', hint: 'Families see the dates. Results are hidden.' },
    published: { label: 'Results published', tone: 'success', hint: 'Families see marks and report cards.' },
};
const range = (e) => (e.starts_on ? `${shortDate(e.starts_on, { month: 'short', day: 'numeric' })}${e.ends_on && e.ends_on !== e.starts_on ? ` – ${shortDate(e.ends_on, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}` : 'Dates not set');

export default function Exams() {
    const ctx = useOutletContext();
    const { id } = useParams();
    if (!ctx.isStaff) return <FamilyExams {...ctx} />;
    return id ? <ExamDetail {...ctx} id={id} /> : <ExamList {...ctx} />;
}

function ExamList({ tenant, isOffice }) {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [creating, setCreating] = useState(false);
    const [scale, setScale] = useState(false);
    useEffect(() => { api('school/exams', { tenant }).then((r) => setRows(r.data)); }, [tenant]);

    return (
        <div>
            <PageHeader title="Exams & results" description="Date sheets, marks entry, results and report cards."
                actions={isOffice && <>
                    <Button variant="secondary" icon="settings" onClick={() => setScale(true)}>Grading scale</Button>
                    <Button icon="plus" onClick={() => setCreating(true)}>New exam</Button>
                </>} />
            <div className="mt-6">
                {rows === null ? <Skeleton className="h-48 rounded-2xl" /> : rows.length === 0 ? (
                    <EmptyState icon="quiz" title="No exams yet" action={isOffice && <Button icon="plus" onClick={() => setCreating(true)}>New exam</Button>}>
                        {isOffice ? 'Create a midterm or monthly test, add papers for each class, and teachers enter marks.' : 'When the school office sets up an exam, you’ll enter marks for your subjects here.'}
                    </EmptyState>
                ) : (
                    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {rows.map((e) => {
                            const pct = e.progress.papers ? Math.round((e.progress.complete / e.progress.papers) * 100) : 0;
                            return (
                                <li key={e.id}>
                                    <Link to={`${e.id}`} className="block rounded-2xl border border-rule bg-white p-5 transition hover:border-ink/40">
                                        <div className="flex items-start justify-between gap-3">
                                            <div><p className="text-sm text-pencil">{KINDS[e.kind]}</p><h2 className="text-xl font-bold">{e.name}</h2><p className="text-sm text-graphite">{range(e)}</p></div>
                                            <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                                        </div>
                                        <div className="mt-4">
                                            <div className="flex justify-between text-sm"><span className="text-pencil">Marks entered</span><span className="font-bold text-graphite tabular-nums">{e.progress.complete}/{e.progress.papers} papers</span></div>
                                            <Progress value={pct} className="mt-1.5" />
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            {creating && <ExamForm tenant={tenant} onClose={() => setCreating(false)} onDone={(e) => navigate(`${e.id}`)} />}
            {scale && <ScaleDialog tenant={tenant} onClose={() => setScale(false)} />}
        </div>
    );
}

function ExamForm({ tenant, exam, onClose, onDone }) {
    const [f, setF] = useState({ name: exam?.name ?? '', kind: exam?.kind ?? 'midterm', starts_on: exam?.starts_on ?? '', ends_on: exam?.ends_on ?? '', show_rank: exam?.show_rank ?? false });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try { onDone(await api(exam ? `school/exams/${exam.id}` : 'school/exams', { method: exam ? 'PATCH' : 'POST', tenant, body: { ...f, starts_on: f.starts_on || null, ends_on: f.ends_on || null } })); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={exam ? 'Exam details' : 'New exam'}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>{exam ? 'Save' : 'Create exam'}</Button></>}>
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
                    <Field label="Name" name="name" error={error} value={f.name} onChange={set('name')} placeholder="e.g. Midterm Exams Fall 2026" />
                    <Field label="Type" name="kind" as="select" error={error} value={f.kind} onChange={set('kind')}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Starts" name="starts_on" type="date" error={error} value={f.starts_on} onChange={set('starts_on')} />
                    <Field label="Ends" name="ends_on" type="date" error={error} value={f.ends_on} min={f.starts_on} onChange={set('ends_on')} />
                </div>
                <Checkbox label="Show class position on report cards" checked={f.show_rank} onChange={(v) => setF({ ...f, show_rank: v })} />
            </div>
        </Modal>
    );
}

function ScaleDialog({ tenant, onClose }) {
    const toast = useToast();
    const [bands, setBands] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => { api('school/grade-scale', { tenant }).then((r) => setBands(r.bands.map((b) => ({ ...b, min_percent: String(b.min_percent), points: b.points ?? '' })))); }, [tenant]);
    const upd = (i, k, v) => setBands(bands.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api('school/grade-scale', { method: 'PUT', tenant, body: { bands: bands.map((b) => ({ min_percent: Number(b.min_percent), grade: b.grade, points: b.points === '' ? null : Number(b.points), remark: b.remark || null })) } });
            toast('Grading scale saved');
            onClose();
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    const inp = 'h-9 w-full rounded-lg border border-rule px-2';
    return (
        <Modal open onClose={onClose} size="lg" title="Grading scale" description="Used for every subject grade and overall grade."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save scale</Button></>}>
            {!bands ? <Skeleton className="h-48" /> : (
                <div className="space-y-2">
                    <div className="grid grid-cols-[6rem_5rem_5rem_1fr_auto] gap-2 text-sm font-bold text-pencil"><span>From %</span><span>Grade</span><span>GPA</span><span>Remark</span><span /></div>
                    {bands.map((b, i) => (
                        <div key={i} className="grid grid-cols-[6rem_5rem_5rem_1fr_auto] gap-2">
                            <input aria-label="From percent" type="number" min="0" max="100" value={b.min_percent} onChange={(e) => upd(i, 'min_percent', e.target.value)} className={inp} />
                            <input aria-label="Grade" value={b.grade} onChange={(e) => upd(i, 'grade', e.target.value)} className={inp} />
                            <input aria-label="GPA points" type="number" step="0.1" value={b.points} onChange={(e) => upd(i, 'points', e.target.value)} className={inp} />
                            <input aria-label="Remark" value={b.remark ?? ''} onChange={(e) => upd(i, 'remark', e.target.value)} className={inp} />
                            <IconButton icon="x" label="Remove" onClick={() => setBands(bands.filter((_, j) => j !== i))} />
                        </div>
                    ))}
                    <Button size="sm" variant="ghost" icon="plus" onClick={() => setBands([...bands, { min_percent: '', grade: '', points: '', remark: '' }])}>Add grade</Button>
                    {error && <p className="text-margin">{error}</p>}
                </div>
            )}
        </Modal>
    );
}

function ExamDetail({ tenant, isOffice, id }) {
    const toast = useToast();
    const navigate = useNavigate();
    const [exam, setExam] = useState(null);
    const [tab, setTab] = useState('papers');
    const [editing, setEditing] = useState(false);
    const [adding, setAdding] = useState(false);
    const [marking, setMarking] = useState(null);
    const [paperEdit, setPaperEdit] = useState(null);
    const load = useCallback(() => api(`school/exams/${id}`, { tenant }).then(setExam).catch(() => navigate('..')), [tenant, id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [load]);

    async function setStatus(status, msg) {
        try { await api(`school/exams/${id}`, { method: 'PATCH', tenant, body: { status } }); toast(msg); load(); } catch (e) { toast(e.message, 'error'); }
    }

    const bySection = useMemo(() => {
        const g = {};
        for (const p of exam?.papers ?? []) (g[p.section?.label] ??= []).push(p);
        return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
    }, [exam]);

    if (!exam) return <Skeleton className="h-72 rounded-2xl" />;
    const done = exam.papers.filter((p) => p.students && p.entered >= p.students).length;

    return (
        <div>
            <PageHeader back={{ to: '..', label: 'All exams' }} title={exam.name} description={`${KINDS[exam.kind]} · ${range(exam)}`}
                actions={isOffice && <>
                    <Button variant="ghost" icon="edit" onClick={() => setEditing(true)}>Details</Button>
                    {exam.status === 'draft' && <Button variant="secondary" disabled={!exam.papers.length} onClick={() => setStatus('scheduled', 'Date sheet published · families notified')}>Publish date sheet</Button>}
                    {exam.status !== 'published' && <Button icon="check" disabled={!exam.papers.length} onClick={() => setStatus('published', 'Results published · families notified')}>Publish results</Button>}
                    {exam.status === 'published' && <Button variant="secondary" onClick={() => setStatus('scheduled', 'Results hidden again')}>Hide results</Button>}
                </>} />
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-rule">
                <Badge tone={STATUS[exam.status].tone}>{STATUS[exam.status].label}</Badge>
                <span className="text-sm text-pencil">{STATUS[exam.status].hint}</span>
                <span className="ml-auto text-sm text-graphite tabular-nums">Marks complete for {done} of {exam.papers.length} papers</span>
            </div>

            <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[{ value: 'papers', label: 'Papers & marks', icon: 'clipboard' }, { value: 'results', label: 'Results', icon: 'chart' }]} />
            <div className="mt-6">
                {tab === 'papers' ? (
                    <>
                        {isOffice && <div className="mb-4 flex justify-end"><Button variant="secondary" icon="plus" onClick={() => setAdding(true)}>Add papers</Button></div>}
                        {bySection.length === 0 ? (
                            <EmptyState icon="clipboard" title="No papers yet" action={isOffice && <Button icon="plus" onClick={() => setAdding(true)}>Add papers</Button>}>
                                Add a paper for each subject in each class. We use the subjects already assigned to each section.
                            </EmptyState>
                        ) : (
                            <div className="space-y-5">
                                {bySection.map(([label, papers]) => (
                                    <section key={label} className="rounded-2xl border border-rule bg-white">
                                        <h2 className="border-b border-rule px-5 py-3 text-lg font-bold">{label}</h2>
                                        <ul className="divide-y divide-rule">
                                            {papers.map((p) => {
                                                const complete = p.students > 0 && p.entered >= p.students;
                                                return (
                                                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                                        <span className="h-8 w-1 rounded-full" style={{ background: p.subject?.color ?? '#9aa3b5' }} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-bold text-graphite">{p.subject?.name}</p>
                                                            <p className="text-sm text-pencil">{p.date ? `${shortDate(p.date)}${p.starts_at ? ` · ${p.starts_at}` : ''}${p.duration_minutes ? ` · ${p.duration_minutes} min` : ''}${p.room ? ` · ${p.room}` : ''}` : 'Date not set'} · out of {p.max_marks}{p.pass_marks ? `, pass ${p.pass_marks}` : ''}</p>
                                                        </div>
                                                        <span className={`text-sm font-bold tabular-nums ${complete ? 'text-leaf' : 'text-pencil'}`}>{p.entered}/{p.students}</span>
                                                        {isOffice && <IconButton icon="edit" label={`Edit ${p.subject?.name} paper`} onClick={() => setPaperEdit(p)} />}
                                                        {p.can_enter && <Button size="sm" variant={complete ? 'secondary' : 'primary'} onClick={() => setMarking(p)}>{complete ? 'Edit marks' : 'Enter marks'}</Button>}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        )}
                    </>
                ) : <Results tenant={tenant} exam={exam} />}
            </div>
            {editing && <ExamForm tenant={tenant} exam={exam} onClose={() => setEditing(false)} onDone={() => { setEditing(false); load(); }} />}
            {adding && <AddPapers tenant={tenant} exam={exam} onClose={() => setAdding(false)} onDone={(n) => { setAdding(false); toast(`${n} papers added`); load(); }} />}
            {paperEdit && <PaperForm tenant={tenant} paper={paperEdit} onClose={() => setPaperEdit(null)} onDone={() => { setPaperEdit(null); load(); }} />}
            {marking && <MarksEntry tenant={tenant} paper={marking} onClose={() => { setMarking(null); load(); }} />}
        </div>
    );
}

function AddPapers({ tenant, exam, onClose, onDone }) {
    const [structure] = useStructure(tenant);
    const [sections, setSections] = useState(new Set());
    const [f, setF] = useState({ max_marks: '100', pass_marks: '40' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const flip = (id) => { const n = new Set(sections); if (n.has(id)) n.delete(id); else n.add(id); setSections(n); };
    async function go() {
        setBusy(true);
        try { const r = await api(`school/exams/${exam.id}/papers`, { method: 'POST', tenant, body: { section_ids: [...sections], max_marks: Number(f.max_marks), pass_marks: f.pass_marks ? Number(f.pass_marks) : null } }); onDone(r.added); } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title="Add papers" description="One paper per subject taught in each class you pick."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!sections.size} onClick={go}>Add papers</Button></>}>
            {!structure ? <Skeleton className="h-32" /> : (
                <div className="space-y-4">
                    <Field label="Classes">
                        <div className="flex flex-wrap gap-1.5">
                            <button type="button" className="rounded-full px-3 py-1 text-sm font-bold text-ink ring-1 ring-ink/30" onClick={() => setSections(new Set(structure.sections.map((s) => s.id)))}>All</button>
                            {structure.sections.map((s) => (
                                <button key={s.id} type="button" aria-pressed={sections.has(s.id)} onClick={() => flip(s.id)}
                                    className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${sections.has(s.id) ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{s.label} <span className="opacity-60">{s.subjects.length}</span></button>
                            ))}
                        </div>
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Marked out of" type="number" min="1" value={f.max_marks} onChange={(e) => setF({ ...f, max_marks: e.target.value })} />
                        <Field label="Pass mark (optional)" type="number" min="0" value={f.pass_marks} onChange={(e) => setF({ ...f, pass_marks: e.target.value })} />
                    </div>
                    {error && <p className="text-margin">{error}</p>}
                </div>
            )}
        </Modal>
    );
}

function PaperForm({ tenant, paper, onClose, onDone }) {
    const toast = useToast();
    const [f, setF] = useState({ date: paper.date ?? '', starts_at: paper.starts_at ?? '', duration_minutes: paper.duration_minutes ?? '', room: paper.room ?? '', max_marks: String(paper.max_marks), pass_marks: paper.pass_marks ?? '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api(`school/exam-papers/${paper.id}`, { method: 'PATCH', tenant, body: { date: f.date || null, starts_at: f.starts_at || null, duration_minutes: f.duration_minutes ? Number(f.duration_minutes) : null, room: f.room || null, max_marks: Number(f.max_marks), pass_marks: f.pass_marks === '' ? null : Number(f.pass_marks) } });
            onDone();
        } catch (e) { setError(e); } finally { setBusy(false); }
    }
    async function remove() {
        await api(`school/exam-papers/${paper.id}`, { method: 'DELETE', tenant }).catch((e) => toast(e.message, 'error'));
        onDone();
    }
    return (
        <Modal open onClose={onClose} title={`${paper.subject?.name} · ${paper.section?.label}`}
            footer={<><Button variant="ghost" className="mr-auto text-margin" onClick={remove}>Remove paper</Button><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
            <div className="space-y-4">
                {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Date" name="date" type="date" error={error} value={f.date} onChange={set('date')} />
                    <Field label="Starts" name="starts_at" type="time" error={error} value={f.starts_at} onChange={set('starts_at')} />
                    <Field label="Minutes" name="duration_minutes" type="number" error={error} value={f.duration_minutes} onChange={set('duration_minutes')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Room" name="room" error={error} value={f.room} onChange={set('room')} />
                    <Field label="Out of" name="max_marks" type="number" error={error} value={f.max_marks} onChange={set('max_marks')} />
                    <Field label="Pass mark" name="pass_marks" type="number" error={error} value={f.pass_marks} onChange={set('pass_marks')} />
                </div>
            </div>
        </Modal>
    );
}

function MarksEntry({ tenant, paper, onClose }) {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState({});
    useEffect(() => { api(`school/exam-papers/${paper.id}/marks`, { tenant }).then((d) => { setData(d); setRows(d.students.map((s) => ({ ...s, marks: s.marks ?? '' }))); }); }, [tenant, paper.id]);
    const upd = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    async function save() {
        setBusy(true);
        setErrors({});
        try {
            await api(`school/exam-papers/${paper.id}/marks`, { method: 'PUT', tenant, body: { marks: rows.map((r) => ({ student_id: r.id, marks: r.is_absent || r.marks === '' ? null : Number(r.marks), is_absent: r.is_absent, remark: r.remark || null })) } });
            toast('Marks saved');
            onClose();
        } catch (e) { setErrors(e.errors ?? {}); toast(e.message, 'error'); } finally { setBusy(false); }
    }

    const max = data?.paper.max_marks;
    const entered = rows.filter((r) => r.is_absent || r.marks !== '').length;

    return (
        <SlideOver open onClose={onClose} title={`${paper.subject?.name} · ${paper.section?.label}`} description={`Out of ${paper.max_marks}${paper.pass_marks ? ` · pass mark ${paper.pass_marks}` : ''} · ${entered}/${rows.length} entered`}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save} disabled={!data?.paper.can_enter}>Save marks</Button></>}>
            {!data ? <Skeleton className="h-64" /> : (
                <ul className="divide-y divide-rule overflow-hidden rounded-xl bg-white ring-1 ring-rule">
                    {rows.map((r, i) => {
                        const err = errors[`marks.${i}.marks`]?.[0];
                        const low = r.marks !== '' && paper.pass_marks && Number(r.marks) < paper.pass_marks;
                        return (
                            <li key={r.id} className="grid grid-cols-[2rem_1fr_6rem_auto] items-center gap-3 px-4 py-2.5">
                                <span className="text-right text-sm text-pencil tabular-nums">{r.roll_no}</span>
                                <span className="truncate font-bold text-graphite">{r.name}</span>
                                <input type="number" inputMode="decimal" min="0" max={max} step="0.5" aria-label={`Marks for ${r.name}`} disabled={r.is_absent}
                                    value={r.is_absent ? '' : r.marks} placeholder={r.is_absent ? 'AB' : '—'}
                                    onChange={(e) => upd(i, { marks: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.closest('li')?.nextElementSibling?.querySelector('input[type=number]')?.focus(); } }}
                                    className={`h-10 rounded-lg border px-3 text-right font-bold tabular-nums focus:outline-none ${err || Number(r.marks) > max ? 'border-margin text-margin' : low ? 'border-amber-500 text-amber-800' : 'border-rule focus:border-ink'}`} />
                                <label className="flex items-center gap-1.5 text-sm text-pencil"><input type="checkbox" checked={r.is_absent} onChange={(e) => upd(i, { is_absent: e.target.checked })} className="h-4 w-4 accent-[var(--color-margin)]" />Absent</label>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-3 text-sm text-pencil">Tip: press Enter to jump to the next student.</p>
        </SlideOver>
    );
}

function Results({ tenant, exam }) {
    const sections = useMemo(() => {
        const m = new Map();
        exam.papers.forEach((p) => p.section && m.set(p.section.id, p.section.label));
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [exam]);
    const [section, setSection] = useState(sections[0]?.[0] ?? '');
    const [sheet, setSheet] = useState(null);
    useEffect(() => { if (section) { setSheet(null); api(`school/exams/${exam.id}/results?section_id=${section}`, { tenant }).then(setSheet); } }, [tenant, exam.id, section]);

    if (!sections.length) return <EmptyState icon="chart" title="No results yet">Add papers and enter marks first.</EmptyState>;
    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <select aria-label="Class" value={section} onChange={(e) => setSection(Number(e.target.value))} className="h-10 rounded-lg border border-rule bg-white px-3 font-bold">
                    {sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                {sheet?.class_average !== null && sheet && <span className="text-sm text-pencil">Class average <b className="text-graphite">{sheet.class_average}%</b></span>}
                <Button variant="secondary" size="sm" icon="download" className="ml-auto" onClick={() => download(`school/exams/${exam.id}/results.csv?section_id=${section}`, tenant, 'results.csv')}>Export</Button>
            </div>
            {!sheet ? <Skeleton className="mt-4 h-64 rounded-2xl" /> : (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-paper/60 text-pencil">
                            <tr>
                                <th className="px-3 py-2 text-left font-bold">#</th>
                                <th className="sticky left-0 bg-paper px-3 py-2 text-left font-bold">Student</th>
                                {sheet.papers.map((p) => <th key={p.id} className="px-3 py-2 text-right font-bold whitespace-nowrap">{p.subject}<span className="block text-xs font-normal">/{p.max_marks}</span></th>)}
                                <th className="px-3 py-2 text-right font-bold">Total</th><th className="px-3 py-2 text-right font-bold">%</th><th className="px-3 py-2 font-bold">Grade</th><th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-rule">
                            {sheet.students.map((s) => (
                                <tr key={s.id}>
                                    <td className="px-3 py-2 font-bold text-pencil tabular-nums">{s.position ?? '—'}</td>
                                    <td className="sticky left-0 bg-white px-3 py-2 font-bold whitespace-nowrap text-graphite">{s.name}</td>
                                    {sheet.papers.map((p) => {
                                        const c = s.marks[p.id];
                                        const fail = c?.marks !== null && c?.marks !== undefined && p.pass_marks && c.marks < p.pass_marks;
                                        return <td key={p.id} className={`px-3 py-2 text-right tabular-nums ${fail ? 'font-bold text-margin' : 'text-graphite'}`}>{c?.is_absent ? <span className="text-pencil">AB</span> : c?.marks ?? <span className="text-rule">—</span>}</td>;
                                    })}
                                    <td className="px-3 py-2 text-right font-bold tabular-nums">{s.total}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{s.percent ?? '—'}</td>
                                    <td className="px-3 py-2"><span className="font-bold text-ink-deep">{s.grade?.grade}</span>{s.passed === false && <span className="ml-1 text-xs font-bold text-margin">Fail</span>}</td>
                                    <td className="px-3 py-2 text-right"><Link to={`/${tenant}/exams/${exam.id}/report/${s.id}`} target="_blank" className="font-bold text-ink hover:underline">Report</Link></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t border-rule bg-paper/40 text-pencil">
                            <tr><td /><td className="sticky left-0 bg-paper px-3 py-2 font-bold">Highest / average</td>{sheet.papers.map((p) => <td key={p.id} className="px-3 py-2 text-right tabular-nums">{p.highest ?? '—'} / {p.average ?? '—'}</td>)}<td colSpan={4} /></tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}

function FamilyExams({ tenant, isParent }) {
    const [rows, setRows] = useState(null);
    useEffect(() => { api('school/exams/mine', { tenant }).then((r) => setRows(r.data)).catch(() => setRows([])); }, [tenant]);
    return (
        <div>
            <PageHeader title="Exams & results" description={isParent ? 'Date sheets and report cards for your children.' : 'Your date sheets and report cards.'} />
            <div className="mt-6 space-y-5">
                {rows === null ? <Skeleton className="h-48 rounded-2xl" /> : rows.length === 0 ? (
                    <EmptyState icon="quiz" title="No exams announced">Date sheets appear here as soon as the school publishes them.</EmptyState>
                ) : rows.map((e) => (
                    <section key={e.id} className="rounded-2xl border border-rule bg-white">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
                            <div><p className="text-sm text-pencil">{KINDS[e.kind]}</p><h2 className="text-xl font-bold">{e.name}</h2><p className="text-sm text-graphite">{range(e)}</p></div>
                            <Badge tone={e.status === 'published' ? 'success' : 'draft'}>{e.status === 'published' ? 'Results out' : 'Upcoming'}</Badge>
                        </div>
                        <div className="divide-y divide-rule">
                            {e.children.map((c) => (
                                <div key={c.student.id} className="px-5 py-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        {isParent && <p className="font-bold text-graphite">{c.student.name} <span className="font-normal text-pencil">· {c.student.section}</span></p>}
                                        {c.summary && (
                                            <span className="flex items-center gap-3 sm:ml-auto">
                                                <span className="font-display text-2xl font-bold text-ink-deep tabular-nums">{c.summary.percent ?? '—'}%</span>
                                                {c.summary.grade && <Badge tone="success">Grade {c.summary.grade.grade}</Badge>}
                                                <Button size="sm" icon="file" as={Link} to={`/${tenant}/exams/${e.id}/report/${c.student.id}`} target="_blank">Report card</Button>
                                            </span>
                                        )}
                                    </div>
                                    {!c.summary && (
                                        <table className="mt-3 w-full text-sm">
                                            <thead className="text-left text-pencil"><tr><th className="py-1 font-bold">Subject</th><th className="py-1 font-bold">Date</th><th className="py-1 font-bold">Time</th><th className="hidden py-1 font-bold sm:table-cell">Room</th></tr></thead>
                                            <tbody className="divide-y divide-rule">
                                                {c.date_sheet.map((p, i) => <tr key={i}><td className="py-1.5 font-bold text-graphite">{p.subject}</td><td className="py-1.5">{p.date ? shortDate(p.date) : 'TBA'}</td><td className="py-1.5 tabular-nums">{p.starts_at ?? '—'}{p.duration_minutes ? ` · ${p.duration_minutes} min` : ''}</td><td className="hidden py-1.5 sm:table-cell">{p.room ?? '—'}</td></tr>)}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}

