import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button, EmptyState, Field, IconButton, Modal, PageHeader, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, download } from '../../lib/api';
import { shortDate, today } from '../../lib/school';
import { money } from '../../lib/format';

const METHODS = { cash: 'Cash', bank: 'Bank transfer', card: 'Card', paypal: 'PayPal', wise: 'Wise', cheque: 'Cheque', other: 'Other' };

export default function Accounts() {
    const { tenant } = useOutletContext();
    const toast = useToast();
    const year = today().slice(0, 4);
    const [range, setRange] = useState({ from: `${year}-01-01`, to: today() });
    const [s, setS] = useState(null);
    const [tab, setTab] = useState('statement');
    const [entries, setEntries] = useState(null);
    const [editing, setEditing] = useState(null);

    const load = useCallback(() => {
        api(`school/accounts/summary?from=${range.from}&to=${range.to}`, { tenant }).then(setS);
        api(`school/accounts/entries?from=${range.from}&to=${range.to}`, { tenant }).then((r) => setEntries(r.data));
    }, [tenant, range]);
    useEffect(() => { load(); }, [load]);

    async function remove(e) {
        await api(`school/accounts/entries/${e.id}`, { method: 'DELETE', tenant }).catch((err) => toast(err.message, 'error'));
        toast('Entry deleted');
        load();
    }

    const c = s?.currency;
    const max = s ? Math.max(1, ...s.months.flatMap((m) => [m.income, m.expense])) : 1;

    return (
        <div>
            <PageHeader title="Accounts" description="Income and expenses. Fee collections and paid payroll are included automatically."
                actions={<>
                    <Button variant="secondary" icon="download" onClick={() => download(`school/accounts/export.csv?from=${range.from}&to=${range.to}`, tenant, 'accounts.csv')}>Export</Button>
                    <Button variant="secondary" icon="plus" onClick={() => setEditing({ type: 'income' })}>Income</Button>
                    <Button icon="plus" onClick={() => setEditing({ type: 'expense' })}>Expense</Button>
                </>} />
            <div className="mt-6 flex flex-wrap items-center gap-2">
                <input type="date" aria-label="From" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="h-10 rounded-lg border border-rule bg-white px-3" />
                <span className="text-pencil">to</span>
                <input type="date" aria-label="To" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="h-10 rounded-lg border border-rule bg-white px-3" />
                {[['This month', `${today().slice(0, 7)}-01`], ['This year', `${year}-01-01`]].map(([l, from]) => <button key={l} type="button" onClick={() => setRange({ from, to: today() })} className="rounded-full px-3 py-1.5 text-sm font-bold text-ink ring-1 ring-ink/30">{l}</button>)}
            </div>

            {!s ? <Skeleton className="mt-6 h-72 rounded-2xl" /> : (
                <>
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[['Income', s.income.total, 'text-leaf'], ['Expenses', s.expense.total, 'text-margin'], [s.net >= 0 ? 'Surplus' : 'Deficit', s.net, s.net >= 0 ? 'text-ink-deep' : 'text-margin']].map(([l, v, tone]) => (
                            <div key={l} className="rounded-2xl border border-rule bg-white p-5"><p className="text-sm font-bold text-pencil">{l}</p><p className={`mt-1 font-display text-3xl font-bold tabular-nums ${tone}`}>{money(v, c)}</p></div>
                        ))}
                    </div>
                    <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[{ value: 'statement', label: 'Income statement' }, { value: 'entries', label: 'Entries', count: entries?.length }]} />
                    <div className="mt-6">
                        {tab === 'statement' ? (
                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                                <section className="rounded-2xl border border-rule bg-white p-5">
                                    {[['Income', s.income], ['Expenses', s.expense]].map(([label, block]) => (
                                        <div key={label} className="mb-5 last:mb-0">
                                            <p className="font-bold text-ink-deep">{label}</p>
                                            <ul className="mt-2 divide-y divide-rule text-sm">
                                                {Object.entries(block.lines).length === 0 && <li className="py-2 text-pencil">Nothing recorded.</li>}
                                                {Object.entries(block.lines).map(([k, v]) => <li key={k} className="flex justify-between py-2"><span className="text-graphite">{k}</span><span className="tabular-nums">{money(v, c)}</span></li>)}
                                                <li className="flex justify-between py-2 font-bold"><span>Total {label.toLowerCase()}</span><span className="tabular-nums">{money(block.total, c)}</span></li>
                                            </ul>
                                        </div>
                                    ))}
                                    <p className="flex justify-between border-t-2 border-ink-deep pt-3 text-lg font-extrabold"><span>Net</span><span className={`tabular-nums ${s.net < 0 ? 'text-margin' : ''}`}>{money(s.net, c)}</span></p>
                                </section>
                                <section className="rounded-2xl border border-rule bg-white p-5">
                                    <div className="flex items-center justify-between"><h2 className="font-bold text-ink-deep">Last 12 months</h2>
                                        <p className="flex gap-3 text-xs text-pencil"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-leaf" />Income</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-margin/70" />Expenses</span></p></div>
                                    <div className="mt-4 flex h-48 items-end gap-2" role="img" aria-label="Income and expenses by month">
                                        {s.months.map((m) => (
                                            <div key={m.month} className="group relative flex flex-1 flex-col items-center">
                                                <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 176 }}>
                                                    <div className="w-1/2 rounded-t bg-leaf" style={{ height: `${(m.income / max) * 176}px` }} />
                                                    <div className="w-1/2 rounded-t bg-margin/70" style={{ height: `${(m.expense / max) * 176}px` }} />
                                                </div>
                                                <span className="mt-1 text-[10px] text-pencil">{new Date(`${m.month}-15`).toLocaleDateString(undefined, { month: 'narrow' })}</span>
                                                <span className="pointer-events-none absolute -top-12 z-10 hidden rounded bg-ink-deep px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">{new Date(`${m.month}-15`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}<br />+{money(m.income, c)} / −{money(m.expense, c)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        ) : !entries ? <Skeleton className="h-48 rounded-2xl" /> : entries.length === 0 ? (
                            <EmptyState icon="receipt" title="No entries in this period">Record rent, utilities, salaries paid outside payroll, donations and other income here.</EmptyState>
                        ) : (
                            <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                                {entries.map((e) => (
                                    <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                        <span className="w-24 text-sm text-pencil">{shortDate(e.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                        <span className="min-w-0 flex-1"><b className="text-graphite">{e.category}</b>{e.party && <span className="text-pencil"> · {e.party}</span>}{e.description && <span className="block truncate text-sm text-pencil">{e.description}</span>}</span>
                                        <span className={`font-bold tabular-nums ${e.type === 'income' ? 'text-leaf' : 'text-margin'}`}>{e.type === 'income' ? '+' : '−'}{money(e.amount, c)}</span>
                                        <IconButton icon="edit" label="Edit" onClick={() => setEditing(e)} />
                                        <IconButton icon="trash" label="Delete" onClick={() => remove(e)} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
            {editing && s && <EntryForm tenant={tenant} entry={editing} categories={s.categories} currency={c} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast('Saved'); load(); }} />}
        </div>
    );
}

function EntryForm({ tenant, entry, categories, currency, onClose, onDone }) {
    const [f, setF] = useState({ type: entry.type, category: entry.category ?? categories[entry.type][0], date: entry.date ?? today(), amount: entry.amount ?? '', method: entry.method ?? 'bank', party: entry.party ?? '', reference: entry.reference ?? '', description: entry.description ?? '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api(entry.id ? `school/accounts/entries/${entry.id}` : 'school/accounts/entries', { method: entry.id ? 'PATCH' : 'POST', tenant, body: { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), amount: Number(f.amount) } });
            onDone();
        } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <Modal open onClose={onClose} title={`${entry.id ? 'Edit' : 'Add'} ${f.type}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category" name="category" error={error} value={f.category} onChange={set('category')} list="cats" />
                    <datalist id="cats">{categories[f.type].map((x) => <option key={x} value={x} />)}</datalist>
                    <Field label={`Amount (${currency})`} name="amount" type="number" min="0" step="0.01" error={error} value={f.amount} onChange={set('amount')} />
                    <Field label="Date" name="date" type="date" error={error} value={f.date} onChange={set('date')} />
                    <Field label="Method" name="method" as="select" error={error} value={f.method} onChange={set('method')}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Field>
                    <Field label={f.type === 'income' ? 'Received from' : 'Paid to'} name="party" error={error} value={f.party} onChange={set('party')} />
                    <Field label="Reference" name="reference" error={error} value={f.reference} onChange={set('reference')} />
                </div>
                <Field label="Description" name="description" error={error} value={f.description} onChange={set('description')} />
            </div>
        </Modal>
    );
}
