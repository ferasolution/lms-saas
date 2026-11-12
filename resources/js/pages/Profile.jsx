import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { Avatar, Button, Field, PageHeader, useToast } from '../components/ui';
import { ROLE_LABEL } from './TenantLayout';

export default function Profile() {
    const { me, tenant, refresh } = useOutletContext();
    const toast = useToast();
    const [info, setInfo] = useState({ name: me.user.name, phone: me.user.phone ?? '' });
    const [pass, setPass] = useState({ current_password: '', password: '', password_confirmation: '' });
    const [infoError, setInfoError] = useState(null);
    const [passError, setPassError] = useState(null);
    const [busy, setBusy] = useState(null);

    async function saveInfo(e) {
        e.preventDefault();
        setBusy('info');
        setInfoError(null);
        try {
            await api('auth/me', { method: 'PATCH', tenant, body: { name: info.name, phone: info.phone || null } });
            await refresh();
            toast('Profile saved');
        } catch (err) {
            setInfoError(err);
        } finally {
            setBusy(null);
        }
    }

    async function savePassword(e) {
        e.preventDefault();
        setBusy('pass');
        setPassError(null);
        try {
            await api('auth/me', { method: 'PATCH', tenant, body: pass });
            setPass({ current_password: '', password: '', password_confirmation: '' });
            toast('Password changed. Other devices were signed out.');
        } catch (err) {
            setPassError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="max-w-3xl">
            <PageHeader title="Your profile" />
            <div className="mt-8 flex items-center gap-4 rounded-2xl border border-rule bg-white p-5">
                <Avatar name={me.user.name} size={56} />
                <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-ink-deep">{me.user.name}</p>
                    <p className="truncate text-pencil">{me.user.email} · {ROLE_LABEL[me.user.role] ?? me.user.role} at {me.tenant.name}</p>
                </div>
            </div>

            <form onSubmit={saveInfo} className="mt-6 space-y-5 rounded-2xl border border-rule bg-white p-5 sm:p-6" noValidate>
                <h2 className="text-lg font-bold">Details</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Full name" name="name" error={infoError} value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} autoComplete="name" />
                    <Field label="Phone" name="phone" type="tel" error={infoError} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} autoComplete="tel" />
                </div>
                <p className="text-sm text-pencil">To change your email, ask your institute’s admin.</p>
                <Button type="submit" busy={busy === 'info'}>Save details</Button>
            </form>

            <form onSubmit={savePassword} className="mt-6 space-y-5 rounded-2xl border border-rule bg-white p-5 sm:p-6" noValidate>
                <h2 className="text-lg font-bold">Password</h2>
                <Field label="Current password" name="current_password" type="password" error={passError} autoComplete="current-password"
                    value={pass.current_password} onChange={(e) => setPass({ ...pass, current_password: e.target.value })} />
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="New password" name="password" type="password" error={passError} autoComplete="new-password" hint="At least 8 characters."
                        value={pass.password} onChange={(e) => setPass({ ...pass, password: e.target.value })} />
                    <Field label="Confirm new password" type="password" autoComplete="new-password"
                        value={pass.password_confirmation} onChange={(e) => setPass({ ...pass, password_confirmation: e.target.value })} />
                </div>
                <Button type="submit" busy={busy === 'pass'} disabled={!pass.current_password || !pass.password}>Change password</Button>
            </form>
        </div>
    );
}
