import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthShell, { AsideList } from '../components/AuthShell';
import { Button, Field } from '../components/ui';

/** /verify — type in a certificate code to check it. */
export default function Verify() {
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const clean = code.trim().split('/').pop();
    const valid = /^[0-9a-f-]{36}$/i.test(clean);

    return (
        <AuthShell aside={<AsideList title="Check a certificate" items={['Every certificate has a unique code', 'Scan or open the link printed on it', 'We show who earned it, for which course, and when']} />}>
            <h1 className="text-3xl font-extrabold">Verify a certificate</h1>
            <p className="mt-2 text-pencil">Paste the full code or link printed on the certificate.</p>
            <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); if (valid) navigate(`/verify/${clean}`); }}>
                <Field label="Certificate code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 3f2b9c1e-…" autoFocus
                    error={code && !valid ? 'That doesn’t look like a full certificate code.' : null} />
                <Button type="submit" size="lg" className="w-full" disabled={!valid}>Check certificate</Button>
            </form>
        </AuthShell>
    );
}
