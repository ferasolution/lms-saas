import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Button, Field, Skeleton, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { addToCalendar, joinSession, startsIn, time } from '../../lib/live';

const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
};

/** Public webinar page at /:tenant/webinars/:slug — sign up, then join with a personal link. */
export default function Webinar() {
    const { tenant, slug } = useParams();
    const [params, setParams] = useSearchParams();
    const toast = useToast();
    const key = `edusphere.webinar.${tenant}.${slug}`;
    const [info, setInfo] = useState(null);
    const [token, setToken] = useState(() => params.get('t') || store.get(key));
    const [f, setF] = useState({ name: '', email: '', organisation: '', phone: '', website: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [, tick] = useState(0);

    useEffect(() => {
        api(`webinars/${slug}`, { tenant }).then((d) => { setInfo(d); document.title = `${d.session.title} · ${d.institute.name}`; }).catch(() => setInfo(false));
    }, [tenant, slug]);
    useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(i); }, []);
    useEffect(() => { if (params.get('t')) store.set(key, params.get('t')); }, [params, key]);

    const myLink = token ? `${window.location.origin}/${tenant}/webinars/${slug}?t=${token}` : null;
    const s = info?.session;
    const opensAt = s ? new Date(new Date(s.starts_at).getTime() - 15 * 60000) : null;
    const canJoin = s && Date.now() >= opensAt && s.state !== 'ended';

    async function register(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await api(`webinars/${slug}/register`, { method: 'POST', tenant, body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])) });
            store.set(key, r.token);
            setToken(r.token);
            setParams({ t: r.token }, { replace: true });
            window.scrollTo(0, 0);
        } catch (err) { setError(err); } finally { setBusy(false); }
    }

    async function copy() {
        try { await navigator.clipboard.writeText(myLink); toast('Link copied'); } catch { toast(myLink); }
    }

    const when = s && new Date(s.starts_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, ' ');

    return (
        <div className="min-h-screen bg-paper">
            <div className="ruled border-b border-rule bg-white">
                <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
                    {info === null ? <Skeleton className="h-24 w-full max-w-md" /> : info === false ? (
                        <><h1 className="text-3xl font-extrabold">This webinar isn’t available</h1><p className="mt-2 text-pencil">The link may be wrong, or the session was cancelled.</p></>
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                {info.institute.logo ? <img src={info.institute.logo} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white"><Icon name="school" size={20} /></span>}
                                <p className="font-bold text-ink-deep">{info.institute.name}</p>
                            </div>
                            <p className="mt-8 font-bold text-margin">{s.state === 'live' ? 'Live now' : s.state === 'ended' ? 'This webinar has ended' : 'Free webinar'}</p>
                            <h1 className="mt-1 text-4xl font-extrabold text-balance sm:text-5xl">{s.title}</h1>
                            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-graphite">
                                <p className="flex items-center gap-2"><Icon name="calendar" size={18} className="text-ink" />{when}</p>
                                <p className="flex items-center gap-2"><Icon name="clock" size={18} className="text-ink" />{time(s.starts_at)} – {time(s.ends_at)} <span className="text-pencil">({tz})</span></p>
                                <p className="flex items-center gap-2"><Icon name="video" size={18} className="text-ink" />{s.provider}</p>
                                {s.host && <p className="flex items-center gap-2"><Icon name="user" size={18} className="text-ink" />{s.host}</p>}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {s && (
                <main className="mx-auto grid max-w-3xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="order-2 md:order-1">
                        {s.description ? <p className="text-lg leading-relaxed whitespace-pre-line text-graphite">{s.description}</p> : <p className="text-pencil">Join us online — sign up to get your personal join link.</p>}
                        {s.state === 'ended' && s.recording_url && <Button as="a" href={s.recording_url} target="_blank" rel="noreferrer" icon="play" variant="secondary" className="mt-6">Watch the recording</Button>}
                    </div>

                    <aside className="order-1 self-start rounded-2xl border border-rule bg-white p-5 md:order-2">
                        {s.state === 'ended' ? (
                            <p className="text-graphite">Registration is closed.</p>
                        ) : token ? (
                            <div className="space-y-4">
                                <p className="flex items-center gap-2 font-bold text-leaf"><Icon name="check" size={18} strokeWidth={3} />You’re registered</p>
                                {canJoin ? (
                                    <Button icon="video" className="w-full" onClick={() => joinSession(`webinars/${slug}/join?t=${encodeURIComponent(token)}`, { tenant }, toast)}>Join the webinar</Button>
                                ) : (
                                    <p className="rounded-xl bg-ink-50 px-4 py-3 text-graphite">The Join button opens at <b>{time(opensAt.toISOString())}</b>{startsIn(opensAt.toISOString()) ? ` (${startsIn(opensAt.toISOString())})` : ''}. Come back to this page then.</p>
                                )}
                                <Button variant="secondary" icon="calendar" className="w-full" onClick={() => addToCalendar({ ...s, url: myLink })}>Add to calendar</Button>
                                <div>
                                    <p className="text-sm font-bold text-graphite">Your personal link</p>
                                    <p className="text-sm text-pencil">Bookmark it or keep it in your calendar — it’s how you get back in.</p>
                                    <button type="button" onClick={copy} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-rule bg-paper px-3 py-2 text-left text-sm text-graphite hover:border-ink/40">
                                        <span className="min-w-0 flex-1 truncate font-mono">{myLink}</span><Icon name="copy" size={16} className="shrink-0 text-ink" />
                                    </button>
                                </div>
                            </div>
                        ) : s.seats_left === 0 ? (
                            <p className="text-graphite">This webinar is full.</p>
                        ) : (
                            <form onSubmit={register} className="space-y-4" noValidate>
                                <h2 className="text-xl font-bold">Save your seat</h2>
                                {s.seats_left !== null && <p className="-mt-2 text-sm text-pencil">{s.seats_left} {s.seats_left === 1 ? 'seat' : 'seats'} left</p>}
                                {error && !Object.keys(error.errors ?? {}).length && <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin" role="alert">{error.message}</p>}
                                <Field label="Your name" name="name" error={error} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
                                <Field label="Email" name="email" type="email" error={error} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
                                <Field label="Organisation or school (optional)" name="organisation" error={error} value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} />
                                <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
                                <Button type="submit" busy={busy} className="w-full">Register</Button>
                                <p className="text-xs text-pencil">Your details go only to {info.institute.name}.</p>
                            </form>
                        )}
                    </aside>
                </main>
            )}
        </div>
    );
}
