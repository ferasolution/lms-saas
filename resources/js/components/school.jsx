import Icon from './Icon';
import { WEEKDAYS_SHORT } from '../lib/school';

/** A select of sections grouped by class. */
export function SectionSelect({ structure, value, onChange, onlyMine = false, allowAll = false, allLabel = 'All classes', className = '', label = 'Class' }) {
    const classes = structure?.classes ?? [];
    return (
        <label className={`relative block ${className}`}>
            <span className="sr-only">{label}</span>
            <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
                className="h-10 w-full appearance-none rounded-lg border border-rule bg-white pr-9 pl-3 font-bold text-graphite focus:border-ink focus:outline-none">
                {allowAll ? <option value="">{allLabel}</option> : <option value="" disabled>Choose a class…</option>}
                {classes.map((c) => {
                    const sections = c.sections.filter((s) => !onlyMine || s.mine);
                    if (!sections.length) return null;
                    return (
                        <optgroup key={c.id} label={c.name}>
                            {sections.map((s) => <option key={s.id} value={s.id}>{s.label}{s.students_count ? ` (${s.students_count})` : ''}</option>)}
                        </optgroup>
                    );
                })}
            </select>
            <Icon name="chevronDown" size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-pencil" />
        </label>
    );
}

/** Monday–Saturday (or –Sunday when used) grid of periods. */
export function WeekGrid({ slots, showSection = false, highlightToday = true }) {
    const usesSunday = slots.some((s) => s.weekday === 7);
    const usesSaturday = usesSunday || slots.some((s) => s.weekday === 6);
    const days = [1, 2, 3, 4, 5, ...(usesSaturday ? [6] : []), ...(usesSunday ? [7] : [])];
    const todayIso = ((new Date().getDay() + 6) % 7) + 1;

    if (!slots.length) {
        return <p className="rounded-xl border border-dashed border-rule bg-white/60 px-4 py-10 text-center text-pencil">No periods on the timetable yet.</p>;
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-rule bg-white">
            <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((d) => (
                    <div key={d} className={`border-r border-rule last:border-r-0 ${highlightToday && d === todayIso ? 'bg-ink-50/40' : ''}`}>
                        <p className={`border-b border-rule px-3 py-2.5 text-sm font-bold ${highlightToday && d === todayIso ? 'text-ink-deep' : 'text-pencil'}`}>
                            {WEEKDAYS_SHORT[d]}{highlightToday && d === todayIso ? ' · Today' : ''}
                        </p>
                        <ul className="space-y-1.5 p-2">
                            {slots.filter((s) => s.weekday === d).map((s) => (
                                <li key={s.id ?? `${d}-${s.starts_at}`}
                                    className={`rounded-lg px-2.5 py-2 text-sm ${s.subject ? 'bg-paper ring-1 ring-rule' : 'bg-transparent text-pencil italic'}`}
                                    style={s.subject?.color ? { boxShadow: `inset 3px 0 0 ${s.subject.color}` } : undefined}>
                                    <p className="text-xs text-pencil tabular-nums">{s.starts_at}–{s.ends_at}</p>
                                    <p className="font-bold leading-snug text-graphite">{s.subject?.name ?? s.label ?? 'Free'}</p>
                                    {showSection && s.section && <p className="text-xs text-ink">{s.section.label}</p>}
                                    {s.teacher && !showSection && <p className="truncate text-xs text-pencil">{s.teacher.name}</p>}
                                    {(s.room || s.meeting_url) && (
                                        <p className="mt-0.5 flex items-center gap-1 text-xs text-pencil">
                                            {s.meeting_url ? <a href={s.meeting_url} target="_blank" rel="noreferrer" className="font-bold text-ink hover:underline">Join online</a> : s.room}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Today's periods as a simple list (dashboards). */
export function TodayList({ periods, empty = 'No classes today.' }) {
    if (!periods?.length) return <p className="py-4 text-pencil">{empty}</p>;
    const now = new Date().toTimeString().slice(0, 5);
    return (
        <ol className="space-y-1">
            {periods.map((p, i) => {
                const live = p.starts_at <= now && now < p.ends_at;
                return (
                    <li key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${live ? 'bg-ink-50' : ''}`}>
                        <span className="w-24 shrink-0 text-sm text-pencil tabular-nums">{p.starts_at}–{p.ends_at}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold text-graphite">{p.subject ?? 'Period'}</span>
                            {(p.section || p.teacher) && <span className="block truncate text-sm text-pencil">{p.section ?? p.teacher}{p.room ? ` · ${p.room}` : ''}</span>}
                        </span>
                        {live && <span className="rounded-full bg-margin px-2 py-0.5 text-xs font-bold text-white">Now</span>}
                        {p.meeting_url && <a href={p.meeting_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-ink hover:underline">Join</a>}
                    </li>
                );
            })}
        </ol>
    );
}
