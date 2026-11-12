import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import { Logo } from '../components/ui';
import { CountUp, EASE, MaskedLines, Reveal } from '../components/landing/Reveal';

const HeroScene = lazy(() => import('../components/landing/HeroScene'));

const hasWebGL = () => {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch {
        return false;
    }
};

/* ---------------------------------------------------------------- content */

const AUDIENCES = [
    {
        key: 'academy', icon: 'academy', label: 'Academies', short: 'Academy',
        title: 'Sell your courses under your own name',
        text: 'Publish free and paid courses, take payments by bank transfer, PayPal, Wise or card link, and give every graduate a certificate they can share.',
        points: ['Free and paid courses with sale prices', 'Payment approvals in one tap', 'Certificates with a public verify link', 'Your logo and colours throughout'],
        shot: 'course',
    },
    {
        key: 'school', icon: 'school', label: 'Schools', short: 'School',
        title: 'Homework, quizzes and notes, all in one place',
        text: 'Teachers build a course per subject and class. Lessons open week by week and quizzes mark themselves, so teachers see who is keeping up.',
        points: ['A course for every subject and class', 'Lessons released on a schedule', 'Self-marking quizzes with pass marks', 'Each student’s progress at a glance'],
        shot: 'builder',
    },
    {
        key: 'corporate', icon: 'building', label: 'Companies', short: 'Company',
        title: 'Train every team and prove who finished',
        text: 'Onboarding, compliance and product training with pass marks and attempt limits. Completion is recorded with a dated certificate.',
        points: ['Training courses for every team', 'Pass marks and attempt limits', 'Who finished, and when', 'Certificates for every completion'],
        shot: 'quiz',
    },
];

const TOUR = [
    { shot: 'builder', icon: 'layers', title: 'Build', text: 'Drop in videos from YouTube or Vimeo, write a reading, attach a PDF, schedule a live class. Arrange it into sections like chapters of a book.' },
    { shot: 'player', icon: 'play', title: 'Teach', text: 'Students get a calm, focused lesson player on phone or laptop. Their place is saved, and “Complete and continue” keeps them moving.' },
    { shot: 'quiz', icon: 'quiz', title: 'Test', text: 'One-answer, multi-answer and true/false questions, marked the moment they submit. Set a pass mark, a timer and how many tries they get.' },
    { shot: 'certificate', icon: 'award', title: 'Certify', text: 'Finish every lesson and a certificate is issued automatically, with a code anyone can check at the verify page.' },
    { shot: 'payments', icon: 'wallet', title: 'Get paid', text: 'Students pay you directly and send the transaction ID. You check it in your account and approve. Access opens instantly.' },
];

const FAQ = [
    ['Do my students need to install anything?', 'No. Fera EduSphere works in any browser on a phone, tablet or computer. Students sign in at your institute’s own address.'],
    ['How do I upload videos?', 'Upload to YouTube (unlisted works well), Vimeo or Bunny Stream and paste the link. Those services stream smoothly on slow connections, which shared hosting can’t do.'],
    ['How do payments work?', 'You add your bank, PayPal, Wise or card payment link in Settings, and price courses in your own currency. Students pay you directly and enter the transaction ID; you approve it on the Payments page and they get access straight away. The money never passes through us.'],
    ['Can I use my own logo and colours?', 'Yes. Upload your logo and pick one of six colour themes. Your sign-in page, dashboard and certificates all carry your name.'],
    ['What happens after the free trial?', 'You keep everything you built. Choose a plan that fits the number of students you have, or stay on the Free plan for small groups.'],
    ['Is our data kept separate from other institutes?', 'Yes. Every institute has its own address, accounts and courses, and the system checks on every request that people only ever see their own institute’s data.'],
];

const FALLBACK_PLANS = [
    { slug: 'free', name: 'Free', price_monthly: '0', max_students: 25, max_courses: 3, storage_mb: 500 },
    { slug: 'basic', name: 'Basic', price_monthly: '29', max_students: 300, max_courses: 30, storage_mb: 10240 },
    { slug: 'pro', name: 'Pro', price_monthly: '79', max_students: null, max_courses: null, storage_mb: 102400 },
];

const shot = (name) => `/marketing/${name}.webp`;
const storage = (mb) => (mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);

/* ---------------------------------------------------------------- page */

export default function Landing() {
    const [plans, setPlans] = useState(FALLBACK_PLANS);
    useEffect(() => { api('plans').then((r) => r.data?.length && setPlans(r.data)).catch(() => {}); }, []);

    return (
        <div className="overflow-x-clip bg-paper">
            <Nav />
            <Hero />
            <ProductReveal />
            <Audiences />
            <Tour />
            <Bento />
            <Facts />
            <Pricing plans={plans} />
            <Faq />
            <FinalCta />
            <Footer />
        </div>
    );
}

/* ---------------------------------------------------------------- nav */

function Nav() {
    const { scrollY } = useScroll();
    const [solid, setSolid] = useState(false);
    const [open, setOpen] = useState(false);
    useMotionValueEvent(scrollY, 'change', (y) => setSolid(y > window.innerHeight * 0.75));

    const link = `rounded-full px-3.5 py-2 text-[15px] font-bold transition ${solid ? 'text-pencil hover:text-ink-deep' : 'text-white/75 hover:text-white'}`;

    return (
        <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
            <div className={`mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pr-2 pl-4 transition-all duration-300 ${solid ? 'bg-white/85 shadow-[0_8px_30px_-12px_rgba(18,40,95,.35)] ring-1 ring-rule backdrop-blur-xl' : 'bg-white/[.06] ring-1 ring-white/10 backdrop-blur-md'}`}>
                <Logo className={solid ? '' : '[&_span:last-child]:text-white'} />
                <nav className="hidden items-center md:flex" aria-label="Main">
                    <a href="#tour" className={link}>Product</a>
                    <a href="#who" className={link}>Who it’s for</a>
                    <a href="#pricing" className={link}>Pricing</a>
                    <a href="#faq" className={link}>FAQ</a>
                </nav>
                <div className="flex items-center gap-1.5">
                    <Link to="/login" className={`hidden sm:block ${link}`}>Sign in</Link>
                    <Link to="/register" className={`rounded-full px-4 py-2 text-[15px] font-bold transition ${solid ? 'bg-ink text-white hover:bg-ink-deep' : 'bg-white text-ink-deep hover:bg-ink-50'}`}>Start free</Link>
                    <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}
                        className={`grid h-10 w-10 place-items-center rounded-full md:hidden ${solid ? 'text-ink-deep' : 'text-white'}`}>
                        <Icon name={open ? 'x' : 'menu'} />
                    </button>
                </div>
            </div>
            <AnimatePresence>
                {open && (
                    <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="mx-auto mt-2 grid max-w-6xl gap-1 rounded-3xl bg-white p-3 shadow-xl ring-1 ring-rule md:hidden" aria-label="Mobile">
                        {[['#tour', 'Product'], ['#who', 'Who it’s for'], ['#pricing', 'Pricing'], ['#faq', 'FAQ']].map(([h, l]) => (
                            <a key={h} href={h} onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 font-bold text-ink-deep hover:bg-ink-50">{l}</a>
                        ))}
                        <Link to="/login" className="rounded-2xl px-4 py-3 font-bold text-ink-deep hover:bg-ink-50">Sign in</Link>
                    </motion.nav>
                )}
            </AnimatePresence>
        </header>
    );
}

/* ---------------------------------------------------------------- hero */

function Hero() {
    const reduce = useReducedMotion();
    const [gl, setGl] = useState(false);
    useEffect(() => setGl(hasWebGL()), []);
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
    const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
    const lift = useTransform(scrollYProgress, [0, 1], [0, -80]);

    return (
        <section ref={ref} className="relative min-h-[100svh] overflow-hidden bg-[#0d1d4a] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_40%,#1d3a8f_0%,#0d1d4a_60%,#08133a_100%)]" aria-hidden />
            <div className="absolute inset-0 opacity-[.35]" aria-hidden
                style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 39px, rgba(255,255,255,.06) 39px, rgba(255,255,255,.06) 40px)' }} />
            <div className="absolute inset-y-0 left-[max(1rem,calc(50%-37rem))] w-[2px] bg-[#e5484d]/80" aria-hidden />

            {gl && <Suspense fallback={null}><HeroScene reduced={!!reduce} /></Suspense>}
            {/* Keeps the headline readable over the 3D scene. */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0d1d4a_0%,rgba(13,29,74,.85)_30%,rgba(13,29,74,0)_62%)] max-md:bg-[linear-gradient(180deg,rgba(13,29,74,.1)_0%,rgba(13,29,74,.7)_40%,rgba(13,29,74,.92)_70%)]" aria-hidden />

            <motion.div style={reduce ? undefined : { opacity: fade, y: lift }}
                className="pointer-events-none relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-5 pt-28 pb-24 sm:px-8 sm:pl-14">
                <div className="pointer-events-auto max-w-2xl">
                    <motion.p initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05, duration: 0.6 }}
                        className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 py-1.5 pr-4 pl-1.5 text-sm text-white/85 ring-1 ring-white/15 backdrop-blur">
                        <span className="rounded-full bg-[#e5484d] px-2 py-0.5 text-xs font-bold text-white">New</span>
                        Quizzes, certificates and payments are live
                    </motion.p>
                    <h1 className="font-display text-[clamp(3rem,9vw,6.6rem)] leading-[0.92] font-extrabold tracking-[-0.045em] text-white">
                        <MaskedLines lines={['Teach it.', 'Test it.', 'Certify it.']} />
                    </h1>
                    <motion.p initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.7, ease: EASE }}
                        className="mt-7 max-w-xl text-lg leading-8 text-white/75 sm:text-xl sm:leading-9">
                        Your own learning portal for courses, quizzes, progress and payments. Built for schools, academies and training teams. Ready in five minutes.
                    </motion.p>
                    <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.7, ease: EASE }}
                        className="mt-9 flex flex-col gap-3 sm:flex-row">
                        <Link to="/register" className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-7 text-[17px] font-bold text-ink-deep shadow-[0_12px_40px_-12px_rgba(255,255,255,.5)] transition hover:bg-ink-50">
                            Start your free trial
                            <Icon name="arrowRight" size={20} className="transition group-hover:translate-x-1" />
                        </Link>
                        <a href="#tour" className="inline-flex h-14 items-center justify-center gap-2 rounded-full px-7 text-[17px] font-bold text-white ring-1 ring-white/25 transition hover:bg-white/10">
                            <Icon name="play" size={18} />See it in action
                        </a>
                    </motion.div>
                    <motion.ul initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95, duration: 0.8 }}
                        className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-white/65">
                        {['14 days free', 'No card needed', 'Works on any phone'].map((t) => (
                            <li key={t} className="flex items-center gap-2"><Icon name="check" size={17} strokeWidth={2.6} className="text-[#7be0a6]" />{t}</li>
                        ))}
                    </motion.ul>
                </div>
            </motion.div>

            <motion.a href="#product" aria-label="Scroll to the product"
                initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
                className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-sm text-white/50 sm:flex">
                <span className="relative h-10 w-6 rounded-full ring-1 ring-white/30">
                    <motion.span className="absolute top-2 left-1/2 h-2 w-1 -translate-x-1/2 rounded-full bg-white/70"
                        animate={reduce ? undefined : { y: [0, 12, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
                </span>
            </motion.a>
        </section>
    );
}

/* ---------------------------------------------------------------- product reveal */

function BrowserFrame({ src, alt, url = 'lms.ferasolution.com/brightpath', className = '', eager = false }) {
    return (
        <div className={`overflow-hidden rounded-2xl bg-white shadow-[0_40px_100px_-30px_rgba(13,29,74,.55)] ring-1 ring-ink-deep/10 ${className}`}>
            <div className="flex items-center gap-2 border-b border-rule bg-[#f3f6fc] px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
                <span className="mx-auto flex max-w-[60%] items-center gap-1.5 truncate rounded-md bg-white px-3 py-1 text-xs text-pencil ring-1 ring-rule">
                    <Icon name="lock" size={11} />{url}
                </span>
                <span className="w-12" />
            </div>
            <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" width="1440" height="900" className="block aspect-[16/10] w-full object-cover object-top" />
        </div>
    );
}

function ProductReveal() {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.25'] });
    const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
    const rotateX = useTransform(p, [0, 1], [24, 0]);
    const scale = useTransform(p, [0, 1], [0.88, 1]);
    const y = useTransform(p, [0, 1], [60, 0]);

    return (
        <section id="product" className="relative -mt-24 px-4 sm:-mt-32 sm:px-8" style={{ perspective: 1600 }}>
            <motion.div ref={ref} style={reduce ? undefined : { rotateX, scale, y, transformOrigin: '50% 0%' }} className="relative z-10 mx-auto max-w-5xl">
                <BrowserFrame src={shot('dashboard')} alt="The institute dashboard: courses, enrolments, students and revenue at a glance" eager />
                <motion.div initial={reduce ? false : { opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.7, ease: EASE }}
                    className="absolute -right-2 bottom-10 hidden w-60 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-rule sm:block lg:-right-14">
                    <p className="text-sm text-pencil">Payment received</p>
                    <p className="mt-1 font-display text-2xl font-bold text-ink-deep">$149</p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-leaf"><Icon name="check" size={16} strokeWidth={2.6} />Approved, access opened</p>
                </motion.div>
                <motion.div initial={reduce ? false : { opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.45, duration: 0.7, ease: EASE }}
                    className="absolute top-24 -left-2 hidden w-56 rounded-2xl bg-ink-deep p-4 text-white shadow-2xl sm:block lg:-left-14">
                    <p className="text-sm text-white/60">Quiz submitted</p>
                    <p className="mt-1 font-display text-3xl font-bold">18<span className="text-lg text-white/50">/20</span></p>
                    <p className="mt-1 text-sm font-bold text-[#7be0a6]">Passed first try</p>
                </motion.div>
            </motion.div>
        </section>
    );
}

/* ---------------------------------------------------------------- audiences */

function Audiences() {
    const [active, setActive] = useState(0);
    const a = AUDIENCES[active];
    return (
        <section id="who" className="mx-auto max-w-6xl scroll-mt-24 px-5 pt-28 pb-20 sm:px-8 lg:pt-36">
            <Reveal>
                <h2 className="max-w-3xl font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.02] font-extrabold tracking-[-0.035em]">One platform that fits the way you teach.</h2>
            </Reveal>
            <Reveal delay={0.1}>
                <div className="mt-10 grid grid-cols-3 rounded-full bg-white p-1.5 ring-1 ring-rule sm:inline-grid" role="tablist" aria-label="Who it’s for">
                    {AUDIENCES.map((x, i) => (
                        <button key={x.key} role="tab" aria-selected={active === i} onClick={() => setActive(i)}
                            className="relative flex items-center justify-center gap-2 rounded-full px-3 py-2.5 font-bold transition sm:px-5">
                            {active === i && <motion.span layoutId="aud-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                            <span className={`relative flex items-center gap-2 ${active === i ? 'text-white' : 'text-pencil hover:text-ink-deep'}`}>
                                <Icon name={x.icon} size={18} className="hidden min-[380px]:block" /><span className="hidden sm:inline">{x.label}</span><span className="sm:hidden">{x.short}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Reveal>

            <AnimatePresence mode="wait">
                <motion.div key={a.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35, ease: EASE }}
                    className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1.25fr]">
                    <div>
                        <h3 className="font-display text-3xl leading-tight font-bold sm:text-4xl">{a.title}</h3>
                        <p className="mt-4 text-lg leading-8 text-pencil">{a.text}</p>
                        <ul className="mt-7 space-y-3.5">
                            {a.points.map((pt, i) => (
                                <motion.li key={pt} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                                    className="flex items-start gap-3 text-[17px] text-graphite">
                                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf-50 text-leaf"><Icon name="check" size={14} strokeWidth={3} /></span>{pt}
                                </motion.li>
                            ))}
                        </ul>
                        <Link to={`/register?type=${a.key}`} className="group mt-9 inline-flex items-center gap-2 font-bold text-ink">
                            Set up {a.key === 'academy' ? 'your academy' : a.key === 'school' ? 'your school' : 'your company'}
                            <Icon name="arrowRight" size={18} className="transition group-hover:translate-x-1" />
                        </Link>
                    </div>
                    <BrowserFrame src={shot(a.shot)} alt={`${a.label}: ${a.title}`} />
                </motion.div>
            </AnimatePresence>
        </section>
    );
}

/* ---------------------------------------------------------------- sticky tour */

function Tour() {
    const [active, setActive] = useState(0);
    return (
        <section id="tour" className="scroll-mt-20 bg-[#0d1d4a] text-white">
            <div className="mx-auto max-w-6xl px-5 pt-24 pb-10 sm:px-8 lg:pt-32">
                <Reveal>
                    <h2 className="max-w-3xl font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.02] font-extrabold tracking-[-0.035em] text-white">From the first lesson to the last certificate.</h2>
                </Reveal>
                <Reveal delay={0.1}><p className="mt-5 max-w-xl text-lg text-white/65">Five things every course needs, done properly, in one place.</p></Reveal>
            </div>

            <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-28 sm:px-8 lg:grid-cols-[1fr_1.35fr] lg:gap-16">
                <ol className="relative lg:py-[22vh]">
                    <span className="absolute top-0 bottom-0 left-[19px] hidden w-px bg-white/15 lg:block" aria-hidden />
                    {TOUR.map((step, i) => <TourStep key={step.title} step={step} index={i} active={active === i} onEnter={() => setActive(i)} />)}
                </ol>
                <div className="sticky top-24 hidden h-[calc(100vh-8rem)] items-center lg:flex">
                    <div className="relative w-full">
                        <AnimatePresence mode="popLayout">
                            <motion.div key={TOUR[active].shot} initial={{ opacity: 0, y: 30, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -30, rotate: 1.5 }}
                                transition={{ duration: 0.5, ease: EASE }}>
                                <BrowserFrame src={shot(TOUR[active].shot)} alt={TOUR[active].title} />
                            </motion.div>
                        </AnimatePresence>
                        <div className="mt-6 flex justify-center gap-2" aria-hidden>
                            {TOUR.map((s, i) => <span key={s.title} className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? 'w-8 bg-[#e5484d]' : 'w-1.5 bg-white/25'}`} />)}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function TourStep({ step, index, active, onEnter }) {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.6', 'end 0.4'] });
    useMotionValueEvent(scrollYProgress, 'change', (v) => { if (v > 0 && v < 1) onEnter(); });

    return (
        <li ref={ref} className="relative pb-14 lg:min-h-[48vh] lg:pb-0">
            <div className={`flex gap-5 transition-opacity duration-500 lg:opacity-30 ${active ? 'lg:!opacity-100' : ''}`}>
                <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 transition-colors duration-500 ${active ? 'bg-white text-ink-deep ring-white' : 'bg-[#0d1d4a] text-white ring-white/30'}`}>
                    <Icon name={step.icon} size={19} />
                </span>
                <div>
                    <p className="text-sm font-bold text-white/45 tabular-nums">Step {index + 1}</p>
                    <h3 className="mt-1 font-display text-3xl font-bold text-white sm:text-4xl">{step.title}</h3>
                    <p className="mt-3 max-w-md text-lg leading-8 text-white/70">{step.text}</p>
                </div>
            </div>
            <div className="mt-6 lg:hidden"><BrowserFrame src={shot(step.shot)} alt={step.title} /></div>
        </li>
    );
}

/* ---------------------------------------------------------------- bento */

function Tile({ className = '', title, text, children, delay = 0 }) {
    return (
        <Reveal delay={delay} className={`group relative flex flex-col overflow-hidden rounded-3xl border border-rule bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(18,40,95,.45)] sm:p-7 ${className}`}>
            <div className="relative flex-1">{children}</div>
            <h3 className="mt-6 text-xl font-bold">{title}</h3>
            <p className="mt-1.5 text-pencil">{text}</p>
        </Reveal>
    );
}

function LessonTypes() {
    const types = [['video', 'Video'], ['book', 'Reading'], ['file', 'PDF'], ['calendar', 'Live class'], ['quiz', 'Quiz']];
    const [i, setI] = useState(0);
    const reduce = useReducedMotion();
    useEffect(() => { if (reduce) return; const t = setInterval(() => setI((x) => (x + 1) % types.length), 1400); return () => clearInterval(t); }, [reduce, types.length]);
    return (
        <div>
        <div className="flex flex-wrap gap-2">
            {types.map(([icon, label], j) => (
                <motion.span key={label} animate={{ scale: i === j ? 1.06 : 1 }}
                    className={`flex items-center gap-2 rounded-full px-3.5 py-2 font-bold transition-colors duration-300 ${i === j ? 'bg-ink text-white' : 'bg-ink-50 text-ink'}`}>
                    <Icon name={icon} size={17} />{label}
                </motion.span>
            ))}
        </div>
        <ol className="ruled-faint mt-6 rounded-2xl border border-rule bg-paper/60 px-4 py-2">
            {[['video', 'Welcome and course map', '4 min'], ['book', 'Structuring a five-minute talk', '10 min'], ['quiz', 'Check: structure and delivery', '3 questions']].map(([icon, t, m], j) => (
                <motion.li key={t} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + j * 0.1 }}
                    className="flex h-8 items-center gap-3 text-[15px] text-graphite">
                    <Icon name={icon} size={16} className="text-ink" /><span className="flex-1 truncate">{t}</span><span className="text-sm text-pencil">{m}</span>
                </motion.li>
            ))}
        </ol>
        </div>
    );
}

function QuizTick() {
    const reduce = useReducedMotion();
    return (
        <div className="space-y-2">
            {['Read your slides word for word', 'Open with a question for the room', 'Apologize for being nervous'].map((o, i) => (
                <motion.div key={o} initial={false} whileInView={i === 1 && !reduce ? { borderColor: ['#d6e3f5', '#1f7a4d'], backgroundColor: ['#ffffff', '#e9f6ef'] } : undefined}
                    viewport={{ once: true }} transition={{ delay: 0.6, duration: 0.4 }}
                    className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 ${reduce && i === 1 ? 'border-leaf bg-leaf-50' : 'border-rule'}`}>
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-ink-50 text-xs font-bold text-ink">{String.fromCharCode(65 + i)}</span>
                    <span className="flex-1 text-graphite">{o}</span>
                    {i === 1 && (
                        <motion.span initial={reduce ? false : { scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.9, type: 'spring', stiffness: 400 }}
                            className="grid h-6 w-6 place-items-center rounded-full bg-leaf text-white"><Icon name="check" size={14} strokeWidth={3} /></motion.span>
                    )}
                </motion.div>
            ))}
        </div>
    );
}

function Bars() {
    const rows = [['Michael', 100], ['Olivia', 66], ['Ethan', 34], ['Ava', 82]];
    return (
        <div className="space-y-3">
            {rows.map(([n, v], i) => (
                <div key={n} className="flex items-center gap-3">
                    <span className="w-16 text-sm font-bold text-graphite">{n}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-50">
                        <motion.div initial={{ width: 0 }} whileInView={{ width: `${v}%` }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.12, duration: 1, ease: EASE }}
                            className={`h-full rounded-full ${v === 100 ? 'bg-leaf' : 'bg-ink'}`} />
                    </div>
                    <span className="w-10 text-right text-sm font-bold text-ink-deep tabular-nums">{v}%</span>
                </div>
            ))}
        </div>
    );
}

function Drip() {
    return (
        <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 14 }, (_, d) => {
                const open = d === 0 || d === 3 || d === 7 || d === 10;
                return (
                    <motion.span key={d} initial={{ opacity: 0.3 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: d * 0.05 }}
                        className={`grid aspect-square place-items-center rounded-lg text-sm font-bold ${open ? 'bg-ink text-white' : 'bg-ink-50 text-pencil'}`}>
                        {open ? <Icon name="play" size={13} /> : d + 1}
                    </motion.span>
                );
            })}
        </div>
    );
}

function Swatches() {
    const colours = ['#1b3a8c', '#17694a', '#6b3d8f', '#1d6b78', '#8c1d3a', '#334155'];
    const [i, setI] = useState(0);
    const reduce = useReducedMotion();
    useEffect(() => { if (reduce) return; const t = setInterval(() => setI((x) => (x + 1) % colours.length), 1200); return () => clearInterval(t); }, [reduce, colours.length]);
    return (
        <div className="flex items-center gap-5">
            <motion.span animate={{ backgroundColor: colours[i] }} transition={{ duration: 0.5 }} className="rounded-full px-5 py-2.5 font-bold text-white">Enrol now</motion.span>
            <div className="flex -space-x-1.5">
                {colours.map((c, j) => (
                    <span key={c} className={`h-7 w-7 rounded-full ring-2 ring-white transition-transform ${i === j ? 'z-10 scale-125' : ''}`} style={{ background: c }} />
                ))}
            </div>
        </div>
    );
}

function Stamp() {
    const reduce = useReducedMotion();
    return (
        <div className="relative h-full min-h-32 rounded-2xl border border-rule bg-paper p-4"
            style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 19px, #e3ecf8 19px, #e3ecf8 20px)' }}>
            <span className="absolute inset-y-0 left-6 w-[2px] bg-[#e5484d]/70" />
            <p className="pl-6 text-sm text-pencil">This certifies that</p>
            <p className="pl-6 font-display text-2xl font-extrabold text-ink-deep">Michael Brown</p>
            <p className="pl-6 text-sm text-pencil">completed Public Speaking Essentials</p>
            <motion.span initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -24 }} whileInView={{ scale: 1, opacity: 1, rotate: -12 }} viewport={{ once: true }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 16 }}
                className="absolute right-4 bottom-3 flex items-center gap-1.5 rounded-lg border-2 border-leaf px-2.5 py-1 text-sm font-extrabold text-leaf">
                <Icon name="shield" size={16} />Verified
            </motion.span>
        </div>
    );
}

function Bento() {
    return (
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
            <Reveal>
                <h2 className="max-w-3xl font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.02] font-extrabold tracking-[-0.035em]">Small details that make teaching easier.</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-6">
                <Tile className="md:col-span-4" title="Five kinds of lesson" text="Mix videos, readings, PDFs, live classes and quizzes in any order."><LessonTypes /></Tile>
                <Tile className="md:col-span-2" delay={0.05} title="Marked instantly" text="Students see their score and your explanations the moment they submit."><QuizTick /></Tile>
                <Tile className="md:col-span-2" delay={0.05} title="Progress you can see" text="Every student’s place in every course, and when they were last active."><Bars /></Tile>
                <Tile className="md:col-span-2" delay={0.1} title="Release on a schedule" text="Open lessons a set number of days after each student enrols."><Drip /></Tile>
                <Tile className="md:col-span-2" delay={0.15} title="Your colours" text="Pick a theme and the whole portal, including certificates, follows."><Swatches /></Tile>
                <Tile className="md:col-span-6 lg:col-span-6" title="Certificates anyone can check" text="Each one carries a unique code. Employers and parents confirm it’s genuine at the verify page, no sign-in needed."><Stamp /></Tile>
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------- facts */

function Facts() {
    const facts = [
        { n: 5, label: 'Lesson types', text: 'Video, reading, PDF, live, quiz' },
        { n: 3, label: 'Question types', text: 'One answer, several, true/false' },
        { n: 6, label: 'Colour themes', text: 'Match your institute’s brand' },
        { n: 14, label: 'Days free', text: 'Every feature, no card needed' },
    ];
    return (
        <section className="border-y border-rule bg-white">
            <div className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
                {facts.map((f, i) => (
                    <div key={f.label} className={`px-5 py-12 sm:px-8 ${i % 2 ? 'border-l border-rule' : ''} ${i >= 2 ? 'border-t border-rule lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
                        <CountUp to={f.n} className="block font-display text-6xl font-extrabold tracking-tight text-ink-deep sm:text-7xl" />
                        <p className="mt-2 font-bold text-graphite">{f.label}</p>
                        <p className="text-sm text-pencil">{f.text}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------- pricing */

function Pricing({ plans }) {
    return (
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 lg:py-32">
            <Reveal className="text-center">
                <h2 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.02] font-extrabold tracking-[-0.035em]">Simple, honest pricing.</h2>
                <p className="mt-4 text-lg text-pencil">Start free. Upgrade when you outgrow it.</p>
            </Reveal>
            <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3 md:items-center">
                {plans.map((p, i) => {
                    const featured = p.slug === 'basic';
                    const items = [
                        p.max_students ? `Up to ${Number(p.max_students).toLocaleString()} students` : 'Unlimited students',
                        p.max_courses ? `${p.max_courses} courses` : 'Unlimited courses',
                        `${storage(p.storage_mb)} storage`,
                        'Quizzes and certificates',
                    ];
                    return (
                        <Reveal key={p.slug} delay={i * 0.08}
                            className={`relative flex flex-col rounded-3xl p-8 ${featured ? 'bg-[#0d1d4a] text-white shadow-[0_40px_80px_-30px_rgba(13,29,74,.7)] md:py-11' : 'border border-rule bg-white'}`}>
                            {featured && <span className="absolute -top-3.5 left-8 rounded-full bg-[#e5484d] px-3.5 py-1 text-sm font-bold text-white">Most popular</span>}
                            <h3 className={`text-xl font-bold ${featured ? 'text-white' : ''}`}>{p.name}</h3>
                            <p className="mt-5 flex items-baseline gap-1.5">
                                <span className={`font-display text-6xl font-extrabold tracking-tight ${featured ? 'text-white' : 'text-ink-deep'}`}>${Number(p.price_monthly)}</span>
                                <span className={featured ? 'text-white/60' : 'text-pencil'}>/ month</span>
                            </p>
                            <ul className={`mt-7 flex-1 space-y-3 ${featured ? 'text-white/85' : 'text-graphite'}`}>
                                {items.map((t) => (
                                    <li key={t} className="flex gap-3"><Icon name="check" size={19} strokeWidth={2.6} className={`mt-0.5 ${featured ? 'text-[#7be0a6]' : 'text-leaf'}`} />{t}</li>
                                ))}
                            </ul>
                            <Link to="/register" className={`mt-9 inline-flex h-12 items-center justify-center rounded-full font-bold transition ${featured ? 'bg-white text-ink-deep hover:bg-ink-50' : 'bg-ink text-white hover:bg-ink-deep'}`}>
                                {Number(p.price_monthly) === 0 ? 'Start free' : `Start with ${p.name}`}
                            </Link>
                        </Reveal>
                    );
                })}
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------- faq */

function Faq() {
    const [open, setOpen] = useState(0);
    return (
        <section id="faq" className="scroll-mt-24 border-t border-rule bg-white">
            <div className="mx-auto grid max-w-6xl gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:py-32">
                <Reveal>
                    <h2 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] leading-[1.02] font-extrabold tracking-[-0.035em]">Questions, answered.</h2>
                    <p className="mt-4 text-lg text-pencil">Anything else? Get in touch through <a href="https://www.ferasolution.com" className="font-bold text-ink hover:underline">ferasolution.com</a>.</p>
                </Reveal>
                <div className="divide-y divide-rule border-y border-rule">
                    {FAQ.map(([q, a], i) => (
                        <div key={q}>
                            <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}
                                className="flex w-full items-center justify-between gap-6 py-5 text-left">
                                <span className="text-lg font-bold text-ink-deep">{q}</span>
                                <motion.span animate={{ rotate: open === i ? 45 : 0 }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-50 text-ink">
                                    <Icon name="plus" size={18} />
                                </motion.span>
                            </button>
                            <AnimatePresence initial={false}>
                                {open === i && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                                        <p className="max-w-2xl pb-6 text-[17px] leading-8 text-pencil">{a}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------- final cta */

function FinalCta() {
    const reduce = useReducedMotion();
    return (
        <section className="px-4 py-16 sm:px-8 sm:py-24">
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#0d1d4a] px-6 py-20 text-center text-white sm:px-12 sm:py-28">
                <div className="absolute inset-0 opacity-50" aria-hidden
                    style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 39px, rgba(255,255,255,.07) 39px, rgba(255,255,255,.07) 40px)' }} />
                <div className="absolute inset-y-0 left-10 w-[2px] bg-[#e5484d]/80 sm:left-16" aria-hidden />
                <svg viewBox="0 0 800 300" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
                    <motion.path d="M -20 250 C 150 260, 220 80, 380 120 S 600 260, 820 60" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" strokeDasharray="6 8"
                        initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2.2, ease: 'easeInOut' }} />
                </svg>
                <div className="relative">
                    <h2 className="mx-auto max-w-3xl font-display text-[clamp(2.4rem,6vw,4.6rem)] leading-[0.98] font-extrabold tracking-[-0.04em] text-white">Your first course could be live tonight.</h2>
                    <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">Create your institute, add a lesson, share your link. It takes about five minutes.</p>
                    <Link to="/register" className="group mt-10 inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-[17px] font-bold text-ink-deep transition hover:bg-ink-50">
                        Create your institute
                        <Icon name="arrowRight" size={20} className="transition group-hover:translate-x-1" />
                    </Link>
                </div>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-rule bg-white">
            <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
                <div>
                    <Logo />
                    <p className="mt-3 max-w-xs text-pencil">Learning portals for schools, academies and training teams.</p>
                    <p className="mt-4 text-sm text-pencil">A product of <a href="https://www.ferasolution.com" className="font-bold text-graphite hover:text-ink">Fera Solution</a></p>
                </div>
                {[
                    ['Product', [['#tour', 'How it works'], ['#who', 'Who it’s for'], ['#pricing', 'Pricing'], ['#faq', 'FAQ']]],
                    ['Get started', [['/register', 'Create an institute'], ['/login', 'Sign in'], ['/verify', 'Verify a certificate']]],
                    ['Company', [['https://www.ferasolution.com', 'Fera Solution'], ['https://www.ferasolution.com', 'Contact us']]],
                ].map(([title, links]) => (
                    <div key={title}>
                        <p className="font-bold text-graphite">{title}</p>
                        <ul className="mt-3 space-y-2">
                            {links.map(([href, label]) => (
                                <li key={label}>
                                    {href.startsWith('/')
                                        ? <Link to={href} className="text-pencil hover:text-ink">{label}</Link>
                                        : <a href={href} className="text-pencil hover:text-ink">{label}</a>}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-rule">
                <p className="mx-auto max-w-6xl px-5 py-6 text-sm text-pencil sm:px-8">© {new Date().getFullYear()} Fera Solution. All rights reserved.</p>
            </div>
        </footer>
    );
}
