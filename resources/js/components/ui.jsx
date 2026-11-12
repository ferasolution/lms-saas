import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { fieldError } from '../lib/api';

/* ---------- Brand ---------- */

export function Logo({ to = '/', className = '' }) {
    return (
        <Link to={to} className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Fera EduSphere home">
            <span className="relative grid h-8 w-8 place-items-center rounded-md bg-ink text-white">
                <span className="absolute inset-y-1 left-[7px] w-px bg-margin/90" aria-hidden />
                <span className="font-display text-[15px] font-extrabold leading-none">F</span>
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-ink-deep">Fera EduSphere</span>
        </Link>
    );
}

/* ---------- Buttons ---------- */

const BUTTON = {
    primary: 'bg-ink text-white hover:bg-ink-deep shadow-[0_1px_0_0_rgba(18,40,95,.4)]',
    secondary: 'border border-rule bg-white text-ink-deep hover:border-ink/40 hover:bg-ink-50',
    ghost: 'text-graphite hover:bg-ink-50',
    danger: 'bg-margin text-white hover:bg-margin-deep',
};

export function Button({ variant = 'primary', size = 'md', icon, iconRight, busy, children, className = '', as: As = 'button', ...props }) {
    const sizes = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 gap-2', lg: 'h-12 px-6 text-[17px] gap-2.5' };
    return (
        <As
            className={`inline-flex select-none items-center justify-center rounded-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${BUTTON[variant]} ${className}`}
            disabled={As === 'button' ? busy || props.disabled : undefined}
            {...props}
        >
            {busy ? <Spinner /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
            {children}
            {iconRight && !busy && <Icon name={iconRight} size={18} />}
        </As>
    );
}

export function IconButton({ icon, label, className = '', ...props }) {
    return (
        <button type="button" aria-label={label} title={label}
            className={`grid h-9 w-9 place-items-center rounded-lg text-pencil transition-colors hover:bg-ink-50 hover:text-ink-deep ${className}`} {...props}>
            <Icon name={icon} size={18} />
        </button>
    );
}

export function Spinner({ className = '' }) {
    return <span className={`h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />;
}

/* ---------- Form fields ---------- */

export function Field({ label, hint, error, name, as = 'input', children, className = '', ...props }) {
    const id = useId();
    const message = typeof error === 'string' ? error : fieldError(error, name);
    const Control = as;
    return (
        <div className={className}>
            {label && <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-graphite">{label}</label>}
            {children && as !== 'select' ? children : (
                <Control
                    id={id}
                    name={name}
                    aria-invalid={message ? true : undefined}
                    aria-describedby={hint || message ? `${id}-d` : undefined}
                    className={`block w-full rounded-lg border bg-white px-3 text-graphite placeholder:text-pencil/60 transition-colors focus:outline-none focus:ring-4 ${as === 'textarea' ? 'py-2.5' : 'h-11'} ${message ? 'border-margin/60 focus:border-margin focus:ring-margin/10' : 'border-rule hover:border-ink/30 focus:border-ink focus:ring-ink/10'}`}
                    {...props}
                >{as === 'select' ? children : undefined}</Control>
            )}
            {(hint || message) && (
                <p id={`${id}-d`} className={`mt-1.5 text-sm ${message ? 'text-margin' : 'text-pencil'}`}>{message || hint}</p>
            )}
        </div>
    );
}

export function Checkbox({ label, hint, checked, onChange }) {
    return (
        <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 rounded accent-ink" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span>
                <span className="block font-bold text-graphite">{label}</span>
                {hint && <span className="block text-sm text-pencil">{hint}</span>}
            </span>
        </label>
    );
}

/* ---------- Display ---------- */

const BADGE = {
    published: 'bg-leaf-50 text-leaf ring-leaf/20',
    draft: 'bg-ink-50 text-ink ring-ink/15',
    archived: 'bg-paper text-pencil ring-rule',
    trial: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    neutral: 'bg-white text-graphite ring-rule',
    danger: 'bg-margin/5 text-margin ring-margin/20',
    success: 'bg-leaf-50 text-leaf ring-leaf/20',
    warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
};

export function Badge({ tone = 'neutral', children, dot }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-bold ring-1 ring-inset ${BADGE[tone] ?? BADGE.neutral}`}>
            {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
            {children}
        </span>
    );
}

const AVATAR_TINTS = ['bg-ink text-white', 'bg-leaf text-white', 'bg-[#8a4fbf] text-white', 'bg-[#c26a1b] text-white', 'bg-ink-deep text-white', 'bg-[#2f6f8f] text-white'];

export function Avatar({ name = '?', size = 36 }) {
    const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
    const tint = AVATAR_TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
    return (
        <span className={`grid shrink-0 place-items-center rounded-full font-bold ${tint}`}
            style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
            {initials || '?'}
        </span>
    );
}

export function Skeleton({ className = '' }) {
    return <span className={`block animate-pulse rounded-md bg-rule/70 ${className}`} aria-hidden />;
}

export function EmptyState({ icon = 'book', title, children, action }) {
    return (
        <div className="ruled rounded-xl border border-dashed border-rule bg-white/60 px-6 py-14 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-ink shadow-sm ring-1 ring-rule">
                <Icon name={icon} size={26} />
            </span>
            <h3 className="mt-5 text-xl font-bold">{title}</h3>
            {children && <p className="mx-auto mt-2 max-w-sm text-pencil">{children}</p>}
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}

/* ---------- Overlays ---------- */

function useEscape(open, onClose) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);
}

export function SlideOver({ open, onClose, title, description, children, footer }) {
    useEscape(open, onClose);
    const panel = useRef(null);
    useEffect(() => {
        if (open) panel.current?.querySelector('input, textarea, select')?.focus();
    }, [open]);
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-ink-deep/30 backdrop-blur-[2px] animate-[fade_.15s_ease-out]" onClick={onClose} />
            <div ref={panel} className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-paper shadow-2xl animate-[slide-in_.2s_cubic-bezier(.2,.8,.2,1)]">
                <div className="margin-line flex items-start justify-between gap-4 border-b border-rule bg-white px-6 py-5 pl-8">
                    <div>
                        <h2 className="text-xl font-bold">{title}</h2>
                        {description && <p className="mt-1 text-sm text-pencil">{description}</p>}
                    </div>
                    <IconButton icon="x" label="Close" onClick={onClose} />
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6 pl-8">{children}</div>
                {footer && <div className="flex justify-end gap-3 border-t border-rule bg-white px-6 py-4">{footer}</div>}
            </div>
        </div>
    );
}

export function ConfirmDialog({ open, title, children, confirmLabel, tone = 'danger', busy, onConfirm, onClose }) {
    useEscape(open, onClose);
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-ink-deep/30 backdrop-blur-[2px]" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl animate-[pop_.15s_ease-out]">
                <h2 className="text-lg font-bold">{title}</h2>
                <div className="mt-2 text-pencil">{children}</div>
                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant={tone} busy={busy} onClick={onConfirm} autoFocus>{confirmLabel}</Button>
                </div>
            </div>
        </div>
    );
}

export function Menu({ items, label = 'More actions' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
        const esc = (e) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', esc);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', esc);
        };
    }, [open]);
    return (
        <div ref={ref} className="relative">
            <IconButton icon="more" label={label} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} />
            {open && (
                <div role="menu" className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-rule bg-white py-1 shadow-xl animate-[pop_.12s_ease-out]">
                    {items.filter(Boolean).map((item) => (
                        <button key={item.label} role="menuitem" type="button"
                            onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[15px] hover:bg-ink-50 ${item.danger ? 'text-margin' : 'text-graphite'}`}>
                            <Icon name={item.icon} size={17} />
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ---------- Toasts ---------- */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const push = useCallback((message, tone = 'success') => {
        const id = Math.random().toString(36).slice(2);
        setToasts((t) => [...t, { id, message, tone }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    }, []);
    return (
        <ToastContext.Provider value={push}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className="pointer-events-auto flex items-center gap-2.5 rounded-lg bg-ink-deep px-4 py-3 text-white shadow-xl animate-[toast_.2s_ease-out]">
                        <Icon name={t.tone === 'error' ? 'alert' : 'check'} size={18} className={t.tone === 'error' ? 'text-[#ffb4ba]' : 'text-[#9fe0b5]'} />
                        <span className="font-bold">{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);

/* ---------- More building blocks ---------- */

export function Progress({ value = 0, className = '', tone = 'ink', label }) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return (
        <div className={`h-2 overflow-hidden rounded-full bg-ink-50 ${className}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
            <div className={`h-full rounded-full transition-[width] duration-500 ${tone === 'leaf' || v === 100 ? 'bg-leaf' : 'bg-ink'}`} style={{ width: `${v}%` }} />
        </div>
    );
}

export function Tabs({ tabs, value, onChange, className = '' }) {
    return (
        <div className={`flex gap-1 overflow-x-auto border-b border-rule ${className}`} role="tablist">
            {tabs.map((t) => (
                <button key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}
                    className={`relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 font-bold whitespace-nowrap transition ${value === t.value ? 'border-margin text-ink-deep' : 'border-transparent text-pencil hover:text-ink-deep'}`}>
                    {t.icon && <Icon name={t.icon} size={18} />}
                    {t.label}
                    {t.count !== undefined && t.count !== null && (
                        <span className={`rounded-full px-1.5 text-xs tabular-nums ${value === t.value ? 'bg-ink text-white' : 'bg-ink-50 text-ink'}`}>{t.count}</span>
                    )}
                </button>
            ))}
        </div>
    );
}

export function Toggle({ checked, onChange, label, hint }) {
    return (
        <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
                <span className="block font-bold text-graphite">{label}</span>
                {hint && <span className="block text-sm text-pencil">{hint}</span>}
            </span>
            <span className="relative mt-0.5 inline-flex shrink-0">
                <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <span className="h-6 w-11 rounded-full bg-rule transition peer-checked:bg-ink peer-focus-visible:ring-4 peer-focus-visible:ring-ink/20" />
                <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
        </label>
    );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
    useEscape(open, onClose);
    if (!open) return null;
    const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-ink-deep/30 backdrop-blur-[2px]" onClick={onClose} />
            <div className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${widths[size]} animate-[pop_.15s_ease-out]`}>
                <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
                    <div>
                        <h2 className="text-xl font-bold">{title}</h2>
                        {description && <p className="mt-1 text-sm text-pencil">{description}</p>}
                    </div>
                    <IconButton icon="x" label="Close" onClick={onClose} />
                </div>
                <div className="overflow-y-auto px-6 py-5">{children}</div>
                {footer && <div className="flex justify-end gap-3 border-t border-rule px-6 py-4">{footer}</div>}
            </div>
        </div>
    );
}

/** Upload box: click or drop a file. `value` is the current URL. */
export function FileDrop({ kind = 'image', value, onUpload, onClear, uploading, error, hint }) {
    const [over, setOver] = useState(false);
    const input = useRef(null);
    const accept = kind === 'image' ? 'image/png,image/jpeg,image/webp' : kind === 'any' ? 'application/pdf,image/png,image/jpeg,image/webp' : 'application/pdf';
    const pick = (files) => files?.[0] && onUpload(files[0]);

    if (value) {
        return (
            <div className="flex items-center gap-3 rounded-xl border border-rule bg-white p-3">
                {kind === 'image'
                    ? <img src={value} alt="" className="h-16 w-24 rounded-lg object-cover ring-1 ring-rule" />
                    : <span className="grid h-12 w-12 place-items-center rounded-lg bg-margin/10 text-margin"><Icon name="file" /></span>}
                <a href={value} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-bold text-ink hover:underline">
                    {decodeURIComponent(value.split('/').pop())}
                </a>
                <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>Replace</Button>
                {onClear && <IconButton icon="trash" label="Remove" onClick={onClear} />}
                <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files)} />
            </div>
        );
    }

    return (
        <div>
            <button type="button" onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${over ? 'border-ink bg-ink-50' : 'border-rule bg-white hover:border-ink/40'}`}>
                {uploading ? <Spinner className="text-ink" /> : <Icon name="upload" size={24} className="text-ink" />}
                <span className="font-bold text-graphite">{uploading ? 'Uploading…' : `Drop ${kind === 'image' ? 'an image' : kind === 'any' ? 'a PDF or image' : 'a PDF'} here or click to choose`}</span>
                <span className="text-sm text-pencil">{hint ?? (kind === 'image' ? 'JPG, PNG or WebP, up to 4 MB' : 'PDF up to 20 MB')}</span>
            </button>
            {error && <p className="mt-1.5 text-sm text-margin">{error}</p>}
            <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files)} />
        </div>
    );
}

export function PageHeader({ title, description, actions, back }) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                {back && (
                    <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-pencil hover:text-ink">
                        <Icon name="arrowLeft" size={16} />{back.label}
                    </Link>
                )}
                <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
                {description && <p className="mt-1 text-pencil">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
    );
}
