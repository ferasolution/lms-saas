import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, Skeleton, Tabs, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { shortDate } from '../../lib/school';
import { money } from '../../lib/format';

export default function Library() {
    const { tenant, isOffice, me } = useOutletContext();
    const toast = useToast();
    const [tab, setTab] = useState('catalogue');
    const [d, setD] = useState(null);
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState(null);
    const [issuing, setIssuing] = useState(null);
    const load = useCallback(() => api(`school/library/books${search ? `?search=${encodeURIComponent(search)}` : ''}`, { tenant }).then(setD), [tenant, search]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

    return (
        <div>
            <PageHeader title="Library" description={isOffice ? 'Catalogue, loans and returns.' : 'Search the school library and see what you’ve borrowed.'}
                actions={isOffice && <Button icon="plus" onClick={() => setEditing({})}>Add book</Button>} />
            {d && isOffice && (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[['Titles', d.stats.titles], ['Copies', d.stats.copies], ['On loan', d.stats.on_loan], ['Overdue', d.stats.overdue]].map(([l, v]) => <div key={l} className="rounded-2xl border border-rule bg-white p-4"><p className="text-sm text-pencil">{l}</p><p className={`font-display text-2xl font-bold ${l === 'Overdue' && v ? 'text-margin' : 'text-ink-deep'}`}>{v}</p></div>)}
                </div>
            )}
            <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[{ value: 'catalogue', label: 'Catalogue' }, isOffice ? { value: 'loans', label: 'Loans' } : { value: 'mine', label: 'My loans' }]} />
            <div className="mt-4">
                {tab === 'catalogue' ? (
                    <>
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, author or ISBN" aria-label="Search books" className="h-10 w-full rounded-lg border border-rule bg-white px-3 sm:w-80" />
                        <div className="mt-4">
                            {!d ? <Skeleton className="h-48 rounded-2xl" /> : d.data.length === 0 ? <EmptyState icon="book" title={search ? 'No books found' : 'The catalogue is empty'}>{isOffice ? 'Add books one by one.' : 'Check back later.'}</EmptyState> : (
                                <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                                    {d.data.map((b) => (
                                        <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                            <div className="min-w-0 flex-1"><p className="font-bold text-graphite">{b.title}</p><p className="text-sm text-pencil">{[b.author, b.category, b.shelf && `Shelf ${b.shelf}`].filter(Boolean).join(' · ')}</p></div>
                                            {b.ebook_url && <Button size="sm" variant="ghost" icon="external" as="a" href={b.ebook_url} target="_blank" rel="noreferrer">Read online</Button>}
                                            <Badge tone={b.available ? 'success' : 'neutral'}>{b.available ? `${b.available} of ${b.copies} available` : 'All out'}</Badge>
                                            {isOffice && <><Button size="sm" disabled={!b.available} onClick={() => setIssuing(b)}>Issue</Button><IconButton icon="edit" label="Edit" onClick={() => setEditing(b)} /></>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </>
                ) : tab === 'loans' ? <Loans tenant={tenant} onChange={load} /> : <MyLoans tenant={tenant} me={me} />}
            </div>
            {editing && <BookForm tenant={tenant} book={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast('Saved'); load(); }} />}
            {issuing && <IssueDialog tenant={tenant} book={issuing} onClose={() => setIssuing(null)} onDone={() => { setIssuing(null); toast('Book issued'); load(); }} />}
        </div>
    );
}

function Loans({ tenant, onChange }) {
    const toast = useToast();
    const [status, setStatus] = useState('out');
    const [rows, setRows] = useState(null);
    const load = useCallback(() => api(`school/library/loans?status=${status}`, { tenant }).then((r) => setRows(r.data)), [tenant, status]);
    useEffect(() => { load(); }, [load]);
    async function ret(l) {
        const r = await api(`school/library/loans/${l.id}/return`, { method: 'POST', tenant }).catch((e) => toast(e.message, 'error'));
        if (r) { toast(r.fine ? `Returned · late fine ${money(r.fine)}` : 'Returned'); load(); onChange(); }
    }
    return (
        <div>
            <div className="flex gap-2">{[['out', 'On loan'], ['overdue', 'Overdue'], ['returned', 'Returned']].map(([v, l]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${status === v ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{l}</button>)}</div>
            <div className="mt-4">
                {!rows ? <Skeleton className="h-40 rounded-2xl" /> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-rule bg-white/60 px-4 py-10 text-center text-pencil">Nothing here.</p> : (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                        {rows.map((l) => (
                            <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                <div className="min-w-0 flex-1"><p className="font-bold text-graphite">{l.book?.title}</p><p className="text-sm text-pencil">{l.user?.name} · out {shortDate(l.issued_on)} · due {shortDate(l.due_on)}{l.returned_on ? ` · back ${shortDate(l.returned_on)}` : ''}</p></div>
                                {l.overdue && <Badge tone="danger">Overdue</Badge>}
                                {!l.returned_on && <Button size="sm" variant="secondary" onClick={() => ret(l)}>Mark returned</Button>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function MyLoans({ tenant, me }) {
    const [rows, setRows] = useState(null);
    useEffect(() => { api('school/library/mine', { tenant }).then((r) => setRows(r.data)); }, [tenant]);
    if (!rows) return <Skeleton className="h-32 rounded-2xl" />;
    if (!rows.length) return <p className="rounded-xl border border-dashed border-rule bg-white/60 px-4 py-10 text-center text-pencil">No books borrowed.</p>;
    return (
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
            {rows.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1"><p className="font-bold text-graphite">{l.book?.title}</p><p className="text-sm text-pencil">{l.user?.id !== me.user.id ? `${l.user?.name} · ` : ''}due {shortDate(l.due_on)}{l.returned_on ? ` · returned ${shortDate(l.returned_on)}` : ''}</p></div>
                    {l.returned_on ? <Badge>Returned</Badge> : l.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone="draft">Borrowed</Badge>}
                </li>
            ))}
        </ul>
    );
}

function BookForm({ tenant, book, onClose, onDone }) {
    const toast = useToast();
    const [f, setF] = useState({ title: book.title ?? '', author: book.author ?? '', isbn: book.isbn ?? '', category: book.category ?? '', publisher: book.publisher ?? '', shelf: book.shelf ?? '', copies: book.copies ?? 1, ebook_url: book.ebook_url ?? '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try { await api(book.id ? `school/library/books/${book.id}` : 'school/library/books', { method: book.id ? 'PATCH' : 'POST', tenant, body: { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), copies: Number(f.copies || 0) } }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={book.id ? 'Edit book' : 'Add a book'} footer={<>{book.id && <Button variant="ghost" className="mr-auto text-margin" onClick={async () => { try { await api(`school/library/books/${book.id}`, { method: 'DELETE', tenant }); onDone(); } catch (e) { toast(e.message, 'error'); } }}>Remove</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
            <div className="space-y-4">
                <Field label="Title" name="title" error={error} value={f.title} onChange={set('title')} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Author" name="author" error={error} value={f.author} onChange={set('author')} />
                    <Field label="ISBN" name="isbn" error={error} value={f.isbn} onChange={set('isbn')} />
                    <Field label="Category" name="category" error={error} value={f.category} onChange={set('category')} placeholder="Fiction, Science, Reference" />
                    <Field label="Shelf" name="shelf" error={error} value={f.shelf} onChange={set('shelf')} />
                    <Field label="Copies" name="copies" type="number" min="0" error={error} value={f.copies} onChange={set('copies')} />
                    <Field label="Publisher" name="publisher" error={error} value={f.publisher} onChange={set('publisher')} />
                </div>
                <Field label="E-book link (optional)" name="ebook_url" error={error} value={f.ebook_url} onChange={set('ebook_url')} placeholder="https://" />
            </div>
        </Modal>
    );
}

function IssueDialog({ tenant, book, onClose, onDone }) {
    const [q, setQ] = useState('');
    const [people, setPeople] = useState([]);
    const [who, setWho] = useState(null);
    const [due, setDue] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => { if (q.trim().length < 2) { setPeople([]); return; } const t = setTimeout(() => api(`school/people-search?search=${encodeURIComponent(q)}`, { tenant }).then((r) => setPeople(r.data)), 200); return () => clearTimeout(t); }, [q, tenant]);
    async function go() {
        setBusy(true);
        try { await api('school/library/loans', { method: 'POST', tenant, body: { library_book_id: book.id, user_id: who.id, due_on: due } }); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={`Issue: ${book.title}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!who} onClick={go}>Issue book</Button></>}>
            <div className="space-y-4">
                {who ? <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2"><span><b>{who.name}</b> <span className="text-sm text-pencil">{who.section ?? who.role}</span></span><button type="button" className="text-sm font-bold text-ink" onClick={() => setWho(null)}>Change</button></div> : (
                    <div>
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student or staff name" aria-label="Borrower" className="h-10 w-full rounded-lg border border-rule px-3" />
                        {people.length > 0 && <ul className="mt-1 divide-y divide-rule rounded-lg border border-rule">{people.map((p) => <li key={p.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-paper" onClick={() => setWho(p)}><b>{p.name}</b> <span className="text-sm text-pencil">· {p.section ?? p.role}</span></button></li>)}</ul>}
                    </div>
                )}
                <Field label="Due back" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                {error && <p className="text-margin">{error}</p>}
            </div>
        </Modal>
    );
}
