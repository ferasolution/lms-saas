import { useCallback, useEffect, useState } from 'react';
import { api, download } from '../../lib/api';
import { date, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Menu, Modal, Progress, Skeleton, useToast } from '../../components/ui';

export default function StudentsTab({ course, tenant, onChange }) {
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState(null);

    const load = useCallback(() => api(`courses/${course.id}/students`, { tenant }).then((r) => setRows(r.data)), [course.id, tenant]);
    useEffect(() => { load(); }, [load]);

    const active = rows?.filter((r) => r.status !== 'cancelled') ?? [];
    const completed = active.filter((r) => r.status === 'completed').length;
    const avg = active.length ? Math.round(active.reduce((n, r) => n + r.progress_percent, 0) / active.length) : 0;

    async function remove() {
        await api(`courses/${course.id}/students/${removing.user.id}`, { method: 'DELETE', tenant }).catch((e) => toast(e.message, 'error'));
        toast(`${removing.user.name} removed from the course`);
        setRemoving(null);
        load();
        onChange?.();
    }

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-6">
                    <Figure label="Enrolled" value={active.length} />
                    <Figure label="Completed" value={completed} />
                    <Figure label="Average progress" value={`${avg}%`} />
                </div>
                <div className="flex flex-wrap gap-2">
                    {active.length > 0 && (
                        <Button variant="secondary" icon="download" onClick={() => download(`exports/courses/${course.id}/students.csv`, tenant, 'students.csv').catch((e) => toast(e.message, 'error'))}>Export</Button>
                    )}
                    <Button icon="plus" onClick={() => setAdding(true)}>Add students</Button>
                </div>
            </div>

            <div className="mt-6">
                {rows === null ? (
                    <Skeleton className="h-48 rounded-2xl" />
                ) : active.length === 0 ? (
                    <EmptyState icon="users" title="No students yet"
                        action={<Button icon="plus" onClick={() => setAdding(true)}>Add students</Button>}>
                        {course.status === 'published'
                            ? 'Students can enrol themselves from the course page, or you can add them here.'
                            : 'Publish the course so students can find it, or add them here directly.'}
                    </EmptyState>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-rule bg-white">
                        <table className="w-full text-left">
                            <thead className="hidden border-b border-rule bg-paper text-sm text-pencil md:table-header-group">
                                <tr>
                                    <th className="px-5 py-3 font-bold">Student</th>
                                    <th className="px-5 py-3 font-bold">Progress</th>
                                    <th className="px-5 py-3 font-bold">Enrolled</th>
                                    <th className="px-5 py-3 font-bold">Last active</th>
                                    <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rule">
                                {active.map((r) => (
                                    <tr key={r.user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 md:table-row md:px-0">
                                        <td className="flex min-w-0 basis-[calc(100%-3rem)] items-center gap-3 md:basis-auto md:px-5 md:py-3.5">
                                            <Avatar name={r.user.name} size={36} />
                                            <div className="min-w-0">
                                                <p className="truncate font-bold text-graphite">{r.user.name}</p>
                                                <p className="truncate text-sm text-pencil">{r.user.email}</p>
                                            </div>
                                        </td>
                                        <td className="w-full md:w-56 md:px-5">
                                            <div className="flex items-center gap-3">
                                                <Progress value={r.progress_percent} className="flex-1" label={`${r.user.name} progress`} />
                                                <span className="w-10 text-right text-sm font-bold tabular-nums text-graphite">{r.progress_percent}%</span>
                                            </div>
                                            {r.status === 'completed' && <span className="mt-1 inline-block"><Badge tone="published" dot>Completed {date(r.completed_at)}</Badge></span>}
                                        </td>
                                        <td className="hidden text-pencil md:table-cell md:px-5">{date(r.enrolled_at)}</td>
                                        <td className="hidden text-pencil md:table-cell md:px-5">{relative(r.last_active_at)}</td>
                                        <td className="ml-auto md:px-5 md:text-right">
                                            <Menu label={`Actions for ${r.user.name}`} items={[
                                                { label: 'Remove from course', icon: 'x', danger: true, onClick: () => setRemoving(r) },
                                            ]} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <AddStudents open={adding} course={course} tenant={tenant} existing={active.map((r) => r.user.id)}
                onClose={() => setAdding(false)}
                onAdded={(n) => { setAdding(false); toast(`${n} ${n === 1 ? 'student' : 'students'} added`); load(); onChange?.(); }} />

            <ConfirmDialog open={!!removing} title="Remove from course?" confirmLabel="Remove" onConfirm={remove} onClose={() => setRemoving(null)}>
                <strong className="text-graphite">{removing?.user.name}</strong> will lose access to this course. Their progress is kept if you add them back.
            </ConfirmDialog>
        </div>
    );
}

function Figure({ label, value }) {
    return (
        <div>
            <p className="text-sm text-pencil">{label}</p>
            <p className="font-display text-2xl font-bold text-ink-deep tabular-nums">{value}</p>
        </div>
    );
}

function AddStudents({ open, course, tenant, existing, onClose, onAdded }) {
    const [search, setSearch] = useState('');
    const [people, setPeople] = useState(null);
    const [picked, setPicked] = useState(new Set());
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPicked(new Set());
        const t = setTimeout(() => {
            const qs = new URLSearchParams({ role: 'student', per_page: '100' });
            if (search.trim()) qs.set('search', search.trim());
            api(`users?${qs}`, { tenant }).then((r) => setPeople(r.data.filter((p) => p.is_active)));
        }, 200);
        return () => clearTimeout(t);
    }, [open, search, tenant]);

    const available = (people ?? []).filter((p) => !existing.includes(p.id));

    function toggle(id) {
        setPicked((s) => {
            const n = new Set(s);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    }

    async function add() {
        setBusy(true);
        try {
            const r = await api(`courses/${course.id}/students`, { method: 'POST', tenant, body: { user_ids: [...picked] } });
            onAdded(r.added);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="Add students" description={`Give students access to “${course.title}” without payment.`}
            footer={<>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button busy={busy} disabled={!picked.size} onClick={add}>Add {picked.size || ''} {picked.size === 1 ? 'student' : 'students'}</Button>
            </>}>
            <label className="relative block">
                <span className="sr-only">Search students</span>
                <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-pencil" />
                <input type="search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email"
                    className="h-11 w-full rounded-lg border border-rule pr-3 pl-10 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
            </label>
            <div className="mt-4 max-h-80 space-y-1 overflow-y-auto">
                {people === null ? <Skeleton className="h-32" /> : available.length === 0 ? (
                    <p className="py-8 text-center text-pencil">{people.length ? 'Everyone found is already enrolled.' : 'No students found. Add them on the People page first.'}</p>
                ) : available.map((p) => (
                    <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${picked.has(p.id) ? 'bg-ink-50' : 'hover:bg-paper'}`}>
                        <input type="checkbox" className="h-5 w-5 accent-ink" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                        <Avatar name={p.name} size={32} />
                        <span className="min-w-0">
                            <span className="block truncate font-bold text-graphite">{p.name}</span>
                            <span className="block truncate text-sm text-pencil">{p.email}</span>
                        </span>
                    </label>
                ))}
            </div>
        </Modal>
    );
}
