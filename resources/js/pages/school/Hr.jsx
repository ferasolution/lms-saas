import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, download } from '../../lib/api';
import { shortDate, today } from '../../lib/school';
import { money } from '../../lib/format';

const LEAVE = { annual: 'Annual', sick: 'Sick', casual: 'Casual', unpaid: 'Unpaid', other: 'Other' };
const STAFF_ATT = { present: ['Present', 'bg-leaf text-white'], late: ['Late', 'bg-amber-500 text-white'], half_day: ['Half day', 'bg-ink text-white'], absent: ['Absent', 'bg-margin text-white'], leave: ['Leave', 'bg-graphite text-white'] };
const monthLabel = (p) => new Date(`${p}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export default function Hr() {
    const { tenant } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || 'people';
    return (
        <div>
            <PageHeader title="Staff & payroll" description="Employee records, staff attendance, leave and monthly payroll." />
            <Tabs className="mt-6" value={tab} onChange={(v) => setParams(v === 'people' ? {} : { tab: v }, { replace: true })} tabs={[
                { value: 'people', label: 'Employees', icon: 'users' },
                { value: 'attendance', label: 'Attendance', icon: 'check2' },
                { value: 'leave', label: 'Leave', icon: 'calendar' },
                { value: 'payroll', label: 'Payroll', icon: 'wallet' },
            ]} />
            <div className="mt-6">
                {tab === 'people' && <Employees tenant={tenant} />}
                {tab === 'attendance' && <StaffRegister tenant={tenant} />}
                {tab === 'leave' && <Leaves tenant={tenant} />}
                {tab === 'payroll' && <Payroll tenant={tenant} />}
            </div>
        </div>
    );
}

function Employees({ tenant }) {
    const toast = useToast();
    const [d, setD] = useState(null);
    const [status, setStatus] = useState('active');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState(null);
    const load = useCallback(() => api(`school/hr/employees?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ''}`, { tenant }).then(setD), [tenant, status, search]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

    async function importAccounts() {
        const r = await api('school/hr/employees/import-accounts', { method: 'POST', tenant });
        toast(`${r.added} staff accounts added as employees`);
        load();
    }

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                {[['active', 'Current'], ['left', 'Former']].map(([v, l]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${status === v ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{l}</button>)}
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, number or role" aria-label="Search employees" className="h-10 w-56 rounded-lg border border-rule bg-white px-3" />
                <div className="ml-auto flex gap-2">
                    <Button variant="secondary" icon="download" onClick={() => download('school/hr/exports/employees.csv', tenant, 'employees.csv')}>Export</Button>
                    <Button icon="plus" onClick={() => setEditing({})}>Add employee</Button>
                </div>
            </div>
            {d?.unlinked_staff_accounts > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-ink-50 px-4 py-3">
                    <p className="flex-1 text-graphite">{d.unlinked_staff_accounts} teacher and admin accounts don’t have an employee record yet.</p>
                    <Button size="sm" onClick={importAccounts}>Add them</Button>
                </div>
            )}
            <div className="mt-4">
                {!d ? <Skeleton className="h-64 rounded-2xl" /> : d.data.length === 0 ? (
                    <EmptyState icon="users" title="No employees">Add teachers, office staff, drivers, guards — everyone you pay.</EmptyState>
                ) : (
                    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {d.data.map((e) => (
                            <li key={e.id}>
                                <button type="button" onClick={() => setEditing(e)} className="flex w-full items-center gap-3 rounded-2xl border border-rule bg-white p-4 text-left transition hover:border-ink/40">
                                    <Avatar name={e.name} size={44} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bold text-graphite">{e.name}</span>
                                        <span className="block truncate text-sm text-pencil">{e.designation ?? '—'}{e.department ? ` · ${e.department}` : ''}</span>
                                        <span className="block text-xs text-pencil">{e.employee_no}{e.user_id ? ' · has sign-in' : ''}</span>
                                    </span>
                                    <span className="text-right text-sm font-bold text-ink-deep tabular-nums">{money(e.base_salary, d.currency)}<span className="block text-xs font-normal text-pencil">/month</span></span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {editing && <EmployeeForm tenant={tenant} employee={editing} departments={d?.departments ?? []} currency={d?.currency} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); toast(m); load(); }} />}
        </div>
    );
}

function ListEditor({ label, rows, onChange }) {
    return (
        <Field label={label}>
            <div className="space-y-2">
                {rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
                        <input aria-label={`${label} name`} value={r.name} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-10 rounded-lg border border-rule px-3" placeholder="Name" />
                        <input aria-label={`${label} amount`} type="number" min="0" value={r.amount} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="h-10 rounded-lg border border-rule px-3 text-right" />
                        <IconButton icon="x" label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
                    </div>
                ))}
                <Button size="sm" variant="ghost" icon="plus" onClick={() => onChange([...rows, { name: '', amount: '' }])}>Add</Button>
            </div>
        </Field>
    );
}

function EmployeeForm({ tenant, employee, departments, currency, onClose, onDone }) {
    const isNew = !employee.id;
    const [f, setF] = useState({
        name: employee.name ?? '', email: employee.email ?? '', phone: employee.phone ?? '', designation: employee.designation ?? '', department: employee.department ?? '',
        employment_type: employee.employment_type ?? 'full_time', joined_on: employee.joined_on ?? '', base_salary: employee.base_salary ?? '', annual_leave_days: employee.annual_leave_days ?? 14,
        bank_name: employee.bank_name ?? '', bank_account: employee.bank_account ?? '', qualifications: employee.qualifications ?? '', notes: employee.notes ?? '',
    });
    const [allowances, setAllowances] = useState(employee.allowances ?? []);
    const [deductions, setDeductions] = useState(employee.deductions ?? []);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

    async function save(extra = {}) {
        setBusy(true);
        setError(null);
        const clean = (rows) => rows.filter((r) => r.name).map((r) => ({ name: r.name, amount: Number(r.amount || 0) }));
        const body = { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), base_salary: Number(f.base_salary || 0), annual_leave_days: Number(f.annual_leave_days || 0), allowances: clean(allowances), deductions: clean(deductions), ...extra };
        try {
            await api(isNew ? 'school/hr/employees' : `school/hr/employees/${employee.id}`, { method: isNew ? 'POST' : 'PATCH', tenant, body });
            onDone(extra.status === 'left' ? `${f.name} marked as left` : isNew ? 'Employee added' : 'Saved');
        } catch (e) { setError(e); } finally { setBusy(false); }
    }

    return (
        <SlideOver open onClose={onClose} title={isNew ? 'Add employee' : employee.name} description={isNew ? null : employee.employee_no}
            footer={<>
                {!isNew && employee.status === 'active' && <Button variant="ghost" className="mr-auto text-margin" onClick={() => save({ status: 'left' })}>Mark as left</Button>}
                <Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => save()}>Save</Button>
            </>}>
            <div className="space-y-4">
                {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                <Field label="Full name" name="name" error={error} value={f.name} onChange={set('name')} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Designation" name="designation" error={error} value={f.designation} onChange={set('designation')} placeholder="Teacher, Accountant, Driver" />
                    <Field label="Department" name="department" error={error} value={f.department} onChange={set('department')} list="departments" />
                    <datalist id="departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
                    <Field label="Email" name="email" type="email" error={error} value={f.email} onChange={set('email')} />
                    <Field label="Phone" name="phone" error={error} value={f.phone} onChange={set('phone')} />
                    <Field label="Type" name="employment_type" as="select" error={error} value={f.employment_type} onChange={set('employment_type')}>
                        <option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="visiting">Visiting</option>
                    </Field>
                    <Field label="Joined" name="joined_on" type="date" error={error} value={f.joined_on} onChange={set('joined_on')} />
                </div>
                <fieldset className="space-y-4 rounded-xl border border-rule bg-white p-4">
                    <legend className="px-1 font-bold text-ink-deep">Pay</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={`Monthly base salary (${currency})`} name="base_salary" type="number" min="0" error={error} value={f.base_salary} onChange={set('base_salary')} />
                        <Field label="Annual leave days" name="annual_leave_days" type="number" min="0" error={error} value={f.annual_leave_days} onChange={set('annual_leave_days')} />
                    </div>
                    <ListEditor label="Allowances" rows={allowances} onChange={setAllowances} />
                    <ListEditor label="Fixed deductions" rows={deductions} onChange={setDeductions} />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Bank" name="bank_name" error={error} value={f.bank_name} onChange={set('bank_name')} />
                        <Field label="Account number" name="bank_account" error={error} value={f.bank_account} onChange={set('bank_account')} />
                    </div>
                </fieldset>
                <Field label="Qualifications" name="qualifications" as="textarea" rows={2} error={error} value={f.qualifications} onChange={set('qualifications')} />
                <Field label="Notes" name="notes" as="textarea" rows={2} error={error} value={f.notes} onChange={set('notes')} />
            </div>
        </SlideOver>
    );
}

function StaffRegister({ tenant }) {
    const toast = useToast();
    const [day, setDay] = useState(today());
    const [d, setD] = useState(null);
    const [marks, setMarks] = useState({});
    const [busy, setBusy] = useState(false);
    useEffect(() => { setD(null); api(`school/hr/attendance?date=${day}`, { tenant }).then((r) => { setD(r); setMarks(Object.fromEntries(r.employees.map((e) => [e.id, { status: e.status, check_in: e.check_in ?? '', check_out: e.check_out ?? '' }]))); }); }, [tenant, day]);

    async function save() {
        setBusy(true);
        try {
            await api('school/hr/attendance', { method: 'POST', tenant, body: { date: day, records: Object.entries(marks).filter(([, v]) => v.status).map(([id, v]) => ({ employee_id: Number(id), status: v.status, check_in: v.check_in || null, check_out: v.check_out || null })) } });
            toast('Staff attendance saved');
        } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
    }

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} aria-label="Date" className="h-10 rounded-lg border border-rule bg-white px-3 font-bold" />
                {d && <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setMarks(Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, { ...v, status: v.status ?? 'present' }])))}>Mark everyone else present</Button>}
            </div>
            {!d ? <Skeleton className="mt-4 h-64 rounded-2xl" /> : d.employees.length === 0 ? <div className="mt-4"><EmptyState icon="users" title="No employees yet">Add employees first.</EmptyState></div> : (
                <>
                    <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {d.employees.map((e) => (
                            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1"><p className="truncate font-bold text-graphite">{e.name}</p><p className="text-sm text-pencil">{e.designation}</p></div>
                                <input type="time" aria-label="Check in" value={marks[e.id]?.check_in ?? ''} onChange={(ev) => setMarks({ ...marks, [e.id]: { ...marks[e.id], check_in: ev.target.value } })} className="hidden h-9 rounded-lg border border-rule px-2 text-sm sm:block" />
                                <div className="flex gap-1">
                                    {Object.entries(STAFF_ATT).map(([k, [l, tone]]) => (
                                        <button key={k} type="button" aria-pressed={marks[e.id]?.status === k} onClick={() => setMarks({ ...marks, [e.id]: { ...marks[e.id], status: k } })}
                                            className={`h-9 rounded-lg px-2.5 text-sm font-bold ${marks[e.id]?.status === k ? tone : 'bg-paper text-pencil ring-1 ring-rule'}`}>{l}</button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="sticky bottom-3 mt-4 flex justify-end"><Button icon="check" busy={busy} onClick={save}>Save attendance</Button></div>
                </>
            )}
        </div>
    );
}

function Leaves({ tenant }) {
    const toast = useToast();
    const [status, setStatus] = useState('pending');
    const [rows, setRows] = useState(null);
    const [adding, setAdding] = useState(false);
    const load = useCallback(() => api(`school/hr/leaves${status ? `?status=${status}` : ''}`, { tenant }).then((r) => setRows(r.data)), [tenant, status]);
    useEffect(() => { load(); }, [load]);
    async function review(l, s) {
        try { await api(`school/hr/leaves/${l.id}/review`, { method: 'POST', tenant, body: { status: s } }); toast(s === 'approved' ? 'Leave approved' : 'Leave declined'); load(); } catch (e) { toast(e.message, 'error'); }
    }
    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <Tabs value={status} onChange={setStatus} tabs={[{ value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Declined' }, { value: '', label: 'All' }]} />
                <Button icon="plus" variant="secondary" onClick={() => setAdding(true)}>Record leave</Button>
            </div>
            <div className="mt-4">
                {rows === null ? <Skeleton className="h-40 rounded-2xl" /> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-rule bg-white/60 px-4 py-10 text-center text-pencil">No leave requests here.</p> : (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {rows.map((l) => (
                            <li key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-graphite">{l.employee?.name} <span className="font-normal text-pencil">· {LEAVE[l.type]} leave · {l.days} {l.days === 1 ? 'day' : 'days'}</span></p>
                                    <p className="text-sm text-graphite">{shortDate(l.from_date)}{l.days > 1 ? ` – ${shortDate(l.to_date)}` : ''}</p>
                                    {l.reason && <p className="text-sm text-pencil">{l.reason}</p>}
                                </div>
                                {l.status === 'pending' ? <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => review(l, 'rejected')}>Decline</Button><Button size="sm" icon="check" onClick={() => review(l, 'approved')}>Approve</Button></div>
                                    : <Badge tone={l.status === 'approved' ? 'success' : 'danger'}>{l.status === 'approved' ? 'Approved' : 'Declined'}</Badge>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {adding && <RecordLeave tenant={tenant} onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast('Leave recorded'); load(); }} />}
        </div>
    );
}

function RecordLeave({ tenant, onClose, onDone, self = false }) {
    const [emps, setEmps] = useState([]);
    const [f, setF] = useState({ employee_id: '', type: 'annual', from_date: today(), to_date: today(), reason: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (!self) api('school/hr/employees', { tenant }).then((r) => setEmps(r.data)); }, [tenant, self]);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try { await api(self ? 'school/hr/me/leave' : 'school/hr/leaves', { method: 'POST', tenant, body: { ...f, employee_id: self ? undefined : Number(f.employee_id), reason: f.reason || null } }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={self ? 'Ask for leave' : 'Record leave'} description={self ? 'The school office is notified.' : 'Recorded as approved.'}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>{self ? 'Send request' : 'Save'}</Button></>}>
            <div className="space-y-4">
                {error && !Object.keys(error.errors ?? {}).length && <p className="text-margin">{error.message}</p>}
                {!self && <Field label="Employee" name="employee_id" as="select" error={error} value={f.employee_id} onChange={set('employee_id')}><option value="">Choose…</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Field>}
                <Field label="Type" name="type" as="select" error={error} value={f.type} onChange={set('type')}>{Object.entries(LEAVE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="From" name="from_date" type="date" error={error} value={f.from_date} onChange={set('from_date')} />
                    <Field label="To" name="to_date" type="date" error={error} value={f.to_date} min={f.from_date} onChange={set('to_date')} />
                </div>
                <Field label="Reason (optional)" name="reason" as="textarea" rows={2} error={error} value={f.reason} onChange={set('reason')} />
            </div>
        </Modal>
    );
}

function Payroll({ tenant }) {
    const toast = useToast();
    const [runs, setRuns] = useState(null);
    const [open, setOpen] = useState(null);
    const [period, setPeriod] = useState(today().slice(0, 7));
    const load = useCallback(() => api('school/hr/payroll', { tenant }).then(setRuns), [tenant]);
    useEffect(() => { load(); }, [load]);

    async function create() {
        try { const r = await api('school/hr/payroll', { method: 'POST', tenant, body: { period } }); toast('Draft payroll created'); load(); setOpen(r.id); } catch (e) { toast(e.errors?.period?.[0] ?? e.message, 'error'); }
    }

    if (open) return <PayrollRunView tenant={tenant} id={open} onBack={() => { setOpen(null); load(); }} />;
    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rule bg-white p-4">
                <p className="flex-1 font-bold text-graphite">Run payroll for</p>
                <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month" className="h-10 rounded-lg border border-rule px-3 font-bold" />
                <Button icon="plus" onClick={create}>Create draft</Button>
            </div>
            <div className="mt-4">
                {!runs ? <Skeleton className="h-40 rounded-2xl" /> : runs.data.length === 0 ? <EmptyState icon="wallet" title="No payroll yet">Create a draft for this month. We work out each payslip from salary, allowances, deductions and unpaid absences.</EmptyState> : (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {runs.data.map((r) => (
                            <li key={r.id}>
                                <button type="button" onClick={() => setOpen(r.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-paper/60">
                                    <span className="min-w-0 flex-1"><span className="block font-bold text-graphite">{monthLabel(r.period)}</span><span className="text-sm text-pencil">{r.payslips_count} payslips{r.paid_on ? ` · paid ${shortDate(r.paid_on)}` : ''}</span></span>
                                    <span className="font-bold tabular-nums">{money(r.net, r.currency)}</span>
                                    <Badge tone={r.status === 'paid' ? 'success' : r.status === 'finalized' ? 'draft' : 'neutral'}>{r.status === 'paid' ? 'Paid' : r.status === 'finalized' ? 'Finalised' : 'Draft'}</Badge>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function PayrollRunView({ tenant, id, onBack }) {
    const toast = useToast();
    const [r, setR] = useState(null);
    const [slip, setSlip] = useState(null);
    const load = useCallback(() => api(`school/hr/payroll/${id}`, { tenant }).then(setR), [tenant, id]);
    useEffect(() => { load(); }, [load]);
    async function act(path, body, msg) {
        try { await api(`school/hr/payroll/${id}/${path}`, { method: 'POST', tenant, body }); toast(msg); load(); } catch (e) { toast(e.message, 'error'); }
    }
    async function remove() {
        try { await api(`school/hr/payroll/${id}`, { method: 'DELETE', tenant }); toast('Draft deleted'); onBack(); } catch (e) { toast(e.message, 'error'); }
    }
    if (!r) return <Skeleton className="h-64 rounded-2xl" />;
    const c = r.currency;
    return (
        <div>
            <button type="button" onClick={onBack} className="mb-3 text-sm font-bold text-pencil hover:text-ink">← All payroll</button>
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="flex-1 text-2xl font-bold">{monthLabel(r.period)}</h2>
                <Button variant="secondary" icon="download" onClick={() => download(`school/hr/payroll/${id}/export.csv`, tenant, `payroll-${r.period}.csv`)}>Bank file (CSV)</Button>
                {r.status === 'draft' && <>
                    <Button variant="ghost" onClick={remove}>Delete draft</Button>
                    <Button variant="secondary" onClick={() => act('recalculate', {}, 'Recalculated from current salaries and attendance')}>Recalculate</Button>
                    <Button onClick={() => act('status', { status: 'finalized' }, 'Payroll finalised')}>Finalise</Button>
                </>}
                {r.status === 'finalized' && <>
                    <Button variant="ghost" onClick={() => act('status', { status: 'draft' }, 'Back to draft')}>Reopen</Button>
                    <Button icon="check" onClick={() => act('status', { status: 'paid', paid_on: today() }, 'Marked as paid · staff notified')}>Mark as paid</Button>
                </>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
                {[['Gross', r.gross], ['Deductions', r.deductions], ['Net pay', r.net]].map(([l, v]) => <div key={l} className="rounded-2xl border border-rule bg-white p-4"><p className="text-sm text-pencil">{l}</p><p className="font-display text-2xl font-bold tabular-nums">{money(v, c)}</p></div>)}
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-paper/60 text-left text-pencil"><tr><th className="px-4 py-2 font-bold">Employee</th><th className="px-4 py-2 text-right font-bold">Basic</th><th className="px-4 py-2 text-right font-bold">Allow. + bonus</th><th className="px-4 py-2 text-right font-bold">Unpaid days</th><th className="px-4 py-2 text-right font-bold">Deductions</th><th className="px-4 py-2 text-right font-bold">Net</th><th /></tr></thead>
                    <tbody className="divide-y divide-rule">
                        {r.payslips.map((p) => (
                            <tr key={p.id}>
                                <td className="px-4 py-2.5"><p className="font-bold text-graphite">{p.employee?.name}</p><p className="text-xs text-pencil">{p.employee?.designation}</p></td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{money(p.basic, c)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{money(p.gross - p.basic, c)}</td>
                                <td className={`px-4 py-2.5 text-right tabular-nums ${p.unpaid_days ? 'font-bold text-margin' : 'text-pencil'}`}>{p.unpaid_days || '—'}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{money(p.total_deductions, c)}</td>
                                <td className="px-4 py-2.5 text-right font-bold tabular-nums">{money(p.net, c)}</td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                    {r.status === 'draft' && <button type="button" className="mr-3 font-bold text-ink hover:underline" onClick={() => setSlip(p)}>Adjust</button>}
                                    <Link to={`/${tenant}/payslips/${p.id}`} target="_blank" className="font-bold text-ink hover:underline">Payslip</Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {slip && <AdjustSlip tenant={tenant} slip={slip} onClose={() => setSlip(null)} onDone={() => { setSlip(null); load(); }} />}
        </div>
    );
}

function AdjustSlip({ tenant, slip, onClose, onDone }) {
    const [f, setF] = useState({ bonus: slip.bonus || '', unpaid_days: slip.unpaid_days, note: slip.note ?? '' });
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        try { await api(`school/hr/payslips/${slip.id}`, { method: 'PATCH', tenant, body: { bonus: Number(f.bonus || 0), unpaid_days: Number(f.unpaid_days || 0), note: f.note || null } }); onDone(); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={`Adjust · ${slip.employee?.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Bonus" type="number" min="0" value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
                    <Field label="Unpaid days" type="number" min="0" step="0.5" value={f.unpaid_days} onChange={(e) => setF({ ...f, unpaid_days: e.target.value })} hint="Each day deducts 1/30 of basic." />
                </div>
                <Field label="Note on payslip" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            </div>
        </Modal>
    );
}

/** Teachers and staff: their own payslips and leave. */
export function MyHr() {
    const { tenant } = useOutletContext();
    const toast = useToast();
    const [d, setD] = useState(null);
    const [asking, setAsking] = useState(false);
    const load = useCallback(() => api('school/hr/me', { tenant }).then(setD), [tenant]);
    useEffect(() => { load(); }, [load]);
    if (!d) return <Skeleton className="h-64 rounded-2xl" />;
    if (!d.employee) return <><PageHeader title="My HR" /><div className="mt-6"><EmptyState icon="user" title="No employee record yet">Ask the school office to add you under Staff & payroll. Then your payslips and leave appear here.</EmptyState></div></>;
    return (
        <div>
            <PageHeader title="My HR" description={`${d.employee.designation ?? ''}${d.employee.department ? ` · ${d.employee.department}` : ''} · ${d.employee.employee_no}`} actions={<Button icon="plus" onClick={() => setAsking(true)}>Ask for leave</Button>} />
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-rule bg-white">
                    <h2 className="border-b border-rule px-5 py-3.5 text-lg font-bold">Payslips</h2>
                    {d.payslips.length === 0 ? <p className="px-5 py-8 text-center text-pencil">No payslips yet.</p> : (
                        <ul className="divide-y divide-rule">{d.payslips.map((p) => (
                            <li key={p.id}><Link to={`/${tenant}/payslips/${p.id}`} target="_blank" className="flex items-center gap-3 px-5 py-3 hover:bg-paper/60"><span className="flex-1 font-bold text-graphite">{monthLabel(p.period)}</span><span className="font-bold tabular-nums">{money(p.net, p.currency)}</span><Badge tone={p.status === 'paid' ? 'success' : 'draft'}>{p.status === 'paid' ? 'Paid' : 'Ready'}</Badge></Link></li>
                        ))}</ul>
                    )}
                </section>
                <section className="rounded-2xl border border-rule bg-white">
                    <div className="flex items-center justify-between border-b border-rule px-5 py-3.5"><h2 className="text-lg font-bold">Leave</h2><span className="text-sm text-pencil"><b className="text-ink-deep">{d.leave_balance.annual}</b> of {d.leave_balance.allowance} annual days left</span></div>
                    {d.leaves.length === 0 ? <p className="px-5 py-8 text-center text-pencil">No leave taken this year.</p> : (
                        <ul className="divide-y divide-rule">{d.leaves.map((l) => (
                            <li key={l.id} className="flex items-center gap-3 px-5 py-3"><span className="flex-1"><b className="text-graphite">{LEAVE[l.type]}</b> <span className="text-sm text-pencil">· {shortDate(l.from_date)}{l.days > 1 ? ` – ${shortDate(l.to_date)}` : ''}</span></span><Badge tone={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}>{l.status === 'pending' ? 'Waiting' : l.status === 'approved' ? 'Approved' : 'Declined'}</Badge></li>
                        ))}</ul>
                    )}
                </section>
            </div>
            {asking && <RecordLeave tenant={tenant} self onClose={() => setAsking(false)} onDone={() => { setAsking(false); toast('Leave request sent'); load(); }} />}
        </div>
    );
}
