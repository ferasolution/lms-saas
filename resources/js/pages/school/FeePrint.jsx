import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Button, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { shortDate } from '../../lib/school';

const METHODS = { cash: 'Cash', bank: 'Bank transfer', card: 'Card', paypal: 'PayPal', wise: 'Wise', cheque: 'Cheque', other: 'Other' };
const long = (d) => shortDate(d, { day: 'numeric', month: 'long', year: 'numeric' });

/** Printable invoice (/fees/invoices/:id/print) or receipt (/fees/receipts/:id/:paymentId). */
export default function FeePrint() {
    const { tenant, id, paymentId } = useParams();
    const [inv, setInv] = useState(null);
    useEffect(() => { api(`school/fees/invoices/${id}`, { tenant }).then(setInv).catch(() => setInv(false)); }, [tenant, id]);

    if (inv === null) return <div className="p-10"><Skeleton className="mx-auto h-96 max-w-3xl" /></div>;
    if (!inv) return <p className="p-10 text-center text-pencil">This document isn’t available. Sign in and try again.</p>;

    const payment = paymentId ? inv.payments.find((p) => String(p.id) === paymentId) : null;
    const c = inv.currency;
    const title = payment ? 'Receipt' : 'Fee invoice';
    document.title = `${title} ${payment?.receipt_no ?? inv.number}`;

    return (
        <div className="min-h-screen bg-paper py-8 print:bg-white print:py-0">
            <div className="mx-auto mb-4 flex max-w-3xl justify-end gap-2 px-4 print:hidden">
                <Button icon="printer" onClick={() => window.print()}>Print or save as PDF</Button>
            </div>
            <article className="mx-auto max-w-3xl bg-white p-10 shadow-sm ring-1 ring-rule print:shadow-none print:ring-0">
                <header className="flex items-start justify-between gap-6 border-b-2 border-ink-deep pb-6">
                    <div className="flex items-center gap-3">
                        {inv.institute.logo ? <img src={inv.institute.logo} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-ink text-white"><Icon name="school" size={28} /></span>}
                        <div><p className="font-display text-2xl font-bold text-ink-deep">{inv.institute.name}</p>{inv.institute.address && <p className="text-sm whitespace-pre-line text-pencil">{inv.institute.address}</p>}</div>
                    </div>
                    <div className="text-right">
                        <p className="font-display text-3xl font-extrabold text-ink-deep">{title}</p>
                        <p className="font-mono text-sm text-graphite">{payment?.receipt_no ?? inv.number}</p>
                    </div>
                </header>

                <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
                    <div>
                        <p className="font-bold text-pencil">{payment ? 'Received from' : 'Billed to'}</p>
                        <p className="mt-1 text-lg font-bold text-graphite">{inv.student.name}</p>
                        <p className="text-graphite">{inv.section}{inv.admission_no ? ` · Adm. ${inv.admission_no}` : ''}</p>
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-right">
                        {payment ? (
                            <>
                                <dt className="text-pencil">Date</dt><dd className="text-graphite">{long(payment.paid_on)}</dd>
                                <dt className="text-pencil">Method</dt><dd className="text-graphite">{METHODS[payment.method] ?? payment.method}</dd>
                                {payment.reference && <><dt className="text-pencil">Reference</dt><dd className="font-mono text-graphite">{payment.reference}</dd></>}
                                <dt className="text-pencil">For invoice</dt><dd className="font-mono text-graphite">{inv.number}</dd>
                            </>
                        ) : (
                            <>
                                <dt className="text-pencil">Period</dt><dd className="text-graphite">{inv.period}</dd>
                                <dt className="text-pencil">Issued</dt><dd className="text-graphite">{long(inv.issued_on)}</dd>
                                <dt className="text-pencil">Due</dt><dd className="font-bold text-graphite">{long(inv.due_on)}</dd>
                            </>
                        )}
                    </dl>
                </section>

                {payment ? (
                    <section className="mt-8 rounded-xl bg-paper p-6 text-center print:border print:border-rule">
                        <p className="text-sm text-pencil">Amount received</p>
                        <p className="font-display text-5xl font-extrabold text-ink-deep tabular-nums">{money(payment.amount, c)}</p>
                        <p className="mt-2 text-graphite">{inv.balance > 0 ? `Remaining balance on ${inv.period}: ${money(inv.balance, c)}` : `${inv.period} is paid in full. Thank you.`}</p>
                    </section>
                ) : (
                    <table className="mt-8 w-full text-sm">
                        <thead className="border-b border-rule text-left text-pencil"><tr><th className="py-2 font-bold">Description</th><th className="py-2 text-right font-bold">Amount</th></tr></thead>
                        <tbody className="divide-y divide-rule">
                            {inv.items.map((it, k) => (
                                <tr key={k}><td className="py-2.5 text-graphite">{it.description}{it.discount > 0 && <span className="block text-xs text-pencil">Less discount {money(it.discount, c)}</span>}</td><td className="py-2.5 text-right tabular-nums">{money(it.amount - it.discount, c)}</td></tr>
                            ))}
                            {inv.late_fee > 0 && <tr><td className="py-2.5 text-graphite">Late fee</td><td className="py-2.5 text-right tabular-nums">{money(inv.late_fee, c)}</td></tr>}
                        </tbody>
                        <tfoot className="border-t-2 border-ink-deep">
                            <tr><td className="pt-3 font-bold">Total</td><td className="pt-3 text-right font-bold tabular-nums">{money(inv.total, c)}</td></tr>
                            {inv.paid > 0 && <tr><td className="pt-1 text-pencil">Paid</td><td className="pt-1 text-right tabular-nums">−{money(inv.paid, c)}</td></tr>}
                            <tr><td className="pt-1 text-lg font-extrabold text-ink-deep">Balance due</td><td className="pt-1 text-right text-lg font-extrabold text-ink-deep tabular-nums">{money(inv.balance, c)}</td></tr>
                        </tfoot>
                    </table>
                )}

                {!payment && inv.balance > 0 && Object.values(inv.pay_to ?? {}).some(Boolean) && (
                    <section className="mt-8 rounded-xl border border-rule p-5 text-sm">
                        <p className="font-bold text-ink-deep">How to pay</p>
                        <div className="mt-2 grid grid-cols-2 gap-4">
                            {Object.entries(inv.pay_to).filter(([, v]) => v).map(([k, v]) => <div key={k}><p className="font-bold text-pencil">{METHODS[k] ?? k}</p><p className="whitespace-pre-line text-graphite">{v}</p></div>)}
                        </div>
                        <p className="mt-3 text-pencil">Please quote invoice number {inv.number} with your payment.</p>
                    </section>
                )}
                <footer className="mt-10 border-t border-rule pt-4 text-center text-xs text-pencil">
                    {payment ? 'This receipt was issued electronically and is valid without a signature.' : 'Generated by Fera EduSphere'}
                </footer>
            </article>
        </div>
    );
}
