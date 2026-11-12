import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { SectionSelect } from '../../components/school';
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, Modal, PageHeader, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, download } from '../../lib/api';
import { shortDate, today, useStructure } from '../../lib/school';
import { money, PAYMENT_METHODS, relative } from '../../lib/format';

const METHODS = { cash: 'Cash', bank: 'Bank transfer', card: 'Card', paypal: 'PayPal', wise: 'Wise', cheque: 'Cheque', other: 'Other' };
const FREQ = { monthly: 'Monthly', termly: 'Per term', annual: 'Yearly', once: 'One time' };

export function InvoiceStatus({ inv }) {
    if (inv.status === 'cancelled') return <Badge>Cancelled</Badge>;
    if (inv.status === 'paid') return <Badge tone="success">Paid</Badge>;
    if (inv.overdue) return <Badge tone="danger">Overdue</Badge>;
    if (inv.status === 'partial') return <Badge tone="warning">Part paid</Badge>;
    return <Badge tone="draft">Unpaid</Badge>;
}

export default function Fees() {
    const ctx = useOutletContext();
    return ctx.isOffice ? <OfficeFees {...ctx} /> : <FamilyFees {...ctx} />;
}

function OfficeFees({ tenant }) {
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || 'overview';
    const [generating, setGenerating] = useState(false);
    const [creating, setCreating] = useState(false);
    const [key, setKey] = useState(0);
    const toast = useToast();
    const setTab = (v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true });

    return (
        <div>
            <PageHeader title="Fees" description="Bill families, record what you receive, and see who still owes."
                actions={<>
                    <Button variant="secondary" icon="plus" onClick={() => setCreating(true)}>Single invoice</Button>
                    <Button icon="receipt" onClick={() => setGenerating(true)}>Generate invoices</Button>
                </>} />
            <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[
                { value: 'overview', label: 'Overview', icon: 'chart' },
                { value: 'invoices', label: 'Invoices', icon: 'receipt' },
                { value: 'payments', label: 'Payments', icon: 'wallet' },
                { value: 'setup', label: 'Fee setup', icon: 'settings' },
            ]} />
            <div className="mt-6" key={key}>
                {tab === 'overview' && <Overview tenant={tenant} onOpen={(id) => setParams({ tab: 'invoices', student: String(id), status: 'open' })} />}
                {tab === 'invoices' && <Invoices tenant={tenant} />}
                {tab === 'payments' && <Payments tenant={tenant} />}
                {tab === 'setup' && <Setup tenant={tenant} />}
            </div>
            {generating && <GenerateDialog tenant={tenant} onClose={() => setGenerating(false)} onDone={(r) => {
                setGenerating(false);
                toast(r.created ? `${r.created} invoices created · parents notified` : 'No new invoices — everyone in those classes is already billed for this period');
                setKey((k) => k + 1);
                if (r.created) setTab('invoices');
            }} />}
            {creating && <SingleInvoice tenant={tenant} onClose={() => setCreating(false)} onDone={() => { setCreating(false); toast('Invoice created'); setKey((k) => k + 1); setTab('invoices'); }} />}
        </div>
    );
}

function Overview({ tenant, onOpen }) {
    const toast = useToast();
    const [d, setD] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { api('school/fees/summary', { tenant }).then(setD); }, [tenant]);
    if (!d) return <Skeleton className="h-72 rounded-2xl" />;
    const c = d.currency;

    async function remind() {
        setBusy(true);
        try {
            const r = await api('school/fees/reminders', { method: 'POST', tenant });
            toast(r.sent ? `Reminders sent for ${r.sent} overdue invoices` : 'Nothing to remind — everyone was reminded in the last 3 days');
        } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
    }

    const max = Math.max(1, ...d.by_day.map((x) => x.total));

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[['Billed this month', money(d.billed, c), 'text-ink-deep'], ['Collected this month', money(d.collected, c), 'text-leaf'], ['Outstanding', money(d.outstanding, c), 'text-ink-deep'], ['Overdue', money(d.overdue, c), d.overdue > 0 ? 'text-margin' : 'text-ink-deep']].map(([l, v, tone]) => (
                    <div key={l} className="rounded-2xl border border-rule bg-white p-5"><p className="text-sm font-bold text-pencil">{l}</p><p className={`mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl ${tone}`}>{v}</p></div>
                ))}
            </div>
            {d.pending_reports > 0 && (
                <Link to="?tab=payments" className="flex items-center gap-3 rounded-2xl border border-amber-600/25 bg-amber-50 p-4 text-amber-900">
                    <Icon name="alert" size={20} /><span className="flex-1 font-bold">{d.pending_reports} payment{d.pending_reports === 1 ? '' : 's'} reported by parents to confirm</span><Icon name="chevronRight" size={18} />
                </Link>
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <section className="rounded-2xl border border-rule bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3.5">
                        <h2 className="text-lg font-bold">Defaulters</h2>
                        <div className="flex gap-2">
                            <Button size="sm" variant="secondary" icon="bell" busy={busy} onClick={remind} disabled={!d.defaulters.length}>Remind parents</Button>
                        </div>
                    </div>
                    {d.defaulters.length === 0 ? <p className="px-5 py-10 text-center text-pencil">No overdue fees. 🎉</p> : (
                        <ul className="divide-y divide-rule">
                            {d.defaulters.map((x) => (
                                <li key={x.student.id}>
                                    <button type="button" onClick={() => onOpen(x.student.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-paper/60">
                                        <span className="min-w-0 flex-1"><span className="block truncate font-bold text-graphite">{x.student.name}</span><span className="text-sm text-pencil">{x.section} · {x.invoices} invoice{x.invoices === 1 ? '' : 's'} · since {shortDate(x.oldest_due, { month: 'short', day: 'numeric' })}</span></span>
                                        <span className="font-bold text-margin tabular-nums">{money(x.balance, c)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                <section className="rounded-2xl border border-rule bg-white p-5">
                    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Collections this month</h2>
                        <Button size="sm" variant="ghost" icon="download" onClick={() => download(`school/fees/exports/payments.csv?from=${d.range.from}&to=${d.range.to}`, tenant, 'fee-collections.csv')}>CSV</Button>
                    </div>
                    {d.by_day.length === 0 ? <p className="py-8 text-center text-pencil">No payments yet this month.</p> : (
                        <div className="mt-4 flex h-36 items-end gap-1" role="img" aria-label="Collections by day">
                            {d.by_day.map((x) => (
                                <div key={x.day} className="group relative flex-1">
                                    <div className="rounded-t bg-ink/80 transition group-hover:bg-ink" style={{ height: `${Math.max(4, (x.total / max) * 136)}px` }} />
                                    <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-ink-deep px-1.5 py-0.5 text-xs whitespace-nowrap text-white group-hover:block">{shortDate(x.day, { month: 'short', day: 'numeric' })}: {money(x.total, c)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <ul className="mt-5 space-y-1.5 text-sm">
                        {Object.entries(d.by_method).map(([m, v]) => <li key={m} className="flex justify-between"><span className="text-pencil">{METHODS[m] ?? m}</span><span className="font-bold text-graphite tabular-nums">{money(v, c)}</span></li>)}
                    </ul>
                </section>
            </div>
        </div>
    );
}

function Invoices({ tenant }) {
    const [params, setParams] = useSearchParams();
    const [structure] = useStructure(tenant);
    const [data, setData] = useState(null);
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(null);
    const status = params.get('status') ?? 'open';
    const period = params.get('period') ?? '';
    const section = params.get('section') ?? '';
    const student = params.get('student') ?? '';
    const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

    const load = useCallback(() => {
        const qs = new URLSearchParams({ per_page: '100' });
        if (status !== 'all') qs.set('status', status);
        if (period) qs.set('period', period);
        if (section) qs.set('section_id', section);
        if (student) qs.set('student_id', student);
        if (search.trim()) qs.set('search', search.trim());
        return api(`school/fees/invoices?${qs}`, { tenant }).then(setData);
    }, [tenant, status, period, section, student, search]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                {[['open', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={status === v} onClick={() => set('status', v === 'open' ? '' : v)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${status === v ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{l}</button>
                ))}
                <div className="ml-auto flex flex-wrap gap-2">
                    <SectionSelect structure={structure} value={section ? Number(section) : ''} onChange={(v) => set('section', v ? String(v) : '')} allowAll className="w-48" />
                    <select aria-label="Period" value={period} onChange={(e) => set('period', e.target.value)} className="h-10 rounded-lg border border-rule bg-white px-3 font-bold text-graphite">
                        <option value="">All periods</option>
                        {data?.periods.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student or invoice no." aria-label="Search invoices" className="h-10 w-48 rounded-lg border border-rule bg-white px-3" />
                    <Button variant="secondary" icon="download" onClick={() => download(`school/fees/exports/invoices.csv${period ? `?period=${encodeURIComponent(period)}` : ''}`, tenant, 'fee-invoices.csv')}>Export</Button>
                </div>
            </div>
            {student && <p className="mt-3 text-sm text-pencil">Showing one student · <button type="button" className="font-bold text-ink hover:underline" onClick={() => set('student', '')}>Show everyone</button></p>}
            <div className="mt-4">
                {data === null ? <Skeleton className="h-64 rounded-2xl" /> : data.data.length === 0 ? (
                    <EmptyState icon="receipt" title="No invoices here">Generate invoices for a month from the button above.</EmptyState>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-rule bg-white">
                        <table className="w-full text-left">
                            <thead className="border-b border-rule bg-paper/60 text-sm text-pencil">
                                <tr><th className="px-4 py-3 font-bold">Student</th><th className="hidden px-4 py-3 font-bold md:table-cell">Invoice</th><th className="hidden px-4 py-3 font-bold sm:table-cell">Due</th><th className="px-4 py-3 text-right font-bold">Balance</th><th className="px-4 py-3 font-bold">Status</th></tr>
                            </thead>
                            <tbody className="divide-y divide-rule">
                                {data.data.map((i) => (
                                    <tr key={i.id} onClick={() => setOpen(i.id)} className="cursor-pointer hover:bg-paper/60">
                                        <td className="px-4 py-3"><p className="font-bold text-graphite">{i.student.name}</p><p className="text-sm text-pencil">{i.section} · {i.period}</p></td>
                                        <td className="hidden px-4 py-3 font-mono text-sm md:table-cell">{i.number}</td>
                                        <td className="hidden px-4 py-3 text-sm sm:table-cell">{shortDate(i.due_on, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                        <td className="px-4 py-3 text-right font-bold tabular-nums">{money(i.balance, i.currency)}<p className="text-xs font-normal text-pencil">of {money(i.total, i.currency)}</p></td>
                                        <td className="px-4 py-3"><InvoiceStatus inv={i} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {open && <InvoicePanel tenant={tenant} id={open} office onClose={() => setOpen(null)} onChanged={load} />}
        </div>
    );
}

export function InvoicePanel({ tenant, id, office = false, onClose, onChanged }) {
    const toast = useToast();
    const [inv, setInv] = useState(null);
    const [paying, setPaying] = useState(false);
    const [lateFee, setLateFee] = useState('');
    const load = useCallback(() => api(`school/fees/invoices/${id}`, { tenant }).then((d) => { setInv(d); setLateFee(String(d.late_fee || '')); }), [tenant, id]);
    useEffect(() => { load(); }, [load]);

    async function patch(body, msg) {
        try { await api(`school/fees/invoices/${id}`, { method: 'PATCH', tenant, body }); toast(msg); load(); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
    }

    const c = inv?.currency;
    return (
        <SlideOver open onClose={onClose} title={inv ? `${inv.student.name} · ${inv.period}` : 'Invoice'} description={inv ? `${inv.number} · due ${shortDate(inv.due_on, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
            footer={inv && <>
                <Button variant="secondary" icon="printer" as={Link} to={`/${tenant}/fees/invoices/${inv.id}/print`} target="_blank">Print</Button>
                {office && inv.balance > 0 && inv.status !== 'cancelled' && <Button icon="wallet" onClick={() => setPaying(true)}>Record payment</Button>}
            </>}>
            {!inv ? <Skeleton className="h-64" /> : (
                <div className="space-y-6">
                    <div className="flex items-center justify-between rounded-2xl bg-white p-5 ring-1 ring-rule">
                        <div><p className="text-sm text-pencil">Balance due</p><p className="font-display text-3xl font-bold text-ink-deep tabular-nums">{money(inv.balance, c)}</p></div>
                        <InvoiceStatus inv={inv} />
                    </div>
                    <table className="w-full text-sm">
                        <tbody className="divide-y divide-rule">
                            {inv.items.map((it, k) => (
                                <tr key={k}><td className="py-2 text-graphite">{it.description}{it.discount > 0 && <span className="block text-xs text-leaf">Discount −{money(it.discount, c)}</span>}</td><td className="py-2 text-right tabular-nums">{money(it.amount, c)}</td></tr>
                            ))}
                            {inv.discount > 0 && <tr><td className="py-2 text-pencil">Discounts</td><td className="py-2 text-right text-leaf tabular-nums">−{money(inv.discount, c)}</td></tr>}
                            {inv.late_fee > 0 && <tr><td className="py-2 text-pencil">Late fee</td><td className="py-2 text-right tabular-nums">{money(inv.late_fee, c)}</td></tr>}
                            <tr className="font-bold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{money(inv.total, c)}</td></tr>
                            <tr><td className="py-2 text-pencil">Paid</td><td className="py-2 text-right tabular-nums">{money(inv.paid, c)}</td></tr>
                        </tbody>
                    </table>
                    <section>
                        <h3 className="font-bold text-ink-deep">Payments</h3>
                        {inv.payments.length === 0 ? <p className="mt-2 text-sm text-pencil">None yet.</p> : (
                            <ul className="mt-2 space-y-2">
                                {inv.payments.map((p) => (
                                    <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-rule">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-graphite">{money(p.amount, c)} <span className="font-normal text-pencil">· {METHODS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}</span></p>
                                            <p className="text-xs text-pencil">{shortDate(p.paid_on)}{p.receipt_no ? ` · Receipt ${p.receipt_no}` : ''}{p.received_by ? ` · by ${p.received_by.name}` : ''}</p>
                                        </div>
                                        {p.status === 'pending' ? <Badge tone="warning">To confirm</Badge> : p.status === 'rejected' ? <Badge tone="danger">Not found</Badge>
                                            : <Link to={`/${tenant}/fees/receipts/${inv.id}/${p.id}`} target="_blank" className="text-sm font-bold text-ink hover:underline">Receipt</Link>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                    {office && inv.status !== 'cancelled' && inv.status !== 'paid' && (
                        <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-rule">
                            <div className="flex items-end gap-2">
                                <Field label={`Late fee (${c})`} type="number" min="0" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
                                <Button size="sm" variant="secondary" className="mb-0.5" onClick={() => patch({ late_fee: Number(lateFee || 0) }, 'Late fee updated')}>Apply</Button>
                            </div>
                            {inv.paid === 0 && <button type="button" className="text-sm font-bold text-margin hover:underline" onClick={() => patch({ status: 'cancelled' }, 'Invoice cancelled')}>Cancel this invoice</button>}
                        </section>
                    )}
                </div>
            )}
            {paying && <RecordPayment tenant={tenant} inv={inv} onClose={() => setPaying(false)} onDone={() => { setPaying(false); toast('Payment recorded · receipt issued'); load(); onChanged?.(); }} />}
        </SlideOver>
    );
}

function RecordPayment({ tenant, inv, onClose, onDone }) {
    const [f, setF] = useState({ amount: String(inv.balance), method: 'cash', reference: '', paid_on: today(), note: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try { await api(`school/fees/invoices/${inv.id}/payments`, { method: 'POST', tenant, body: { ...f, amount: Number(f.amount), reference: f.reference || null, note: f.note || null } }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title="Record a payment" description={`${inv.student.name} · balance ${money(inv.balance, inv.currency)}`}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save and issue receipt</Button></>}>
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={`Amount (${inv.currency})`} name="amount" type="number" min="0" step="0.01" error={error} value={f.amount} onChange={set('amount')} />
                    <Field label="Date received" name="paid_on" type="date" error={error} value={f.paid_on} max={today()} onChange={set('paid_on')} />
                </div>
                <Field label="Method" name="method" as="select" error={error} value={f.method} onChange={set('method')}>
                    {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Field>
                <Field label="Reference (optional)" name="reference" error={error} value={f.reference} onChange={set('reference')} placeholder="Transaction ID, cheque no." />
                <Field label="Note (optional)" name="note" error={error} value={f.note} onChange={set('note')} />
            </div>
        </Modal>
    );
}

function Payments({ tenant }) {
    const toast = useToast();
    const [status, setStatus] = useState('pending');
    const [rows, setRows] = useState(null);
    const load = useCallback(() => api(`school/fees/payments?status=${status}`, { tenant }).then((r) => setRows(r.data)), [tenant, status]);
    useEffect(() => { setRows(null); load(); }, [load]);

    async function review(p, decision) {
        try {
            await api(`school/fees/payments/${p.id}/review`, { method: 'POST', tenant, body: { status: decision } });
            toast(decision === 'confirmed' ? 'Confirmed · receipt sent to the parent' : 'Marked as not found · parent notified');
            load();
        } catch (e) { toast(e.message, 'error'); }
    }

    return (
        <div>
            <Tabs value={status} onChange={setStatus} tabs={[{ value: 'pending', label: 'Reported by parents' }, { value: 'confirmed', label: 'Received' }, { value: 'rejected', label: 'Not found' }]} />
            <div className="mt-4">
                {rows === null ? <Skeleton className="h-48 rounded-2xl" /> : rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-rule bg-white/60 px-4 py-10 text-center text-pencil">{status === 'pending' ? 'Nothing to confirm. When a parent says they’ve paid by bank or card, it shows up here.' : 'No payments yet.'}</p>
                ) : (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {rows.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-graphite">{p.student?.name} <span className="font-normal text-pencil">· {p.invoice.number} · {p.invoice.period}</span></p>
                                    <p className="text-sm text-graphite">{money(p.amount)} by {METHODS[p.method] ?? p.method}{p.reference && <> · ref <span className="font-mono">{p.reference}</span></>}</p>
                                    <p className="text-xs text-pencil">{shortDate(p.paid_on)}{p.submitted_by ? ` · reported by ${p.submitted_by.name}` : ''}{p.receipt_no ? ` · ${p.receipt_no}` : ''} · {relative(p.created_at)}</p>
                                </div>
                                {p.status === 'pending' ? (
                                    <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => review(p, 'rejected')}>Not found</Button><Button size="sm" icon="check" onClick={() => review(p, 'confirmed')}>Confirm</Button></div>
                                ) : p.status === 'confirmed' ? <Link to={`/${tenant}/fees/receipts/${p.invoice.id}/${p.id}`} target="_blank" className="text-sm font-bold text-ink hover:underline">Receipt</Link> : <Badge tone="danger">Not found</Badge>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function Setup({ tenant }) {
    const toast = useToast();
    const [s, setS] = useState(null);
    const [headForm, setHeadForm] = useState(null);
    const [planFor, setPlanFor] = useState(null);
    const [discounting, setDiscounting] = useState(false);
    const [discounts, setDiscounts] = useState(null);
    const load = useCallback(() => Promise.all([
        api('school/fees/setup', { tenant }).then(setS),
        api('school/fees/discounts', { tenant }).then((r) => setDiscounts(r.data)),
    ]), [tenant]);
    useEffect(() => { load(); }, [load]);
    if (!s) return <Skeleton className="h-64 rounded-2xl" />;
    const c = s.currency;
    const headName = Object.fromEntries(s.heads.map((h) => [h.id, h.name]));

    async function toggle(h) {
        await api(`school/fees/heads/${h.id}`, { method: 'PATCH', tenant, body: { is_active: !h.is_active } }).catch((e) => toast(e.message, 'error'));
        load();
    }

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-rule bg-white">
                <div className="flex items-center justify-between border-b border-rule px-5 py-3.5"><h2 className="text-lg font-bold">Fee types</h2><Button size="sm" icon="plus" onClick={() => setHeadForm({})}>Add</Button></div>
                {s.heads.length === 0 ? <p className="px-5 py-8 text-center text-pencil">Add fee types like Tuition (monthly), Admission (one time), Transport (monthly).</p> : (
                    <ul className="divide-y divide-rule">
                        {s.heads.map((h) => (
                            <li key={h.id} className={`flex items-center gap-3 px-5 py-3 ${h.is_active ? '' : 'opacity-60'}`}>
                                <span className="flex-1 font-bold text-graphite">{h.name} <span className="font-normal text-pencil">· {FREQ[h.frequency]}</span></span>
                                <button type="button" className="text-sm font-bold text-ink hover:underline" onClick={() => toggle(h)}>{h.is_active ? 'Turn off' : 'Turn on'}</button>
                                <IconButton icon="edit" label={`Edit ${h.name}`} onClick={() => setHeadForm(h)} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            <section className="rounded-2xl border border-rule bg-white">
                <div className="border-b border-rule px-5 py-3.5"><h2 className="text-lg font-bold">Fees by class</h2><p className="text-sm text-pencil">What each class pays. Invoices are built from this.</p></div>
                {s.classes.length === 0 ? <p className="px-5 py-8 text-center text-pencil">Add classes under Classes & subjects first.</p> : (
                    <ul className="divide-y divide-rule">
                        {s.classes.map((cl) => {
                            const monthly = cl.plans.filter((p) => s.heads.find((h) => h.id === p.fee_head_id)?.frequency === 'monthly').reduce((n, p) => n + p.amount, 0);
                            return (
                                <li key={cl.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-graphite">{cl.name}</p>
                                        <p className="truncate text-sm text-pencil">{cl.plans.length ? cl.plans.map((p) => `${headName[p.fee_head_id]} ${money(p.amount, c)}`).join(' · ') : 'No fees set'}</p>
                                    </div>
                                    {monthly > 0 && <span className="text-sm font-bold text-ink-deep tabular-nums">{money(monthly, c)}/mo</span>}
                                    <Button size="sm" variant="secondary" onClick={() => setPlanFor(cl)} disabled={!s.heads.length}>Set fees</Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
            <section className="rounded-2xl border border-rule bg-white xl:col-span-2">
                <div className="flex items-center justify-between border-b border-rule px-5 py-3.5"><div><h2 className="text-lg font-bold">Discounts and scholarships</h2><p className="text-sm text-pencil">Applied automatically when invoices are generated.</p></div><Button size="sm" icon="plus" onClick={() => setDiscounting(true)}>Add</Button></div>
                {!discounts?.length ? <p className="px-5 py-8 text-center text-pencil">No discounts yet. Add sibling discounts, scholarships or staff-child concessions.</p> : (
                    <ul className="divide-y divide-rule">
                        {discounts.map((d) => (
                            <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                                <span className="min-w-0 flex-1"><b className="text-graphite">{d.student.name}</b> <span className="text-pencil">· {d.name}</span></span>
                                <span className="font-bold text-leaf">{d.type === 'percent' ? `${d.value}% off` : `${money(d.value, c)} off`} {d.head ? d.head.name : 'all fees'}</span>
                                <IconButton icon="trash" label="Remove discount" onClick={async () => { await api(`school/fees/discounts/${d.id}`, { method: 'DELETE', tenant }); load(); }} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            {headForm && <HeadForm tenant={tenant} head={headForm} onClose={() => setHeadForm(null)} onDone={() => { setHeadForm(null); load(); }} />}
            {planFor && <PlanForm tenant={tenant} cls={planFor} heads={s.heads.filter((h) => h.is_active)} currency={c} onClose={() => setPlanFor(null)} onDone={() => { setPlanFor(null); toast('Fees saved'); load(); }} />}
            {discounting && <DiscountForm tenant={tenant} heads={s.heads} onClose={() => setDiscounting(false)} onDone={() => { setDiscounting(false); toast('Discount added'); load(); }} />}
        </div>
    );
}

function HeadForm({ tenant, head, onClose, onDone }) {
    const [f, setF] = useState({ name: head.name ?? '', frequency: head.frequency ?? 'monthly' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        try { await api(head.id ? `school/fees/heads/${head.id}` : 'school/fees/heads', { method: head.id ? 'PATCH' : 'POST', tenant, body: f }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={head.id ? `Edit ${head.name}` : 'Add a fee type'}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
            <div className="space-y-4">
                <Field label="Name" name="name" error={error} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Tuition, Transport, Lab fee…" />
                <Field label="How often" name="frequency" as="select" error={error} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
                    {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Field>
            </div>
        </Modal>
    );
}

function PlanForm({ tenant, cls, heads, currency, onClose, onDone }) {
    const [amounts, setAmounts] = useState(Object.fromEntries(cls.plans.map((p) => [p.fee_head_id, String(p.amount)])));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function save() {
        setBusy(true);
        try {
            await api(`school/fees/plans/${cls.id}`, { method: 'PUT', tenant, body: { plans: Object.entries(amounts).filter(([, v]) => v !== '').map(([k, v]) => ({ fee_head_id: Number(k), amount: Number(v) })) } });
            onDone();
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={`Fees for ${cls.name}`} description="Leave a fee empty if this class doesn’t pay it."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save fees</Button></>}>
            <div className="space-y-3">
                {heads.map((h) => (
                    <label key={h.id} className="grid grid-cols-[1fr_9rem] items-center gap-3">
                        <span><span className="font-bold text-graphite">{h.name}</span> <span className="text-sm text-pencil">· {FREQ[h.frequency]}</span></span>
                        <span className="relative"><span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-pencil">{currency}</span>
                            <input type="number" min="0" step="0.01" value={amounts[h.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [h.id]: e.target.value })}
                                className="h-10 w-full rounded-lg border border-rule pr-3 pl-12 text-right tabular-nums focus:border-ink focus:outline-none" /></span>
                    </label>
                ))}
                {error && <p className="text-margin">{error}</p>}
            </div>
        </Modal>
    );
}

function StudentPicker({ tenant, value, onChange }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState([]);
    useEffect(() => {
        if (q.trim().length < 2) { setRows([]); return; }
        const t = setTimeout(() => api(`school/students?search=${encodeURIComponent(q.trim())}&per_page=8`, { tenant }).then((r) => setRows(r.data)), 200);
        return () => clearTimeout(t);
    }, [q, tenant]);
    if (value) return <div className="flex items-center justify-between rounded-lg border border-ink bg-ink-50/40 px-3 py-2"><span className="font-bold text-graphite">{value.name} <span className="font-normal text-pencil">· {value.section?.label}</span></span><button type="button" className="text-sm font-bold text-ink" onClick={() => onChange(null)}>Change</button></div>;
    return (
        <div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a student’s name" aria-label="Student" className="h-10 w-full rounded-lg border border-rule px-3 focus:border-ink focus:outline-none" />
            {rows.length > 0 && <ul className="mt-1 divide-y divide-rule rounded-lg border border-rule bg-white">{rows.map((r) => <li key={r.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-paper" onClick={() => onChange(r)}><b>{r.name}</b> <span className="text-sm text-pencil">· {r.section?.label ?? 'No class'} · {r.admission_no}</span></button></li>)}</ul>}
        </div>
    );
}

function DiscountForm({ tenant, heads, onClose, onDone }) {
    const [student, setStudent] = useState(null);
    const [f, setF] = useState({ name: 'Sibling discount', type: 'percent', value: '10', fee_head_id: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        try { await api('school/fees/discounts', { method: 'POST', tenant, body: { ...f, student_id: student?.id, value: Number(f.value), fee_head_id: f.fee_head_id ? Number(f.fee_head_id) : null } }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title="Add a discount or scholarship"
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!student} onClick={save}>Add discount</Button></>}>
            <div className="space-y-4">
                <Field label="Student"><StudentPicker tenant={tenant} value={student} onChange={setStudent} /></Field>
                <Field label="Name" name="name" error={error} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Type" as="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></Field>
                    <Field label={f.type === 'percent' ? 'Percent off' : 'Amount off'} name="value" type="number" min="0" error={error} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
                    <Field label="On" as="select" value={f.fee_head_id} onChange={(e) => setF({ ...f, fee_head_id: e.target.value })}><option value="">All fees</option>{heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Field>
                </div>
            </div>
        </Modal>
    );
}

function GenerateDialog({ tenant, onClose, onDone }) {
    const [structure] = useStructure(tenant);
    const [setup, setSetup] = useState(null);
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const due = new Date(now.getFullYear(), now.getMonth(), 10).toISOString().slice(0, 10);
    const [f, setF] = useState({ period: monthName, due_on: due < today() ? new Date(now.getFullYear(), now.getMonth() + 1, 10).toISOString().slice(0, 10) : due });
    const [sections, setSections] = useState(new Set());
    const [heads, setHeads] = useState(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => { api('school/fees/setup', { tenant }).then((s) => { setSetup(s); setHeads(new Set(s.heads.filter((h) => h.is_active && h.frequency === 'monthly').map((h) => h.id))); }); }, [tenant]);

    const flip = (set, setter, id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n); };

    async function go() {
        setBusy(true);
        setError(null);
        try { onDone(await api('school/fees/generate', { method: 'POST', tenant, body: { ...f, section_ids: [...sections], head_ids: [...heads] } })); } catch (e) { setError(e); } finally { setBusy(false); }
    }

    return (
        <Modal open onClose={onClose} size="lg" title="Generate invoices" description="One invoice per student from each class’s fees. Students already billed for this period are skipped."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!heads.size} onClick={go}>Generate</Button></>}>
            {!setup || !structure ? <Skeleton className="h-48" /> : (
                <div className="space-y-5">
                    {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Period" name="period" error={error} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} hint="Shown on the invoice, e.g. November 2026 or Term 1." />
                        <Field label="Due date" name="due_on" type="date" error={error} value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} />
                    </div>
                    <Field label="Fees to include">
                        {setup.heads.length === 0 ? <p className="text-pencil">Add fee types on the Fee setup tab first.</p> : (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {setup.heads.filter((h) => h.is_active).map((h) => <Checkbox key={h.id} label={h.name} hint={FREQ[h.frequency]} checked={heads.has(h.id)} onChange={() => flip(heads, setHeads, h.id)} />)}
                            </div>
                        )}
                    </Field>
                    <Field label="Classes" hint={sections.size ? null : 'All classes'}>
                        <div className="flex flex-wrap gap-1.5">
                            {structure.sections.map((s) => (
                                <button key={s.id} type="button" aria-pressed={sections.has(s.id)} onClick={() => flip(sections, setSections, s.id)}
                                    className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${sections.has(s.id) ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{s.label}</button>
                            ))}
                        </div>
                    </Field>
                </div>
            )}
        </Modal>
    );
}

function SingleInvoice({ tenant, onClose, onDone }) {
    const [student, setStudent] = useState(null);
    const [f, setF] = useState({ period: '', due_on: today(), note: '' });
    const [items, setItems] = useState([{ description: '', amount: '' }]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api('school/fees/invoices', { method: 'POST', tenant, body: { ...f, note: f.note || null, student_id: student?.id, items: items.filter((i) => i.description).map((i) => ({ description: i.description, amount: Number(i.amount || 0) })) } });
            onDone();
        } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <SlideOver open onClose={onClose} title="Single invoice" description="For one-off charges: books, uniform, a trip."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!student} onClick={save}>Create invoice</Button></>}>
            <div className="space-y-4">
                {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                <Field label="Student"><StudentPicker tenant={tenant} value={student} onChange={setStudent} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="For" name="period" error={error} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} placeholder="e.g. Science fair trip" />
                    <Field label="Due" name="due_on" type="date" error={error} value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} />
                </div>
                <Field label="Lines">
                    <div className="space-y-2">
                        {items.map((it, i) => (
                            <div key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2">
                                <input aria-label="Description" value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Description" className="h-10 rounded-lg border border-rule px-3" />
                                <input aria-label="Amount" type="number" min="0" value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="0.00" className="h-10 rounded-lg border border-rule px-3 text-right" />
                                <IconButton icon="x" label="Remove line" onClick={() => setItems(items.filter((_, j) => j !== i))} />
                            </div>
                        ))}
                        <Button size="sm" variant="ghost" icon="plus" onClick={() => setItems([...items, { description: '', amount: '' }])}>Add line</Button>
                    </div>
                </Field>
                <Field label="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            </div>
        </SlideOver>
    );
}

// ── Families ────────────────────────────────────────────────────────

function FamilyFees({ tenant, isParent }) {
    const [d, setD] = useState(null);
    const [open, setOpen] = useState(null);
    const [paying, setPaying] = useState(null);
    const load = useCallback(() => api('school/fees/mine', { tenant }).then(setD), [tenant]);
    useEffect(() => { load(); }, [load]);
    const payTo = d ? Object.entries(d.pay_to ?? {}).filter(([, v]) => v) : [];

    return (
        <div>
            <PageHeader title="Fees" description={isParent ? 'Invoices for your children, what’s paid and what’s due.' : 'Your fee invoices.'} />
            {d === null ? <Skeleton className="mt-6 h-64 rounded-2xl" /> : (
                <>
                    <div className={`mt-6 flex flex-wrap items-center gap-4 rounded-2xl p-5 ${d.outstanding > 0 ? 'bg-ink-deep text-white' : 'border border-rule bg-white'}`}>
                        <div className="flex-1"><p className={`text-sm ${d.outstanding > 0 ? 'text-white/70' : 'text-pencil'}`}>Total due</p><p className="font-display text-4xl font-extrabold tabular-nums">{money(d.outstanding, d.currency)}</p></div>
                        {d.outstanding === 0 && <Badge tone="success">All paid</Badge>}
                    </div>
                    {payTo.length > 0 && d.outstanding > 0 && (
                        <section className="mt-4 rounded-2xl border border-rule bg-white p-5">
                            <h2 className="font-bold text-ink-deep">How to pay</h2>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                {payTo.map(([k, v]) => <div key={k} className="rounded-xl bg-paper p-3"><p className="text-sm font-bold text-pencil">{PAYMENT_METHODS[k]?.label ?? METHODS[k] ?? k}</p><p className="mt-1 whitespace-pre-line text-graphite">{v}</p></div>)}
                            </div>
                            <p className="mt-3 text-sm text-pencil">After paying, press “I’ve paid” on the invoice and enter the transaction ID. The school confirms it and you get a receipt.</p>
                        </section>
                    )}
                    <div className="mt-6">
                        {d.data.length === 0 ? <EmptyState icon="receipt" title="No invoices yet">Fee invoices from the school appear here.</EmptyState> : (
                            <ul className="space-y-3">
                                {d.data.map((i) => {
                                    const pending = i.payments.some((p) => p.status === 'pending');
                                    return (
                                        <li key={i.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-rule bg-white px-5 py-4">
                                            <button type="button" onClick={() => setOpen(i.id)} className="min-w-0 flex-1 text-left">
                                                <p className="font-bold text-graphite">{i.period}{isParent && <span className="font-normal text-pencil"> · {i.student.name}</span>}</p>
                                                <p className="text-sm text-pencil">{i.number} · due {shortDate(i.due_on, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                            </button>
                                            <div className="text-right"><p className="font-bold tabular-nums">{money(i.balance > 0 ? i.balance : i.total, i.currency)}</p><InvoiceStatus inv={i} /></div>
                                            {i.balance > 0 && (pending ? <Badge tone="warning">Payment being checked</Badge> : <Button size="sm" onClick={() => setPaying(i)}>I’ve paid</Button>)}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </>
            )}
            {open && <InvoicePanel tenant={tenant} id={open} onClose={() => setOpen(null)} />}
            {paying && <ReportPayment tenant={tenant} inv={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
        </div>
    );
}

function ReportPayment({ tenant, inv, onClose, onDone }) {
    const toast = useToast();
    const [f, setF] = useState({ amount: String(inv.balance), method: 'bank', reference: '', paid_on: today(), note: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api(`school/fees/invoices/${inv.id}/report-payment`, { method: 'POST', tenant, body: { ...f, amount: Number(f.amount), note: f.note || null } });
            toast('Sent to the school office to confirm');
            onDone();
        } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title="Tell the school you’ve paid" description={`${inv.period} · ${inv.number}`}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Send</Button></>}>
            <div className="space-y-4">
                {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={`Amount (${inv.currency})`} name="amount" type="number" min="0" step="0.01" error={error} value={f.amount} onChange={set('amount')} />
                    <Field label="Paid on" name="paid_on" type="date" max={today()} error={error} value={f.paid_on} onChange={set('paid_on')} />
                </div>
                <Field label="How you paid" name="method" as="select" error={error} value={f.method} onChange={set('method')}>
                    {Object.entries(METHODS).filter(([k]) => k !== 'cash').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Field>
                <Field label="Transaction ID or receipt number" name="reference" error={error} value={f.reference} onChange={set('reference')} />
            </div>
        </Modal>
    );
}
