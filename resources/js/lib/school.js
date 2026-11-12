import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Academic structure (classes, sections, subjects, teachers) for pickers and admin screens. */
export function useStructure(tenant) {
    const [data, setData] = useState(null);
    const load = useCallback(() => api('school/structure', { tenant }).then((d) => {
        const sections = d.classes.flatMap((c) => c.sections.map((s) => ({ ...s, class_id: c.id, class_name: c.name })));
        setData({ ...d, sections });
        return d;
    }).catch(() => setData({ years: [], classes: [], subjects: [], teachers: [], sections: [] })), [tenant]);
    useEffect(() => { load(); }, [load]);
    return [data, load];
}

export const ATTENDANCE = {
    present: { label: 'Present', short: 'P', tone: 'bg-leaf text-white', soft: 'bg-leaf-50 text-leaf' },
    absent: { label: 'Absent', short: 'A', tone: 'bg-margin text-white', soft: 'bg-margin/10 text-margin' },
    late: { label: 'Late', short: 'L', tone: 'bg-amber-500 text-white', soft: 'bg-amber-50 text-amber-800' },
    excused: { label: 'Excused', short: 'E', tone: 'bg-ink text-white', soft: 'bg-ink-50 text-ink' },
    leave: { label: 'On leave', short: 'LV', tone: 'bg-graphite text-white', soft: 'bg-rule/60 text-graphite' },
};

export const DIARY_KINDS = {
    homework: { label: 'Homework', icon: 'diary', tone: 'bg-ink-50 text-ink' },
    classwork: { label: 'Classwork', icon: 'book', tone: 'bg-leaf-50 text-leaf' },
    test: { label: 'Test', icon: 'quiz', tone: 'bg-amber-50 text-amber-800' },
    notice: { label: 'Notice', icon: 'flag', tone: 'bg-margin/10 text-margin' },
};

export const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ADMISSION_STATUS = {
    new: { label: 'New', tone: 'warning' },
    reviewing: { label: 'Reviewing', tone: 'draft' },
    interview: { label: 'Interview', tone: 'draft' },
    accepted: { label: 'Accepted', tone: 'success' },
    waitlisted: { label: 'Waitlist', tone: 'neutral' },
    rejected: { label: 'Not offered', tone: 'danger' },
    enrolled: { label: 'Enrolled', tone: 'success' },
};

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function shortDate(d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
    if (!d) return '';
    return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, opts);
}

/** "Today", "Tomorrow", "in 3 days", "2 days ago". */
export function dueLabel(d) {
    if (!d) return '';
    const days = Math.round((new Date(`${d}T12:00:00`) - new Date(`${today()}T12:00:00`)) / 86400000);
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days > 1) return `Due in ${days} days`;
    return `Was due ${-days === 1 ? 'yesterday' : `${-days} days ago`}`;
}
