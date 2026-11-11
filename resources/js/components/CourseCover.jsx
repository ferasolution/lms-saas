// Generated cover for courses without an uploaded image: an exercise-book
// cover in one of a few ink colours, picked from the course id so it is stable.
const COVERS = [
    { bg: '#1b3a8c', fg: '#ffffff', rule: 'rgba(255,255,255,.12)' },
    { bg: '#1f7a4d', fg: '#ffffff', rule: 'rgba(255,255,255,.12)' },
    { bg: '#7a3f9d', fg: '#ffffff', rule: 'rgba(255,255,255,.12)' },
    { bg: '#b85c1d', fg: '#ffffff', rule: 'rgba(255,255,255,.14)' },
    { bg: '#e8eef9', fg: '#12285f', rule: 'rgba(27,58,140,.12)' },
    { bg: '#12285f', fg: '#ffffff', rule: 'rgba(255,255,255,.1)' },
];

const initials = (t = '') => t.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'C';

export default function CourseCover({ course, className = '', compact = false }) {
    if (course.thumbnail) {
        return <img src={course.thumbnail} alt="" className={`object-cover ${className}`} />;
    }
    const c = COVERS[(course.id ?? 0) % COVERS.length];
    return (
        <div
            className={`relative overflow-hidden ${className}`}
            style={{
                background: c.bg,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 13px, ${c.rule} 13px, ${c.rule} 14px)`,
            }}
            aria-hidden
        >
            <span className="absolute inset-y-0 left-[14%] w-[2px] bg-[#e5484d]/80" />
            {!compact && (
                // A notebook name plate: initials of the course, like a label on an exercise book.
                <span className="absolute top-1/2 left-1/2 grid h-16 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md bg-white/95 shadow-sm ring-1 ring-black/5">
                    <span className="absolute inset-x-3 top-4 h-px bg-[#d6e3f5]" />
                    <span className="absolute inset-x-3 bottom-4 h-px bg-[#d6e3f5]" />
                    <span className="relative font-display text-2xl font-extrabold tracking-tight text-[#12285f]">{initials(course.title)}</span>
                </span>
            )}
        </div>
    );
}
