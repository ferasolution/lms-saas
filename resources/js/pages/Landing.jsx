import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import { Button, Logo } from '../components/ui';

const AUDIENCES = [
    {
        type: 'school', icon: 'school', title: 'Schools and colleges',
        text: 'Run classes online alongside the classroom.',
        points: ['Courses by subject and class', 'Quizzes that mark themselves', 'Lessons released week by week', 'Student progress at a glance'],
    },
    {
        type: 'academy', icon: 'academy', title: 'Academies and tutors',
        text: 'Sell your courses under your own name.',
        points: ['Paid and free courses', 'JazzCash, Easypaisa and bank payments', 'Sale prices', 'Certificates anyone can verify'],
    },
    {
        type: 'corporate', icon: 'building', title: 'Companies',
        text: 'Train staff and prove who finished.',
        points: ['Training courses for every team', 'Pass marks and attempt limits', 'Who finished, and when', 'Certificates for every completion'],
    },
];

const FEATURES = [
    { icon: 'book', title: 'Course builder', text: 'Organise lessons into sections: video, PDF, text or a live class link.' },
    { icon: 'quiz', title: 'Quizzes that mark themselves', text: 'One-answer, multi-answer and true/false questions are graded the moment a student submits.' },
    { icon: 'chart', title: 'Progress you can see', text: 'Know which lesson each student reached and who has gone quiet.' },
    { icon: 'award', title: 'Certificates', text: 'Issued on completion, each with a code anyone can verify.' },
    { icon: 'wallet', title: 'Payments in rupees', text: 'Students pay by JazzCash, Easypaisa or bank, send the transaction ID, and you approve in one tap.' },
    { icon: 'palette', title: 'Your name on it', text: 'Your logo and colours on your own sign-in page. Students never see ours.' },
];

const FALLBACK_PLANS = [
    { slug: 'free', name: 'Free', price_monthly: '0', currency: 'USD', max_students: 25, max_courses: 3, storage_mb: 500 },
    { slug: 'basic', name: 'Basic', price_monthly: '29', currency: 'USD', max_students: 300, max_courses: 30, storage_mb: 10240 },
    { slug: 'pro', name: 'Pro', price_monthly: '79', currency: 'USD', max_students: null, max_courses: null, storage_mb: 102400 },
];

const storage = (mb) => (mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);

export default function Landing() {
    const [plans, setPlans] = useState(FALLBACK_PLANS);

    useEffect(() => {
        api('plans').then((r) => r.data?.length && setPlans(r.data)).catch(() => {});
    }, []);

    return (
        <div className="bg-paper">
            {/* Nav */}
            <header className="sticky top-0 z-30 border-b border-rule/70 bg-paper/85 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
                    <Logo />
                    <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
                        <a href="#features" className="hidden rounded-lg px-3 py-2 font-bold text-pencil hover:text-ink-deep md:block">Features</a>
                        <a href="#pricing" className="hidden rounded-lg px-3 py-2 font-bold text-pencil hover:text-ink-deep md:block">Pricing</a>
                        <Link to="/login" className="rounded-lg px-3 py-2 font-bold text-ink-deep hover:bg-ink-50">Sign in</Link>
                        <Button as={Link} to="/register" size="sm" className="h-9">Start free</Button>
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="ruled-faint absolute inset-0" aria-hidden />
                <div className="absolute inset-y-0 left-[max(1.25rem,calc(50%-36rem))] hidden w-[2px] bg-margin/70 sm:block" aria-hidden />
                <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-14 pb-20 sm:px-8 sm:pl-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-28">
                    <div>
                        <h1 className="text-[2.6rem] leading-[1.04] font-extrabold tracking-[-0.03em] sm:text-6xl">
                            Teach, test and track every student, under your own name.
                        </h1>
                        <p className="mt-6 max-w-xl text-lg leading-8 text-pencil sm:text-xl sm:leading-9">
                            Fera Learn gives schools, academies and training teams their own learning portal with courses,
                            quizzes, progress and payments. Set up in minutes.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Button as={Link} to="/register" size="lg" iconRight="arrowRight">Start your free trial</Button>
                            <Button as="a" href="#how" size="lg" variant="secondary">See how it works</Button>
                        </div>
                        <p className="mt-5 flex items-center gap-2 text-pencil"><Icon name="check" size={18} className="text-leaf" strokeWidth={2.4} />14 days free, no card needed</p>
                    </div>
                    <HeroPreview />
                </div>
            </section>

            {/* Audiences */}
            <section className="border-y border-rule bg-white">
                <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
                    <h2 className="max-w-2xl text-3xl font-extrabold sm:text-4xl">One platform, set up for the way you teach</h2>
                    <p className="mt-3 max-w-2xl text-lg text-pencil">Pick your type when you sign up and the dashboard fits it from day one.</p>
                    <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-3">
                        {AUDIENCES.map((a) => (
                            <article key={a.type} className="flex flex-col bg-white p-7">
                                <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink-50 text-ink"><Icon name={a.icon} size={24} /></span>
                                <h3 className="mt-5 text-xl font-bold">{a.title}</h3>
                                <p className="mt-1.5 text-pencil">{a.text}</p>
                                <ul className="mt-5 flex-1 space-y-2.5">
                                    {a.points.map((p) => (
                                        <li key={p} className="flex items-start gap-2.5 text-graphite">
                                            <Icon name="check" size={18} className="mt-0.5 text-leaf" strokeWidth={2.4} />{p}
                                        </li>
                                    ))}
                                </ul>
                                <Link to={`/register?type=${a.type}`} className="group mt-7 inline-flex items-center gap-1.5 font-bold text-ink">
                                    Set up {a.type === 'school' ? 'a school' : a.type === 'academy' ? 'an academy' : 'your company'}
                                    <Icon name="arrowRight" size={18} className="transition group-hover:translate-x-0.5" />
                                </Link>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 lg:py-24">
                <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
                    <div className="lg:sticky lg:top-28 lg:self-start">
                        <h2 className="text-3xl font-extrabold sm:text-4xl">Everything a course needs, nothing it doesn’t</h2>
                        <p className="mt-3 text-lg text-pencil">Built for teachers who would rather teach than fight software.</p>
                    </div>
                    <ul className="ruled-faint grid gap-x-10 sm:grid-cols-2">
                        {FEATURES.map((f) => (
                            <li key={f.title} className="border-t border-rule py-6">
                                <Icon name={f.icon} size={24} className="text-ink" />
                                <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
                                <p className="mt-1 text-pencil">{f.text}</p>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* How it works */}
            <section id="how" className="scroll-mt-20 bg-ink-deep text-white">
                <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
                    <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Live in three steps</h2>
                    <ol className="mt-12 grid gap-10 md:grid-cols-3">
                        {[
                            ['Create your institute', 'Choose a name and your address. Your sign-in page exists the moment you finish.'],
                            ['Add a course', 'Give it a title, add lessons and a quiz, then publish when it’s ready.'],
                            ['Invite your people', 'Add students and teachers, then share your sign-in link with them.'],
                        ].map(([title, text], i) => (
                            <li key={title} className="relative border-l-2 border-margin pl-6">
                                <span className="font-display text-5xl font-extrabold text-white/25 tabular-nums">{i + 1}</span>
                                <h3 className="mt-2 text-xl font-bold text-white">{title}</h3>
                                <p className="mt-2 text-white/70">{text}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 lg:py-24">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold sm:text-4xl">Simple pricing</h2>
                    <p className="mt-3 text-lg text-pencil">Start free. Upgrade when you outgrow it.</p>
                </div>
                <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
                    {plans.map((p) => {
                        const featured = p.slug === 'basic';
                        return (
                            <article key={p.slug} className={`relative flex flex-col rounded-2xl p-7 ${featured ? 'bg-ink text-white shadow-[0_24px_48px_-24px_rgba(18,40,95,.6)]' : 'border border-rule bg-white'}`}>
                                {featured && <span className="absolute -top-3 left-7 rounded-full bg-margin px-3 py-1 text-sm font-bold text-white">Most popular</span>}
                                <h3 className={`text-xl font-bold ${featured ? 'text-white' : ''}`}>{p.name}</h3>
                                <p className="mt-4 flex items-baseline gap-1">
                                    <span className={`font-display text-5xl font-extrabold ${featured ? 'text-white' : 'text-ink-deep'}`}>${Number(p.price_monthly)}</span>
                                    <span className={featured ? 'text-white/70' : 'text-pencil'}>/ month</span>
                                </p>
                                <ul className={`mt-6 flex-1 space-y-3 ${featured ? 'text-white/90' : 'text-graphite'}`}>
                                    <li className="flex gap-2.5"><Icon name="check" size={18} className={`mt-0.5 ${featured ? 'text-white' : 'text-leaf'}`} strokeWidth={2.4} />{p.max_students ? `Up to ${p.max_students.toLocaleString()} students` : 'Unlimited students'}</li>
                                    <li className="flex gap-2.5"><Icon name="check" size={18} className={`mt-0.5 ${featured ? 'text-white' : 'text-leaf'}`} strokeWidth={2.4} />{p.max_courses ? `${p.max_courses} courses` : 'Unlimited courses'}</li>
                                    <li className="flex gap-2.5"><Icon name="check" size={18} className={`mt-0.5 ${featured ? 'text-white' : 'text-leaf'}`} strokeWidth={2.4} />{storage(p.storage_mb)} storage</li>
                                </ul>
                                <Button as={Link} to="/register" variant={featured ? 'secondary' : 'primary'} className="mt-8 w-full">
                                    {Number(p.price_monthly) === 0 ? 'Start free' : `Start with ${p.name}`}
                                </Button>
                            </article>
                        );
                    })}
                </div>
            </section>

            {/* Closing CTA */}
            <section className="px-5 pb-20 sm:px-8">
                <div className="margin-line relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-rule bg-white px-8 py-14 sm:px-14">
                    <div className="ruled-faint absolute inset-0" aria-hidden />
                    <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-3xl font-extrabold sm:text-4xl">Your first course could be live today.</h2>
                            <p className="mt-2 text-lg text-pencil">Set up takes about five minutes.</p>
                        </div>
                        <Button as={Link} to="/register" size="lg" iconRight="arrowRight">Create your institute</Button>
                    </div>
                </div>
            </section>

            <footer className="border-t border-rule bg-white">
                <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <div>
                        <Logo />
                        <p className="mt-2 text-sm text-pencil">A product of <a href="https://www.ferasolution.com" className="font-bold text-graphite hover:text-ink">Fera Solution</a></p>
                    </div>
                    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-pencil" aria-label="Footer">
                        <a href="#features" className="hover:text-ink">Features</a>
                        <a href="#pricing" className="hover:text-ink">Pricing</a>
                        <Link to="/login" className="hover:text-ink">Sign in</Link>
                        <Link to="/register" className="hover:text-ink">Create institute</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}

/* A small, honest picture of the product: one course page as a student sees it. */
function HeroPreview() {
    const lessons = [
        ['Welcome and course map', '4 min', true],
        ['Present tense in daily talk', '12 min', true],
        ['Asking questions politely', '9 min', true],
        ['Quiz: everyday conversations', '10 questions', false, true],
        ['Talking about the past', '14 min', false],
    ];
    return (
        <div className="relative mx-auto w-full max-w-lg lg:mx-0" aria-label="Preview of a course page" role="img">
            <div className="rounded-2xl border border-rule bg-white shadow-[0_32px_64px_-32px_rgba(18,40,95,.45)]">
                <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-rule" /><span className="h-2.5 w-2.5 rounded-full bg-rule" /><span className="h-2.5 w-2.5 rounded-full bg-rule" />
                    <span className="ml-3 truncate rounded-md bg-paper px-3 py-1 text-xs text-pencil">lms.ferasolution.com/bright-minds</span>
                </div>
                <div className="p-5 pb-24 sm:p-6 sm:pb-24">
                    <p className="text-sm font-bold text-pencil">Bright Minds Academy</p>
                    <h3 className="mt-1 text-2xl font-extrabold">Spoken English: Level 1</h3>
                    <div className="mt-4 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-50">
                            <div className="h-full w-[60%] rounded-full bg-ink animate-[fill_1.4s_cubic-bezier(.2,.8,.2,1)_.3s_both]" />
                        </div>
                        <span className="text-sm font-bold text-ink-deep tabular-nums">60%</span>
                    </div>
                    <ol className="ruled mt-5 border-t border-rule">
                        {lessons.map(([title, meta, done, current]) => (
                            <li key={title} className={`flex h-8 items-center gap-3 ${current ? 'font-bold text-ink-deep' : done ? 'text-pencil' : 'text-graphite'}`}>
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? 'bg-leaf text-white' : current ? 'border-2 border-ink' : 'border border-rule bg-white'}`}>
                                    {done && <Icon name="check" size={12} strokeWidth={3} />}
                                </span>
                                <span className="flex-1 truncate text-[15px]">{title}</span>
                                <span className="text-xs text-pencil">{meta}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
            <div className="absolute -bottom-6 -left-3 w-52 rounded-xl border border-rule bg-white p-4 shadow-xl sm:-left-10">
                <p className="text-sm text-pencil">Last quiz</p>
                <p className="mt-0.5 font-display text-3xl font-bold text-ink-deep">18<span className="text-lg text-pencil">/20</span></p>
                <p className="mt-1 text-sm font-bold text-leaf">Passed on first try</p>
            </div>
            <div className="absolute -top-5 -right-3 hidden rounded-xl bg-ink-deep px-4 py-3 text-white shadow-xl sm:block">
                <p className="text-xs text-white/60">This week</p>
                <p className="font-bold">42 students active</p>
            </div>
        </div>
    );
}
