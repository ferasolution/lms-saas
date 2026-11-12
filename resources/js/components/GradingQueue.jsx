import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { dateTime, relative } from '../lib/format';
import Icon from './Icon';
import { Avatar, Badge, Button, EmptyState, Field, Modal, Skeleton, Tabs, useToast } from './ui';

/** Handed-in assignments, newest first, with a grade dialog. Pass courseId to limit to one course. */
export default function GradingQueue({ tenant, courseId, showCourse = !courseId }) {
    const toast = useToast();
    const [status, setStatus] = useState('submitted');
    const [rows, setRows] = useState(null);
    const [current, setCurrent] = useState(null);

    const load = useCallback(() => {
        const qs = new URLSearchParams();
        if (status !== 'all') qs.set('status', status);
        if (courseId) qs.set('course_id', courseId);
        return api(`submissions?${qs}`, { tenant }).then((r) => setRows(r.data)).catch(() => setRows([]));
    }, [tenant, courseId, status]);
    useEffect(() => { setRows(null); load(); }, [load]);

    return (
        <div className="space-y-4">
            <Tabs value={status} onChange={setStatus} tabs={[
                { value: 'submitted', label: 'To grade' },
                { value: 'graded', label: 'Graded' },
                { value: 'all', label: 'All' },
            ]} />
            {rows === null ? <Skeleton className="h-40 rounded-2xl" /> : rows.length === 0 ? (
                <EmptyState icon="clipboard" title={status === 'submitted' ? 'Nothing waiting to be graded' : 'No submissions yet'}>
                    {status === 'submitted' ? 'When students hand in an assignment, it shows up here and you get a notification.' : 'Add an Assignment lesson to a course to collect work from students.'}
                </EmptyState>
            ) : (
                <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                    {rows.map((s) => (
                        <li key={s.id}>
                            <button type="button" onClick={() => setCurrent(s)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-paper">
                                <Avatar name={s.user?.name} size={38} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-bold text-graphite">{s.user?.name}</p>
                                    <p className="truncate text-sm text-pencil">{s.lesson?.title}{showCourse && s.course ? ` — ${s.course.title}` : ''}</p>
                                </div>
                                <span className="hidden text-sm text-pencil sm:block">{relative(s.submitted_at)}</span>
                                {s.status === 'graded'
                                    ? <Badge tone="success">{s.grade}/{s.lesson?.max_points}</Badge>
                                    : <Badge tone="warning" dot>To grade</Badge>}
                                <Icon name="chevronRight" size={18} className="text-pencil" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <GradeDialog tenant={tenant} submission={current} onClose={() => setCurrent(null)}
                onSaved={() => { setCurrent(null); toast('Grade saved and sent to the student'); load(); }} />
        </div>
    );
}

function GradeDialog({ tenant, submission: s, onClose, onSaved }) {
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const max = s?.lesson?.max_points ?? 100;

    useEffect(() => {
        if (s) { setGrade(s.grade ?? ''); setFeedback(s.feedback ?? ''); setError(null); }
    }, [s]);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api(`submissions/${s.id}`, { method: 'PATCH', tenant, body: { grade: Number(grade), feedback: feedback || null } });
            onSaved();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={!!s} onClose={onClose} size="lg" title={s ? `${s.user?.name} — ${s.lesson?.title}` : ''}
            description={s ? `Handed in ${dateTime(s.submitted_at)}` : ''}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save} disabled={grade === ''}>{s?.status === 'graded' ? 'Update grade' : 'Save grade'}</Button></>}>
            {s && (
                <div className="space-y-5">
                    {s.body && <div className="max-h-72 overflow-y-auto rounded-xl border border-rule bg-paper p-4 whitespace-pre-line text-graphite">{s.body}</div>}
                    {s.file_path && (
                        <a href={s.file_path} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-rule p-3 font-bold text-ink hover:bg-ink-50">
                            <Icon name="file" size={20} /> Open attached file <Icon name="external" size={16} className="ml-auto" />
                        </a>
                    )}
                    <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                        <Field label={`Grade (out of ${max})`} name="grade" error={error} type="number" min={0} max={max} value={grade} onChange={(e) => setGrade(e.target.value)} />
                        <Field label="Feedback" name="feedback" error={error} as="textarea" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What went well, and what to work on" />
                    </div>
                    {s.lesson && <Link to={`/${tenant}/learn/${s.lesson.course_id}/${s.lesson.id}`} className="text-sm font-bold text-ink hover:underline">View the assignment</Link>}
                </div>
            )}
        </Modal>
    );
}
