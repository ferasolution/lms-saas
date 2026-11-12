import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Button, Modal, useToast } from './ui';

/**
 * Two steps: confirm, then show the new temporary password once with a copy
 * button. `reset` performs the change and resolves to the new password.
 */
export default function ResetPasswordDialog({ open, person, signInUrl, reset, onClose }) {
    const toast = useToast();
    const [password, setPassword] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => { if (open) { setPassword(null); setError(null); } }, [open]);

    async function go() {
        setBusy(true);
        setError(null);
        try {
            setPassword(await reset());
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function copy(text, msg) {
        try {
            await navigator.clipboard.writeText(text);
            toast(msg);
        } catch {
            toast('Select the text and copy it', 'error');
        }
    }

    const message = password && `Hi ${person?.name?.split(' ')[0] ?? ''}, your password has been reset.\nEmail: ${person?.email}\nTemporary password: ${password}${signInUrl ? `\nSign in: ${signInUrl}` : ''}\nPlease change it from your profile after signing in.`;

    return (
        <Modal open={open} onClose={onClose} size="sm" title={password ? 'New password ready' : 'Reset password?'}
            description={person ? `${person.name} · ${person.email}` : ''}
            footer={password ? (
                <Button onClick={onClose}>Done</Button>
            ) : (
                <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={go}>Reset password</Button></>
            )}>
            {!password ? (
                <div className="space-y-3 text-graphite">
                    <p>We’ll create a new temporary password and sign them out of every device. Their courses and progress stay as they are.</p>
                    {error && <p className="text-margin" role="alert">{error}</p>}
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-graphite">Share this with them privately. It won’t be shown again.</p>
                    <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-3">
                        <code className="min-w-0 flex-1 font-mono text-lg font-bold break-all text-ink-deep">{password}</code>
                        <Button size="sm" variant="secondary" icon="copy" onClick={() => copy(password, 'Password copied')}>Copy</Button>
                    </div>
                    <button type="button" onClick={() => copy(message, 'Message copied')}
                        className="flex w-full items-center gap-2 rounded-lg px-1 text-left text-sm font-bold text-ink hover:underline">
                        <Icon name="copy" size={16} />Copy a ready-to-send message with sign-in details
                    </button>
                </div>
            )}
        </Modal>
    );
}

/** Readable temporary password: Word-Word-1234 */
export function temporaryPassword() {
    const words = ['Maple', 'River', 'Cedar', 'Harbor', 'Summit', 'Willow', 'Falcon', 'Meadow', 'Canyon', 'Aspen', 'Orbit', 'Prairie'];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    const n = window.crypto?.getRandomValues ? 1000 + (window.crypto.getRandomValues(new Uint16Array(1))[0] % 9000) : 1000 + Math.floor(Math.random() * 9000);
    return `${pick()}-${pick()}-${n}`;
}
