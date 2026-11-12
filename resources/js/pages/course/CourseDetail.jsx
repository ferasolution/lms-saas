import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { coursePrice, dateTime, duration, LESSON_TYPES, money, PAYMENT_METHODS, titleCase } from '../../lib/format';
import Stars from '../../components/Stars';
import CourseReviews from '../../components/CourseReviews';
import Announcements from '../../components/Announcements';
import Icon from '../../components/Icon';
import CourseCover from '../../components/CourseCover';
import RichText from '../../components/RichText';
import { Badge, Button, Field, Modal, Progress, useToast } from '../../components/ui';

/** What a student sees before and after enrolling. */
export default function CourseDetail({ data, reload, tenant, me }) {
    const navigate = useNavigate();
    const toast = useToast();
    const { course, sections, stats, enrollment, pending_order: pending, certificate } = data;
    const price = coursePrice(course);
    const [busy, setBusy] = useState(false);
    const [paying, setPaying] = useState(false);
    const [open, setOpen] = useState(() => new Set(sections.slice(0, 2).map((s) => s.id)));
    const enrolled = enrollment && enrollment.status !== 'cancelled';
    const firstOpen = sections.flatMap((s) => s.lessons).find((l) => !l.completed && !l.locked) ?? sections[0]?.lessons[0];
    const learn = (lessonId) => navigate(`/${tenant}/learn/${course.id}${lessonId ? `/${lessonId}` : ''}`);
    const points = (course.what_you_learn ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

    async function enrolFree() {
        setBusy(true);
        try {
            await api(`courses/${course.id}/enrol`, { method: 'POST', tenant });
            toast('You’re enrolled. Enjoy the course!');
            learn(firstOpen?.id);
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const action = (
        <div className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
            {enrolled ? (
                <>
                    <p className="text-sm font-bold text-pencil">{enrollment.status === 'completed' ? 'Completed' : 'Your progress'}</p>
                    <div className="mt-2 flex items-center gap-3">
                        <Progress value={enrollment.progress_percent} className="flex-1" label="Course progress" />
                        <span className="font-display text-lg font-bold text-ink-deep tabular-nums">{enrollment.progress_percent}%</span>
                    </div>
                    <Button size="lg" className="mt-5 w-full" iconRight="arrowRight" onClick={() => learn(firstOpen?.id)}>
                        {enrollment.progress_percent === 0 ? 'Start learning' : enrollment.status === 'completed' ? 'Review course' : 'Continue learning'}
                    </Button>
                    {certificate && (
                        <Button variant="secondary" className="mt-2 w-full" icon="award" as={Link} to={`/${tenant}/certificates/${certificate.code}`}>View certificate</Button>
                    )}
                </>
            ) : pending ? (
                <>
                    <Badge tone="trial" dot>Payment being checked</Badge>
                    <p className="mt-3 text-graphite">We received your payment details (reference <strong>{pending.payment_reference}</strong>). You’ll get access as soon as the institute confirms it.</p>
                    <Button variant="secondary" className="mt-4 w-full" onClick={() => setPaying(true)}>Update payment details</Button>
                </>
            ) : (
                <>
                    <p className="flex items-baseline gap-2">
                        <span className="font-display text-3xl font-extrabold text-ink-deep">{price.now}</span>
                        {price.was && <span className="text-pencil line-through">{price.was}</span>}
                    </p>
                    {price.free ? (
                        <Button size="lg" className="mt-5 w-full" busy={busy} onClick={enrolFree}>Enrol for free</Button>
                    ) : (
                        <Button size="lg" className="mt-5 w-full" onClick={() => setPaying(true)}>Buy this course</Button>
                    )}
                </>
            )}
            <ul className="mt-5 space-y-2.5 border-t border-rule pt-5 text-[15px] text-graphite">
                <li className="flex items-center gap-3"><Icon name="layers" size={18} className="text-pencil" />{stats.lessons} lessons</li>
                {duration(stats.duration_seconds) && <li className="flex items-center gap-3"><Icon name="clock" size={18} className="text-pencil" />{duration(stats.duration_seconds)} in total</li>}
                <li className="flex items-center gap-3"><Icon name="flag" size={18} className="text-pencil" />{titleCase(course.level)} level</li>
                {course.certificate_enabled && <li className="flex items-center gap-3"><Icon name="award" size={18} className="text-pencil" />Certificate when you finish</li>}
                <li className="flex items-center gap-3"><Icon name="phone" size={18} className="text-pencil" />Works on phone and computer</li>
            </ul>
        </div>
    );

    return (
        <div>
            <Link to={`/${tenant}/courses`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-pencil hover:text-ink">
                <Icon name="arrowLeft" size={16} />All courses
            </Link>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="min-w-0">
                    <CourseCover course={course} className="aspect-[16/7] w-full rounded-2xl" />
                    <h1 className="mt-6 text-3xl leading-tight font-extrabold sm:text-4xl">{course.title}</h1>
                    {course.short_description && <p className="mt-3 text-lg text-pencil">{course.short_description}</p>}
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-graphite">
                        {course.instructor && <p>Taught by <strong>{course.instructor.name}</strong></p>}
                        {course.rating ? (
                            <a href="#reviews" className="flex items-center gap-2 hover:underline">
                                <Stars value={course.rating} size={16} /><strong>{course.rating.toFixed(1)}</strong>
                                <span className="text-pencil">({course.reviews_count} {course.reviews_count === 1 ? 'review' : 'reviews'})</span>
                            </a>
                        ) : null}
                        {course.category && <span className="rounded-full bg-ink-50 px-3 py-0.5 text-sm font-bold text-ink">{course.category.name}</span>}
                    </div>

                    <div className="mt-6 lg:hidden">{action}</div>

                    {enrolled && (
                        <div className="mt-8">
                            <Announcements tenant={tenant} courseId={course.id} title="Course announcements" limit={3} compact />
                        </div>
                    )}

                    {points.length > 0 && (
                        <section className="ruled-faint mt-8 rounded-2xl border border-rule bg-white p-5 sm:p-6">
                            <h2 className="text-xl font-bold">What you’ll learn</h2>
                            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                                {points.map((p) => (
                                    <li key={p} className="flex gap-3 text-graphite"><Icon name="check" size={20} className="mt-0.5 text-leaf" strokeWidth={2.4} />{p}</li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {course.description && (
                        <section className="mt-8">
                            <h2 className="text-xl font-bold">About this course</h2>
                            <RichText text={course.description} className="mt-3" />
                        </section>
                    )}

                    <section className="mt-8">
                        <div className="flex items-baseline justify-between gap-4">
                            <h2 className="text-xl font-bold">Course outline</h2>
                            <p className="text-sm text-pencil">{sections.length} sections · {stats.lessons} lessons</p>
                        </div>
                        <div className="mt-4 overflow-hidden rounded-2xl border border-rule bg-white">
                            {sections.map((s, i) => (
                                <div key={s.id} className={i ? 'border-t border-rule' : ''}>
                                    <button type="button" onClick={() => toggle(s.id)} aria-expanded={open.has(s.id)}
                                        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-paper/60">
                                        <Icon name={open.has(s.id) ? 'chevronUp' : 'chevronDown'} size={18} className="text-pencil" />
                                        <span className="flex-1 font-bold text-ink-deep">{s.title}</span>
                                        <span className="text-sm text-pencil">{s.lessons.length} lessons</span>
                                    </button>
                                    {open.has(s.id) && (
                                        <ul className="border-t border-rule bg-paper/40 py-1">
                                            {s.lessons.map((l) => {
                                                const t = LESSON_TYPES[l.type] ?? LESSON_TYPES.text;
                                                const canOpen = !l.locked;
                                                return (
                                                    <li key={l.id}>
                                                        <button type="button" disabled={!canOpen} onClick={() => learn(l.id)}
                                                            className="flex w-full items-center gap-3 px-5 py-2.5 text-left enabled:hover:bg-white disabled:cursor-default">
                                                            {l.completed
                                                                ? <span className="grid h-6 w-6 place-items-center rounded-full bg-leaf text-white"><Icon name="check" size={14} strokeWidth={3} /></span>
                                                                : <Icon name={t.icon} size={18} className="mx-[3px] text-pencil" />}
                                                            <span className={`min-w-0 flex-1 truncate ${canOpen ? 'text-graphite' : 'text-pencil'}`}>{l.title}</span>
                                                            {l.is_preview && !enrolled && <span className="text-sm font-bold text-ink">Preview</span>}
                                                            {l.locked && l.locked_reason?.startsWith('drip:') && <span className="text-sm text-pencil">Opens {dateTime(l.locked_reason.slice(5))}</span>}
                                                            {duration(l.duration_seconds) && <span className="text-sm text-pencil">{duration(l.duration_seconds)}</span>}
                                                            {l.locked && <Icon name="lock" size={16} className="text-pencil" />}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="mt-10">
                        <CourseReviews tenant={tenant} courseId={course.id} onChange={reload} />
                    </div>
                </div>

                <aside className="hidden lg:block">
                    <div className="sticky top-6">{action}</div>
                </aside>
            </div>

            <PaymentDialog open={paying} onClose={() => setPaying(false)} course={course} price={price} tenant={tenant} me={me} pending={pending}
                onDone={(r) => {
                    setPaying(false);
                    if (r?.status === 'enrolled') { toast('Code applied — you’re enrolled!'); learn(firstOpen?.id); return; }
                    toast('Payment details sent');
                    reload();
                }} />
        </div>
    );
}

function PaymentDialog({ open, onClose, course, price, tenant, me, pending, onDone }) {
    const pay = me?.tenant?.settings?.payments ?? {};
    const configured = ['bank', 'paypal', 'wise', 'card'].filter((k) => pay[k]);
    const available = (configured.length ? configured : ['other']).map((k) => ({ value: k, label: PAYMENT_METHODS[k].label }));
    const [method, setMethod] = useState(available[0]?.value ?? 'other');
    const [reference, setReference] = useState(pending?.payment_reference ?? '');
    const [note, setNote] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [code, setCode] = useState('');
    const [coupon, setCoupon] = useState(null);
    const [codeError, setCodeError] = useState(null);
    const [checking, setChecking] = useState(false);
    const free = coupon && coupon.total <= 0;
    const amount = coupon ? money(coupon.total, course.currency) : price.now;

    async function applyCode() {
        if (!code.trim()) return;
        setChecking(true);
        setCodeError(null);
        try {
            setCoupon(await api(`courses/${course.id}/coupon-check`, { method: 'POST', tenant, body: { code } }));
        } catch (err) {
            setCoupon(null);
            setCodeError(err.message);
        } finally {
            setChecking(false);
        }
    }

    async function submit(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const body = free
                ? { coupon: coupon.code }
                : { payment_method: method, payment_reference: reference, note: note || null, ...(coupon ? { coupon: coupon.code } : {}) };
            const r = await api(`courses/${course.id}/enrol`, { method: 'POST', tenant, body });
            onDone(r);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const account = method === 'other' ? null : pay[method];
    const support = me?.tenant?.settings?.support_email || me?.tenant?.settings?.support_phone;

    return (
        <Modal open={open} onClose={onClose} title="Pay for this course" description={`${course.title} · ${amount}`}
            footer={<>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button busy={busy} onClick={submit}>{free ? 'Enrol now' : 'Send payment details'}</Button>
            </>}>
            <form onSubmit={submit} className="space-y-5" noValidate>
                <div className="rounded-xl border border-dashed border-rule p-3">
                    {coupon ? (
                        <div className="flex items-center gap-3">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-leaf-50 text-leaf"><Icon name="tag" size={16} /></span>
                            <p className="flex-1 text-graphite"><strong>{coupon.code}</strong> applied — you save {money(coupon.discount, course.currency)}</p>
                            <button type="button" onClick={() => { setCoupon(null); setCode(''); }} className="text-sm font-bold text-pencil hover:text-margin">Remove</button>
                        </div>
                    ) : (
                        <div className="flex items-start gap-2">
                            <div className="flex-1">
                                <label className="sr-only" htmlFor="coupon-code">Discount code</label>
                                <input id="coupon-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Have a discount code?"
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } }}
                                    className="h-10 w-full rounded-lg border border-rule px-3 tracking-wide uppercase placeholder:normal-case placeholder:tracking-normal focus:border-ink focus:outline-none" />
                                {(codeError || error?.errors?.coupon) && <p className="mt-1 text-sm text-margin">{codeError || error.errors.coupon[0]}</p>}
                            </div>
                            <Button type="button" variant="secondary" size="sm" className="h-10" busy={checking} onClick={applyCode} disabled={!code.trim()}>Apply</Button>
                        </div>
                    )}
                </div>
                {free ? (
                    <p className="rounded-xl bg-leaf-50 px-4 py-3 text-graphite">This code covers the full price. Nothing to pay — just enrol.</p>
                ) : (
                <ol className="space-y-5">
                    <li>
                        <p className="font-bold text-graphite">1. Choose how you’ll pay</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {available.map((m) => (
                                <button key={m.value} type="button" onClick={() => setMethod(m.value)} aria-pressed={method === m.value}
                                    className={`h-11 rounded-lg border font-bold transition ${method === m.value ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule text-pencil hover:border-ink/30'}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </li>
                    <li>
                        <p className="font-bold text-graphite">2. Send <span className="text-ink-deep">{amount}</span></p>
                        <div className="mt-2 rounded-xl bg-ink-50 px-4 py-3 text-graphite">
                            {method === 'card' && account ? (
                                <a href={account} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-bold text-ink hover:underline">Pay by card<Icon name="external" size={16} /></a>
                            ) : account ? (
                                <p className="font-bold break-words whitespace-pre-line text-ink-deep">{account}</p>
                            ) : (
                                <p>Ask the institute how to pay{support ? ` (${support})` : ''}, then enter your receipt number below.</p>
                            )}
                            {pay.instructions && <p className="mt-2 text-sm whitespace-pre-line text-pencil">{pay.instructions}</p>}
                        </div>
                    </li>
                    <li>
                        <Field label="3. Transaction ID or receipt number" name="payment_reference" error={error} value={reference}
                            onChange={(e) => setReference(e.target.value)} placeholder="e.g. 5TY12345AB678901C" hint="From your bank, PayPal, Wise or card receipt. The institute uses it to find your payment." />
                    </li>
                </ol>
                )}
                {!free && <Field label="Message for the institute (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
                {error && !Object.keys(error.errors).length && <p className="text-margin" role="alert">{error.message}</p>}
            </form>
        </Modal>
    );
}
