import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, session } from '../lib/api';
import AuthShell from '../components/AuthShell';
import Icon from '../components/Icon';
import { Button, EmptyState, Field, Skeleton } from '../components/ui';

const TYPE_ICON = { school: 'school', academy: 'academy', corporate: 'building' };

export default function Login() {
    const { tenant } = useParams();
    const navigate = useNavigate();
    const [info, setInfo] = useState(null);
    const [form, setForm] = useState({ email: '', password: '' });
    const [show, setShow] = useState(false);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api('tenant', { tenant, token: null })
            .then(setInfo)
            .catch((err) => setInfo({ missing: err.status === 404, blocked: err.status === 403, message: err.message }));
    }, [tenant]);

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

    const aside = info?.name ? (
        <>
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20">
                <Icon name={TYPE_ICON[info.type] ?? 'academy'} size={30} />
            </span>
            <h2 className="mt-8 font-display text-4xl leading-[1.1] font-extrabold text-white">{info.name}</h2>
            <p className="mt-3 text-[17px] text-white/70">Sign in with the email and password your institute gave you.</p>
        </>
    ) : null;

    return (
        <AuthShell aside={aside}>
            {info === null ? (
                <div className="space-y-4" role="status" aria-label="Loading"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
            ) : info.missing || info.blocked ? (
                <EmptyState icon={info.blocked ? 'lock' : 'search'} title={info.blocked ? 'This institute is unavailable' : 'No institute at this address'}
                    action={<Link to="/login" className="font-bold text-ink hover:underline">Find your institute</Link>}>
                    {info.blocked ? info.message : <>Nothing is set up at <strong className="text-graphite">/{tenant}</strong>. Check the link you were given.</>}
                </EmptyState>
            ) : (
                <>
                    <p className="font-bold text-pencil lg:hidden">{info.name}</p>
                    <h1 className="text-3xl font-extrabold">Welcome back</h1>
                    <p className="mt-2 text-pencil">Sign in to <span className="font-bold text-graphite">{info.name}</span>.</p>

                    <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
                        <Field label="Email" name="email" type="email" error={error} autoComplete="email" value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus />
                        <Field label="Password">
                            <div className="relative">
                                <input aria-label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    className="h-11 w-full rounded-lg border border-rule bg-white pr-12 pl-3 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                                <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-pencil hover:text-ink"
                                    aria-label={show ? 'Hide password' : 'Show password'}>
                                    <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
                                </button>
                            </div>
                        </Field>
                        {error?.status === 429 && <p className="text-margin" role="alert">Too many attempts. Wait a minute, then try again.</p>}
                        <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
                    </form>
                    <div className="mt-6 rounded-xl bg-paper px-4 py-3 text-center text-sm text-pencil">
                        <p><strong className="text-graphite">Forgot your password?</strong> Your institute’s admin can set a new one for you.</p>
                        {(info.settings?.support_email || info.settings?.support_phone) && (
                            <p className="mt-1">
                                Contact them at{' '}
                                {info.settings.support_email && <a href={`mailto:${info.settings.support_email}`} className="font-bold text-ink hover:underline">{info.settings.support_email}</a>}
                                {info.settings.support_email && info.settings.support_phone && ' or '}
                                {info.settings.support_phone && <a href={`tel:${info.settings.support_phone.replace(/\s/g, '')}`} className="font-bold text-ink hover:underline">{info.settings.support_phone}</a>}
                            </p>
                        )}
                    </div>
                    <p className="mt-2 text-center text-sm"><Link to="/login" className="font-bold text-ink hover:underline">Not your institute?</Link></p>
                </>
            )}
        </AuthShell>
    );
}
