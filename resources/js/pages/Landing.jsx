import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fieldError, session } from '../lib/api';

const TYPES = [
    { value: 'school', title: 'School or college', text: 'Classes, teachers, students and parents.' },
    { value: 'academy', title: 'Academy or course seller', text: 'Sell online courses and issue certificates.' },
    { value: 'corporate', title: 'Company', text: 'Train employees and track completion.' },
];

const slugify = (s) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function Landing() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        institute_name: '', slug: '', type: 'academy', name: '', email: '', password: '', password_confirmation: '',
    });
    const [slugTouched, setSlugTouched] = useState(false);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const set = (key) => (e) => {
        const value = e.target.value;
        setForm((f) => ({
            ...f,
            [key]: value,
            ...(key === 'institute_name' && !slugTouched ? { slug: slugify(value) } : {}),
        }));
    };

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await api('register-institute', { method: 'POST', body: form });
            session.save(res.tenant.slug, res.token);
            navigate(`/${res.tenant.slug}`);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
            <section className="ruled margin-line relative flex flex-col justify-between px-6 py-10 pl-10 sm:pl-16 lg:min-h-screen lg:py-16">
                <p className="font-display text-lg font-bold text-ink">Fera Learn</p>
                <div className="my-14 max-w-xl">
                    <h1 className="text-5xl leading-[1.05] font-extrabold sm:text-6xl">
                        Run your classes, courses and trainings from one place.
                    </h1>
                    <p className="mt-6 max-w-md text-lg leading-8 text-pencil">
                        Upload lessons, set quizzes, track every student’s progress and take payments.
                        Your institute gets its own address and branding.
                    </p>
                </div>
                <p className="text-sm text-pencil">14-day free trial. No card needed.</p>
            </section>

            <section className="flex items-center px-6 py-12 sm:px-12">
                <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-5" noValidate>
                    <h2 className="text-2xl font-bold">Create your institute</h2>

                    {error && !Object.keys(error.errors).length && (
                        <p className="error" role="alert">{error.message}</p>
                    )}

                    <fieldset>
                        <legend className="label">What are you setting up?</legend>
                        <div className="grid gap-2">
                            {TYPES.map((t) => (
                                <label key={t.value}
                                    className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 ${form.type === t.value ? 'border-ink bg-ink/5' : 'border-rule bg-white'}`}>
                                    <input type="radio" name="type" value={t.value} checked={form.type === t.value}
                                        onChange={set('type')} className="mt-1 accent-ink" />
                                    <span>
                                        <span className="block font-bold text-graphite">{t.title}</span>
                                        <span className="block text-sm text-pencil">{t.text}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <div>
                        <label className="label" htmlFor="institute_name">Institute name</label>
                        <input id="institute_name" className="field" value={form.institute_name} onChange={set('institute_name')} required />
                        {fieldError(error, 'institute_name') && <p className="error">{fieldError(error, 'institute_name')}</p>}
                    </div>

                    <div>
                        <label className="label" htmlFor="slug">Your address</label>
                        <div className="flex items-center rounded-md border border-rule bg-white focus-within:border-ink">
                            <span className="pl-3 whitespace-nowrap text-pencil">{window.location.host}/</span>
                            <input id="slug" className="w-full bg-transparent px-1 py-2.5 focus:outline-none" value={form.slug}
                                onChange={(e) => { setSlugTouched(true); set('slug')({ target: { value: slugify(e.target.value) } }); }} required />
                        </div>
                        {fieldError(error, 'slug') && <p className="error">{fieldError(error, 'slug')}</p>}
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <label className="label" htmlFor="name">Your name</label>
                            <input id="name" className="field" value={form.name} onChange={set('name')} autoComplete="name" required />
                            {fieldError(error, 'name') && <p className="error">{fieldError(error, 'name')}</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="email">Email</label>
                            <input id="email" type="email" className="field" value={form.email} onChange={set('email')} autoComplete="email" required />
                            {fieldError(error, 'email') && <p className="error">{fieldError(error, 'email')}</p>}
                        </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <label className="label" htmlFor="password">Password</label>
                            <input id="password" type="password" className="field" value={form.password} onChange={set('password')} autoComplete="new-password" required />
                            {fieldError(error, 'password') && <p className="error">{fieldError(error, 'password')}</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="password_confirmation">Confirm password</label>
                            <input id="password_confirmation" type="password" className="field" value={form.password_confirmation}
                                onChange={set('password_confirmation')} autoComplete="new-password" required />
                        </div>
                    </div>

                    <button className="btn-ink w-full" disabled={busy}>
                        {busy ? 'Creating institute…' : 'Create institute'}
                    </button>
                </form>
            </section>
        </div>
    );
}
