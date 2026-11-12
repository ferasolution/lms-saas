import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Button, Field, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';

/** Public admission form at /:tenant/apply. */
export default function Apply() {
    const { tenant } = useParams();
    const [info, setInfo] = useState(null);
    const [f, setF] = useState({ student_name: '', date_of_birth: '', gender: '', school_class_id: '', previous_school: '', guardian_name: '', relation: 'mother', guardian_email: '', guardian_phone: '', notes: '', website: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);

    useEffect(() => {
        api('admissions/form', { tenant }).then((d) => { setInfo(d); document.title = `Apply · ${d.institute.name}`; }).catch(() => setInfo(false));
    }, [tenant]);

    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await api('admissions/apply', { method: 'POST', tenant, body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])) });
            setDone(r.reference);
            window.scrollTo(0, 0);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-paper">
            <div className="ruled border-b border-rule bg-white">
                <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
                    {info === null ? <Skeleton className="h-10 w-64" /> : info === false ? (
                        <h1 className="text-3xl font-extrabold">Institute not found</h1>
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                {info.institute.logo ? <img src={info.institute.logo} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink text-white"><Icon name="school" size={24} /></span>}
                                <p className="font-display text-xl font-bold text-ink-deep">{info.institute.name}</p>
                            </div>
                            <h1 className="mt-6 text-4xl font-extrabold">Apply for admission</h1>
                            <p className="mt-2 text-pencil">Tell us about your child. The admissions office will contact you about the next steps.</p>
                        </>
                    )}
                </div>
            </div>

            <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
                {done ? (
                    <div className="rounded-2xl border border-leaf/30 bg-leaf-50 p-8 text-center">
                        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-leaf text-white"><Icon name="check" size={28} strokeWidth={3} /></span>
                        <h2 className="mt-4 text-2xl font-bold">Application received</h2>
                        <p className="mt-2 text-graphite">Your reference is <strong className="font-mono">{done}</strong>. Keep it for any questions.</p>
                        <p className="mt-1 text-pencil">We’ll write to {f.guardian_email}.</p>
                    </div>
                ) : info && !info.open ? (
                    <p className="rounded-2xl border border-rule bg-white p-8 text-center text-graphite">Admissions are closed at the moment. Please check back later.</p>
                ) : info ? (
                    <form onSubmit={submit} className="space-y-8" noValidate>
                        {error && !Object.keys(error.errors ?? {}).length && <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin" role="alert">{error.message}</p>}
                        <fieldset className="space-y-4">
                            <legend className="text-xl font-bold text-ink-deep">The student</legend>
                            <Field label="Full name" name="student_name" error={error} value={f.student_name} onChange={set('student_name')} autoComplete="off" />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Date of birth" name="date_of_birth" type="date" error={error} value={f.date_of_birth} onChange={set('date_of_birth')} />
                                <Field label="Gender" name="gender" as="select" error={error} value={f.gender} onChange={set('gender')}>
                                    <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
                                </Field>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Applying for" name="school_class_id" as="select" error={error} value={f.school_class_id} onChange={set('school_class_id')}>
                                    <option value="">Not sure</option>
                                    {info.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </Field>
                                <Field label="Current or previous school" name="previous_school" error={error} value={f.previous_school} onChange={set('previous_school')} />
                            </div>
                        </fieldset>
                        <fieldset className="space-y-4">
                            <legend className="text-xl font-bold text-ink-deep">Parent or guardian</legend>
                            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                                <Field label="Full name" name="guardian_name" error={error} value={f.guardian_name} onChange={set('guardian_name')} autoComplete="name" />
                                <Field label="Relation" as="select" value={f.relation} onChange={set('relation')}>
                                    {['mother', 'father', 'guardian', 'grandparent', 'other'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                                </Field>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Email" name="guardian_email" type="email" error={error} value={f.guardian_email} onChange={set('guardian_email')} autoComplete="email" />
                                <Field label="Phone" name="guardian_phone" type="tel" error={error} value={f.guardian_phone} onChange={set('guardian_phone')} autoComplete="tel" />
                            </div>
                            <Field label="Anything we should know? (optional)" name="notes" as="textarea" rows={4} error={error} value={f.notes} onChange={set('notes')} />
                            <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                        </fieldset>
                        <Button type="submit" size="lg" busy={busy} className="w-full sm:w-auto">Send application</Button>
                        <p className="text-sm text-pencil">Already a family here? <Link to={`/${tenant}/login`} className="font-bold text-ink hover:underline">Sign in</Link></p>
                    </form>
                ) : null}
            </main>
        </div>
    );
}
