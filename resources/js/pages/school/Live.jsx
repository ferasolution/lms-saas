import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Avatar, Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, Menu, PageHeader, SlideOver, Skeleton, Tabs, Toggle, useToast } from '../../components/ui';
import { api, download } from '../../lib/api';
import { LIVE_KINDS, addToCalendar, dayLabel, joinSession, providerOf, startsIn, time } from '../../lib/live';
import { useStructure } from '../../lib/school';

const localInput = (iso) => {
    const d = iso ? new Date(iso) : new Date(Date.now() + 3600000);
    if (!iso) d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function audienceText(s) {
    if (s.audience === 'staff') return 'All staff';
    if (s.audience === 'everyone') return s.is_public ? 'Whole school + public' : 'Whole school';
    return s.sections?.join(', ') || 'Selected classes';
}

export default function Live() {
    const { tenant, isStaff, isOffice, isParent } = useOutletContext();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const focus = Number(params.get('s')) || null;
    const [tab, setTab] = useState('upcoming');
    const [kind, setKind] = useState('');
    const [rows, setRows] = useState(null);
    const [editing, setEditing] = useState(null);
    const [people, setPeople] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [, tick] = useState(0);

    const load = useCallback(() => api(`school/live?${new URLSearchParams({ ...(tab === 'past' ? { past: 1 } : {}), ...(kind ? { kind } : {}) })}`, { tenant }).then((r) => setRows(r.data)), [tenant, tab, kind]);
    useEffect(() => { setRows(null); load(); }, [load]);
    // Refresh the "starts in" labels and Join buttons every 30 seconds.
    useEffect(() => { const i = setInterval(() => { tick((n) => n + 1); if (tab === 'upcoming') load(); }, 30000); return () => clearInterval(i); }, [load, tab]);
    useEffect(() => {
        if (focus && rows) document.getElementById(`live-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [focus, rows]);

    const groups = useMemo(() => {
        const out = [];
        for (const s of rows ?? []) {
            if (tab === 'upcoming' && s.state === 'live') continue; // shown in the banner above
            const key = new Date(s.starts_at).toDateString();
            const g = out[out.length - 1];
            if (g && g.key === key) g.items.push(s); else out.push({ key, label: dayLabel(s.starts_at), items: [s] });
        }
        return out;
    }, [rows, tab]);

    const live = (rows ?? []).filter((s) => tab === 'upcoming' && s.state === 'live');

    async function join(s) {
        const r = await joinSession(`school/live/${s.id}/join`, { method: 'POST', tenant }, toast);
        if (r) load();
    }

    async function remind(s) {
        try { const r = await api(`school/live/${s.id}/remind`, { method: 'POST', tenant }); toast(`Reminder sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`); } catch (e) { toast(e.message, 'error'); }
    }

    async function copyLink(s) {
        const url = `${window.location.origin}/${tenant}/webinars/${s.slug}`;
        try { await navigator.clipboard.writeText(url); toast('Registration link copied'); } catch { toast(url); }
    }

    async function act() {
        const { s, action } = confirm;
        try {
            if (action === 'delete') await api(`school/live/${s.id}`, { method: 'DELETE', tenant });
            else await api(`school/live/${s.id}`, { method: 'PATCH', tenant, body: { status: 'cancelled' } });
            toast(action === 'delete' ? 'Deleted' : 'Cancelled · everyone invited was told');
            setConfirm(null);
            load();
        } catch (e) { toast(e.message, 'error'); }
    }

    const kinds = isStaff ? ['class', 'training', 'webinar'] : ['class', 'webinar'];

    return (
        <div>
            <PageHeader title="Live sessions"
                description={isStaff ? 'Online classes, staff trainings and webinars on Zoom, Google Meet or Teams. Join from here so attendance is recorded.' : 'Online classes and webinars. Press Join when it’s time — the button opens 15 minutes before the start.'}
                actions={isStaff && <Button icon="plus" onClick={() => setEditing({})}>Schedule</Button>} />

            <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                <Tabs tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past & recordings' }]} value={tab} onChange={setTab} className="border-b-0" />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
                    {['', ...kinds].map((k) => (
                        <button key={k || 'all'} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                            className={`rounded-full px-3 py-1 text-sm font-bold ring-1 transition ${kind === k ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule hover:ring-ink/40'}`}>
                            {k ? LIVE_KINDS[k].short + (k === 'class' ? 'es' : 's') : 'All'}
                        </button>
                    ))}
                </div>
            </div>

            {live.length > 0 && (
                <section aria-label="Live now" className="mt-6 space-y-3">
                    {live.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-ink-deep p-5 text-white">
                            <span className="relative flex h-3 w-3" aria-hidden><span className="absolute inline-flex h-full w-full rounded-full bg-leaf opacity-75 motion-safe:animate-ping" /><span className="relative inline-flex h-3 w-3 rounded-full bg-leaf" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-white/70">Live now · until {time(s.ends_at)} · {s.provider}</p>
                                <p className="text-xl font-bold">{s.title}</p>
                                {s.host && <p className="text-sm text-white/70">with {s.host.name}</p>}
                            </div>
                            <Button icon="video" onClick={() => join(s)} className="bg-leaf! text-white! hover:brightness-110">{s.can_manage ? 'Start' : 'Join now'}</Button>
                        </div>
                    ))}
                </section>
            )}

            <div className="mt-6 space-y-8">
                {rows === null ? <Skeleton className="h-56 rounded-2xl" /> : rows.length === 0 ? (
                    tab === 'past'
                        ? <EmptyState icon="video" title="No past sessions">Sessions that have ended appear here with their recordings.</EmptyState>
                        : <EmptyState icon="video" title="Nothing scheduled" action={isStaff && <Button icon="plus" onClick={() => setEditing({})}>Schedule a session</Button>}>
                            {isStaff ? 'Paste your Zoom or Meet link, choose who it’s for, and everyone invited gets a notification.' : 'When a teacher schedules an online class or webinar for you, it shows up here.'}
                        </EmptyState>
                ) : groups.map((g) => (
                    <section key={g.key}>
                        <h2 className="mb-3 font-display text-lg font-bold text-ink-deep">{g.label}</h2>
                        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-white">
                            {g.items.map((s) => {
                                const K = LIVE_KINDS[s.kind];
                                const soon = startsIn(s.starts_at);
                                return (
                                    <li key={s.id} id={`live-${s.id}`} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5 ${focus === s.id ? 'bg-ink-50' : ''}`}>
                                        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap sm:block sm:w-28">
                                            <p className={`font-display text-xl font-bold tabular-nums ${s.state === 'cancelled' ? 'text-pencil line-through' : 'text-ink-deep'}`}>{time(s.starts_at)}</p>
                                            <p className="text-sm text-pencil">{s.duration_minutes} min</p>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-pencil">
                                                <span className="inline-flex items-center gap-1"><Icon name={K.icon} size={14} />{K.label}</span>
                                                <span className="inline-flex items-center gap-1"><Icon name="video" size={14} />{s.provider}</span>
                                                {s.state === 'live' && <Badge tone="success" dot>Live</Badge>}
                                                {s.state === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
                                                {s.attended && <Badge tone="success">You joined</Badge>}
                                            </div>
                                            <p className="mt-1 text-lg font-bold text-ink-deep">{s.title}</p>
                                            <p className="text-sm text-pencil">
                                                {s.host && <>with {s.host.name} · </>}{audienceText(s)}
                                                {s.stats && (s.stats.joined > 0 || s.stats.registered > 0) && <> · <button type="button" onClick={() => setPeople(s)} className="font-bold text-ink hover:underline">{s.stats.joined} joined{s.stats.registered ? `, ${s.stats.registered} registered` : ''}</button></>}
                                            </p>
                                            {s.description && <p className="mt-1 line-clamp-2 text-graphite">{s.description}</p>}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {s.recording_url ? (
                                                <Button as="a" href={s.recording_url} target="_blank" rel="noreferrer" variant="secondary" icon="play" size="sm">Recording</Button>
                                            ) : s.state === 'cancelled' || s.state === 'ended' ? null : s.join_open ? (
                                                <Button size="sm" icon="video" onClick={() => join(s)}>{s.can_manage ? 'Start' : 'Join'}</Button>
                                            ) : (
                                                <span className="text-sm font-bold text-pencil">{soon ? `Starts ${soon}` : 'Not open yet'}</span>
                                            )}
                                            {s.state !== 'cancelled' && s.state !== 'ended' && !s.can_manage && (
                                                <IconCal s={s} />
                                            )}
                                            {s.can_manage && (
                                                <Menu items={[
                                                    { label: 'Edit', icon: 'edit', onClick: () => setEditing(s) },
                                                    s.state !== 'ended' && s.state !== 'cancelled' && !s.join_open && { label: 'Test meeting link', icon: 'external', onClick: () => join(s) },
                                                    { label: 'Who joined', icon: 'users', onClick: () => setPeople(s) },
                                                    s.state !== 'ended' && s.state !== 'cancelled' && { label: 'Send reminder', icon: 'bell', onClick: () => remind(s) },
                                                    s.slug && { label: 'Copy sign-up link', icon: 'copy', onClick: () => copyLink(s) },
                                                    s.state === 'ended' && !s.recording_url && { label: 'Add recording', icon: 'play', onClick: () => setEditing({ ...s, focusRecording: true }) },
                                                    s.state === 'upcoming' && { label: 'Cancel session', icon: 'x', danger: true, onClick: () => setConfirm({ s, action: 'cancel' }) },
                                                    { label: 'Delete', icon: 'trash', danger: true, onClick: () => setConfirm({ s, action: 'delete' }) },
                                                ]} />
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>

            {isParent && rows?.length > 0 && <p className="mt-6 text-sm text-pencil">Your child joins from their own student login so their attendance is counted.</p>}

            {editing && <Editor tenant={tenant} isOffice={isOffice} session={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); if (focus) setParams({}); }} />}
            {people && <People tenant={tenant} session={people} onClose={() => setPeople(null)} />}
            <ConfirmDialog open={!!confirm} title={confirm?.action === 'delete' ? 'Delete this session?' : 'Cancel this session?'} confirmLabel={confirm?.action === 'delete' ? 'Delete' : 'Cancel session'}
                onConfirm={act} onClose={() => setConfirm(null)}>
                {confirm?.action === 'delete' ? 'It disappears for everyone, along with its attendance record.' : 'Everyone invited gets a notification that it’s cancelled.'}
            </ConfirmDialog>
        </div>
    );
}

function IconCal({ s }) {
    return (
        <button type="button" title="Add to calendar" aria-label="Add to calendar" onClick={() => addToCalendar({ ...s, url: `${window.location.origin}${window.location.pathname}?s=${s.id}` })}
            className="grid h-9 w-9 place-items-center rounded-lg text-pencil hover:bg-ink-50 hover:text-ink">
            <Icon name="calendar" size={18} />
        </button>
    );
}

function Editor({ tenant, isOffice, session, onClose, onSaved }) {
    const toast = useToast();
    const [structure] = useStructure(tenant);
    const isNew = !session.id;
    const [f, setF] = useState(() => ({
        kind: session.kind ?? 'class', title: session.title ?? '', description: session.description ?? '',
        starts_at: localInput(session.starts_at), duration_minutes: session.duration_minutes ?? 45,
        meeting_url: session.meeting_url ?? '', passcode: session.passcode ?? '', audience: session.audience ?? 'sections',
        section_ids: session.section_ids ?? [], is_public: session.is_public ?? false, capacity: session.capacity ?? '',
        host_id: session.host?.id ?? '', recording_url: session.recording_url ?? '', notify: true,
    }));
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const provider = providerOf(f.meeting_url);
    const sections = (structure?.sections ?? []).filter((s) => isOffice || s.mine);
    const audience = f.kind === 'training' ? 'staff' : f.audience;

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const body = {
                ...f, audience, starts_at: new Date(f.starts_at).toISOString(), duration_minutes: Number(f.duration_minutes),
                capacity: f.capacity === '' ? null : Number(f.capacity), host_id: f.host_id === '' ? null : Number(f.host_id),
                passcode: f.passcode || null, description: f.description || null, recording_url: f.recording_url || null,
                section_ids: audience === 'sections' ? f.section_ids : [],
            };
            if (!isOffice) delete body.host_id;
            if (isNew) delete body.recording_url;
            await api(isNew ? 'school/live' : `school/live/${session.id}`, { method: isNew ? 'POST' : 'PATCH', tenant, body });
            toast(isNew ? (f.notify ? 'Scheduled · invitations sent' : 'Scheduled') : 'Saved');
            onSaved();
        } catch (err) {
            setError(err);
            if (!Object.keys(err.errors ?? {}).length) toast(err.message, 'error');
        } finally { setBusy(false); }
    }

    const toggleSection = (id) => setF({ ...f, section_ids: f.section_ids.includes(id) ? f.section_ids.filter((x) => x !== id) : [...f.section_ids, id] });

    return (
        <SlideOver open onClose={onClose} title={isNew ? 'Schedule a live session' : 'Edit session'}
            description="Create the meeting in Zoom, Google Meet or Teams, then paste its link here."
            footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="live-form" busy={busy}>{isNew ? 'Schedule' : 'Save changes'}</Button></>}>
            <form id="live-form" onSubmit={save} className="space-y-5">
                {isNew && (
                    <fieldset>
                        <legend className="mb-2 font-bold text-graphite">Type</legend>
                        <div className="grid grid-cols-3 gap-2">
                            {Object.entries(LIVE_KINDS).filter(([k]) => k !== 'training' || isOffice).map(([k, K]) => (
                                <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k, audience: k === 'webinar' ? 'everyone' : k === 'class' ? 'sections' : 'staff' })}
                                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-sm font-bold ring-1 transition ${f.kind === k ? 'bg-ink-50 text-ink-deep ring-ink' : 'bg-white text-graphite ring-rule hover:ring-ink/40'}`}>
                                    <Icon name={K.icon} size={20} />{K.short}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                )}
                <Field label="Title" name="title" error={error} value={f.title} onChange={set('title')} placeholder={f.kind === 'class' ? 'Grade 5 Maths — fractions recap' : f.kind === 'training' ? 'Safeguarding refresher' : 'Admissions open house'} />
                <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
                    <Field label="Starts" name="starts_at" type="datetime-local" error={error} value={f.starts_at} onChange={set('starts_at')} />
                    <Field label="Length" name="duration_minutes" as="select" error={error} value={f.duration_minutes} onChange={set('duration_minutes')}>
                        {[15, 30, 40, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                        {![15, 30, 40, 45, 60, 90, 120, 180].includes(Number(f.duration_minutes)) && <option value={f.duration_minutes}>{f.duration_minutes} min</option>}
                    </Field>
                </div>
                <div>
                    <Field label="Meeting link" name="meeting_url" type="url" error={error} value={f.meeting_url} onChange={set('meeting_url')} placeholder="https://zoom.us/j/… or https://meet.google.com/…"
                        hint={provider ? `${provider} link · only hosts see it; everyone else joins with the Join button so attendance is recorded.` : 'Students and parents never see the raw link — they press Join.'} />
                </div>
                <Field label="Passcode (optional)" name="passcode" error={error} value={f.passcode} onChange={set('passcode')} className="max-w-56" />

                {f.kind !== 'training' && (
                    <fieldset className="space-y-3">
                        <legend className="mb-1 font-bold text-graphite">Who’s it for?</legend>
                        {f.kind === 'webinar' && (
                            <div className="flex gap-2">
                                {[['everyone', 'Whole school'], ['sections', 'Some classes']].map(([v, l]) => (
                                    <button key={v} type="button" aria-pressed={f.audience === v} onClick={() => setF({ ...f, audience: v })}
                                        className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${f.audience === v ? 'bg-ink-deep text-white ring-ink-deep' : 'bg-white text-graphite ring-rule'}`}>{l}</button>
                                ))}
                            </div>
                        )}
                        {audience === 'sections' && (
                            structure === null ? <Skeleton className="h-20" /> : sections.length === 0 ? <p className="text-pencil">You aren’t assigned to any class yet.</p> : (
                                <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-rule p-3">
                                    {sections.map((s) => <Checkbox key={s.id} label={s.label} checked={f.section_ids.includes(s.id)} onChange={() => toggleSection(s.id)} />)}
                                </div>
                            )
                        )}
                        {audience === 'sections' && <p className="text-sm text-pencil">Students in these classes and their parents are invited.</p>}
                    </fieldset>
                )}
                {f.kind === 'training' && <p className="rounded-xl bg-ink-50 px-4 py-3 text-graphite">All teachers and office staff are invited.</p>}

                {f.kind === 'webinar' && (
                    <div className="space-y-3 rounded-xl border border-rule p-4">
                        <Toggle checked={f.is_public} onChange={(v) => setF({ ...f, is_public: v })} label="Open registration page" hint="Anyone with the link can sign up — prospective parents, alumni, guests." />
                        {f.is_public && <Field label="Seats (optional)" name="capacity" type="number" min="1" error={error} value={f.capacity} onChange={set('capacity')} className="max-w-40" />}
                    </div>
                )}

                {isOffice && (
                    <Field label="Host" name="host_id" as="select" error={error} value={f.host_id} onChange={set('host_id')}>
                        <option value="">Me</option>
                        {(structure?.teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Field>
                )}
                <Field label="Description (optional)" name="description" as="textarea" rows={3} error={error} value={f.description} onChange={set('description')} placeholder="What to prepare, what you’ll cover…" />
                {!isNew && (
                    <Field label="Recording link" name="recording_url" type="url" error={error} value={f.recording_url} onChange={set('recording_url')} autoFocus={session.focusRecording}
                        placeholder="Zoom cloud, Google Drive or YouTube (unlisted) link" hint="Everyone invited is told when you add it." />
                )}
                {isNew && <Checkbox label="Notify everyone invited now" checked={f.notify} onChange={(v) => setF({ ...f, notify: v })} />}
            </form>
        </SlideOver>
    );
}

function People({ tenant, session, onClose }) {
    const toast = useToast();
    const [d, setD] = useState(null);
    const [tab, setTab] = useState('people');
    useEffect(() => { api(`school/live/${session.id}/attendance`, { tenant }).then(setD).catch((e) => { toast(e.message, 'error'); onClose(); }); }, [tenant, session.id]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <SlideOver open onClose={onClose} title="Who joined" description={`${session.title} · ${dayLabel(session.starts_at)}, ${time(session.starts_at)}`}
            footer={<Button variant="secondary" icon="download" onClick={() => download(`school/live/${session.id}/attendance.csv`, tenant, 'attendance.csv').catch((e) => toast(e.message, 'error'))}>Download CSV</Button>}>
            {!d ? <Skeleton className="h-48" /> : (
                <>
                    <dl className="grid grid-cols-3 divide-x divide-rule rounded-xl border border-rule text-center">
                        {[['Joined', d.summary.joined], ['Invited', d.summary.invited ?? '—'], ['Registered', d.summary.registered]].map(([l, v]) => (
                            <div key={l} className="p-3"><dt className="text-sm text-pencil">{l}</dt><dd className="font-display text-2xl font-bold tabular-nums text-ink-deep">{v}</dd></div>
                        ))}
                    </dl>
                    {d.registrations.length > 0 && <Tabs className="mt-5" tabs={[{ value: 'people', label: 'Members', count: d.people.length }, { value: 'guests', label: 'Registrations', count: d.registrations.length }]} value={tab} onChange={setTab} />}
                    <ul className="mt-3 divide-y divide-rule">
                        {(tab === 'people' ? d.people : d.registrations.map((r) => ({ ...r, about: r.organisation || r.email, joined: !!r.joined_at, first_joined_at: r.joined_at }))).map((p) => (
                            <li key={p.id} className="flex items-center gap-3 py-2.5">
                                <Avatar name={p.name} size={34} />
                                <div className="min-w-0 flex-1"><p className="truncate font-bold text-graphite">{p.name}</p><p className="truncate text-sm text-pencil">{p.about}</p></div>
                                {p.joined ? <span className="text-right text-sm"><Badge tone="success">Joined</Badge><span className="mt-0.5 block text-pencil">{time(p.first_joined_at)}{p.joins > 1 ? ` · ${p.joins}×` : ''}</span></span> : <Badge tone="draft">Not joined</Badge>}
                            </li>
                        ))}
                        {tab === 'people' && d.people.length === 0 && <li className="py-6 text-center text-pencil">Nobody has joined yet.</li>}
                    </ul>
                </>
            )}
        </SlideOver>
    );
}
