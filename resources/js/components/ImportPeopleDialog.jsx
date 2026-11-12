import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import Icon from './Icon';
import { Badge, Button, Field, Modal } from './ui';

const SAMPLE = 'name,email,role\nEmily Carter,emily.carter@example.com,student\nJames Walker,james.walker@example.com,student\nSarah Mitchell,sarah.mitchell@example.com,teacher';

/** Minimal CSV parser: quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

function toRows(text) {
    const grid = parseCsv(text.replace(/^﻿/, ''));
    if (!grid.length) return [];
    const head = grid[0].map((h) => h.toLowerCase());
    const hasHeader = head.includes('email');
    const col = (name, fallback) => (hasHeader ? head.findIndex((h) => h === name || h.startsWith(name)) : fallback);
    const idx = { name: col('name', 0), email: col('email', 1), role: col('role', 2), password: col('password', 3) };
    return (hasHeader ? grid.slice(1) : grid).map((r) => ({
        name: r[idx.name] ?? '', email: r[idx.email] ?? '', role: idx.role >= 0 ? r[idx.role] || 'student' : 'student', password: idx.password >= 0 ? r[idx.password] ?? '' : '',
    }));
}

export default function ImportPeopleDialog({ open, onClose, tenant, onDone }) {
    const [text, setText] = useState('');
    const [courses, setCourses] = useState([]);
    const [courseId, setCourseId] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setText(''); setResult(null); setError(null); setCourseId('');
        api('courses?per_page=100&status=published', { tenant }).then((r) => setCourses(r.data)).catch(() => {});
    }, [open, tenant]);

    const rows = useMemo(() => toRows(text), [text]);

    async function readFile(f) {
        if (!f) return;
        setText(await f.text());
    }

    async function run() {
        setBusy(true);
        setError(null);
        try {
            const r = await api('users/import', { method: 'POST', tenant, body: { rows, course_id: courseId ? Number(courseId) : null } });
            setResult(r);
            if (r.created.length) onDone?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    function downloadLogins() {
        const csv = 'name,email,role,password\n' + result.created.map((p) => [p.name, p.email, p.role, p.password].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: 'new-logins.csv' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    if (result) {
        return (
            <Modal open={open} onClose={onClose} size="lg" title="Import finished"
                description={`${result.created.length} added${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}.`}
                footer={<>
                    {result.created.length > 0 && <Button variant="secondary" icon="download" onClick={downloadLogins}>Download logins</Button>}
                    <Button onClick={onClose}>Done</Button>
                </>}>
                {result.created.length > 0 && (
                    <>
                        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                            <Icon name="lock" size={18} className="mt-0.5 shrink-0" />
                            These passwords are shown only now. Download them and share each one privately.
                        </p>
                        <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-rule">
                            <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-paper text-pencil"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Password</th></tr></thead>
                                <tbody className="divide-y divide-rule">
                                    {result.created.map((p) => (
                                        <tr key={p.email}><td className="px-3 py-2 font-bold">{p.name}</td><td className="px-3 py-2">{p.email}</td><td className="px-3 py-2 font-mono">{p.password}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                {result.skipped.length > 0 && (
                    <div className="mt-4">
                        <p className="font-bold text-graphite">Skipped</p>
                        <ul className="mt-2 space-y-1 text-sm">
                            {result.skipped.map((s) => <li key={`${s.line}-${s.email}`} className="text-pencil">Line {s.line} · {s.email} — <span className="text-margin">{s.reason}</span></li>)}
                        </ul>
                    </div>
                )}
            </Modal>
        );
    }

    return (
        <Modal open={open} onClose={onClose} size="lg" title="Import people from a spreadsheet"
            description="Columns: name, email, role (student, teacher, parent, manager, admin) and an optional password."
            footer={<>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button busy={busy} disabled={!rows.length} onClick={run}>Import {rows.length || ''} {rows.length === 1 ? 'person' : 'people'}</Button>
            </>}>
            <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Choose a CSV file</Button>
                    <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>Fill in an example</Button>
                    <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
                </div>
                <Field label="Or paste rows here" as="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={SAMPLE} hint="Save from Excel or Google Sheets as CSV. Missing passwords are generated for you." className="font-mono text-sm" />
                {rows.length > 0 && (
                    <div className="max-h-48 overflow-auto rounded-xl border border-rule">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 bg-paper text-pencil"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th></tr></thead>
                            <tbody className="divide-y divide-rule">
                                {rows.slice(0, 50).map((r, i) => (
                                    <tr key={i}><td className="px-3 py-1.5">{r.name || <span className="text-margin">missing</span>}</td><td className="px-3 py-1.5">{r.email || <span className="text-margin">missing</span>}</td><td className="px-3 py-1.5"><Badge>{r.role}</Badge></td></tr>
                                ))}
                            </tbody>
                        </table>
                        {rows.length > 50 && <p className="px-3 py-2 text-sm text-pencil">…and {rows.length - 50} more</p>}
                    </div>
                )}
                {courses.length > 0 && (
                    <Field label="Enrol new students in a course (optional)" as="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                        <option value="">Don’t enrol</option>
                        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </Field>
                )}
                {error && <p className="text-margin" role="alert">{error}</p>}
            </div>
        </Modal>
    );
}
