import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { date } from '../lib/format';
import Icon from './Icon';
import { Badge, Button, Progress, Skeleton } from './ui';

/** Intro → one question at a time → result with review. */
export default function QuizRunner({ quizId, tenant, canTake, onProgress }) {
    const [quiz, setQuiz] = useState(null);
    const [run, setRun] = useState(null); // { attempt_id, ends_at, questions }
    const [answers, setAnswers] = useState({});
    const [step, setStep] = useState(0);
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const loadQuiz = () => api(`quizzes/${quizId}`, { tenant }).then(setQuiz).catch(setError);
    useEffect(() => { loadQuiz(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [quizId]);

    async function start() {
        setBusy(true);
        setError(null);
        try {
            const r = await api(`quizzes/${quizId}/start`, { method: 'POST', tenant });
            setRun(r);
            setAnswers({});
            setStep(0);
            setResult(null);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    async function submit() {
        setBusy(true);
        try {
            const r = await api(`quiz-attempts/${run.attempt_id}/submit`, { method: 'POST', tenant, body: { answers } });
            setResult(r);
            setRun(null);
            loadQuiz();
            onProgress?.(r.progress);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    if (!quiz) return error ? <p className="text-margin">{error.message}</p> : <Skeleton className="h-56 rounded-2xl" />;

    if (run) {
        const q = run.questions[step];
        const chosen = answers[q.id] ?? [];
        const answered = run.questions.filter((x) => (answers[x.id] ?? []).length).length;
        const choose = (optionId) => {
            const next = q.type === 'multiple'
                ? (chosen.includes(optionId) ? chosen.filter((i) => i !== optionId) : [...chosen, optionId])
                : [optionId];
            setAnswers({ ...answers, [q.id]: next });
        };
        const last = step === run.questions.length - 1;

        return (
            <div className="rounded-2xl border border-rule bg-white">
                <div className="flex items-center gap-4 border-b border-rule px-5 py-4 sm:px-6">
                    <span className="text-sm font-bold text-pencil tabular-nums">Question {step + 1} of {run.questions.length}</span>
                    <Progress value={((step + 1) / run.questions.length) * 100} className="flex-1" label="Quiz progress" />
                    {run.ends_at && <Countdown endsAt={run.ends_at} onEnd={submit} />}
                </div>
                <div className="margin-line px-5 py-6 pl-7 sm:px-8 sm:pl-10">
                    <p className="text-xl leading-snug font-bold text-ink-deep whitespace-pre-line">{q.question}</p>
                    <p className="mt-1 text-sm text-pencil">{q.type === 'multiple' ? 'Choose all that apply' : 'Choose one answer'} · {q.points} {q.points === 1 ? 'point' : 'points'}</p>
                    <div className="mt-5 grid gap-2" role={q.type === 'multiple' ? 'group' : 'radiogroup'} aria-label="Answers">
                        {q.options.map((o, i) => {
                            const on = chosen.includes(o.id);
                            return (
                                <button key={o.id} type="button" role={q.type === 'multiple' ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => choose(o.id)}
                                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-[17px] transition ${on ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule bg-white text-graphite hover:border-ink/40'}`}>
                                    <span className={`grid h-7 w-7 shrink-0 place-items-center text-sm font-bold ${q.type === 'multiple' ? 'rounded-md' : 'rounded-full'} ${on ? 'bg-ink text-white' : 'bg-ink-50 text-ink'}`}>
                                        {on ? <Icon name="check" size={15} strokeWidth={3} /> : String.fromCharCode(65 + i)}
                                    </span>
                                    {o.text}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-4 sm:px-6">
                    <Button variant="ghost" icon="chevronLeft" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
                    <div className="hidden gap-1.5 sm:flex" aria-hidden>
                        {run.questions.map((x, i) => (
                            <button key={x.id} type="button" tabIndex={-1} onClick={() => setStep(i)}
                                className={`h-2.5 w-2.5 rounded-full ${i === step ? 'bg-margin' : (answers[x.id] ?? []).length ? 'bg-ink' : 'bg-rule'}`} />
                        ))}
                    </div>
                    {last ? (
                        <Button busy={busy} icon="check" onClick={submit}>Submit {answered < run.questions.length ? `(${answered}/${run.questions.length})` : ''}</Button>
                    ) : (
                        <Button iconRight="chevronRight" onClick={() => setStep(step + 1)}>Next</Button>
                    )}
                </div>
            </div>
        );
    }

    if (result) return <Result quiz={quiz} result={result} questions={result.review} onRetry={quiz.attempts_left === 0 ? null : start} busy={busy} />;

    const best = quiz.attempts.reduce((b, a) => (b === null || a.percentage > b.percentage ? a : b), null);

    return (
        <div className="rounded-2xl border border-rule bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
                {quiz.passed ? <Badge tone="published" dot>Passed</Badge> : quiz.attempts.length ? <Badge tone="trial" dot>Not passed yet</Badge> : null}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Questions" value={quiz.questions_count} />
                <Fact label="Pass mark" value={`${quiz.pass_percentage}%`} />
                <Fact label="Time" value={quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : 'No limit'} />
                <Fact label="Attempts" value={quiz.max_attempts ? `${quiz.attempts.length} of ${quiz.max_attempts}` : quiz.attempts.length || 'Unlimited'} />
            </dl>
            {best && (
                <p className="mt-5 rounded-xl bg-paper px-4 py-3 text-graphite">
                    Best score <strong className="text-ink-deep">{Math.round(best.percentage)}%</strong> ({best.score}/{best.max_score}) on {date(best.submitted_at)}
                </p>
            )}
            {error && <p className="mt-4 text-margin" role="alert">{error.message}</p>}
            <div className="mt-6">
                {!canTake && !quiz.can_manage ? (
                    <p className="text-pencil">Enrol in the course to take this quiz.</p>
                ) : quiz.questions_count === 0 ? (
                    <p className="text-pencil">This quiz doesn’t have questions yet.</p>
                ) : quiz.attempts_left === 0 ? (
                    <p className="text-pencil">You’ve used all your attempts.</p>
                ) : (
                    <Button size="lg" busy={busy} icon="play" onClick={start}>{quiz.attempts.length ? 'Try again' : 'Start quiz'}</Button>
                )}
            </div>
        </div>
    );
}

function Fact({ label, value }) {
    return (
        <div>
            <dt className="text-sm text-pencil">{label}</dt>
            <dd className="font-display text-xl font-bold text-ink-deep">{value}</dd>
        </div>
    );
}

function Countdown({ endsAt, onEnd }) {
    const [left, setLeft] = useState(() => Math.max(0, Math.floor((new Date(endsAt) - Date.now()) / 1000)));
    useEffect(() => {
        const t = setInterval(() => {
            const s = Math.max(0, Math.floor((new Date(endsAt) - Date.now()) / 1000));
            setLeft(s);
            if (s === 0) { clearInterval(t); onEnd(); }
        }, 1000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endsAt]);
    const h = Math.floor(left / 3600);
    const m = h ? String(Math.floor((left % 3600) / 60)).padStart(2, '0') : Math.floor(left / 60);
    const s = String(left % 60).padStart(2, '0');
    return (
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${left < 60 ? 'bg-margin/10 text-margin' : 'bg-ink-50 text-ink-deep'}`} aria-live="off">
            <Icon name="clock" size={15} />{h ? `${h}:` : ''}{m}:{s}
        </span>
    );
}

function Result({ quiz, result, onRetry, busy }) {
    const a = result.attempt;
    return (
        <div className="space-y-5">
            <div className={`rounded-2xl p-6 sm:p-8 ${a.passed ? 'bg-leaf-50 ring-1 ring-leaf/20' : 'bg-white ring-1 ring-rule'}`}>
                <p className={`flex items-center gap-2 font-bold ${a.passed ? 'text-leaf' : 'text-margin'}`}>
                    <Icon name={a.passed ? 'check' : 'alert'} size={20} strokeWidth={2.4} />{a.passed ? 'Passed' : 'Not passed this time'}
                </p>
                <p className="mt-2 font-display text-5xl font-extrabold text-ink-deep tabular-nums">{Math.round(a.percentage)}%</p>
                <p className="mt-1 text-pencil">{a.score} of {a.max_score} points · pass mark {quiz.pass_percentage}%</p>
                {!a.passed && onRetry && <Button className="mt-5" busy={busy} onClick={onRetry}>Try again</Button>}
            </div>
            <ReviewList review={result.review} />
        </div>
    );
}

function ReviewList({ review }) {
    const wrong = review.filter((r) => !r.is_correct).length;
    const explained = review.map((r, i) => ({ ...r, n: i + 1 })).filter((r) => r.explanation);
    return (
        <div className="space-y-2">
            <p className="text-pencil">
                {wrong === 0 ? 'Every answer was correct.' : `${wrong} ${wrong === 1 ? 'answer was' : 'answers were'} wrong.`}
                {explained.length > 0 && ' Notes from your teacher:'}
            </p>
            {explained.map((r) => (
                <div key={r.question_id} className="flex gap-3 rounded-xl bg-white p-3 text-graphite ring-1 ring-rule">
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${r.is_correct ? 'bg-leaf text-white' : 'bg-margin/10 text-margin'}`}>
                        <Icon name={r.is_correct ? 'check' : 'x'} size={13} strokeWidth={3} />
                    </span>
                    <span><strong>Question {r.n}.</strong> {r.explanation}</span>
                </div>
            ))}
        </div>
    );
}
