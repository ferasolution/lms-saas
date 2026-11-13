import { api } from './api';

export const LIVE_KINDS = {
    class: { label: 'Online class', short: 'Class', icon: 'school' },
    training: { label: 'Staff training', short: 'Training', icon: 'award' },
    webinar: { label: 'Webinar', short: 'Webinar', icon: 'globe' },
};

export const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const dayLabel = (iso) => {
    const d = new Date(iso);
    const t = new Date();
    const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

/** "in 12 min", "in 3 h", or null once started. */
export function startsIn(iso) {
    const mins = Math.round((new Date(iso) - Date.now()) / 60000);
    if (mins <= 0) return null;
    if (mins < 60) return `in ${mins} min`;
    if (mins < 60 * 24) return `in ${Math.round(mins / 60)} h`;
    return null;
}

/**
 * Join: record attendance, then open the meeting in a new tab. The tab is
 * opened first (inside the click) so pop-up blockers allow it.
 */
export async function joinSession(path, opts, toast) {
    let w = null;
    try { w = window.open('', '_blank'); } catch { /* blocked */ }
    try {
        const r = await api(path, opts);
        if (r.passcode) toast?.(`Passcode: ${r.passcode}`);
        if (w && !w.closed) { w.opener = null; w.location.href = r.meeting_url; } else window.location.href = r.meeting_url;
        return r;
    } catch (e) {
        w?.close();
        toast?.(e.message, 'error');
        return null;
    }
}

const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s = '') => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

/** Download an .ics calendar file for the session. */
export function addToCalendar({ title, description, starts_at, ends_at, url }) {
    const body = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fera EduSphere//Live//EN', 'BEGIN:VEVENT',
        `UID:${icsDate(starts_at)}-${Math.random().toString(36).slice(2)}@edusphere`,
        `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(starts_at)}`, `DTEND:${icsDate(ends_at)}`,
        `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText([description, url && `Join: ${url}`].filter(Boolean).join('\n\n'))}`,
        url ? `URL:${url}` : null, 'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([body], { type: 'text/calendar' })), download: `${title.replace(/[^\w -]/g, '').slice(0, 60) || 'session'}.ics` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Recognise the meeting service from a pasted link. */
export function providerOf(url = '') {
    const h = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
    if (h.includes('zoom.')) return 'Zoom';
    if (h.includes('meet.google.')) return 'Google Meet';
    if (h.includes('teams.')) return 'Microsoft Teams';
    if (h.includes('webex.')) return 'Webex';
    if (h.includes('jit.si')) return 'Jitsi';
    return h ? 'Online meeting' : null;
}
