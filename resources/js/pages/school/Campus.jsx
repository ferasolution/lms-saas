import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, SlideOver, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, download } from '../../lib/api';
import { today } from '../../lib/school';
import { money, relative } from '../../lib/format';

export default function Campus() {
    const { tenant } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || 'transport';
    return (
        <div>
            <PageHeader title="Campus" description="School transport, stock and supplies, and the visitor log." />
            <Tabs className="mt-6" value={tab} onChange={(v) => setParams(v === 'transport' ? {} : { tab: v }, { replace: true })} tabs={[
                { value: 'transport', label: 'Transport', icon: 'globe' },
                { value: 'inventory', label: 'Inventory', icon: 'layers' },
                { value: 'visitors', label: 'Visitors', icon: 'shield' },
            ]} />
            <div className="mt-6">
                {tab === 'transport' && <Transport tenant={tenant} />}
                {tab === 'inventory' && <Inventory tenant={tenant} />}
                {tab === 'visitors' && <Visitors tenant={tenant} />}
            </div>
        </div>
    );
}

// ── Transport ───────────────────────────────────────────────────────

function Transport({ tenant }) {
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [editing, setEditing] = useState(null);
    const [adding, setAdding] = useState(null);
    const load = useCallback(() => api('school/transport/routes', { tenant }).then((r) => setRows(r.data)), [tenant]);
    useEffect(() => { load(); }, [load]);
    return (
        <div>
            <div className="mb-4 flex justify-end"><Button icon="plus" onClick={() => setEditing({})}>Add route</Button></div>
            {!rows ? <Skeleton className="h-48 rounded-2xl" /> : rows.length === 0 ? <EmptyState icon="globe" title="No bus routes yet">Add a route with its stops, vehicle and driver, then assign students. Parents see their child’s bus and pickup time.</EmptyState> : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {rows.map((r) => (
                        <section key={r.id} className="rounded-2xl border border-rule bg-white">
                            <div className="flex items-start justify-between gap-3 border-b border-rule px-5 py-4">
                                <div><h2 className="text-lg font-bold">{r.name}</h2><p className="text-sm text-pencil">{[r.vehicle, r.driver_name && `Driver ${r.driver_name}`, r.driver_phone].filter(Boolean).join(' · ')}</p></div>
                                <IconButton icon="edit" label="Edit route" onClick={() => setEditing(r)} />
                            </div>
                            {r.stops.length > 0 && (
                                <ol className="relative mx-5 mt-4 space-y-2 border-l-2 border-ink/20 pl-4">
                                    {r.stops.map((s, i) => <li key={i} className="text-sm"><span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-ink" /><b className="text-graphite">{s.name}</b> <span className="text-pencil">{s.pickup ? `· pickup ${s.pickup}` : ''}{s.drop ? ` · drop ${s.drop}` : ''}</span></li>)}
                                </ol>
                            )}
                            <div className="px-5 py-4">
                                <div className="flex items-center justify-between"><p className="text-sm font-bold text-pencil">Students {r.students.length}{r.capacity ? ` / ${r.capacity}` : ''}</p><Button size="sm" variant="ghost" icon="plus" onClick={() => setAdding(r)}>Add student</Button></div>
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                    {r.students.map((s) => <li key={s.id} className="flex items-center gap-1 rounded-full bg-paper py-0.5 pr-1 pl-3 text-sm ring-1 ring-rule">{s.name}{s.stop && <span className="text-pencil">· {s.stop}</span>}<button type="button" aria-label={`Remove ${s.name}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-rule" onClick={async () => { await api(`school/transport/routes/${r.id}/students/${s.id}`, { method: 'DELETE', tenant }); load(); }}><Icon name="x" size={12} /></button></li>)}
                                </ul>
                            </div>
                        </section>
                    ))}
                </div>
            )}
            {editing && <RouteForm tenant={tenant} route={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast('Route saved'); load(); }} />}
            {adding && <AssignStudent tenant={tenant} route={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); toast('Student added · parents notified'); load(); }} />}
        </div>
    );
}

function RouteForm({ tenant, route, onClose, onDone }) {
    const [f, setF] = useState({ name: route.name ?? '', vehicle: route.vehicle ?? '', capacity: route.capacity ?? '', driver_name: route.driver_name ?? '', driver_phone: route.driver_phone ?? '', attendant_name: route.attendant_name ?? '', monthly_fee: route.monthly_fee ?? '' });
    const [stops, setStops] = useState(route.stops ?? []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        const body = { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), capacity: f.capacity ? Number(f.capacity) : null, monthly_fee: f.monthly_fee ? Number(f.monthly_fee) : null, stops: stops.filter((s) => s.name).map((s) => ({ name: s.name, pickup: s.pickup || null, drop: s.drop || null })) };
        try { await api(route.id ? `school/transport/routes/${route.id}` : 'school/transport/routes', { method: route.id ? 'PATCH' : 'POST', tenant, body }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <SlideOver open onClose={onClose} title={route.id ? `Edit ${route.name}` : 'Add a bus route'}
            footer={<>{route.id && <Button variant="ghost" className="mr-auto text-margin" onClick={async () => { await api(`school/transport/routes/${route.id}`, { method: 'DELETE', tenant }); onDone(); }}>Delete route</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Route name" name="name" error={error} value={f.name} onChange={set('name')} placeholder="North loop" />
                    <Field label="Vehicle" name="vehicle" error={error} value={f.vehicle} onChange={set('vehicle')} placeholder="Bus 4 · plate 7ABC123" />
                    <Field label="Driver" name="driver_name" error={error} value={f.driver_name} onChange={set('driver_name')} />
                    <Field label="Driver phone" name="driver_phone" error={error} value={f.driver_phone} onChange={set('driver_phone')} />
                    <Field label="Attendant" name="attendant_name" error={error} value={f.attendant_name} onChange={set('attendant_name')} />
                    <Field label="Seats" name="capacity" type="number" min="1" error={error} value={f.capacity} onChange={set('capacity')} />
                </div>
                <Field label="Stops, in order">
                    <div className="space-y-2">
                        {stops.map((s, i) => (
                            <div key={i} className="grid grid-cols-[1fr_6rem_6rem_auto] gap-2">
                                <input aria-label="Stop" value={s.name} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Stop name" className="h-10 rounded-lg border border-rule px-3" />
                                <input aria-label="Pickup time" type="time" value={s.pickup ?? ''} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, pickup: e.target.value } : x)))} className="h-10 rounded-lg border border-rule px-2" />
                                <input aria-label="Drop time" type="time" value={s.drop ?? ''} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, drop: e.target.value } : x)))} className="h-10 rounded-lg border border-rule px-2" />
                                <IconButton icon="x" label="Remove stop" onClick={() => setStops(stops.filter((_, j) => j !== i))} />
                            </div>
                        ))}
                        <Button size="sm" variant="ghost" icon="plus" onClick={() => setStops([...stops, { name: '', pickup: '', drop: '' }])}>Add stop</Button>
                    </div>
                </Field>
            </div>
        </SlideOver>
    );
}

function AssignStudent({ tenant, route, onClose, onDone }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState([]);
    const [who, setWho] = useState(null);
    const [stop, setStop] = useState(route.stops[0]?.name ?? '');
    const [error, setError] = useState(null);
    useEffect(() => { if (q.trim().length < 2) { setRows([]); return; } const t = setTimeout(() => api(`school/students?search=${encodeURIComponent(q)}&per_page=8`, { tenant }).then((r) => setRows(r.data)), 200); return () => clearTimeout(t); }, [q, tenant]);
    async function go() {
        try { await api(`school/transport/routes/${route.id}/students`, { method: 'POST', tenant, body: { student_id: who.id, stop: stop || null } }); onDone(); } catch (e) { setError(e.message); }
    }
    return (
        <Modal open onClose={onClose} title={`Add to ${route.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!who} onClick={go}>Add</Button></>}>
            <div className="space-y-4">
                {who ? <p className="rounded-lg bg-ink-50 px-3 py-2"><b>{who.name}</b> <span className="text-sm text-pencil">{who.section?.label}</span></p> : (
                    <div><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student name" aria-label="Student" className="h-10 w-full rounded-lg border border-rule px-3" />
                        {rows.length > 0 && <ul className="mt-1 divide-y divide-rule rounded-lg border border-rule">{rows.map((r) => <li key={r.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-paper" onClick={() => setWho(r)}><b>{r.name}</b> <span className="text-sm text-pencil">· {r.section?.label}</span></button></li>)}</ul>}</div>
                )}
                {route.stops.length > 0 && <Field label="Stop" as="select" value={stop} onChange={(e) => setStop(e.target.value)}>{route.stops.map((s) => <option key={s.name} value={s.name}>{s.name}{s.pickup ? ` (${s.pickup})` : ''}</option>)}</Field>}
                {error && <p className="text-margin">{error}</p>}
            </div>
        </Modal>
    );
}

// ── Inventory ───────────────────────────────────────────────────────

function Inventory({ tenant }) {
    const toast = useToast();
    const [d, setD] = useState(null);
    const [low, setLow] = useState(false);
    const [editing, setEditing] = useState(null);
    const [moving, setMoving] = useState(null);
    const load = useCallback(() => api(`school/inventory${low ? '?low=1' : ''}`, { tenant }).then(setD), [tenant, low]);
    useEffect(() => { load(); }, [load]);
    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
                {d && <p className="text-graphite">Stock value <b>{money(d.value)}</b>{d.low > 0 && <button type="button" onClick={() => setLow(!low)} className="ml-3 font-bold text-margin hover:underline">{low ? 'Show all' : `${d.low} running low`}</button>}</p>}
                <Button className="ml-auto" icon="plus" onClick={() => setEditing({})}>Add item</Button>
            </div>
            {!d ? <Skeleton className="h-48 rounded-2xl" /> : d.data.length === 0 ? <EmptyState icon="layers" title="Nothing in stock yet">Track stationery, lab supplies, uniforms, books and equipment. Set a minimum and we flag it when it runs low.</EmptyState> : (
                <div className="overflow-hidden rounded-2xl border border-rule bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-paper/60 text-left text-pencil"><tr><th className="px-4 py-2.5 font-bold">Item</th><th className="hidden px-4 py-2.5 font-bold sm:table-cell">Location</th><th className="px-4 py-2.5 text-right font-bold">In stock</th><th /></tr></thead>
                        <tbody className="divide-y divide-rule">
                            {d.data.map((i) => (
                                <tr key={i.id}>
                                    <td className="px-4 py-2.5"><button type="button" onClick={() => setEditing(i)} className="text-left"><b className="text-graphite hover:text-ink">{i.name}</b><span className="block text-xs text-pencil">{i.category}</span></button></td>
                                    <td className="hidden px-4 py-2.5 text-pencil sm:table-cell">{i.location}</td>
                                    <td className="px-4 py-2.5 text-right"><span className={`font-bold tabular-nums ${i.low ? 'text-margin' : 'text-graphite'}`}>{i.quantity}</span> <span className="text-pencil">{i.unit}</span>{i.low && <span className="block text-xs text-margin">min {i.min_quantity}</span>}</td>
                                    <td className="px-4 py-2.5 text-right whitespace-nowrap"><Button size="sm" variant="secondary" onClick={() => setMoving({ item: i, kind: 'in' })}>+ In</Button> <Button size="sm" variant="secondary" onClick={() => setMoving({ item: i, kind: 'out' })}>− Issue</Button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {editing && <ItemForm tenant={tenant} item={editing} categories={d?.categories ?? []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast('Saved'); load(); }} />}
            {moving && <MoveDialog tenant={tenant} {...moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); toast('Stock updated'); load(); }} />}
        </div>
    );
}

function ItemForm({ tenant, item, categories, onClose, onDone }) {
    const [f, setF] = useState({ name: item.name ?? '', category: item.category ?? '', unit: item.unit ?? 'pcs', quantity: item.quantity ?? 0, min_quantity: item.min_quantity ?? 0, location: item.location ?? '', unit_cost: item.unit_cost ?? '' });
    const [history, setHistory] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (item.id) api(`school/inventory/${item.id}/movements`, { tenant }).then((r) => setHistory(r.data)); }, [tenant, item.id]);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        setBusy(true);
        setError(null);
        try { await api(item.id ? `school/inventory/${item.id}` : 'school/inventory', { method: item.id ? 'PATCH' : 'POST', tenant, body: { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])), quantity: Number(f.quantity || 0), min_quantity: Number(f.min_quantity || 0), unit_cost: f.unit_cost === '' ? null : Number(f.unit_cost) } }); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    }
    return (
        <SlideOver open onClose={onClose} title={item.id ? item.name : 'Add item'} footer={<>{item.id && <Button variant="ghost" className="mr-auto text-margin" onClick={async () => { await api(`school/inventory/${item.id}`, { method: 'DELETE', tenant }); onDone(); }}>Delete</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
            <div className="space-y-4">
                <Field label="Name" name="name" error={error} value={f.name} onChange={set('name')} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category" name="category" error={error} value={f.category} onChange={set('category')} list="inv-cats" />
                    <datalist id="inv-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                    <Field label="Unit" name="unit" error={error} value={f.unit} onChange={set('unit')} placeholder="pcs, box, ream" />
                    {!item.id && <Field label="Opening stock" name="quantity" type="number" min="0" error={error} value={f.quantity} onChange={set('quantity')} />}
                    <Field label="Warn when at or below" name="min_quantity" type="number" min="0" error={error} value={f.min_quantity} onChange={set('min_quantity')} />
                    <Field label="Location" name="location" error={error} value={f.location} onChange={set('location')} />
                    <Field label="Cost per unit" name="unit_cost" type="number" min="0" step="0.01" error={error} value={f.unit_cost} onChange={set('unit_cost')} />
                </div>
                {history && (
                    <div><p className="font-bold text-ink-deep">History</p>
                        <ul className="mt-2 divide-y divide-rule rounded-xl bg-white ring-1 ring-rule">{history.map((m) => <li key={m.id} className="flex justify-between px-3 py-2 text-sm"><span>{m.note ?? (m.kind === 'in' ? 'Stock in' : m.kind === 'out' ? 'Issued' : 'Count adjusted')}<span className="block text-xs text-pencil">{m.user} · {relative(m.at)}</span></span><b className={m.quantity < 0 ? 'text-margin' : 'text-leaf'}>{m.quantity > 0 ? '+' : ''}{m.quantity}</b></li>)}</ul>
                    </div>
                )}
            </div>
        </SlideOver>
    );
}

function MoveDialog({ tenant, item, kind, onClose, onDone }) {
    const [k, setK] = useState(kind);
    const [qty, setQty] = useState(kind === 'adjust' ? item.quantity : 1);
    const [note, setNote] = useState('');
    const [error, setError] = useState(null);
    async function go() {
        try { await api(`school/inventory/${item.id}/move`, { method: 'POST', tenant, body: { kind: k, quantity: Number(qty), note: note || null } }); onDone(); } catch (e) { setError(e.message); }
    }
    return (
        <Modal open onClose={onClose} title={item.name} description={`${item.quantity} ${item.unit} in stock`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={go}>Save</Button></>}>
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">{[['in', 'Stock in'], ['out', 'Issue out'], ['adjust', 'Set count']].map(([v, l]) => <button key={v} type="button" aria-pressed={k === v} onClick={() => setK(v)} className={`h-10 rounded-lg border text-sm font-bold ${k === v ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule text-pencil'}`}>{l}</button>)}</div>
                <Field label={k === 'adjust' ? 'Actual count' : 'Quantity'} type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
                <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={k === 'out' ? 'e.g. Grade 4 – A' : k === 'in' ? 'e.g. Supplier invoice #' : 'e.g. Term-end count'} />
                {error && <p className="text-margin">{error}</p>}
            </div>
        </Modal>
    );
}

// ── Visitors ────────────────────────────────────────────────────────

function Visitors({ tenant }) {
    const toast = useToast();
    const [day, setDay] = useState(today());
    const [d, setD] = useState(null);
    const [adding, setAdding] = useState(false);
    const load = useCallback(() => api(`school/visitors?date=${day}`, { tenant }).then(setD), [tenant, day]);
    useEffect(() => { load(); }, [load]);
    async function out(v) { await api(`school/visitors/${v.id}/out`, { method: 'POST', tenant }); toast(`${v.name} checked out`); load(); }
    const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} aria-label="Date" className="h-10 rounded-lg border border-rule bg-white px-3 font-bold" />
                {d && <Badge tone={d.inside ? 'warning' : 'neutral'}>{d.inside} on campus now</Badge>}
                <Button variant="ghost" icon="download" onClick={() => download('school/visitors/export.csv', tenant, 'visitors.csv')}>Export month</Button>
                <Button className="ml-auto" icon="plus" onClick={() => setAdding(true)}>Check in visitor</Button>
            </div>
            {!d ? <Skeleton className="h-40 rounded-2xl" /> : d.data.length === 0 ? <p className="rounded-xl border border-dashed border-rule bg-white/60 px-4 py-10 text-center text-pencil">No visitors logged on this day.</p> : (
                <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                    {d.data.map((v) => (
                        <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                            <span className="w-24 text-sm text-graphite tabular-nums">{time(v.checked_in_at)}{v.checked_out_at ? `–${time(v.checked_out_at)}` : ''}</span>
                            <span className="min-w-0 flex-1"><b className="text-graphite">{v.name}</b>{v.badge && <span className="ml-2 rounded bg-paper px-1.5 text-xs font-bold ring-1 ring-rule">Badge {v.badge}</span>}<span className="block text-sm text-pencil">{v.purpose}{v.host ? ` · meeting ${v.host}` : ''}{v.phone ? ` · ${v.phone}` : ''}</span></span>
                            {v.checked_out_at ? <Badge>Left</Badge> : <Button size="sm" variant="secondary" onClick={() => out(v)}>Check out</Button>}
                        </li>
                    ))}
                </ul>
            )}
            {adding && <VisitorForm tenant={tenant} onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast('Checked in'); load(); }} />}
        </div>
    );
}

function VisitorForm({ tenant, onClose, onDone }) {
    const [f, setF] = useState({ name: '', phone: '', purpose: '', host: '', id_note: '', badge: '' });
    const [error, setError] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    async function save() {
        try { await api('school/visitors', { method: 'POST', tenant, body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])) }); onDone(); } catch (e) { setError(e); }
    }
    return (
        <Modal open onClose={onClose} title="Check in a visitor" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Check in</Button></>}>
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" name="name" error={error} value={f.name} onChange={set('name')} />
                    <Field label="Phone" name="phone" error={error} value={f.phone} onChange={set('phone')} />
                </div>
                <Field label="Purpose of visit" name="purpose" error={error} value={f.purpose} onChange={set('purpose')} placeholder="Parent meeting, delivery, maintenance…" />
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Meeting" name="host" error={error} value={f.host} onChange={set('host')} />
                    <Field label="ID seen" name="id_note" error={error} value={f.id_note} onChange={set('id_note')} placeholder="Driver’s license" />
                    <Field label="Badge no." name="badge" error={error} value={f.badge} onChange={set('badge')} />
                </div>
            </div>
        </Modal>
    );
}
