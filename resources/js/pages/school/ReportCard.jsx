import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Button, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { shortDate } from '../../lib/school';

/** Printable report card at /:tenant/exams/:id/report/:studentId. */
export default function ReportCard() {
    const { tenant, id, studentId } = useParams();
    const [r, setR] = useState(null);
    useEffect(() => { api(`school/exams/${id}/report/${studentId}`, { tenant }).then(setR).catch(() => setR(false)); }, [tenant, id, studentId]);

    if (r === null) return <div className="p-10"><Skeleton className="mx-auto h-96 max-w-3xl" /></div>;
    if (!r) return <p className="p-10 text-center text-pencil">This report card isn’t available yet.</p>;
    document.title = `Report card · ${r.student.name}`;

    return (
        <div className="min-h-screen bg-paper py-8 print:bg-white print:py-0">
            <div className="mx-auto mb-4 flex max-w-3xl justify-end px-4 print:hidden"><Button icon="printer" onClick={() => window.print()}>Print or save as PDF</Button></div>
            <article className="mx-auto max-w-3xl bg-white p-10 shadow-sm ring-1 ring-rule print:shadow-none print:ring-0">
                <header className="flex items-center gap-4 border-b-2 border-ink-deep pb-5">
                    {r.institute.logo ? <img src={r.institute.logo} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-xl bg-ink text-white"><Icon name="school" size={30} /></span>}
                    <div className="flex-1">
                        <p className="font-display text-2xl font-bold text-ink-deep">{r.institute.name}</p>
                        {r.institute.address && <p className="text-sm whitespace-pre-line text-pencil">{r.institute.address}</p>}
                    </div>
                    <div className="text-right"><p className="font-display text-2xl font-extrabold text-ink-deep">Report card</p><p className="text-sm text-graphite">{r.exam.name}</p></div>
                </header>

                <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                    {[['Student', r.student.name], ['Class', r.student.section], ['Admission no.', r.student.admission_no], ['Roll no.', r.student.roll_no ?? '—']].map(([k, v]) => (
                        <div key={k}><p className="text-pencil">{k}</p><p className="font-bold text-graphite">{v}</p></div>
                    ))}
                </section>

                <table className="mt-6 w-full text-sm">
                    <thead className="border-y border-ink-deep text-left">
                        <tr><th className="py-2 font-bold">Subject</th><th className="py-2 text-right font-bold">Marks</th><th className="py-2 text-right font-bold">Out of</th><th className="py-2 text-center font-bold">Grade</th><th className="hidden py-2 text-right font-bold sm:table-cell print:table-cell">Class high / avg</th></tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                        {r.subjects.map((s) => {
                            const fail = s.pass && s.marks !== null && s.marks < s.pass;
                            return (
                                <tr key={s.subject}>
                                    <td className="py-2.5 font-bold text-graphite">{s.subject}{s.remark && <span className="block text-xs font-normal text-pencil">{s.remark}</span>}</td>
                                    <td className={`py-2.5 text-right tabular-nums ${fail || s.is_absent ? 'font-bold text-margin' : ''}`}>{s.is_absent ? 'Absent' : s.marks ?? '—'}</td>
                                    <td className="py-2.5 text-right text-pencil tabular-nums">{s.max}</td>
                                    <td className="py-2.5 text-center font-bold text-ink-deep">{s.grade ?? '—'}</td>
                                    <td className="hidden py-2.5 text-right text-pencil tabular-nums sm:table-cell print:table-cell">{s.class_highest ?? '—'} / {s.class_average ?? '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="border-t-2 border-ink-deep">
                        <tr><td className="pt-3 font-extrabold">Total</td><td className="pt-3 text-right font-extrabold tabular-nums">{r.total}</td><td className="pt-3 text-right text-pencil tabular-nums">{r.max}</td><td /><td className="hidden sm:table-cell print:table-cell" /></tr>
                    </tfoot>
                </table>

                <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[['Percentage', r.percent !== null ? `${r.percent}%` : '—'], ['Overall grade', r.grade?.grade ?? '—'], ['Result', r.passed === null ? '—' : r.passed ? 'Pass' : 'Needs re-sit'], r.position ? ['Position', `${r.position} of ${r.class_size}`] : ['Attendance', r.attendance.percent !== null ? `${r.attendance.percent}%` : '—']].map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-paper p-3 text-center print:border print:border-rule"><p className="text-xs text-pencil">{k}</p><p className={`font-display text-2xl font-bold ${v === 'Needs re-sit' ? 'text-margin' : 'text-ink-deep'}`}>{v}</p></div>
                    ))}
                </section>
                {r.grade?.remark && <p className="mt-4 text-center text-graphite">“{r.grade.remark}”</p>}
                {r.position && <p className="mt-2 text-center text-sm text-pencil">Attendance up to the exam: {r.attendance.present} of {r.attendance.days} days{r.attendance.percent !== null ? ` (${r.attendance.percent}%)` : ''}</p>}

                <section className="mt-10 grid grid-cols-2 gap-10 text-sm">
                    <div className="border-t border-graphite pt-2 text-center text-pencil">{r.class_teacher ?? 'Class teacher'}<br />Class teacher</div>
                    <div className="border-t border-graphite pt-2 text-center text-pencil">Principal</div>
                </section>
                <footer className="mt-8 border-t border-rule pt-3 text-xs text-pencil">
                    Grading: {r.scale.map((b) => `${b.grade} ${b.min_percent}%+`).join(' · ')}
                    {r.exam.published_at && <span className="float-right">Issued {shortDate(r.exam.published_at.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
                </footer>
            </article>
        </div>
    );
}
