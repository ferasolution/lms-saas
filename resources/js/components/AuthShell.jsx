import { Logo } from './ui';

// Split layout for sign-up, sign-in and setup pages: a quiet notebook-cover
// panel on the left (desktop only) and the form on the right.
export default function AuthShell({ aside, children }) {
    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <aside className="relative hidden overflow-hidden bg-ink-deep text-white lg:block">
                <div className="absolute inset-0"
                    style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 39px, rgba(255,255,255,.07) 39px, rgba(255,255,255,.07) 40px)' }} aria-hidden />
                <div className="absolute inset-y-0 left-16 w-[2px] bg-margin" aria-hidden />
                <div className="relative flex h-full flex-col justify-between py-12 pr-12 pl-24">
                    <Logo className="[&_span:last-child]:text-white" />
                    <div className="max-w-md">{aside}</div>
                    <p className="text-sm text-white/50">A product of Fera Solution</p>
                </div>
            </aside>
            <main className="flex min-h-screen flex-col px-5 py-8 sm:px-10">
                <div className="lg:hidden"><Logo /></div>
                <div className="flex flex-1 items-center justify-center py-10">
                    <div className="w-full max-w-md">{children}</div>
                </div>
            </main>
        </div>
    );
}

export function AsideList({ title, items }) {
    return (
        <>
            <h2 className="font-display text-4xl leading-[1.1] font-extrabold text-white">{title}</h2>
            <ul className="mt-8 space-y-4">
                {items.map((item) => (
                    <li key={item} className="flex gap-3 text-[17px] text-white/80">
                        <span className="mt-2.5 h-[2px] w-4 shrink-0 bg-white/40" aria-hidden />
                        {item}
                    </li>
                ))}
            </ul>
        </>
    );
}
