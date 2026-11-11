import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fieldError } from '../lib/api';

// One-time page to create the platform owner account on a server without a terminal.
export default function PlatformSetup() {
    const [available, setAvailable] = useState(null);
    const [done, setDone] = useState(false);
    const [form, setForm] = useState({ token: '', name: '', email: '', password: '', password_confirmation: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    useEffect(() => {
        api('platform/setup').then((r) => setAvailable(r.available)).catch(() => setAvailable(false));
    }, []);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('platform/setup', { method: 'POST', body: form });
            setDone(true);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="ruled flex min-h-screen items-center justify-center px-6 py-10">
            <div className="margin-line w-full max-w-md rounded-lg border border-rule bg-white p-8 pl-10 shadow-sm">
                <h1 className="text-2xl font-bold">Platform setup</h1>

                {available === null && <p className="mt-4 text-pencil" role="status">Checking…</p>}

                {available === false && !done && (
                    <p className="mt-4 text-pencil">
                        Setup is already complete, so this page is closed. <Link to="/" className="text-ink underline">Go to the home page</Link>.
                    </p>
                )}

                {done && (
                    <p className="mt-4 text-graphite" role="status">
                        Your platform owner account is ready. This page is now closed for good.
                    </p>
                )}

                {available && !done && (
                    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                        <p className="text-pencil">Create the owner account. This works only once.</p>
                        <div>
                            <label className="label" htmlFor="s-token">Setup key</label>
                            <input id="s-token" type="password" className="field" value={form.token} onChange={set('token')} autoComplete="off" />
                            <p className="mt-1.5 text-sm text-pencil">The DEPLOY_TOKEN value from the server’s .env file.</p>
                            {fieldError(error, 'token') && <p className="error">{fieldError(error, 'token')}</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="s-name">Your name</label>
                            <input id="s-name" className="field" value={form.name} onChange={set('name')} autoComplete="name" />
                            {fieldError(error, 'name') && <p className="error">{fieldError(error, 'name')}</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="s-email">Email</label>
                            <input id="s-email" type="email" className="field" value={form.email} onChange={set('email')} autoComplete="email" />
                            {fieldError(error, 'email') && <p className="error">{fieldError(error, 'email')}</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="s-pass">Password (10+ characters)</label>
                            <input id="s-pass" type="password" className="field" value={form.password} onChange={set('password')} autoComplete="new-password" />
                            {fieldError(error, 'password') && <p className="error">{fieldError(error, 'password')}</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="s-pass2">Confirm password</label>
                            <input id="s-pass2" type="password" className="field" value={form.password_confirmation} onChange={set('password_confirmation')} autoComplete="new-password" />
                        </div>
                        {error?.status === 429 && <p className="error" role="alert">Too many attempts. Wait a minute and try again.</p>}
                        <button className="btn-ink w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create owner account'}</button>
                    </form>
                )}
            </div>
        </div>
    );
}
