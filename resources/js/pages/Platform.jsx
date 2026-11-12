import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session } from '../lib/api';
import AuthShell, { AsideList } from '../components/AuthShell';
import { Button, Field } from '../components/ui';

const KEY = '__platform';

export function PlatformLogin() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await api('platform/login', { method: 'POST', body: form });
            session.save(KEY, r.token);
            navigate('/platform');
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell aside={<AsideList title="Platform console" items={['Every institute on Fera EduSphere', 'Trials, plans and suspensions', 'Growth at a glance']} />}>
            <h1 className="text-3xl font-extrabold">Owner sign in</h1>
            <p className="mt-2 text-pencil">For the people who run Fera EduSphere itself.</p>
            <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
                <Field label="Email" name="email" type="email" error={error} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" autoFocus />
                <Field label="Password" name="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
                {error?.status === 429 && <p className="text-margin">Too many attempts. Wait a minute.</p>}
                <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
            </form>
        </AuthShell>
    );
}
