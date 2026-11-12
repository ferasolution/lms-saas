import { useCallback, useEffect, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { date, dateTime } from '../lib/format';
import Icon from '../components/Icon';
import { Badge, Button, Field, Modal, PageHeader, Progress, Skeleton, useToast } from '../components/ui';

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const METHODS = [['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['bank', 'Bank transfer']];
const storage = (mb) => (mb === null || mb === undefined ? 'Unlimited' : mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);

export default function Billing() {
    const { tenant, isAdmin } = useOutletContext();
    const toast = useToast();
    const [data, setData] = useState(null);
    const [choosing, setChoosing] = useState(null);

    const load = useCallback(() => api('billing', { tenant }).then(setData), [tenant]);
    useEffect(() => { if (isAdmin) load(); }, [load, isAdmin]);

    if (!isAdmin) return <Navigate to={`/${tenant}`} replace />;
    if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-60" /><Skeleton className="h-48 rounded-2xl" /></div>;

    const { current, usage } = data;
    const pending = data.history.find((h) => h.status === 'pending');
    const lastRejected = data.history[0]?.status === 'rejected' ? data.history[0] : null;
    const meters = [
        ['Students', usage.students, current.plan?.max_students],
        ['Courses', usage.courses, current.plan?.max_courses],
        ['Storage', usage.storage_mb, current.plan?.storage_mb, (v) => `${v} MB`],
    ];

    return (
        <div>
            <PageHeader title="Billing" description="Your plan, what you’re using, and upgrades." />

            {pending && (
                <div className="mt-6 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-600/20">
                    <Icon name="clock" size={18} className="mt-0.5" />
                    <p>Your payment for <strong>{pending.plan?.name}</strong> ({usd(pending.amount)}, ref {pending.payment_reference}) is being checked. Your plan updates as soon as it’s approved.</p>
                </div>
            )}
            {lastRejected && !pending && (
                <div className="mt-6 flex items-start gap-3 rounded-xl bg-margin/5 px-4 py-3 text-margin ring-1 ring-margin/20">
                    <Icon name="alert" size={18} className="mt-0.5" />
                    <p>Your last payment (ref {lastRejected.payment_reference}) couldn’t be confirmed{lastRejected.note ? `: ${lastRejected.note}` : '.'} Please check and send it again.</p>
                </div>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <section className="margin-line rounded-2xl border border-rule bg-white p-6 pl-8">
                    <p className="text-sm font-bold text-pencil">Current plan</p>
                    <p className="mt-1 font-display text-4xl font-extrabold text-ink-deep">{current.plan?.name ?? 'Free'}</p>
                    <p className="mt-2 text-graphite">
                        {current.source === 'trial' && <>Free trial of everything until <strong>{date(current.ends_at)}</strong>. Then you move to the Free plan unless you upgrade.</>}
                        {current.source === 'paid' && <>Paid until <strong>{date(current.ends_at)}</strong>. Renew before then to keep your limits.</>}
                        {current.source === 'free' && <>Small groups can stay on Free for as long as they like.</>}
                    </p>
                    <p className="mt-4 text-sm text-pencil">Nothing is ever deleted when a plan ends. You just can’t add more than the Free plan allows.</p>
                </section>
                <section className="rounded-2xl border border-rule bg-white p-6">
                    <p className="text-sm font-bold text-pencil">Usage</p>
                    <div className="mt-4 space-y-5">
                        {meters.map(([label, used, max, fmt = (v) => v]) => {
                            const pct = max ? (used / max) * 100 : 0;
                            return (
                                <div key={label}>
                                    <div className="mb-1.5 flex justify-between"><span className="font-bold text-graphite">{label}</span><span className="text-pencil tabular-nums">{fmt(used)} of {max ? fmt(max) : 'unlimited'}</span></div>
                                    <Progress value={pct} label={label} />
                                    {pct >= 90 && <p className="mt-1 text-sm font-bold text-amber-700">{pct >= 100 ? 'Limit reached' : 'Almost at the limit'}</p>}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>

            <h2 className="mt-12 text-2xl font-bold">Plans</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
                {data.plans.map((p) => {
                    const isCurrent = current.source === 'paid' && current.plan?.id === p.id;
                    const free = Number(p.price_monthly) === 0;
                    return (
                        <article key={p.id} className={`flex flex-col rounded-2xl p-6 ${p.slug === 'basic' ? 'bg-ink-deep text-white' : 'border border-rule bg-white'}`}>
                            <div className="flex items-center justify-between">
                                <h3 className={`text-xl font-bold ${p.slug === 'basic' ? 'text-white' : ''}`}>{p.name}</h3>
                                {isCurrent && <Badge tone="published">Your plan</Badge>}
                            </div>
                            <p className="mt-3"><span className={`font-display text-4xl font-extrabold ${p.slug === 'basic' ? 'text-white' : 'text-ink-deep'}`}>{usd(p.price_monthly)}</span><span className={p.slug === 'basic' ? 'text-white/60' : 'text-pencil'}> / month</span></p>
                            <ul className={`mt-4 flex-1 space-y-2 ${p.slug === 'basic' ? 'text-white/85' : 'text-graphite'}`}>
                                <li>{p.max_students ? `Up to ${p.max_students.toLocaleString()} students` : 'Unlimited students'}</li>
                                <li>{p.max_courses ? `${p.max_courses} courses` : 'Unlimited courses'}</li>
                                <li>{storage(p.storage_mb)} storage</li>
                            </ul>
                            {!free && (
                                <Button className="mt-6 w-full" variant={p.slug === 'basic' ? 'secondary' : 'primary'} disabled={!!pending} onClick={() => setChoosing(p)}>
                                    {isCurrent ? 'Renew' : `Upgrade to ${p.name}`}
                                </Button>
                            )}
                        </article>
                    );
                })}
            </div>

            {data.history.length > 0 && (
                <>
                    <h2 className="mt-12 text-2xl font-bold">Payment history</h2>
                    <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {data.history.map((h) => (
                            <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                                <span className="min-w-0 flex-1 font-bold text-graphite">{h.plan?.name} × {h.months} month{h.months > 1 ? 's' : ''}</span>
                                <span className="text-sm text-pencil">{dateTime(h.created_at)}</span>
                                <span className="font-mono text-sm">{h.payment_reference}</span>
                                <span className="w-20 text-right font-bold text-ink-deep">{usd(h.amount)}</span>
                                {h.status === 'active' ? <Badge tone="published" dot>Approved</Badge> : h.status === 'pending' ? <Badge tone="trial" dot>Checking</Badge> : <Badge tone="danger" dot>Not confirmed</Badge>}
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <PayDialog plan={choosing} payTo={data.pay_to} tenant={tenant} onClose={() => setChoosing(null)}
                onDone={() => { setChoosing(null); toast('Payment sent for approval'); load(); }} />
        </div>
    );
}

function PayDialog({ plan, payTo, tenant, onClose, onDone }) {
    const available = METHODS.filter(([m]) => payTo?.[m]);
    const [months, setMonths] = useState(1);
    const [method, setMethod] = useState('');
    const [reference, setReference] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (plan) { setMonths(1); setMethod(available[0]?.[0] ?? 'jazzcash'); setReference(''); setError(null); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan]);

    if (!plan) return null;
    const total = Number(plan.price_monthly) * months;

    async function submit(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('billing/subscribe', { method: 'POST', tenant, body: { plan_id: plan.id, months, payment_method: method, payment_reference: reference } });
            onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={`Upgrade to ${plan.name}`} description="Pay Fera Learn directly, then send us the transaction ID."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={submit} disabled={!available.length}>Send payment details</Button></>}>
            {!available.length ? (
                <p className="text-graphite">Payment details aren’t set up yet. Please contact Fera Solution to upgrade.</p>
            ) : (
                <form onSubmit={submit} className="space-y-5" noValidate>
                    <div>
                        <p className="mb-2 font-bold text-graphite">1. How long?</p>
                        <div className="grid grid-cols-4 gap-2">
                            {[1, 3, 6, 12].map((m) => (
                                <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m}
                                    className={`rounded-lg border py-2 font-bold transition ${months === m ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule text-pencil hover:border-ink/30'}`}>
                                    {m} mo
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="mb-2 font-bold text-graphite">2. Send <span className="text-ink-deep">{usd(total)}</span> by</p>
                        <div className="grid grid-cols-3 gap-2">
                            {available.map(([m, l]) => (
                                <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
                                    className={`rounded-lg border py-2 text-sm font-bold transition ${method === m ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule text-pencil hover:border-ink/30'}`}>{l}</button>
                            ))}
                        </div>
                        <div className="mt-2 rounded-xl bg-ink-50 px-4 py-3">
                            <p className="font-bold whitespace-pre-line text-ink-deep">{payTo[method]}</p>
                            {payTo.instructions && <p className="mt-1 text-sm whitespace-pre-line text-pencil">{payTo.instructions}</p>}
                        </div>
                    </div>
                    <Field label="3. Transaction ID" name="payment_reference" error={error} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 0123456789" />
                    {error && !Object.keys(error.errors).length && <p className="text-margin">{error.message}</p>}
                </form>
            )}
        </Modal>
    );
}
