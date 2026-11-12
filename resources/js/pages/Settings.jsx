import { useEffect, useState } from 'react';
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, upload } from '../lib/api';
import { applyBrand, BRANDS } from '../lib/brand';
import { CURRENCIES } from '../lib/format';
import Icon from '../components/Icon';
import { Button, Field, FileDrop, PageHeader, Tabs, Toggle, useToast } from '../components/ui';
import { ActivityTab, ModulesTab } from './school/AdminTabs';

export default function Settings() {
    const { tenant, isAdmin, me, refresh } = useOutletContext();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') ?? 'institute';
    const s = me.tenant.settings ?? {};

    const [form, setForm] = useState(() => ({
        name: me.tenant.name,
        brand: s.brand ?? 'ink',
        logo_url: s.logo_url ?? '',
        welcome_message: s.welcome_message ?? '',
        support_email: s.support_email ?? '',
        support_phone: s.support_phone ?? '',
        certificate_signatory: s.certificate_signatory ?? '',
        currency: s.currency ?? 'USD',
        paypal: s.payments?.paypal ?? '',
        wise: s.payments?.wise ?? '',
        card: s.payments?.card ?? '',
        bank: s.payments?.bank ?? '',
        instructions: s.payments?.instructions ?? '',
        address: s.address ?? '',
        admissions_open: s.admissions_open ?? true,
        library_fine_per_day: s.library_fine_per_day ?? '',
        timezone: s.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    // Undo an unsaved colour preview when leaving the page.
    const savedBrand = s.brand ?? 'ink';
    useEffect(() => () => applyBrand(savedBrand), [savedBrand]);

    if (!isAdmin) return <Navigate to={`/${tenant}`} replace />;

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const pickBrand = (key) => { setForm((f) => ({ ...f, brand: key })); applyBrand(key); };

    async function onLogo(file) {
        setUploading(true);
        setUploadError(null);
        try {
            const r = await upload(file, 'image', tenant);
            setForm((f) => ({ ...f, logo_url: r.url }));
        } catch (err) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    }

    async function save(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('settings', {
                method: 'PATCH', tenant, body: {
                    name: form.name,
                    settings: {
                        brand: form.brand,
                        logo_url: form.logo_url || null,
                        welcome_message: form.welcome_message || null,
                        support_email: form.support_email || null,
                        support_phone: form.support_phone || null,
                        certificate_signatory: form.certificate_signatory || null,
                        currency: form.currency,
                        address: form.address || null,
                        admissions_open: !!form.admissions_open,
                        library_fine_per_day: form.library_fine_per_day === '' ? null : Number(form.library_fine_per_day),
                        timezone: form.timezone || null,
                        payments: {
                            paypal: form.paypal || null,
                            wise: form.wise || null,
                            card: form.card || null,
                            bank: form.bank || null,
                            instructions: form.instructions || null,
                        },
                    },
                },
            });
            await refresh();
            toast('Settings saved');
        } catch (err) {
            setError(err);
            toast(err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    const err = (k) => error?.errors?.[`settings.${k}`]?.[0] ?? error?.errors?.[`settings.payments.${k}`]?.[0];

    return (
        <form onSubmit={save} noValidate className="pb-24">
            <PageHeader title="Settings" description="How your institute looks to students, and how they pay you." />

            <Tabs className="mt-8" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[
                { value: 'institute', label: 'Institute', icon: 'school' },
                { value: 'branding', label: 'Branding', icon: 'palette' },
                { value: 'payments', label: 'Payments', icon: 'wallet' },
                { value: 'certificates', label: 'Certificates', icon: 'award' },
                { value: 'modules', label: 'Modules', icon: 'grid' },
                { value: 'activity', label: 'Activity log', icon: 'clock' },
            ]} />

            <div className="mt-6 max-w-3xl space-y-6">
                {tab === 'institute' && (
                    <Card>
                        <Field label="Institute name" name="name" error={error} value={form.name} onChange={set('name')} />
                        <Field label="Currency" hint="Used for new courses and your revenue figures.">
                            <select value={form.currency} onChange={set('currency')} className="h-11 w-full rounded-lg border border-rule bg-white px-3 focus:border-ink focus:outline-none sm:w-60">
                                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </Field>
                        <Field label="Welcome message on your sign-in page" value={form.welcome_message} onChange={set('welcome_message')} error={err('welcome_message')}
                            placeholder="e.g. Welcome back! Classes resume on Monday." maxLength={300} />
                        <div className="grid gap-5 sm:grid-cols-2">
                            <Field label="Support email" type="email" value={form.support_email} onChange={set('support_email')} error={err('support_email')} hint="Shown to students who need help." />
                            <Field label="Support phone / WhatsApp" value={form.support_phone} onChange={set('support_phone')} error={err('support_phone')} placeholder="+1 555 123 4567" />
                        </div>
                        <Field label="Address" as="textarea" rows={2} value={form.address} onChange={set('address')} error={err('address')} hint="Printed on invoices, receipts and report cards." />
                        <div className="grid gap-5 sm:grid-cols-2">
                            <Field label="Time zone" value={form.timezone} onChange={set('timezone')} error={err('timezone')} placeholder="America/New_York" />
                            <Field label="Library late fine per day" type="number" min="0" step="0.01" value={form.library_fine_per_day} onChange={set('library_fine_per_day')} error={err('library_fine_per_day')} />
                        </div>
                        <Toggle label="Accept online applications" hint={`Your form: ${window.location.host}/${tenant}/apply`} checked={!!form.admissions_open} onChange={(v) => setForm((f) => ({ ...f, admissions_open: v }))} />
                        <div className="rounded-xl bg-paper p-4 text-sm text-pencil">
                            Your sign-in page: <strong className="text-graphite">{window.location.host}/{tenant}/login</strong>
                        </div>
                    </Card>
                )}

                {tab === 'branding' && (
                    <>
                        <Card title="Logo">
                            <FileDrop kind="image" value={form.logo_url} uploading={uploading} error={uploadError ?? err('logo_url')}
                                onUpload={onLogo} onClear={() => setForm((f) => ({ ...f, logo_url: '' }))} hint="Square or wide PNG with a transparent background works best." />
                        </Card>
                        <Card title="Colour" description="Used for buttons, links and highlights across your institute. Changes preview instantly.">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {Object.entries(BRANDS).map(([key, b]) => (
                                    <button key={key} type="button" onClick={() => pickBrand(key)} aria-pressed={form.brand === key}
                                        className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${form.brand === key ? 'border-ink' : 'border-rule hover:border-ink/30'}`}>
                                        <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                                            <span className="flex-1" style={{ background: b.ink }} />
                                            <span className="w-3" style={{ background: b.deep }} />
                                        </span>
                                        <span className="font-bold text-graphite">{b.label}</span>
                                        {form.brand === key && <Icon name="check" size={18} className="ml-auto text-ink" strokeWidth={2.6} />}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-paper p-4">
                                <Button type="button" size="sm">Primary button</Button>
                                <Button type="button" size="sm" variant="secondary">Secondary</Button>
                                <span className="font-bold text-ink">A link</span>
                                <span className="h-2 w-28 overflow-hidden rounded-full bg-ink-50"><span className="block h-full w-2/3 bg-ink" /></span>
                            </div>
                        </Card>
                    </>
                )}

                {tab === 'payments' && (
                    <Card description="Students see these when they buy a paid course. They pay you directly, then send the transaction ID or receipt number for you to approve on the Payments page. Fill in only the ones you use.">
                        <Field label="Bank transfer" as="textarea" rows={4} value={form.bank} onChange={set('bank')} error={err('bank')}
                            placeholder={'Chase Bank\nAccount name: Brightpath Academy LLC\nAccount number: 000123456789\nRouting (ABA): 021000021 · SWIFT: CHASUS33'} />
                        <div className="grid gap-5 sm:grid-cols-2">
                            <Field label="PayPal" value={form.paypal} onChange={set('paypal')} error={err('paypal')} placeholder="payments@yourschool.com or paypal.me/yourschool" />
                            <Field label="Wise" value={form.wise} onChange={set('wise')} error={err('wise')} placeholder="payments@yourschool.com or @yourschool" />
                        </div>
                        <Field label="Card payment link" type="url" value={form.card} onChange={set('card')} error={err('card')}
                            placeholder="https://buy.stripe.com/…" hint="A payment link from Stripe, Square, PayPal or similar. Students pay there and send you the receipt number." />
                        <Field label="Extra instructions (optional)" as="textarea" rows={3} value={form.instructions} onChange={set('instructions')} error={err('instructions')}
                            placeholder="e.g. Put your full name in the payment reference." />
                        <p className="flex items-start gap-2 text-sm text-pencil"><Icon name="lock" size={16} className="mt-0.5 shrink-0" />Only signed-in students of your institute can see these details.</p>
                    </Card>
                )}

                {tab === 'modules' && <ModulesTab tenant={tenant} me={me} refresh={refresh} />}
                {tab === 'activity' && <ActivityTab tenant={tenant} />}

                {tab === 'certificates' && (
                    <Card description="Certificates are issued automatically when a student finishes every lesson of a course with certificates turned on.">
                        <Field label="Signed by" value={form.certificate_signatory} onChange={set('certificate_signatory')} error={err('certificate_signatory')}
                            placeholder="e.g. Emily Carter, Principal" hint="Leave empty to show the course instructor’s name." />
                        <p className="text-sm text-pencil">Every certificate has a code that anyone can check at <strong className="text-graphite">{window.location.host}/verify</strong>.</p>
                    </Card>
                )}
            </div>

            {!['modules', 'activity'].includes(tab) && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-white/95 backdrop-blur lg:left-[17rem]">
                <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-8 lg:px-12">
                    <Button type="submit" busy={busy} icon="check">Save settings</Button>
                </div>
            </div>}
        </form>
    );
}

function Card({ title, description, children }) {
    return (
        <section className="space-y-5 rounded-2xl border border-rule bg-white p-5 sm:p-6">
            {(title || description) && (
                <div>
                    {title && <h2 className="text-lg font-bold">{title}</h2>}
                    {description && <p className="mt-1 text-pencil">{description}</p>}
                </div>
            )}
            {children}
        </section>
    );
}
