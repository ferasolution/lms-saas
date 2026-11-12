import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { dateTime, money } from '../lib/format';
import Icon from '../components/Icon';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageHeader, Skeleton, Tabs, useToast } from '../components/ui';

const METHOD = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank: 'Bank transfer', cash: 'Cash' };

export default function Payments() {
    const { tenant, isAdmin, me } = useOutletContext();
    const toast = useToast();
    const [status, setStatus] = useState('pending');
    const [data, setData] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(null);

    const load = useCallback(() => api(`orders?status=${status}`, { tenant }).then(setData), [tenant, status]);
    useEffect(() => { if (isAdmin) { setData(null); load(); } }, [load, isAdmin]);

    if (!isAdmin) return <Navigate to={`/${tenant}`} replace />;

    const noAccounts = !Object.values(me.tenant.settings?.payments ?? {}).some(Boolean);

    async function approve(order) {
        setBusy(order.id);
        try {
            await api(`orders/${order.id}/approve`, { method: 'POST', tenant });
            toast(`${order.user?.name} now has access to ${order.course?.title}`);
            load();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setBusy(null);
        }
    }

    async function reject() {
        setBusy(rejecting.id);
        try {
            await api(`orders/${rejecting.id}/reject`, { method: 'POST', tenant, body: { note: note || null } });
            toast('Payment marked as not received');
            setRejecting(null);
            setNote('');
            load();
        } finally {
            setBusy(null);
        }
    }

    return (
        <div>
            <PageHeader title="Payments" description="Students send their transaction ID after paying. Check it in your account, then approve." />

            {noAccounts && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-600/20">
                    <p className="flex items-center gap-2"><Icon name="alert" size={18} />Add your JazzCash, Easypaisa or bank details so students know where to pay.</p>
                    <Button size="sm" variant="secondary" as={Link} to={`/${tenant}/settings?tab=payments`}>Add payment details</Button>
                </div>
            )}

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Waiting for you" value={data?.summary.pending} tone="amber" />
                <Stat label="Approved" value={data?.summary.paid} />
                <Stat label="Revenue" value={data ? money(data.summary.revenue) : undefined} className="col-span-2 sm:col-span-1" />
            </div>

            <Tabs className="mt-8" value={status} onChange={setStatus} tabs={[
                { value: 'pending', label: 'To review', count: data?.summary.pending },
                { value: 'paid', label: 'Approved' },
                { value: 'failed', label: 'Not received' },
            ]} />

            <div className="mt-6">
                {data === null ? <Skeleton className="h-48 rounded-2xl" /> : data.data.length === 0 ? (
                    <EmptyState icon="receipt" title={status === 'pending' ? 'Nothing to review' : 'No payments here yet'}>
                        {status === 'pending' ? 'When a student pays for a course, their payment shows up here for you to confirm.' : null}
                    </EmptyState>
                ) : (
                    <ul className="space-y-3">
                        {data.data.map((o) => (
                            <li key={o.id} className="flex flex-col gap-4 rounded-2xl border border-rule bg-white p-5 lg:flex-row lg:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <Avatar name={o.user?.name ?? '?'} size={40} />
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-graphite">{o.user?.name}</p>
                                        <p className="truncate text-sm text-pencil">{o.course?.title}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 lg:w-[34rem]">
                                    <Meta label="Amount" value={<strong className="font-display text-base text-ink-deep">{money(o.total, o.currency)}</strong>} />
                                    <Meta label="Method" value={METHOD[o.payment_method] ?? o.payment_method} />
                                    <Meta label="Reference" value={<span className="font-mono font-bold break-all text-graphite">{o.payment_reference}</span>} />
                                    <Meta label="Sent" value={dateTime(o.created_at)} />
                                </div>
                                {o.note && <p className="rounded-lg bg-paper px-3 py-2 text-sm text-graphite lg:hidden">“{o.note}”</p>}
                                <div className="flex shrink-0 gap-2">
                                    {o.status === 'pending' ? (
                                        <>
                                            <Button variant="secondary" size="sm" onClick={() => { setRejecting(o); setNote(''); }}>Not received</Button>
                                            <Button size="sm" icon="check" busy={busy === o.id} onClick={() => approve(o)}>Approve</Button>
                                        </>
                                    ) : o.status === 'paid' ? (
                                        <Badge tone="published" dot>Approved{o.reviewer ? ` by ${o.reviewer.name.split(' ')[0]}` : ''}</Badge>
                                    ) : (
                                        <Badge tone="danger" dot>Not received</Badge>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Payment not received?" size="sm"
                description={rejecting ? `${rejecting.user?.name} · ${money(rejecting.total, rejecting.currency)} · ref ${rejecting.payment_reference}` : ''}
                footer={<>
                    <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
                    <Button variant="danger" busy={busy === rejecting?.id} onClick={reject}>Mark as not received</Button>
                </>}>
                <Field label="Reason (optional)" as="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. No payment found with this transaction ID" />
                <p className="mt-3 text-sm text-pencil">The student can send corrected details from the course page.</p>
            </Modal>
        </div>
    );
}

function Stat({ label, value, tone, className = '' }) {
    return (
        <div className={`rounded-2xl border border-rule bg-white p-4 sm:p-5 ${className}`}>
            <p className="text-sm text-pencil">{label}</p>
            {value === undefined ? <Skeleton className="mt-2 h-8 w-16" /> : (
                <p className={`mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl ${tone === 'amber' && value > 0 ? 'text-amber-700' : 'text-ink-deep'}`}>{value}</p>
            )}
        </div>
    );
}

function Meta({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-pencil">{label}</p>
            <div className="truncate text-graphite">{value}</div>
        </div>
    );
}
