import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fieldError, session } from '../lib/api';

export default function Login() {
    const { tenant } = useParams();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await api('auth/login', { method: 'POST', body: form, tenant, token: null });
            session.save(tenant, res.token);
            navigate(`/${tenant}`);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="ruled flex min-h-screen items-center justify-center px-6">
            <form onSubmit={submit} className="margin-line w-full max-w-sm rounded-lg border border-rule bg-white p-8 pl-10 shadow-sm" noValidate>
                <h1 className="text-2xl font-bold">Sign in</h1>
                <p className="mt-1 text-pencil">to <span className="font-bold text-graphite">{tenant}</span></p>

                {error?.status === 404 && (
                    <p className="error" role="alert">
                        No institute uses this address. Check the link, or <Link className="underline" to="/">create one</Link>.
                    </p>
                )}
                {error?.status === 403 && <p className="error" role="alert">{error.message}</p>}

                <div className="mt-6 space-y-4">
                    <div>
                        <label className="label" htmlFor="email">Email</label>
                        <input id="email" type="email" className="field" autoComplete="email" value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                        {fieldError(error, 'email') && <p className="error">{fieldError(error, 'email')}</p>}
                    </div>
                    <div>
                        <label className="label" htmlFor="password">Password</label>
                        <input id="password" type="password" className="field" autoComplete="current-password" value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                    </div>
                    <button className="btn-ink w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                </div>
            </form>
        </div>
    );
}
