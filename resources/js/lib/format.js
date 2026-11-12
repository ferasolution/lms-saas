// Small display helpers shared across screens.

export function duration(seconds) {
    const s = Number(seconds) || 0;
    if (s <= 0) return null;
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${Math.max(1, m)} min`;
}

export function date(value, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
    if (!value) return '';
    return new Date(value).toLocaleDateString(undefined, opts);
}

export function dateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function relative(value) {
    if (!value) return 'Never';
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
    return date(value);
}

export function money(amount, currency = 'PKR') {
    const n = Number(amount) || 0;
    return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function coursePrice(c) {
    if (c.is_free || Number(c.price) === 0) return { now: 'Free', was: null, free: true };
    const sale = c.sale_price !== null && c.sale_price !== undefined && c.sale_price !== '';
    return {
        now: money(sale ? c.sale_price : c.price, c.currency),
        was: sale ? money(c.price, c.currency) : null,
        free: false,
    };
}

export const titleCase = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

/** Turn a YouTube, Vimeo or Bunny Stream link into an embeddable player URL. */
export function videoEmbed(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?rel=0` };
        if (host.endsWith('youtube.com')) {
            const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
            return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
        }
        if (host === 'vimeo.com') return { kind: 'iframe', src: `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean)[0]}` };
        if (host === 'player.vimeo.com' || host.endsWith('mediadelivery.net') || host.endsWith('b-cdn.net') && u.pathname.includes('embed')) {
            return { kind: 'iframe', src: url };
        }
        if (/\.(mp4|webm|m3u8)$/i.test(u.pathname)) return { kind: 'video', src: url };
        return { kind: 'link', src: url };
    } catch {
        return null;
    }
}

export const LESSON_TYPES = {
    video: { label: 'Video', icon: 'video', hint: 'YouTube, Vimeo or Bunny Stream link' },
    text: { label: 'Reading', icon: 'book', hint: 'Notes or an article' },
    pdf: { label: 'PDF', icon: 'file', hint: 'Upload a handout or worksheet' },
    live: { label: 'Live class', icon: 'calendar', hint: 'Zoom or Google Meet link with a time' },
    quiz: { label: 'Quiz', icon: 'quiz', hint: 'Auto-graded questions' },
};
