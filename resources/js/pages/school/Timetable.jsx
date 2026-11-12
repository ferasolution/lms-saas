import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { SectionSelect, WeekGrid } from '../../components/school';
import { Button, EmptyState, IconButton, PageHeader, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { WEEKDAYS, useStructure } from '../../lib/school';

export default function Timetable() {
    const ctx = useOutletContext();
    return ctx.isStaff ? <StaffTimetable {...ctx} /> : <FamilyTimetable {...ctx} />;
}

function StaffTimetable({ tenant, isOffice, me }) {
    const [params, setParams] = useSearchParams();
    const [structure] = useStructure(tenant);
    const isTeacher = me.user.role === 'instructor';
    const tab = params.get('tab') || (isTeacher ? 'mine' : 'class');
    const section = Number(params.get('section')) || structure?.sections[0]?.id || '';
    const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

    return (
        <div>
            <PageHeader title="Timetable" description={isOffice ? 'Build each class’s week. We stop you from booking a teacher in two places at once.' : 'Your week and each class’s timetable.'} />
            <Tabs className="mt-6" value={tab} onChange={(v) => set('tab', v)} tabs={[
                { value: 'mine', label: 'My week', icon: 'user' },
                { value: 'class', label: 'Class timetables', icon: 'grid' },
            ]} />
            <div className="mt-6">
                {tab === 'mine' ? <MyWeek tenant={tenant} /> : !structure ? <Skeleton className="h-64 rounded-2xl" /> : structure.sections.length === 0 ? (
                    <EmptyState icon="calendar" title="No classes yet">Add classes under Classes & subjects first.</EmptyState>
                ) : (
                    <>
                        <SectionSelect structure={structure} value={section} onChange={(v) => set('section', String(v))} className="w-full sm:w-72" />
                        <div className="mt-4"><SectionWeek tenant={tenant} section={section} structure={structure} /></div>
                    </>
                )}
            </div>
        </div>
    );
}

function MyWeek({ tenant }) {
    const [slots, setSlots] = useState(null);
    useEffect(() => { api('school/timetable/mine', { tenant }).then((r) => setSlots(r.slots ?? [])).catch(() => setSlots([])); }, [tenant]);
    if (!slots) return <Skeleton className="h-64 rounded-2xl" />;
    return <WeekGrid slots={slots} showSection />;
}

function SectionWeek({ tenant, section, structure }) {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [editing, setEditing] = useState(false);
    const load = useCallback(() => api(`school/timetable/sections/${section}`, { tenant }).then(setData).catch((e) => toast(e.message, 'error')), [tenant, section]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (section) { setData(null); load(); } }, [load, section]);

    if (!data) return <Skeleton className="h-64 rounded-2xl" />;
    return (
        <div>
            {data.can_edit && (
                <div className="mb-3 flex justify-end">
                    <Button icon="edit" onClick={() => setEditing(true)}>{data.slots.length ? 'Edit timetable' : 'Build timetable'}</Button>
                </div>
            )}
            <WeekGrid slots={data.slots} />
            {editing && <Editor tenant={tenant} section={structure.sections.find((s) => s.id === section)} structure={structure} slots={data.slots}
                onClose={() => setEditing(false)} onSaved={(slots) => { setEditing(false); setData({ ...data, slots }); toast('Timetable saved · class notified'); }} />}
        </div>
    );
}

const BLANK = (weekday, starts_at = '08:00', ends_at = '08:45') => ({ weekday, starts_at, ends_at, subject_id: '', teacher_id: '', label: '', room: '', meeting_url: '' });

function addMinutes(t, m) {
    const [h, mm] = t.split(':').map(Number);
    const total = h * 60 + mm + m;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function Editor({ tenant, section, structure, slots, onClose, onSaved }) {
    const [rows, setRows] = useState(() => slots.map((s) => ({
        weekday: s.weekday, starts_at: s.starts_at, ends_at: s.ends_at, subject_id: s.subject?.id ?? '', teacher_id: s.teacher?.id ?? '',
        label: s.label ?? '', room: s.room ?? '', meeting_url: s.meeting_url ?? '',
    })));
    const [day, setDay] = useState(1);
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState({});
    const [message, setMessage] = useState(null);

    // Default teacher for a subject in this section.
    const teacherFor = useMemo(() => Object.fromEntries((section?.subjects ?? []).map((x) => [x.subject_id, x.teacher?.id ?? ''])), [section]);
    const subjects = section?.subjects?.length ? section.subjects.map((x) => ({ id: x.subject_id, name: x.name })) : structure.subjects;
    const dayRows = rows.map((r, i) => ({ ...r, i })).filter((r) => r.weekday === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    const update = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    function addPeriod() {
        const last = dayRows[dayRows.length - 1];
        setRows([...rows, BLANK(day, last ? last.ends_at : '08:00', last ? addMinutes(last.ends_at, 45) : '08:45')]);
    }
    function copyToWeek() {
        const src = rows.filter((r) => r.weekday === day);
        setRows([...rows.filter((r) => r.weekday === day || r.weekday > 5), ...[1, 2, 3, 4, 5].filter((d) => d !== day).flatMap((d) => src.map((r) => ({ ...r, weekday: d })))]);
    }

    async function save() {
        setBusy(true);
        setErrors({});
        setMessage(null);
        const payload = rows.map((r) => ({
            weekday: r.weekday, starts_at: r.starts_at, ends_at: r.ends_at,
            subject_id: r.subject_id ? Number(r.subject_id) : null, teacher_id: r.teacher_id ? Number(r.teacher_id) : null,
            label: r.label || null, room: r.room || null, meeting_url: r.meeting_url || null,
        }));
        try {
            const r = await api(`school/timetable/sections/${section.id}`, { method: 'PUT', tenant, body: { slots: payload } });
            onSaved(r.slots);
        } catch (e) {
            setErrors(e.errors ?? {});
            setMessage(e.message);
            const first = Object.keys(e.errors ?? {})[0]?.match(/slots\.(\d+)/);
            if (first) setDay(rows[Number(first[1])].weekday);
        } finally {
            setBusy(false);
        }
    }

    const err = (i, k) => errors[`slots.${i}.${k}`]?.[0];
    const inp = 'h-9 w-full rounded-lg border bg-white px-2 text-sm focus:border-ink focus:outline-none';

    return (
        <SlideOver open onClose={onClose} title={`Timetable · ${section?.label}`} description="Add each period per day. Use a label like “Break” or “Assembly” for periods without a subject."
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save timetable</Button></>}>
            <div className="flex gap-1 overflow-x-auto pb-2">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                    const n = rows.filter((r) => r.weekday === d).length;
                    const bad = rows.some((r, i) => r.weekday === d && Object.keys(errors).some((k) => k.startsWith(`slots.${i}.`)));
                    return (
                        <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d}
                            className={`rounded-lg px-3 py-1.5 text-sm font-bold whitespace-nowrap ${day === d ? 'bg-ink-deep text-white' : 'bg-white text-graphite ring-1 ring-rule'} ${bad ? 'ring-2 ring-margin' : ''}`}>
                            {WEEKDAYS[d].slice(0, 3)}{n ? ` · ${n}` : ''}
                        </button>
                    );
                })}
            </div>
            {message && <p className="mt-2 rounded-lg bg-margin/5 px-3 py-2 text-sm text-margin" role="alert">{message}</p>}
            <ul className="mt-3 space-y-3">
                {dayRows.length === 0 && <li className="rounded-xl border border-dashed border-rule px-4 py-6 text-center text-pencil">No periods on {WEEKDAYS[day]}.</li>}
                {dayRows.map((r) => (
                    <li key={r.i} className="rounded-xl bg-white p-3 ring-1 ring-rule">
                        <div className="grid grid-cols-[5.5rem_5.5rem_1fr_auto] items-center gap-2">
                            <input type="time" aria-label="Starts" value={r.starts_at} onChange={(e) => update(r.i, { starts_at: e.target.value })} className={`${inp} ${err(r.i, 'starts_at') ? 'border-margin' : 'border-rule'}`} />
                            <input type="time" aria-label="Ends" value={r.ends_at} onChange={(e) => update(r.i, { ends_at: e.target.value })} className={`${inp} ${err(r.i, 'ends_at') ? 'border-margin' : 'border-rule'}`} />
                            <select aria-label="Subject" value={r.subject_id} onChange={(e) => update(r.i, { subject_id: e.target.value, teacher_id: teacherFor[Number(e.target.value)] ?? r.teacher_id })} className={`${inp} border-rule`}>
                                <option value="">No subject (break, assembly…)</option>
                                {subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                            <IconButton icon="trash" label="Remove period" onClick={() => setRows(rows.filter((_, j) => j !== r.i))} />
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {r.subject_id ? (
                                <select aria-label="Teacher" value={r.teacher_id} onChange={(e) => update(r.i, { teacher_id: e.target.value })} className={`${inp} ${err(r.i, 'teacher_id') ? 'border-margin' : 'border-rule'}`}>
                                    <option value="">No teacher</option>
                                    {structure.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            ) : <input aria-label="Label" placeholder="Label, e.g. Break" value={r.label} onChange={(e) => update(r.i, { label: e.target.value })} className={`${inp} border-rule`} />}
                            <input aria-label="Room" placeholder="Room" value={r.room} onChange={(e) => update(r.i, { room: e.target.value })} className={`${inp} border-rule`} />
                            <input aria-label="Online class link" placeholder="Online class link (optional)" value={r.meeting_url} onChange={(e) => update(r.i, { meeting_url: e.target.value })} className={`${inp} ${err(r.i, 'meeting_url') ? 'border-margin' : 'border-rule'}`} />
                        </div>
                        {['starts_at', 'ends_at', 'teacher_id', 'meeting_url'].map((k) => err(r.i, k) && <p key={k} className="mt-1 text-sm text-margin">{err(r.i, k)}</p>)}
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon="plus" onClick={addPeriod}>Add period</Button>
                {dayRows.length > 0 && day <= 5 && <Button size="sm" variant="ghost" icon="copy" onClick={copyToWeek}>Copy {WEEKDAYS[day]} to Mon–Fri</Button>}
            </div>
        </SlideOver>
    );
}

function FamilyTimetable({ tenant, isParent }) {
    const [children, setChildren] = useState(null);
    const [active, setActive] = useState(0);
    useEffect(() => { api('school/timetable/mine', { tenant }).then((r) => setChildren(r.children ?? [])).catch(() => setChildren([])); }, [tenant]);

    return (
        <div>
            <PageHeader title="Timetable" description={isParent ? 'Your children’s weekly classes. Online classes show a Join link.' : 'Your weekly classes. Online classes show a Join link.'} />
            <div className="mt-6">
                {children === null ? <Skeleton className="h-64 rounded-2xl" /> : children.length === 0 ? (
                    <EmptyState icon="calendar" title="No timetable yet">Your class timetable appears here once the school publishes it.</EmptyState>
                ) : (
                    <>
                        {children.length > 1 && (
                            <Tabs value={active} onChange={setActive} tabs={children.map((c, i) => ({ value: i, label: c.student.name.split(' ')[0] }))} />
                        )}
                        <p className="mt-4 mb-3 font-bold text-graphite">{children[active].section?.label ?? 'No class yet'}</p>
                        <WeekGrid slots={children[active].slots} />
                    </>
                )}
            </div>
        </div>
    );
}
