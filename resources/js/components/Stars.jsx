import { useState } from 'react';

const STAR = 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.8Z';

/** Read-only star row; fills partial stars for averages like 4.3. */
export default function Stars({ value = 0, size = 16, className = '' }) {
    return (
        <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${value} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => {
                const fill = Math.max(0, Math.min(1, value - (i - 1)));
                return (
                    <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
                        <path d={STAR} fill="var(--color-rule)" />
                        {fill > 0 && (
                            <path d={STAR} fill="#e8a317" style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }} />
                        )}
                    </svg>
                );
            })}
        </span>
    );
}

/** Clickable 1–5 picker. */
export function StarInput({ value, onChange, size = 30 }) {
    const [hover, setHover] = useState(0);
    const shown = hover || value;
    const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
    return (
        <div className="flex items-center gap-3">
            <div className="flex" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((i) => (
                    <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? 's' : ''}`}
                        onMouseEnter={() => setHover(i)} onClick={() => onChange(i)} className="rounded p-0.5 transition hover:scale-110">
                        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
                            <path d={STAR} fill={i <= shown ? '#e8a317' : 'var(--color-rule)'} />
                        </svg>
                    </button>
                ))}
            </div>
            {shown > 0 && <span className="font-bold text-graphite">{words[shown]}</span>}
        </div>
    );
}
