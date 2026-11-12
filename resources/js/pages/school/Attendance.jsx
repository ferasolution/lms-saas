import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { SectionSelect } from '../../components/school';
import { Badge, Button, EmptyState, Field, FileDrop, Modal, PageHeader, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, download, upload } from '../../lib/api';
import { ATTENDANCE, shortDate, today, useStructure } from '../../lib/school';
import { relative } from '../../lib/format';

export default function Attendance() {
    const ctx = useOutletContext();
    return ctx.isStaff ? <StaffAttendance {...ctx} /> : <FamilyAttendance {...ctx} />;
}

function StaffAttendance({ tenant, isOffice }) {
    const [params, setParams] = useSearchParams();
    const [structure] = useStructure(tenant);
    const tab = params.get('tab') || 'mark';
    const mine = useMemo(() => structure?.sections.filter((s) => s.mine) ?? [], [structure]);
    const section = Number(params.get('section')) || mine[0]?.id || '';

    const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

    return (
        <div>
            <PageHeader title="Attendance" description="Take the register, see the month at a glance and handle leave requests. Parents are told when their child is absent or late." />
            <Tabs className="mt-6" value={tab} onChange={(v) => set('tab', v === 'mark' ? '' : v)} tabs={[
                { value: 'mark', label: 'Take register', icon: 'check2' },
                { value: 'month', label: 'Monthly register', icon: 'calendar' },
                isOffice && { value: 'today', label: 'Today across school', icon: 'grid' },
                { value: 'leave', label: 'Leave requests', icon: 'inbox' },
            ].filter(Boolean)} />

            <div className="mt-6">
                {!structure ? <Skeleton className="h-64 rounded-2xl" /> : tab === 'leave' ? <LeaveList tenant={tenant} staff />
                    : tab === 'today' ? <TodayAcross tenant={tenant} onOpen={(id) => { const p = new URLSearchParams(); p.set('section', id); setParams(p); }} />
                        : mine.length === 0 ? (
                            <EmptyState icon="grid" title="No classes to show">
                                {isOffice ? 'Add classes and sections under Classes & subjects first.' : 'You’re not a class teacher or subject teacher for any section yet. Ask the school office to assign you.'}
                            </EmptyState>
                        ) : (
                            <>
                                <SectionSelect structure={structure} onlyMine value={section} onChange={(v) => set('section', String(v))} className="w-full sm:w-72" />
                                <div className="mt-4">
                                    {tab === 'month' ? <MonthRegister tenant={tenant} section={section} /> : <Register tenant={tenant} section={section} />}
                                </div>
                            </>
                        )}
            </div>
        </div>
    );
}

function Register({ tenant, section }) {
    const toast = useToast();
    const [day, setDay] = useState(today());
    const [sheet, setSheet] = useState(null);
    const [marks, setMarks] = useState({});
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        setSheet(null);
        return api(`school/attendance?section_id=${section}&date=${day}`, { tenant }).then((s) => {
            setSheet(s);
            setMarks(Object.fromEntries(s.students.map((x) => [x.id, x.status])));
        }).catch((e) => toast(e.message, 'error'));
    }, [tenant, section, day]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (section) load(); }, [load, section]);

    const unmarked = sheet?.students.filter((x) => !marks[x.id]).length ?? 0;
    const counts = Object.values(marks).reduce((a, v) => (v ? { ...a, [v]: (a[v] ?? 0) + 1 } : a), {});

    async function save() {
        setBusy(true);
        try {
            const r = await api('school/attendance', { method: 'POST', tenant, body: {
                section_id: section, date: day,
                records: sheet.students.filter((x) => marks[x.id]).map((x) => ({ student_id: x.id, status: marks[x.id] })),
            } });
            toast(r.alerts ? `Register saved · ${r.alerts} parent ${r.alerts === 1 ? 'alert' : 'alerts'} sent` : 'Register saved');
            load();
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                    <span className="sr-only">Date</span>
                    <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())}
                        className="h-10 rounded-lg border border-rule bg-white px-3 font-bold text-graphite focus:border-ink focus:outline-none" />
                </label>
                {sheet && (sheet.taken ? <Badge tone="success" dot>Register taken</Badge> : <Badge tone="warning" dot>Not taken yet</Badge>)}
                {sheet?.students.length > 0 && (
                    <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setMarks(Object.fromEntries(sheet.students.map((x) => [x.id, marks[x.id] && marks[x.id] !== 'present' ? marks[x.id] : 'present'])))}>
                        Mark everyone else present
                    </Button>
                )}
            </div>

            {!sheet ? <Skeleton className="mt-4 h-64 rounded-2xl" /> : sheet.students.length === 0 ? (
                <div className="mt-4"><EmptyState icon="users" title="No students in this class">Admit students or move them into {sheet.section.label} from Students.</EmptyState></div>
            ) : (
                <>
                    <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {sheet.students.map((x) => (
                            <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                                <span className="w-8 text-right text-sm text-pencil tabular-nums">{x.roll_no}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-bold text-graphite">{x.name}</p>
                                    {x.on_leave && <p className="text-xs text-pencil">Approved leave today</p>}
                                </div>
                                <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${x.name}`}>
                                    {['present', 'absent', 'late', 'excused'].map((st) => (
                                        <button key={st} type="button" role="radio" aria-checked={marks[x.id] === st} title={ATTENDANCE[st].label}
                                            onClick={() => setMarks({ ...marks, [x.id]: st })}
                                            className={`h-10 min-w-10 rounded-lg px-2.5 text-sm font-bold transition ${marks[x.id] === st ? ATTENDANCE[st].tone : 'bg-paper text-pencil ring-1 ring-rule hover:text-ink-deep'}`}>
                                            <span className="sm:hidden">{ATTENDANCE[st].short}</span>
                                            <span className="hidden sm:inline">{ATTENDANCE[st].label}</span>
                                        </button>
                                    ))}
                                    {marks[x.id] === 'leave' && <span className={`grid h-10 place-items-center rounded-lg px-2.5 text-sm font-bold ${ATTENDANCE.leave.tone}`}>Leave</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-rule bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
                        <p className="text-sm text-graphite">
                            {['present', 'absent', 'late', 'excused', 'leave'].filter((k) => counts[k]).map((k) => `${counts[k]} ${ATTENDANCE[k].label.toLowerCase()}`).join(' · ') || 'Nobody marked yet'}
                            {unmarked > 0 && <span className="text-amber-700"> · {unmarked} not marked</span>}
                        </p>
                        <Button className="ml-auto" icon="check" busy={busy} disabled={!Object.values(marks).some(Boolean)} onClick={save}>{sheet.taken ? 'Update register' : 'Save register'}</Button>
                    </div>
                </>
            )}
        </div>
    );
}

function MonthRegister({ tenant, section }) {
    const toast = useToast();
    const [month, setMonth] = useState(today().slice(0, 7));
    const [data, setData] = useState(null);

    useEffect(() => {
        if (!section) return;
        setData(null);
        api(`school/attendance/month?section_id=${section}&month=${month}`, { tenant }).then(setData).catch((e) => toast(e.message, 'error'));
    }, [tenant, section, month]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <input type="month" value={month} max={today().slice(0, 7)} onChange={(e) => setMonth(e.target.value || today().slice(0, 7))} aria-label="Month"
                    className="h-10 rounded-lg border border-rule bg-white px-3 font-bold text-graphite focus:border-ink focus:outline-none" />
                <Button size="sm" variant="secondary" icon="download" className="ml-auto" disabled={!data?.days.length}
                    onClick={() => download(`school/attendance/month.csv?section_id=${section}&month=${month}`, tenant, `attendance-${month}.csv`).catch((e) => toast(e.message, 'error'))}>Export CSV</Button>
            </div>
            {!data ? <Skeleton className="mt-4 h-64 rounded-2xl" /> : data.days.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-rule bg-white/60 px-4 py-10 text-center text-pencil">No register taken for {data.section.label} this month.</p>
            ) : (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-paper/60 text-pencil">
                            <tr>
                                <th className="sticky left-0 z-10 bg-paper px-3 py-2 text-left font-bold">Student</th>
                                {data.days.map((d) => <th key={d} className="px-1 py-2 text-center font-bold tabular-nums">{Number(d.slice(8))}</th>)}
                                <th className="px-3 py-2 text-right font-bold">%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-rule">
                            {data.students.map((s) => (
                                <tr key={s.id}>
                                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-bold whitespace-nowrap text-graphite">{s.name}</td>
                                    {data.days.map((d) => {
                                        const st = s.days[d];
                                        return <td key={d} className="px-0.5 py-1 text-center">{st && <span className={`inline-grid h-6 min-w-6 place-items-center rounded text-[11px] font-bold ${ATTENDANCE[st].soft}`} title={ATTENDANCE[st].label}>{ATTENDANCE[st].short}</span>}</td>;
                                    })}
                                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.percent !== null && s.percent < 75 ? 'text-margin' : 'text-graphite'}`}>{s.percent ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function TodayAcross({ tenant, onOpen }) {
    const [data, setData] = useState(null);
    useEffect(() => { api('school/attendance/today', { tenant }).then(setData).catch(() => setData(false)); }, [tenant]);
    if (data === null) return <Skeleton className="h-64 rounded-2xl" />;
    if (!data) return null;
    const t = data.totals;
    return (
        <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[['Present', t.percent === null ? '—' : `${t.percent}%`, 'text-leaf'], ['Absent', t.absent, 'text-margin'], ['Late', t.late, 'text-amber-700'], ['Registers not taken', t.pending_sections, 'text-ink-deep']].map(([l, v, c]) => (
                    <div key={l} className="rounded-2xl border border-rule bg-white p-4"><p className="text-sm text-pencil">{l}</p><p className={`mt-1 font-display text-3xl font-bold tabular-nums ${c}`}>{v}</p></div>
                ))}
            </div>
            <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                {data.sections.filter((s) => s.students > 0).map((s) => (
                    <li key={s.id}>
                        <button type="button" onClick={() => onOpen(s.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-paper/60">
                            <span className="min-w-0 flex-1 font-bold text-graphite">{s.label}</span>
                            {s.taken ? (
                                <span className="text-sm text-graphite tabular-nums">{s.present}/{s.students} present{s.absent ? <span className="text-margin"> · {s.absent} absent</span> : ''}</span>
                            ) : <Badge tone="warning" dot>Not taken</Badge>}
                            <Icon name="chevronRight" size={18} className="text-pencil" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function LeaveList({ tenant, staff = false, refreshKey }) {
    const toast = useToast();
    const [status, setStatus] = useState(staff ? 'pending' : '');
    const [rows, setRows] = useState(null);
    const load = useCallback(() => api(`school/leave${status ? `?status=${status}` : ''}`, { tenant }).then((r) => setRows(r.data)), [tenant, status]);
    useEffect(() => { load(); }, [load, refreshKey]);

    async function review(l, decision) {
        try {
            await api(`school/leave/${l.id}/review`, { method: 'POST', tenant, body: { status: decision } });
            toast(decision === 'approved' ? 'Leave approved — the register is updated' : 'Leave declined');
            load();
        } catch (e) {
            toast(e.message, 'error');
        }
    }

    return (
        <div>
            {staff && <Tabs value={status} onChange={setStatus} tabs={[{ value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Declined' }, { value: '', label: 'All' }]} />}
            <div className={staff ? 'mt-4' : ''}>
                {rows === null ? <Skeleton className="h-32 rounded-2xl" /> : rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-rule bg-white/60 px-4 py-8 text-center text-pencil">{staff && status === 'pending' ? 'No leave requests waiting.' : 'No leave requests yet.'}</p>
                ) : (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {rows.map((l) => (
                            <li key={l.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-graphite">{l.student.name} <span className="font-normal text-pencil">· {l.student.section}</span></p>
                                    <p className="text-sm text-graphite">{shortDate(l.from_date)}{l.days > 1 ? ` – ${shortDate(l.to_date)}` : ''} · {l.days} {l.days === 1 ? 'day' : 'days'}</p>
                                    <p className="mt-1 text-graphite">{l.reason}</p>
                                    <p className="mt-1 text-xs text-pencil">Asked by {l.requested_by?.name} · {relative(l.created_at)}</p>
                                    {l.attachment && <a href={l.attachment} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-ink hover:underline"><Icon name="file" size={14} />Attachment</a>}
                                </div>
                                {l.can_review ? (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="secondary" onClick={() => review(l, 'rejected')}>Decline</Button>
                                        <Button size="sm" icon="check" onClick={() => review(l, 'approved')}>Approve</Button>
                                    </div>
                                ) : <Badge tone={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}>{l.status === 'pending' ? 'Waiting' : l.status === 'approved' ? 'Approved' : 'Declined'}</Badge>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function FamilyAttendance({ tenant, isParent }) {
    const [family, setFamily] = useState(null);
    const [asking, setAsking] = useState(false);
    const [key, setKey] = useState(0);
    useEffect(() => { api('school/family', { tenant }).then((r) => setFamily(r.children)).catch(() => setFamily([])); }, [tenant]);

    return (
        <div>
            <PageHeader title={isParent ? 'Attendance & leave' : 'Attendance'} description="The last 30 school days."
                actions={family?.length > 0 && <Button icon="plus" onClick={() => setAsking(true)}>Ask for leave</Button>} />
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                {family === null ? <Skeleton className="h-36 rounded-2xl" /> : family.length === 0 ? (
                    <EmptyState icon="family" title="No school record linked">Ask the school office to link your account to your child’s record.</EmptyState>
                ) : family.map((c) => (
                    <div key={c.id} className="rounded-2xl border border-rule bg-white p-5">
                        <p className="font-bold text-ink-deep">{c.name}</p>
                        <p className="text-sm text-pencil">{c.section?.label ?? 'No class yet'}</p>
                        <div className="mt-4 flex items-end gap-6">
                            <p className="font-display text-4xl font-extrabold text-ink-deep tabular-nums">{c.attendance.percent ?? '—'}{c.attendance.percent !== null && <span className="text-xl">%</span>}</p>
                            <p className="pb-1 text-sm text-graphite">{c.attendance.absent} absent · {c.attendance.late} late · {c.attendance.days} days recorded</p>
                        </div>
                        <p className="mt-3 text-sm">Today: {c.today_attendance ? <span className={`rounded px-1.5 py-0.5 font-bold ${ATTENDANCE[c.today_attendance].soft}`}>{ATTENDANCE[c.today_attendance].label}</span> : <span className="text-pencil">not taken yet</span>}</p>
                    </div>
                ))}
            </div>
            <h2 className="mt-10 text-xl font-bold">Leave requests</h2>
            <div className="mt-3"><LeaveList tenant={tenant} refreshKey={key} /></div>
            {asking && <LeaveForm tenant={tenant} family={family} onClose={() => setAsking(false)} onDone={() => { setAsking(false); setKey((k) => k + 1); }} />}
        </div>
    );
}

function LeaveForm({ tenant, family, onClose, onDone }) {
    const toast = useToast();
    const [form, setForm] = useState({ student_id: family[0]?.id ?? '', from_date: today(), to_date: today(), reason: '', attachment: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    async function onFile(f) {
        setUploading(true);
        try { setForm((x) => ({ ...x, attachment: '' })); const r = await upload(f, f.type === 'application/pdf' ? 'pdf' : 'image', tenant); setForm((x) => ({ ...x, attachment: r.url })); } catch (e) { toast(e.message, 'error'); } finally { setUploading(false); }
    }

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api('school/leave', { method: 'POST', tenant, body: { ...form, student_id: Number(form.student_id), attachment: form.attachment || null } });
            toast('Leave request sent to the class teacher');
            onDone();
        } catch (e) {
            setError(e);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} title="Ask for leave" description="The class teacher and school office are notified."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={uploading} onClick={save}>Send request</Button></>}>
            <div className="space-y-4">
                {family.length > 1 && (
                    <Field label="Child" name="student_id" as="select" error={error} value={form.student_id} onChange={set('student_id')}>
                        {family.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Field>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="From" name="from_date" type="date" error={error} value={form.from_date} onChange={set('from_date')} />
                    <Field label="To" name="to_date" type="date" error={error} value={form.to_date} min={form.from_date} onChange={set('to_date')} />
                </div>
                <Field label="Reason" name="reason" as="textarea" rows={3} error={error} value={form.reason} onChange={set('reason')} placeholder="e.g. Doctor’s appointment, family event" />
                <Field label="Supporting document (optional)">
                    <FileDrop kind="any" value={form.attachment} uploading={uploading} onUpload={onFile} onClear={() => setForm({ ...form, attachment: '' })} />
                </Field>
            </div>
        </Modal>
    );
}
