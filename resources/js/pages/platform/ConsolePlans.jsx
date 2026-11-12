import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Skeleton, Toggle, useToast } from '../../components/ui';
import Icon from '../../components/Icon';
import { call, Panel, relative, usd } from './shared';

const limit = (v, unit) => (v ? `${Number(v).toLocaleString()} ${unit}` : `Unlimited ${unit}`);

export function ConsolePlans() {
    const toast = useToast();
    const [plans, setPlans] = useState(null);
    const [editing, setEditing] = useState(null);

    const load = useCallback(() => call('plans').then((r) => setPlans(r.data)), []);
    useEffect(() => { load(); }, [load]);

    return (
        <div>
            <PageHeader title="Plans" description="What institutes pay you each month and what each plan includes. Changes apply straight away."
                actions={<Button icon="plus" onClick={() => setEditing({})}>New plan</Button>} />
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans === null ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />) : plans.map((p) => (
                    <article key={p.id} className={`flex flex-col rounded-2xl border bg-white p-6 ${p.is_active ? 'border-rule' : 'border-dashed border-rule opacity-70'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-bold">{p.name}</h2>
                                <p className="mt-1 font-display text-3xl font-extrabold text-ink-deep">{Number(p.price_monthly) ? usd(p.price_monthly) : 'Free'}<span className="text-base font-bold text-pencil">{Number(p.price_monthly) ? ' /month' : ''}</span></p>
                            </div>
                            {p.is_active ? <Badge tone="success" dot>On sale</Badge> : <Badge>Hidden</Badge>}
                        </div>
                        <ul className="mt-5 space-y-2 text-graphite">
                            <li className="flex items-center gap-2"><Icon name="users" size={18} className="text-pencil" />{limit(p.max_students, 'students')}</li>
                            <li className="flex items-center gap-2"><Icon name="book" size={18} className="text-pencil" />{limit(p.max_courses, 'courses')}</li>
                            <li className="flex items-center gap-2"><Icon name="layers" size={18} className="text-pencil" />{p.storage_mb ? `${(p.storage_mb / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB storage` : 'Unlimited storage'}</li>
                        </ul>
                        <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule pt-4">
                            <span className="text-sm text-pencil">{p.subscribers} paying {p.subscribers === 1 ? 'institute' : 'institutes'}</span>
                            <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditing(p)}>Edit</Button>
                        </div>
                    </article>
                ))}
            </div>
            <PlanEditor plan={editing} onClose={() => setEditing(null)} onSaved={(r, msg) => { setPlans(r.data); setEditing(null); toast(msg); }} />
        </div>
    );
}

function PlanEditor({ plan, onClose, onSaved }) {
    const isNew = plan && !plan.id;
    const [form, setForm] = useState({});
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!plan) return;
        setError(null);
        setForm({
            name: plan.name ?? '', price_monthly: plan.price_monthly != null ? String(Number(plan.price_monthly)) : '',
            max_students: plan.max_students ? String(plan.max_students) : '', max_courses: plan.max_courses ? String(plan.max_courses) : '',
            storage_mb: plan.storage_mb ? String(plan.storage_mb) : '', is_active: plan.is_active ?? true,
        });
    }, [plan]);

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const num = (v) => (v === '' ? null : Number(v));

    async function save(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const body = { name: form.name, price_monthly: Number(form.price_monthly || 0), max_students: num(form.max_students), max_courses: num(form.max_courses), storage_mb: num(form.storage_mb), is_active: form.is_active };
            const r = await call(isNew ? 'plans' : `plans/${plan.id}`, { method: isNew ? 'POST' : 'PATCH', body });
            onSaved(r, isNew ? `${form.name} plan created` : `${form.name} plan saved`);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open={!!plan} onClose={onClose} title={isNew ? 'New plan' : `Edit ${plan?.name}`}
            description={plan?.subscribers ? `${plan.subscribers} institutes are on this plan. New limits apply to them too; nobody loses data.` : null}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>{isNew ? 'Create plan' : 'Save plan'}</Button></>}>
            <form onSubmit={save} className="space-y-4" noValidate>
                {error && !Object.keys(error.errors).length && <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin" role="alert">{error.message}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" name="name" error={error} value={form.name ?? ''} onChange={set('name')} placeholder="e.g. Growth" />
                    <Field label="Price per month (USD)" name="price_monthly" type="number" min="0" error={error} value={form.price_monthly ?? ''} onChange={set('price_monthly')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Students" name="max_students" type="number" min="1" error={error} value={form.max_students ?? ''} onChange={set('max_students')} placeholder="Unlimited" />
                    <Field label="Courses" name="max_courses" type="number" min="1" error={error} value={form.max_courses ?? ''} onChange={set('max_courses')} placeholder="Unlimited" />
                    <Field label="Storage (MB)" name="storage_mb" type="number" min="1" error={error} value={form.storage_mb ?? ''} onChange={set('storage_mb')} placeholder="Unlimited" />
                </div>
                <p className="text-sm text-pencil">Leave a limit empty for unlimited.</p>
                <Toggle label="On sale" hint="Hidden plans stay on existing institutes but can’t be picked by new ones."
                    checked={!!form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
            </form>
        </Modal>
    );
}

export function ConsoleAnnouncements() {
    const toast = useToast();
    const [items, setItems] = useState(null);
    const [form, setForm] = useState({ title: '', body: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => call('announcements').then((r) => setItems(r.data)), []);
    useEffect(() => { load(); }, [load]);

    async function send(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await call('announcements', { method: 'POST', body: form });
            toast(`Sent to ${r.sent_to} institute ${r.sent_to === 1 ? 'admin' : 'admins'}`);
            setForm({ title: '', body: '' });
            load();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <PageHeader title="Announcements" description="Tell every institute admin about new features, maintenance or policy changes. It appears on their dashboard and as a notification." />
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Panel title="New announcement">
                    <form onSubmit={send} className="space-y-4" noValidate>
                        <Field label="Title" name="title" error={error} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Scheduled maintenance on Sunday" />
                        <Field label="Message" name="body" as="textarea" rows={7} error={error} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                        <Button type="submit" icon="flag" busy={busy} disabled={!form.title.trim() || !form.body.trim()}>Send to all institutes</Button>
                    </form>
                </Panel>
                <Panel title="Sent" padded={false}>
                    {items === null ? <div className="p-5"><Skeleton className="h-24" /></div> : items.length === 0 ? (
                        <div className="p-5"><EmptyState icon="flag" title="Nothing sent yet">Your announcements will be listed here.</EmptyState></div>
                    ) : (
                        <ul className="divide-y divide-rule">
                            {items.map((a) => (
                                <li key={a.id} className="px-5 py-4">
                                    <p className="font-bold text-ink-deep">{a.title}</p>
                                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-graphite">{a.body}</p>
                                    <p className="mt-1 text-xs text-pencil">{relative(a.created_at)}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}
