import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fieldError } from '../lib/api';

// First-run installer: database details in, .env written, DEPLOY_TOKEN shown once.
export default function Install() {
    const [status, setStatus] = useState(null);
    const [result, setResult] = useState(null);
    const [form, setForm] = useState({
        install_key: '',
        app_url: window.location.origin,
        db_host: 'localhost',
        db_port: 3306,
        db_database: '',
        db_username: '',
        db_password: '',
        admin_name: '',
        admin_email: '',
        admin_password: '',
        admin_password_confirmation: '',
    });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    useEffect(() => {
        api('install').then(setStatus).catch(() => setStatus({ installed: false, ready: false, failed: true }));
    }, []);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            setResult(await api('install', { method: 'POST', body: form }));
        } catch (err) {
            setError(err);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setBusy(false);
        }
    }

    const field = (id, label, props = {}, hint) => (
        <div>
            <label className="label" htmlFor={id}>{label}</label>
            <input id={id} className="field" value={form[id]} onChange={set(id)} {...props} />
            {hint && <p className="mt-1.5 text-sm text-pencil">{hint}</p>}
            {fieldError(error, id) && <p className="error">{fieldError(error, id)}</p>}
        </div>
    );

    return (
        <div className="ruled min-h-screen px-6 py-12">
            <div className="margin-line mx-auto max-w-xl rounded-lg border border-rule bg-white p-8 pl-10 shadow-sm">
                <h1 className="text-3xl font-bold">Install Fera EduSphere</h1>

                {status === null && <p className="mt-4 text-pencil" role="status">Checking the server…</p>}

                {status?.installed && !result && (
                    <p className="mt-4 text-pencil">
                        This site is already installed, so the installer is closed.{' '}
                        <Link to="/" className="text-ink underline">Go to the home page</Link>.
                    </p>
                )}

                {status && !status.installed && !status.ready && !result && (
                    <p className="mt-4 text-graphite">
                        {status.failed
                            ? 'The server did not respond. Check that PHP 8.3 is selected for this subdomain, then reload.'
                            : 'The installer is not ready yet. Run a deploy from GitHub first, then reload this page.'}
                    </p>
                )}

                {result && <Done result={result} />}

                {status && !status.installed && status.ready && !result && (
                    <form onSubmit={submit} className="mt-6 space-y-8" noValidate>
                        {error && !Object.keys(error.errors).length && (
                            <p className="error rounded-md border border-margin/30 bg-margin/5 px-3 py-2" role="alert">{error.message}</p>
                        )}

                        <fieldset className="space-y-4">
                            <legend className="font-display text-xl font-bold text-ink-deep">Confirm it’s you</legend>
                            {field('install_key', 'Install key', { type: 'password', autoComplete: 'off' },
                                'The INSTALL_KEY secret saved in GitHub. If you did not add one, use the FTP password.')}
                        </fieldset>

                        <fieldset className="space-y-4">
                            <legend className="font-display text-xl font-bold text-ink-deep">Database</legend>
                            <p className="text-sm text-pencil">From cPanel → MySQL Databases. Use the full names, including the prefix.</p>
                            {field('db_database', 'Database name', { placeholder: 'ferasol_lms', autoComplete: 'off' })}
                            {field('db_username', 'Database user', { placeholder: 'ferasol_lmsuser', autoComplete: 'off' })}
                            {field('db_password', 'Database password', { type: 'password', autoComplete: 'off' })}
                            <div className="grid grid-cols-[1fr_7rem] gap-4">
                                {field('db_host', 'Host')}
                                {field('db_port', 'Port', { type: 'number' })}
                            </div>
                        </fieldset>

                        <fieldset className="space-y-4">
                            <legend className="font-display text-xl font-bold text-ink-deep">Your owner account</legend>
                            <p className="text-sm text-pencil">You’ll use this to manage every institute on the platform.</p>
                            {field('admin_name', 'Your name', { autoComplete: 'name' })}
                            {field('admin_email', 'Email', { type: 'email', autoComplete: 'email' })}
                            <div className="grid gap-4 sm:grid-cols-2">
                                {field('admin_password', 'Password (10+ characters)', { type: 'password', autoComplete: 'new-password' })}
                                {field('admin_password_confirmation', 'Confirm password', { type: 'password', autoComplete: 'new-password' })}
                            </div>
                        </fieldset>

                        <fieldset className="space-y-4">
                            <legend className="font-display text-xl font-bold text-ink-deep">Site address</legend>
                            {field('app_url', 'Address', { type: 'url' })}
                        </fieldset>

                        <button className="btn-ink w-full" disabled={busy}>
                            {busy ? 'Installing… this can take a minute' : 'Install'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

function Done({ result }) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(result.deploy_token);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    }

    return (
        <div className="mt-6 space-y-6">
            <p className="text-lg text-graphite" role="status">
                Installed. The database is ready and your owner account <strong>{result.owner_email}</strong> is created.
            </p>

            <div>
                <h2 className="text-xl font-bold">Your deploy token</h2>
                <p className="mt-1 text-pencil">
                    Shown only once. In GitHub open Settings → Secrets and variables → Actions,
                    and save it as <strong className="text-graphite">DEPLOY_TOKEN</strong>.
                </p>
                <div className="mt-3 flex gap-2">
                    <input readOnly value={result.deploy_token} className="field font-mono text-sm" onFocus={(e) => e.target.select()} aria-label="Deploy token" />
                    <button type="button" className="btn-ink shrink-0" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                </div>
            </div>

            <p className="text-pencil">
                After saving the token, the next push to GitHub finishes the setup automatically.
            </p>
        </div>
    );
}
