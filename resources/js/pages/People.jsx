import { useCallback, useEffect, useState } from 'react';
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import ResetPasswordDialog, { temporaryPassword } from '../components/ResetPasswordDialog';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Field, Menu, SlideOver, Skeleton, useToast } from '../components/ui';

const ROLES = [
    { value: 'student', label: 'Student', plural: 'Students', hint: 'Takes courses and quizzes.' },
    { value: 'instructor', label: 'Instructor', plural: 'Instructors', hint: 'Creates and manages their own courses.' },
    { value: 'parent', label: 'Parent', plural: 'Parents', hint: 'Follows a child’s progress.' },
    { value: 'manager', label: 'Manager', plural: 'Managers', hint: 'Views reports for their team.' },
    { value: 'admin', label: 'Admin', plural: 'Admins', hint: 'Full control of this institute.' },
];
const ROLE = Object.fromEntries(ROLES.map((r) => [r.value, r]));

export default function People() {
    const { tenant, isAdmin, me } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const toast = useToast();

    const [role, setRole] = useState('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [people, setPeople] = useState(null);
    const [counts, setCounts] = useState({});
    const [editing, setEditing] = useState(params.get('new') ? { role: params.get('role') || 'student' } : null);
    const [disabling, setDisabling] = useState(null);
    const [resetting, setResetting] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => setQuery(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(() => {
        const qs = new URLSearchParams({ per_page: '100' });
        if (role) qs.set('role', role);
        if (query) qs.set('search', query);
        api(`users?${qs}`, { tenant }).then((r) => setPeople(r.data));
        api('dashboard', { tenant }).then((d) => setCounts(d.people ?? {}));
    }, [tenant, role, query]);

    useEffect(() => { if (isAdmin) load(); }, [load, isAdmin]);

    if (!isAdmin) return <Navigate to={`/${tenant}`} replace />;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    function closeEditor() {
        setEditing(null);
        if (params.get('new')) setParams({}, { replace: true });
    }

    async function setActive(person, active) {
        try {
            await api(`users/${person.id}`, { method: 'PATCH', tenant, body: { is_active: active } });
            toast(active ? `${person.name} can sign in again` : `${person.name} can no longer sign in`);
            setDisabling(null);
            load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    return (
        <div>
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold sm:text-4xl">People</h1>
                    <p className="mt-1 text-pencil">Everyone who can sign in to your institute.</p>
                </div>
                <Button icon="plus" onClick={() => setEditing({ role: role || 'student' })}>Add person</Button>
            </header>

            <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-rule" role="tablist" aria-label="Filter by role">
                    {[{ value: '', plural: 'Everyone', count: total }, ...ROLES.map((r) => ({ ...r, count: counts[r.value] ?? 0 }))].map((r) => (
                        <button key={r.value} role="tab" aria-selected={role === r.value} onClick={() => setRole(r.value)}
                            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[15px] font-bold whitespace-nowrap transition ${role === r.value ? 'bg-ink text-white' : 'text-pencil hover:text-ink-deep'}`}>
                            {r.plural}
                            <span className={`rounded-full px-1.5 text-xs tabular-nums ${role === r.value ? 'bg-white/20' : 'bg-ink-50 text-ink'}`}>{r.count}</span>
                        </button>
                    ))}
                </div>
                <label className="relative block lg:w-72">
                    <span className="sr-only">Search people</span>
                    <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-pencil" />
                    <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email"
                        className="h-11 w-full rounded-lg border border-rule bg-white pr-3 pl-10 placeholder:text-pencil/70 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                </label>
            </div>

            <div className="mt-6">
                {people === null ? (
                    <div className="space-y-2 rounded-2xl border border-rule bg-white p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
                ) : people.length === 0 ? (
                    query ? (
                        <EmptyState icon="search" title="Nobody matches that search">Check the spelling, or search by email instead.</EmptyState>
                    ) : (
                        <EmptyState icon="users" title={role ? `No ${ROLE[role].plural.toLowerCase()} yet` : 'No one here yet'}
                            action={<Button icon="plus" onClick={() => setEditing({ role: role || 'student' })}>Add {role ? ROLE[role].label.toLowerCase() : 'person'}</Button>}>
                            Add people with a temporary password, then share your sign-in link with them.
                        </EmptyState>
                    )
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-rule bg-white">
                        <table className="w-full text-left">
                            <thead className="hidden border-b border-rule bg-paper text-sm text-pencil md:table-header-group">
                                <tr>
                                    <th className="px-5 py-3 font-bold">Name</th>
                                    <th className="px-5 py-3 font-bold">Role</th>
                                    <th className="px-5 py-3 font-bold">Phone</th>
                                    <th className="px-5 py-3 font-bold">Access</th>
                                    <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rule">
                                {people.map((p) => {
                                    const self = p.id === me.user.id;
                                    return (
                                        <tr key={p.id} className="flex flex-row-reverse flex-wrap items-center justify-end gap-x-3 gap-y-2 px-5 py-3.5 md:table-row md:px-0">
                                            <td className="flex min-w-0 basis-[calc(100%-3rem)] items-center gap-3 md:basis-auto md:px-5 md:py-3.5">
                                                <span className={p.is_active ? '' : 'opacity-40 grayscale'}><Avatar name={p.name} size={38} /></span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-bold text-graphite">{p.name}{self && <span className="ml-2 text-sm font-normal text-pencil">(you)</span>}</p>
                                                    <p className="truncate text-sm text-pencil">{p.email}</p>
                                                </div>
                                            </td>
                                            <td className="md:px-5"><Badge tone={p.role === 'admin' ? 'draft' : 'neutral'}>{ROLE[p.role]?.label ?? p.role}</Badge></td>
                                            <td className="hidden text-pencil md:table-cell md:px-5">{p.phone || '—'}</td>
                                            <td className="md:px-5">{p.is_active ? <Badge tone="published" dot>Active</Badge> : <Badge tone="danger" dot>Disabled</Badge>}</td>
                                            <td className="order-first ml-auto md:order-none md:px-5 md:text-right">
                                                <Menu label={`Actions for ${p.name}`} items={[
                                                    { label: 'Edit details', icon: 'edit', onClick: () => setEditing(p) },
                                                    !self && { label: 'Reset password', icon: 'lock', onClick: () => setResetting(p) },
                                                    !self && p.is_active && { label: 'Disable access', icon: 'x', danger: true, onClick: () => setDisabling(p) },
                                                    !self && !p.is_active && { label: 'Restore access', icon: 'check', onClick: () => setActive(p, true) },
                                                ]} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <PersonEditor open={editing !== null} person={editing} tenant={tenant} self={editing?.id === me.user.id}
                onClose={closeEditor} onSaved={(msg) => { closeEditor(); toast(msg); load(); }} />

            <ResetPasswordDialog open={!!resetting} person={resetting} signInUrl={`${window.location.origin}/${tenant}/login`}
                onClose={() => setResetting(null)}
                reset={async () => {
                    const password = temporaryPassword();
                    await api(`users/${resetting.id}`, { method: 'PATCH', tenant, body: { password } });
                    return password;
                }} />

            <ConfirmDialog open={!!disabling} title="Disable access?" confirmLabel="Disable access"
                onConfirm={() => setActive(disabling, false)} onClose={() => setDisabling(null)}>
                <strong className="text-graphite">{disabling?.name}</strong> won’t be able to sign in. Their records stay, and you can restore access any time.
            </ConfirmDialog>
        </div>
    );
}

function PersonEditor({ open, person, tenant, self, onClose, onSaved }) {
    const isNew = !person?.id;
    const [form, setForm] = useState({});
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setForm({
            name: person?.name ?? '',
            email: person?.email ?? '',
            phone: person?.phone ?? '',
            role: person?.role ?? 'student',
            password: '',
        });
    }, [open, person]);

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    function suggestPassword() {
        const words = ['ink', 'chalk', 'slate', 'page', 'quill', 'atlas', 'river', 'maple'];
        const pick = () => words[Math.floor(Math.random() * words.length)];
        setForm({ ...form, password: `${pick()}-${pick()}-${Math.floor(100 + Math.random() * 900)}` });
    }

    async function save(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        const body = { name: form.name, email: form.email, phone: form.phone || null, role: form.role };
        if (isNew || form.password) body.password = form.password;
        try {
            await api(isNew ? 'users' : `users/${person.id}`, { method: isNew ? 'POST' : 'PATCH', tenant, body });
            onSaved(isNew ? `${form.name} added` : 'Changes saved');
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <SlideOver open={open} onClose={onClose} title={isNew ? 'Add a person' : 'Edit person'}
            description={isNew ? 'They sign in with this email and the temporary password.' : null}
            footer={<>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button busy={busy} onClick={save}>{isNew ? 'Add person' : 'Save changes'}</Button>
            </>}>
            <form className="space-y-5" onSubmit={save} noValidate>
                {error && !Object.keys(error.errors).length && (
                    <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin" role="alert">{error.message}</p>
                )}
                <Field label="Role" name="role" error={error}>
                    <div className="grid gap-2">
                        {ROLES.map((r) => (
                            <label key={r.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${form.role === r.value ? 'border-ink bg-ink-50' : 'border-rule bg-white hover:border-ink/30'} ${self && r.value !== 'admin' ? 'pointer-events-none opacity-40' : ''}`}>
                                <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={set('role')} className="accent-ink" disabled={self && r.value !== 'admin'} />
                                <span className="font-bold text-graphite">{r.label}</span>
                                <span className="text-sm text-pencil">{r.hint}</span>
                            </label>
                        ))}
                    </div>
                </Field>
                <Field label="Full name" name="name" error={error} value={form.name ?? ''} onChange={set('name')} autoComplete="off" />
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Email" name="email" type="email" error={error} value={form.email ?? ''} onChange={set('email')} autoComplete="off" />
                    <Field label="Phone (optional)" name="phone" type="tel" error={error} value={form.phone ?? ''} onChange={set('phone')} placeholder="+1 555 123 4567" />
                </div>
                <div>
                    <Field label={isNew ? 'Temporary password' : 'New password (optional)'} name="password" error={error}
                        value={form.password ?? ''} onChange={set('password')} autoComplete="new-password"
                        hint={isNew ? 'At least 8 characters. Share it with them privately.' : 'Leave empty to keep their current password.'} />
                    <button type="button" onClick={suggestPassword} className="mt-2 text-sm font-bold text-ink hover:underline">Suggest a password</button>
                </div>
                <button type="submit" className="hidden" />
            </form>
        </SlideOver>
    );
}
