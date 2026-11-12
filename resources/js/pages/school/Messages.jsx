import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Avatar, Button, Field, Modal, PageHeader, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { relative } from '../../lib/format';

const ROLE = { admin: 'Office', manager: 'Office', instructor: 'Teacher', parent: 'Parent', student: 'Student' };

export default function Messages() {
    const { tenant } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const [list, setList] = useState(null);
    const [composing, setComposing] = useState(false);
    const open = Number(params.get('c')) || null;
    const load = useCallback(() => api('school/messages', { tenant }).then((r) => setList(r.data)), [tenant]);
    useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
    const select = (id) => setParams(id ? { c: String(id) } : {}, { replace: true });

    return (
        <div>
            <PageHeader title="Messages" description="Private conversations between families and staff." actions={<Button icon="plus" onClick={() => setComposing(true)}>New message</Button>} />
            <div className="mt-6 grid h-[calc(100vh-14rem)] min-h-[28rem] grid-cols-1 overflow-hidden rounded-2xl border border-rule bg-white md:grid-cols-[20rem_minmax(0,1fr)]">
                <aside className={`overflow-y-auto border-rule md:border-r ${open ? 'hidden md:block' : ''}`}>
                    {list === null ? <div className="p-4"><Skeleton className="h-40" /></div> : list.length === 0 ? (
                        <p className="px-5 py-10 text-center text-pencil">No conversations yet.</p>
                    ) : (
                        <ul className="divide-y divide-rule">
                            {list.map((c) => (
                                <li key={c.id}>
                                    <button type="button" onClick={() => select(c.id)} className={`flex w-full gap-3 px-4 py-3 text-left transition ${open === c.id ? 'bg-ink-50' : 'hover:bg-paper'}`}>
                                        <Avatar name={c.with[0]?.name ?? '?'} size={38} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-2"><span className={`truncate ${c.unread ? 'font-extrabold text-ink-deep' : 'font-bold text-graphite'}`}>{c.with.map((w) => w.name).join(', ')}</span><span className="shrink-0 text-xs text-pencil">{c.last && relative(c.last.at)}</span></span>
                                            {c.subject && <span className="block truncate text-sm font-bold text-graphite">{c.subject}</span>}
                                            <span className="block truncate text-sm text-pencil">{c.last?.mine ? 'You: ' : ''}{c.last?.body}</span>
                                        </span>
                                        {c.unread && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-margin" aria-label="Unread" />}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>
                <section className={`min-h-0 flex-col ${open ? 'flex' : 'hidden md:flex'}`}>
                    {open ? <Thread key={open} tenant={tenant} id={open} onBack={() => select(null)} onSent={load} /> : (
                        <div className="grid flex-1 place-items-center p-8 text-center text-pencil"><div><Icon name="message" size={36} className="mx-auto text-rule" /><p className="mt-2">Choose a conversation or start a new one.</p></div></div>
                    )}
                </section>
            </div>
            {composing && <Compose tenant={tenant} onClose={() => setComposing(false)} onSent={(id) => { setComposing(false); load(); select(id); }} />}
        </div>
    );
}

function Thread({ tenant, id, onBack, onSent }) {
    const [t, setT] = useState(null);
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const end = useRef(null);
    const load = useCallback(() => api(`school/messages/${id}`, { tenant }).then(setT), [tenant, id]);
    useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
    useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [t?.messages.length]);

    async function send(e) {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        try { await api(`school/messages/${id}`, { method: 'POST', tenant, body: { body } }); setBody(''); await load(); onSent(); } finally { setBusy(false); }
    }

    if (!t) return <div className="p-6"><Skeleton className="h-48" /></div>;
    const last = t.messages[t.messages.length - 1];
    return (
        <>
            <header className="flex items-center gap-3 border-b border-rule px-4 py-3">
                <button type="button" onClick={onBack} className="md:hidden" aria-label="Back"><Icon name="arrowLeft" size={20} /></button>
                <Avatar name={t.with[0]?.name ?? '?'} size={36} />
                <div className="min-w-0"><p className="truncate font-bold text-ink-deep">{t.with.map((w) => w.name).join(', ')}</p><p className="truncate text-sm text-pencil">{[ROLE[t.with[0]?.role], t.subject, t.student && `About ${t.student.name}`].filter(Boolean).join(' · ')}</p></div>
            </header>
            <ol className="flex-1 space-y-3 overflow-y-auto bg-paper/50 px-4 py-4">
                {t.messages.map((m) => (
                    <li key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-white text-graphite ring-1 ring-rule'}`}>
                            <p className="whitespace-pre-line">{m.body}</p>
                            {m.attachment && <a href={m.attachment} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-bold underline">Attachment</a>}
                            <p className={`mt-1 text-right text-[11px] ${m.mine ? 'text-white/70' : 'text-pencil'}`}>{relative(m.at)}</p>
                        </div>
                    </li>
                ))}
                {last?.mine && t.seen_at && new Date(t.seen_at) >= new Date(last.at) && <li className="text-right text-xs text-pencil">Seen</li>}
                <li ref={end} />
            </ol>
            <form onSubmit={send} className="flex items-end gap-2 border-t border-rule p-3">
                <textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" aria-label="Message"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
                    className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-rule px-3 py-2.5 focus:border-ink focus:outline-none" />
                <Button type="submit" icon="arrowRight" busy={busy} disabled={!body.trim()}>Send</Button>
            </form>
        </>
    );
}

function Compose({ tenant, onClose, onSent }) {
    const [contacts, setContacts] = useState(null);
    const [search, setSearch] = useState('');
    const [to, setTo] = useState(null);
    const [f, setF] = useState({ subject: '', body: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => { const t = setTimeout(() => api(`school/messages/contacts${search ? `?search=${encodeURIComponent(search)}` : ''}`, { tenant }).then((r) => setContacts(r.data)), 200); return () => clearTimeout(t); }, [tenant, search]);
    async function send() {
        setBusy(true);
        setError(null);
        try { const r = await api('school/messages', { method: 'POST', tenant, body: { to: to.id, subject: f.subject || null, body: f.body } }); onSent(r.id); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title="New message" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!to || !f.body.trim()} onClick={send}>Send</Button></>}>
            <div className="space-y-4">
                {to ? (
                    <div className="flex items-center gap-3 rounded-xl bg-ink-50 px-3 py-2"><Avatar name={to.name} size={32} /><span className="flex-1"><b>{to.name}</b><span className="block text-sm text-pencil">{to.about}</span></span><button type="button" className="text-sm font-bold text-ink" onClick={() => setTo(null)}>Change</button></div>
                ) : (
                    <div>
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-10 w-full rounded-lg border border-rule px-3" />
                        <ul className="mt-2 max-h-60 divide-y divide-rule overflow-y-auto rounded-xl border border-rule">
                            {contacts === null ? <li className="p-3"><Skeleton className="h-10" /></li> : contacts.length === 0 ? <li className="p-4 text-center text-pencil">Nobody found.</li> : contacts.map((c) => (
                                <li key={c.id}><button type="button" onClick={() => setTo(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-paper"><Avatar name={c.name} size={30} /><span><b className="text-graphite">{c.name}</b><span className="block text-sm text-pencil">{c.about}</span></span></button></li>
                            ))}
                        </ul>
                    </div>
                )}
                <Field label="Subject (optional)" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
                <Field label="Message" name="body" as="textarea" rows={5} error={error} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            </div>
        </Modal>
    );
}

