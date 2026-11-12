import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import RichText from '../../components/RichText';
import { Button, EmptyState, Field, PageHeader, Skeleton, useToast } from '../../components/ui';
import { api } from '../../lib/api';

const TOOLS = {
    lesson_plan: { label: 'Lesson plan', icon: 'book', hint: 'Objectives, activities with timings, checks and homework.', topic: 'What is the lesson about?' },
    quiz: { label: 'Quiz questions', icon: 'quiz', hint: 'Multiple-choice questions with an answer key.', topic: 'Topic', count: true },
    worksheet: { label: 'Worksheet', icon: 'file', hint: 'Practice questions that build in difficulty.', topic: 'Topic', count: true },
    homework: { label: 'Homework', icon: 'diary', hint: 'A 20–30 minute task students can do alone.', topic: 'Topic' },
    rubric: { label: 'Marking rubric', icon: 'clipboard', hint: 'Four criteria × four levels.', topic: 'Assignment' },
    report_comment: { label: 'Report comments', icon: 'message', hint: 'Warm, specific comments with a next step.', topic: 'What should the comment say about the student? (no names needed)' },
    announcement: { label: 'Announcement', icon: 'flag', hint: 'A short, clear notice for families.', topic: 'What is it about?' },
    explain: { label: 'Explain a topic', icon: 'sparkle', hint: 'A step-by-step explanation for students.', topic: 'What should be explained?' },
    tutor: { label: 'Help me understand', icon: 'sparkle', hint: 'A patient tutor that explains step by step.', topic: 'What are you stuck on?' },
    child_summary: { label: 'My child’s week', icon: 'family', hint: 'A plain-language summary from attendance, homework and the diary.' },
};

export default function Assistant() {
    const { tenant, isParent } = useOutletContext();
    const toast = useToast();
    const [status, setStatus] = useState(null);
    const [tool, setTool] = useState(null);
    const [f, setF] = useState({ subject: '', grade: '', topic: '', details: '', count: 10 });
    const [busy, setBusy] = useState(false);
    const [out, setOut] = useState('');
    const [error, setError] = useState(null);
    const [kids, setKids] = useState([]);
    const [kid, setKid] = useState('');

    useEffect(() => {
        api('school/ai', { tenant }).then((s) => { setStatus(s); setTool(s.tools[0]); });
        if (isParent) api('school/family', { tenant }).then((r) => { setKids(r.children); setKid(r.children[0]?.id ?? ''); }).catch(() => {});
    }, [tenant, isParent]);

    async function go(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        setOut('');
        try {
            const r = await api('school/ai', { method: 'POST', tenant, body: { tool, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), count: TOOLS[tool].count ? Number(f.count) : null, student_id: tool === 'child_summary' && kid ? Number(kid) : null } });
            setOut(r.text);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        try { await navigator.clipboard.writeText(out); toast('Copied'); } catch { /* blocked */ }
    }

    if (!status) return <Skeleton className="h-72 rounded-2xl" />;
    if (!status.enabled) return <><PageHeader title="AI assistant" /><div className="mt-6"><EmptyState icon="sparkle" title="The AI assistant isn’t switched on yet">It needs to be set up by the platform owner. Once it is, teachers can draft lesson plans and quizzes here, and students get a step-by-step tutor.</EmptyState></div></>;
    const t = TOOLS[tool];

    return (
        <div>
            <PageHeader title="AI assistant" description="Drafts to save you time. Always read and adjust before you use them." />
            <div className="mt-6 flex flex-wrap gap-2">
                {status.tools.map((k) => (
                    <button key={k} type="button" aria-pressed={tool === k} onClick={() => { setTool(k); setOut(''); setError(null); }}
                        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold ring-1 transition ${tool === k ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule hover:ring-ink/40'}`}>
                        <Icon name={TOOLS[k].icon} size={16} />{TOOLS[k].label}
                    </button>
                ))}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                <form onSubmit={go} className="space-y-4 self-start rounded-2xl border border-rule bg-white p-5">
                    <p className="text-pencil">{t.hint}</p>
                    {tool === 'child_summary' ? (
                        kids.length > 1 && <Field label="Child" as="select" value={kid} onChange={(e) => setKid(e.target.value)}>{kids.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
                    ) : (
                        <>
                            {!['tutor', 'announcement', 'child_summary'].includes(tool) && (
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Science" />
                                    <Field label="Class / level" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} placeholder="Grade 4" />
                                </div>
                            )}
                            <Field label={t.topic} name="topic" as="textarea" rows={3} error={error} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
                            {t.count && <Field label="How many questions" type="number" min="1" max="30" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} className="w-40" />}
                            <Field label="Anything else? (optional)" as="textarea" rows={2} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder="Length, difficulty, curriculum, students who need support…" />
                        </>
                    )}
                    <Button type="submit" icon="sparkle" busy={busy} className="w-full">Draft it</Button>
                    {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                </form>
                <section className="min-h-72 rounded-2xl border border-rule bg-white p-6">
                    {busy ? (
                        <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /><p className="pt-2 text-sm text-pencil">Writing your draft…</p></div>
                    ) : out ? (
                        <>
                            <div className="mb-4 flex justify-end gap-2 print:hidden"><Button size="sm" variant="secondary" icon="copy" onClick={copy}>Copy</Button><Button size="sm" variant="ghost" icon="printer" onClick={() => window.print()}>Print</Button></div>
                            <RichText text={out} />
                            <p className="mt-6 border-t border-rule pt-3 text-xs text-pencil">AI-generated draft. Check facts and suitability before sharing.</p>
                        </>
                    ) : <p className="grid h-full place-items-center text-center text-pencil">Your draft will appear here.</p>}
                </section>
            </div>
        </div>
    );
}
