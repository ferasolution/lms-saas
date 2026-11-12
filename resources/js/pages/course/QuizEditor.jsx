import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import Icon from '../../components/Icon';
import { Button, EmptyState, Field, IconButton, Skeleton, Toggle, useToast } from '../../components/ui';

const TYPES = [
    { value: 'single', label: 'One answer' },
    { value: 'multiple', label: 'Several answers' },
    { value: 'true_false', label: 'True or false' },
];

const blankQuestion = (type = 'single') => ({
    key: Math.random().toString(36).slice(2),
    type,
    question: '',
    explanation: '',
    points: 1,
    options: type === 'true_false'
        ? [{ text: 'True', is_correct: true }, { text: 'False', is_correct: false }]
        : [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }],
});

export default function QuizEditor() {
    const { tenant } = useOutletContext();
    const { id: courseId, quizId } = useParams();
    const toast = useToast();
    const [quiz, setQuiz] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        api(`quizzes/${quizId}`, { tenant }).then((q) => {
            setQuiz(q);
            setQuestions((q.questions ?? []).map((x) => ({ ...x, key: String(x.id), explanation: x.explanation ?? '' })));
        }).catch(setError);
    }, [quizId, tenant]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    if (error && !quiz) return <EmptyState icon="quiz" title="Quiz not found" />;
    if (!quiz) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 rounded-2xl" /></div>;

    const touch = () => setDirty(true);
    const setQuizField = (k, v) => { setQuiz((q) => ({ ...q, [k]: v })); touch(); };
    const update = (i, patch) => { setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q))); touch(); };

    function setType(i, type) {
        const q = questions[i];
        if (type === 'true_false') {
            update(i, { type, options: [{ text: 'True', is_correct: true }, { text: 'False', is_correct: false }] });
        } else if (type === 'single') {
            let seen = false;
            update(i, { type, options: q.options.map((o) => { const keep = o.is_correct && !seen; if (keep) seen = true; return { ...o, is_correct: keep }; }) });
        } else {
            update(i, { type });
        }
    }

    function markCorrect(i, oIndex) {
        const q = questions[i];
        const options = q.options.map((o, j) => (q.type === 'multiple'
            ? (j === oIndex ? { ...o, is_correct: !o.is_correct } : o)
            : { ...o, is_correct: j === oIndex }));
        update(i, { options });
    }

    function move(i, dir) {
        const next = [...questions];
        const t = i + dir;
        if (t < 0 || t >= next.length) return;
        [next[i], next[t]] = [next[t], next[i]];
        setQuestions(next);
        touch();
    }

    async function save() {
        setBusy(true);
        setError(null);
        try {
            const saved = await api(`quizzes/${quizId}`, {
                method: 'PUT', tenant, body: {
                    title: quiz.title,
                    pass_percentage: Number(quiz.pass_percentage) || 60,
                    time_limit_minutes: quiz.time_limit_minutes ? Number(quiz.time_limit_minutes) : null,
                    max_attempts: quiz.max_attempts ? Number(quiz.max_attempts) : null,
                    shuffle_questions: !!quiz.shuffle_questions,
                    questions: questions.map((q) => ({
                        type: q.type,
                        question: q.question,
                        explanation: q.explanation || null,
                        points: Number(q.points) || 1,
                        options: q.options.map((o) => ({ text: o.text, is_correct: !!o.is_correct })),
                    })),
                },
            });
            setQuiz(saved);
            setQuestions(saved.questions.map((x) => ({ ...x, key: String(x.id), explanation: x.explanation ?? '' })));
            setDirty(false);
            toast('Quiz saved');
        } catch (err) {
            setError(err);
            toast(err.errors && Object.keys(err.errors).length ? 'Some questions need fixing' : err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    const qError = (i, field) => error?.errors?.[`questions.${i}.${field}`]?.[0];
    const totalPoints = questions.reduce((n, q) => n + (Number(q.points) || 1), 0);

    return (
        <div className="pb-24">
            <Link to={`/${tenant}/courses/${courseId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-pencil hover:text-ink">
                <Icon name="arrowLeft" size={16} />Back to course
            </Link>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="min-w-0 space-y-5">
                    <input value={quiz.title} onChange={(e) => setQuizField('title', e.target.value)} aria-label="Quiz title"
                        className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 -ml-2 font-display text-3xl font-extrabold text-ink-deep hover:border-rule focus:border-ink focus:bg-white focus:outline-none" />

                    {questions.length === 0 && (
                        <EmptyState icon="quiz" title="Add your first question"
                            action={<Button icon="plus" onClick={() => { setQuestions([blankQuestion()]); touch(); }}>Add question</Button>}>
                            Questions are marked automatically. Students see their score straight away.
                        </EmptyState>
                    )}

                    {questions.map((q, i) => (
                        <section key={q.key} className="margin-line rounded-2xl border border-rule bg-white p-5 pl-7 sm:p-6 sm:pl-8">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="font-display text-lg font-bold text-ink-deep">Question {i + 1}</span>
                                <div className="flex items-center gap-1">
                                    <select value={q.type} onChange={(e) => setType(i, e.target.value)} aria-label="Question type"
                                        className="h-9 rounded-lg border border-rule bg-white px-2 text-sm font-bold text-graphite focus:border-ink focus:outline-none">
                                        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                    <IconButton icon="chevronUp" label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30" />
                                    <IconButton icon="chevronDown" label="Move down" onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="disabled:opacity-30" />
                                    <IconButton icon="trash" label="Delete question" onClick={() => { setQuestions(questions.filter((_, j) => j !== i)); touch(); }} />
                                </div>
                            </div>

                            <textarea value={q.question} onChange={(e) => update(i, { question: e.target.value })} rows={2} placeholder="Type the question"
                                aria-label={`Question ${i + 1} text`}
                                className={`mt-3 w-full rounded-lg border px-3 py-2.5 text-[17px] focus:ring-4 focus:outline-none ${qError(i, 'question') ? 'border-margin/60 focus:ring-margin/10' : 'border-rule focus:border-ink focus:ring-ink/10'}`} />
                            {qError(i, 'question') && <p className="mt-1 text-sm text-margin">{qError(i, 'question')}</p>}

                            <p className="mt-4 mb-2 text-sm font-bold text-pencil">
                                Answers <span className="font-normal">· {q.type === 'multiple' ? 'tick every correct answer' : 'select the correct answer'}</span>
                            </p>
                            <ul className="space-y-2">
                                {q.options.map((o, oi) => (
                                    <li key={oi} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${o.is_correct ? 'border-leaf/40 bg-leaf-50' : 'border-rule bg-white'}`}>
                                        <button type="button" onClick={() => markCorrect(i, oi)} aria-label={o.is_correct ? 'Correct answer' : 'Mark as correct'} aria-pressed={o.is_correct}
                                            className={`grid h-7 w-7 shrink-0 place-items-center border-2 transition ${q.type === 'multiple' ? 'rounded-md' : 'rounded-full'} ${o.is_correct ? 'border-leaf bg-leaf text-white' : 'border-rule text-transparent hover:border-leaf/60'}`}>
                                            <Icon name="check" size={15} strokeWidth={3} />
                                        </button>
                                        <input value={o.text} readOnly={q.type === 'true_false'} placeholder={`Answer ${oi + 1}`} aria-label={`Answer ${oi + 1}`}
                                            onChange={(e) => update(i, { options: q.options.map((x, j) => (j === oi ? { ...x, text: e.target.value } : x)) })}
                                            className="h-9 min-w-0 flex-1 bg-transparent px-1 focus:outline-none" />
                                        {q.type !== 'true_false' && q.options.length > 2 && (
                                            <IconButton icon="x" label="Remove answer" onClick={() => update(i, { options: q.options.filter((_, j) => j !== oi) })} />
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {qError(i, 'options') && <p className="mt-1.5 text-sm text-margin">{qError(i, 'options')}</p>}
                            {q.type !== 'true_false' && q.options.length < 10 && (
                                <button type="button" onClick={() => update(i, { options: [...q.options, { text: '', is_correct: false }] })}
                                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-ink hover:bg-ink-50">
                                    <Icon name="plus" size={16} />Add answer
                                </button>
                            )}

                            <div className="mt-4 grid gap-4 border-t border-rule pt-4 sm:grid-cols-[1fr_7rem]">
                                <Field label="Explanation (optional)" value={q.explanation} onChange={(e) => update(i, { explanation: e.target.value })}
                                    hint="Shown after the student answers." />
                                <Field label="Points" type="number" min="1" max="100" value={q.points} onChange={(e) => update(i, { points: e.target.value })} />
                            </div>
                        </section>
                    ))}

                    {questions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {TYPES.map((t) => (
                                <Button key={t.value} variant="secondary" icon="plus" onClick={() => { setQuestions([...questions, blankQuestion(t.value)]); touch(); }}>
                                    {t.label}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>

                <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                    <section className="space-y-4 rounded-2xl border border-rule bg-white p-5">
                        <h2 className="text-lg font-bold">Rules</h2>
                        <Field label="Pass mark (%)" type="number" min="1" max="100" value={quiz.pass_percentage ?? 60}
                            onChange={(e) => setQuizField('pass_percentage', e.target.value)} />
                        <Field label="Time limit (minutes)" type="number" min="1" value={quiz.time_limit_minutes ?? ''} placeholder="No limit"
                            onChange={(e) => setQuizField('time_limit_minutes', e.target.value)} />
                        <Field label="Attempts allowed" type="number" min="1" value={quiz.max_attempts ?? ''} placeholder="Unlimited"
                            onChange={(e) => setQuizField('max_attempts', e.target.value)} />
                        <Toggle label="Shuffle questions" hint="Each attempt gets a different order." checked={!!quiz.shuffle_questions}
                            onChange={(v) => setQuizField('shuffle_questions', v)} />
                    </section>
                    <section className="rounded-2xl border border-rule bg-white p-5 text-sm text-pencil">
                        <p><strong className="text-graphite">{questions.length}</strong> questions · <strong className="text-graphite">{totalPoints}</strong> points</p>
                        <p className="mt-1">Students need <strong className="text-graphite">{Math.ceil(totalPoints * (Number(quiz.pass_percentage) || 60) / 100)}</strong> points to pass. Passing completes this lesson.</p>
                    </section>
                </aside>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-white/95 backdrop-blur lg:left-[17rem]">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8 lg:px-12">
                    <p className="text-sm text-pencil">{dirty ? 'You have unsaved changes' : 'All changes saved'}</p>
                    <Button busy={busy} disabled={!dirty} onClick={save} icon="check">Save quiz</Button>
                </div>
            </div>
        </div>
    );
}
