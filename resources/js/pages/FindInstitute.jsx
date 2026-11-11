import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell, { AsideList } from '../components/AuthShell';
import Icon from '../components/Icon';
import { Button, Field } from '../components/ui';

// Institutes this browser has signed in to before (tokens are stored per slug).
function knownInstitutes() {
    try {
        return Object.keys(localStorage)
            .filter((k) => k.startsWith('lms.token.'))
            .map((k) => k.slice('lms.token.'.length));
    } catch {
        return [];
    }
}

export default function FindInstitute() {
    const navigate = useNavigate();
    const [slug, setSlug] = useState('');
    const known = useMemo(knownInstitutes, []);

    function go(e) {
        e.preventDefault();
        const clean = slug.trim().toLowerCase().replace(/^https?:\/\//, '').split('/').filter(Boolean).pop() ?? '';
        if (clean) navigate(`/${clean}/login`);
    }

    return (
        <AuthShell aside={<AsideList title="Every institute has its own sign-in page." items={[
            'Ask your school, academy or company for its address',
            'It looks like this site’s address followed by a short name',
            'Bookmark it once and sign in straight from there',
        ]} />}>
            <h1 className="text-3xl font-extrabold">Sign in</h1>
            <p className="mt-2 text-pencil">Enter your institute’s address to continue.</p>

            {known.length > 0 && (
                <div className="mt-8">
                    <p className="mb-2 text-sm font-bold text-pencil">On this device</p>
                    <ul className="space-y-2">
                        {known.map((k) => (
                            <li key={k}>
                                <Link to={`/${k}`} className="group flex items-center gap-3 rounded-xl border border-rule bg-white px-4 py-3 transition hover:border-ink">
                                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-50 font-display font-bold text-ink uppercase">{k[0]}</span>
                                    <span className="flex-1 font-bold text-ink-deep">{k}</span>
                                    <Icon name="arrowRight" size={18} className="text-pencil group-hover:text-ink" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <form onSubmit={go} className="mt-8 space-y-5">
                <Field label="Institute address">
                    <div className="flex h-11 items-center overflow-hidden rounded-lg border border-rule bg-white transition focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/10">
                        <span className="flex h-full items-center border-r border-rule bg-paper px-3 text-sm whitespace-nowrap text-pencil">{window.location.host}/</span>
                        <input aria-label="Institute address" className="h-full w-full min-w-0 bg-transparent px-3 font-bold text-ink-deep focus:outline-none"
                            value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="your-institute" autoFocus autoCapitalize="none" autoCorrect="off" />
                    </div>
                </Field>
                <Button type="submit" size="lg" className="w-full" iconRight="arrowRight" disabled={!slug.trim()}>Continue</Button>
            </form>

            <p className="mt-8 text-center text-sm text-pencil">
                Running an institute? <Link to="/register" className="font-bold text-ink hover:underline">Create one free</Link>
            </p>
        </AuthShell>
    );
}
