import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Button, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';

export default function PayslipPrint() {
    const { tenant, id } = useParams();
    const [p, setP] = useState(null);
    useEffect(() => { api(`school/hr/payslips/${id}`, { tenant }).then(setP).catch(() => setP(false)); }, [tenant, id]);
    if (p === null) return <div className="p-10"><Skeleton className="mx-auto h-96 max-w-2xl" /></div>;
    if (!p) return <p className="p-10 text-center text-pencil">This payslip isn’t available.</p>;
    const c = p.currency;
    const month = new Date(`${p.period}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    document.title = `Payslip ${month} · ${p.employee?.name}`;
    const earnings = [['Basic salary', p.basic], ...p.allowances.map((a) => [a.name, a.amount]), ...(p.bonus > 0 ? [['Bonus', p.bonus]] : [])];
    const deductions = [...p.deductions.map((a) => [a.name, a.amount]), ...(p.unpaid_deduction > 0 ? [[`Unpaid days (${p.unpaid_days})`, p.unpaid_deduction]] : [])];

    return (
        <div className="min-h-screen bg-paper py-8 print:bg-white print:py-0">
            <div className="mx-auto mb-4 flex max-w-2xl justify-end px-4 print:hidden"><Button icon="printer" onClick={() => window.print()}>Print or save as PDF</Button></div>
            <article className="mx-auto max-w-2xl bg-white p-10 shadow-sm ring-1 ring-rule print:shadow-none print:ring-0">
                <header className="flex items-center gap-4 border-b-2 border-ink-deep pb-5">
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink text-white"><Icon name="school" size={24} /></span>
                    <div className="flex-1"><p className="font-display text-xl font-bold text-ink-deep">{p.institute.name}</p>{p.institute.address && <p className="text-sm whitespace-pre-line text-pencil">{p.institute.address}</p>}</div>
                    <div className="text-right"><p className="font-display text-2xl font-extrabold text-ink-deep">Payslip</p><p className="text-sm text-graphite">{month}</p></div>
                </header>
                <section className="mt-5 grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-pencil">Employee</p><p className="font-bold text-graphite">{p.employee?.name}</p><p className="text-graphite">{p.employee?.designation}{p.employee?.department ? ` · ${p.employee.department}` : ''}</p></div>
                    <div className="text-right"><p className="text-pencil">Employee no.</p><p className="font-bold text-graphite">{p.employee?.employee_no}</p>{p.paid_on && <p className="text-graphite">Paid {new Date(`${p.paid_on}T12:00:00`).toLocaleDateString()}</p>}</div>
                </section>
                <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
                    {[['Earnings', earnings, p.gross], ['Deductions', deductions, p.total_deductions]].map(([t, rows, total]) => (
                        <div key={t}>
                            <p className="border-b border-ink-deep pb-1 font-bold">{t}</p>
                            <ul className="divide-y divide-rule">{rows.length === 0 ? <li className="py-2 text-pencil">None</li> : rows.map(([k, v]) => <li key={k} className="flex justify-between py-2"><span>{k}</span><span className="tabular-nums">{money(v, c)}</span></li>)}</ul>
                            <p className="flex justify-between border-t border-rule pt-2 font-bold"><span>Total</span><span className="tabular-nums">{money(total, c)}</span></p>
                        </div>
                    ))}
                </section>
                <section className="mt-8 rounded-xl bg-paper p-5 text-center print:border print:border-rule">
                    <p className="text-sm text-pencil">Net pay</p>
                    <p className="font-display text-4xl font-extrabold text-ink-deep tabular-nums">{money(p.net, c)}</p>
                </section>
                {p.note && <p className="mt-4 text-sm text-graphite">Note: {p.note}</p>}
                <footer className="mt-8 border-t border-rule pt-3 text-center text-xs text-pencil">Generated electronically by Fera EduSphere.</footer>
            </article>
        </div>
    );
}
