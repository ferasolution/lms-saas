import { useCallback, useEffect, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { api, fieldError } from '../lib/api';

const ROLES = [
    { value: 'student', label: 'Student' },
    { value: 'instructor', label: 'Instructor' },
    { value: 'parent', label: 'Parent' },
    { value: 'manager', label: 'Manager' },
    { value: 'admin', label: 'Admin' },
];

export default function People() {
    const { tenant, isAdmin, me } = useOutletContext();
    const [role, setRole] = useState('');
    const [people, setPeople] = useState(null);
    const [adding, setAdding] = useState(false);

    const load = useCallback(() => {
        api(`users?per_page=100${role ? `&role=${role}` : ''}`, { tenant }).then(setPeople);
    }, [tenant, role]);

    useEffect(() => { if (isAdmin) load(); }, [load, isAdmin]);

    if (!isAdmin) return <Navigate to={`/${tenant}`} replace />;

    async function toggleActive(person) {
        await api(`users/${person.id}`, { method: 'PATCH', tenant, body: { is_active: !person.is_active } });
        load();
    }

    return (
        <div className="max-w-4xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-3xl font-bold">People</h1>
                {!adding && <button className="btn-ink" onClick={() => setAdding(true)}>Add a person</button>}
            </div>

            {adding && <NewPerson tenant={tenant} onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}

            <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by role">
                {[{ value: '', label: 'Everyone' }, ...ROLES].map((r) => (
                    <button key={r.value} onClick={() => setRole(r.value)} aria-pressed={role === r.value}
                        className={`rounded-full border px-3 py-1 text-sm ${role === r.value ? 'border-ink bg-ink text-white' : 'border-rule bg-white text-graphite'}`}>
                        {r.label}
                    </button>
                ))}
            </div>

            {people?.data.length === 0 && <p className="mt-6 text-pencil">Nobody with this role yet.</p>}

            {people?.data.length > 0 && (
                <ul className="mt-6 divide-y divide-rule border-y border-rule">
                    {people.data.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div className={p.is_active ? '' : 'opacity-50'}>
                                <p className="font-bold text-graphite">{p.name}</p>
                                <p className="text-sm text-pencil">{p.email} · <span className="capitalize">{p.role}</span></p>
                            </div>
                            {p.id !== me.user.id && (
                                <button className="text-sm text-pencil underline hover:text-ink" onClick={() => toggleActive(p)}>
                                    {p.is_active ? 'Disable access' : 'Restore access'}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function NewPerson({ tenant, onDone, onCancel }) {
    const [form, setForm] = useState({ name: '', email: '', role: 'student', phone: '', password: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('users', { method: 'POST', tenant, body: form });
            onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="mt-6 grid max-w-xl gap-4 rounded-lg border border-rule bg-white p-6 sm:grid-cols-2" noValidate>
            <h2 className="text-xl font-bold sm:col-span-2">New person</h2>
            <div>
                <label className="label" htmlFor="p-name">Name</label>
                <input id="p-name" className="field" value={form.name} onChange={set('name')} autoFocus />
                {fieldError(error, 'name') && <p className="error">{fieldError(error, 'name')}</p>}
            </div>
            <div>
                <label className="label" htmlFor="p-role">Role</label>
                <select id="p-role" className="field" value={form.role} onChange={set('role')}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
            </div>
            <div>
                <label className="label" htmlFor="p-email">Email</label>
                <input id="p-email" type="email" className="field" value={form.email} onChange={set('email')} />
                {fieldError(error, 'email') && <p className="error">{fieldError(error, 'email')}</p>}
            </div>
            <div>
                <label className="label" htmlFor="p-phone">Phone (optional)</label>
                <input id="p-phone" className="field" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="sm:col-span-2">
                <label className="label" htmlFor="p-password">Temporary password</label>
                <input id="p-password" type="text" className="field" value={form.password} onChange={set('password')} autoComplete="off" />
                {fieldError(error, 'password') && <p className="error">{fieldError(error, 'password')}</p>}
                <p className="mt-1.5 text-sm text-pencil">Share this with them. They sign in with their email and this password.</p>
            </div>
            <div className="flex gap-3 sm:col-span-2">
                <button className="btn-ink" disabled={busy}>{busy ? 'Adding…' : 'Add person'}</button>
                <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}
