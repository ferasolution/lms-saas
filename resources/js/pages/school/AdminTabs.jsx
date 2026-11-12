import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Skeleton, Toggle, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';

export const MODULES = [
    ['admissions', 'Admissions', 'Online application form and the admissions pipeline.'],
    ['attendance', 'Attendance & leave', 'Daily registers, parent alerts and leave requests.'],
    ['diary', 'Diary & homework', 'Classwork, homework hand-in and checking.'],
    ['timetable', 'Timetable', 'Weekly class timetables and online class links.'],
    ['exams', 'Exams & results', 'Date sheets, marks, report cards.'],
    ['fees', 'Fees', 'Invoices, payments, receipts and reminders.'],
    ['hr', 'Staff & payroll', 'Employees, staff attendance, leave and payslips.'],
    ['accounts', 'Accounts', 'Income, expenses and the income statement.'],
    ['library', 'Library', 'Catalogue and book loans.'],
    ['campus', 'Campus', 'Transport, inventory and the visitor log.'],
    ['meetings', 'Parent meetings', 'Parent-teacher meeting booking.'],
    ['events', 'Events & calendar', 'School events with permission slips.'],
    ['messages', 'Messages', 'Private messages between families and staff.'],
    ['helpdesk', 'Help desk', 'Support requests from families and staff.'],
    ['courses', 'Online courses', 'Self-paced courses, quizzes and certificates.'],
    ['ai', 'AI assistant', 'Lesson plans, quizzes, tutoring and parent summaries.'],
];

export function ModulesTab({ tenant, me, refresh }) {
    const toast = useToast();
    const [mods, setMods] = useState(me.tenant.settings?.modules ?? {});
    async function flip(key, on) {
        const next = { ...mods, [key]: on };
        setMods(next);
        try { await api('school/modules', { method: 'PUT', tenant, body: { modules: { [key]: on } } }); await refresh(); toast(on ? 'Turned on' : 'Turned off'); } catch (e) { toast(e.message, 'error'); setMods(mods); }
    }
    return (
        <section className="rounded-2xl border border-rule bg-white">
            <div className="border-b border-rule px-5 py-4"><h2 className="text-lg font-bold">Modules</h2><p className="text-pencil">Turn off what your institute doesn’t use. It disappears for everyone, and its data is kept.</p></div>
            <ul className="divide-y divide-rule">
                {MODULES.map(([k, l, h]) => (
                    <li key={k} className="px-5 py-3"><Toggle label={l} hint={h} checked={mods[k] !== false} onChange={(v) => flip(k, v)} /></li>
                ))}
            </ul>
        </section>
    );
}

export function ActivityTab({ tenant }) {
    const [d, setD] = useState(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const load = useCallback(() => api(`school/audit?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ''}`, { tenant }).then(setD), [tenant, page, search]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
    return (
        <section className="rounded-2xl border border-rule bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4">
                <div><h2 className="text-lg font-bold">Activity log</h2><p className="text-pencil">Who changed what, and when. Kept for your records.</p></div>
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search" aria-label="Search activity" className="h-10 w-56 rounded-lg border border-rule px-3" />
            </div>
            {!d ? <div className="p-5"><Skeleton className="h-40" /></div> : d.data.length === 0 ? <p className="px-5 py-10 text-center text-pencil">Nothing logged yet.</p> : (
                <>
                    <ul className="divide-y divide-rule">
                        {d.data.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                                <span className="w-40 shrink-0 text-sm text-pencil">{dateTime(a.at)}</span>
                                <span className="min-w-0 flex-1"><span className="text-graphite">{a.description}</span><span className="block text-xs text-pencil">{a.user?.name ?? 'System'}{a.ip ? ` · ${a.ip}` : ''}</span></span>
                                <Badge>{a.action}</Badge>
                            </li>
                        ))}
                    </ul>
                    {d.meta.last_page > 1 && (
                        <div className="flex items-center justify-between border-t border-rule px-5 py-3">
                            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
                            <span className="text-sm text-pencil">Page {d.meta.current_page} of {d.meta.last_page}</span>
                            <Button size="sm" variant="secondary" disabled={page >= d.meta.last_page} onClick={() => setPage(page + 1)}>Older</Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
