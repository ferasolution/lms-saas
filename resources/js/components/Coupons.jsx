import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { date, money } from '../lib/format';
import Icon from './Icon';
import { Badge, Button, EmptyState, Field, IconButton, Modal, Skeleton, Toggle, useToast } from './ui';

/** Admin: create and manage discount codes. */
export default function Coupons({ tenant, currency }) {
    const toast = useToast();
    const [items, setItems] = useState(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(() => api('coupons', { tenant }).then((r) => setItems(r.data)).catch(() => setItems([])), [tenant]);
    useEffect(() => { load(); }, [load]);

    async function toggle(c) {
        await api(`coupons/${c.id}`, { method: 'PATCH', tenant, body: { is_active: !c.is_active } }).catch((e) => toast(e.message, 'error'));
        toast(c.is_active ? `${c.code} turned off` : `${c.code} turned on`);
        load();
    }

    async function remove(c) {
        try {
            await api(`coupons/${c.id}`, { method: 'DELETE', tenant });
            toast('Code deleted');
            load();
        } catch (e) {
            toast(e.message, 'error');
        }
    }

    async function copy(code) {
        try { await navigator.clipboard.writeText(code); toast(`${code} copied`); } catch { /* clipboard blocked */ }
    }

    const value = (c) => (c.type === 'percent' ? `${c.value}% off` : `${money(c.value, c.course?.currency ?? currency)} off`);

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-pencil">Give students a code for a percentage or fixed amount off a paid course.</p>
                <Button icon="plus" onClick={() => setCreating(true)}>New code</Button>
            </div>
            {items === null ? <Skeleton className="h-40 rounded-2xl" /> : items.length === 0 ? (
                <EmptyState icon="tag" title="No discount codes yet" action={<Button icon="plus" onClick={() => setCreating(true)}>Create a code</Button>}>
                    Codes like WELCOME20 or EARLYBIRD help fill a new course.
                </EmptyState>
            ) : (
                <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                    {items.map((c) => {
                        const expired = c.expires_at && new Date(c.expires_at) < new Date();
                        const used = c.max_uses && c.used_count >= c.max_uses;
                        return (
                            <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 ${c.is_active ? '' : 'bg-paper/60'}`}>
                                <button type="button" onClick={() => copy(c.code)} title="Copy code"
                                    className="rounded-lg border-2 border-dashed border-ink/30 px-3 py-1 font-mono font-bold tracking-wider text-ink-deep hover:border-ink">
                                    {c.code}
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-graphite">{value(c)}</p>
                                    <p className="text-sm text-pencil">
                                        {c.course ? c.course.title : 'Any paid course'}
                                        {c.expires_at ? ` · until ${date(c.expires_at)}` : ''}
                                    </p>
                                </div>
                                <span className="text-sm text-pencil tabular-nums">Used {c.used_count}{c.max_uses ? ` of ${c.max_uses}` : ''}</span>
                                {expired ? <Badge>Expired</Badge> : used ? <Badge>Used up</Badge> : c.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge>Off</Badge>}
                                <div className="flex items-center gap-1">
                                    <Toggle label={<span className="sr-only">Active</span>} checked={c.is_active} onChange={() => toggle(c)} />
                                    {c.used_count === 0 && <IconButton icon="trash" label={`Delete ${c.code}`} onClick={() => remove(c)} />}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <NewCoupon open={creating} onClose={() => setCreating(false)} tenant={tenant} currency={currency}
                onCreated={(c) => { setCreating(false); toast(`${c.code} is ready to share`); load(); }} />
        </div>
    );
}

function randomCode() {
    const words = ['WELCOME', 'LEARN', 'SPRING', 'SUMMER', 'FALL', 'STUDY', 'START'];
    return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(10 + Math.random() * 40)}`;
}

function NewCoupon({ open, onClose, tenant, currency, onCreated }) {
    const blank = { code: '', type: 'percent', value: '20', course_id: '', max_uses: '', expires_at: '' };
    const [form, setForm] = useState(blank);
    const [courses, setCourses] = useState([]);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setForm({ ...blank, code: randomCode() });
        setError(null);
        api('courses?per_page=100', { tenant }).then((r) => setCourses(r.data.filter((c) => !c.is_free && Number(c.price) > 0))).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, tenant]);

    const set = (k) => (e) => setForm({ ...form, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });

    async function save(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const c = await api('coupons', { method: 'POST', tenant, body: {
                code: form.code, type: form.type, value: Number(form.value),
                course_id: form.course_id ? Number(form.course_id) : null,
                max_uses: form.max_uses ? Number(form.max_uses) : null,
                expires_at: form.expires_at || null,
            } });
            onCreated(c);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="New discount code"
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Create code</Button></>}>
            <form onSubmit={save} className="space-y-4" noValidate>
                <Field label="Code" name="code" error={error} value={form.code} onChange={set('code')} className="font-mono" hint="Letters, numbers, dashes. Students type this at checkout." />
                <div className="grid grid-cols-2 gap-2">
                    {[['percent', 'Percentage off'], ['fixed', `Fixed amount (${currency})`]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setForm({ ...form, type: v })} aria-pressed={form.type === v}
                            className={`h-11 rounded-lg border text-sm font-bold ${form.type === v ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule text-pencil'}`}>{l}</button>
                    ))}
                </div>
                <Field label={form.type === 'percent' ? 'Percent off' : 'Amount off'} name="value" type="number" min="1" max={form.type === 'percent' ? 100 : undefined}
                    error={error} value={form.value} onChange={set('value')} hint={form.type === 'percent' && Number(form.value) === 100 ? 'Students get the course free with this code.' : null} />
                <Field label="Course" name="course_id" as="select" error={error} value={form.course_id} onChange={set('course_id')}>
                    <option value="">Any paid course</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Use limit (optional)" name="max_uses" type="number" min="1" error={error} value={form.max_uses} onChange={set('max_uses')} placeholder="Unlimited" />
                    <Field label="Expires (optional)" name="expires_at" type="date" error={error} value={form.expires_at} onChange={set('expires_at')} />
                </div>
                <p className="flex items-center gap-2 text-sm text-pencil"><Icon name="alert" size={16} />A code counts as used once its payment is approved.</p>
            </form>
        </Modal>
    );
}
