import { date } from '../lib/format';
import { BRANDS } from '../lib/brand';

/** A printable A4-landscape certificate, styled like a ruled notebook page. */
export default function Certificate({ cert }) {
    const brand = BRANDS[cert.institute?.settings?.brand] ?? BRANDS.ink;
    const logo = cert.institute?.settings?.logo_url;
    const signatory = cert.institute?.settings?.certificate_signatory || cert.instructor_name;
    const verifyUrl = `${window.location.origin}/verify/${cert.code}`;

    return (
        <article className="certificate relative mx-auto aspect-[1.414/1] w-full max-w-4xl overflow-hidden rounded-sm bg-white text-left shadow-[0_24px_64px_-24px_rgba(18,40,95,.4)] ring-1 ring-rule print:max-w-none print:rounded-none print:shadow-none print:ring-0"
            style={{ '--c': brand.ink, '--d': brand.deep }}>
            <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #e3ecf8 27px, #e3ecf8 28px)' }} aria-hidden />
            <div className="absolute inset-y-0 left-[9%] w-[2px] bg-[#c8202f]" aria-hidden />
            <div className="absolute inset-[3%] border-2" style={{ borderColor: 'var(--c)' }} aria-hidden />

            <div className="relative flex h-full flex-col justify-between py-[6%] pr-[8%] pl-[14%]">
                <header className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        {logo ? <img src={logo} alt="" className="h-[clamp(28px,6vw,52px)] w-auto object-contain" /> : null}
                        <p className="font-display text-[clamp(14px,2.2vw,22px)] font-bold" style={{ color: 'var(--d)' }}>{cert.institute?.name}</p>
                    </div>
                    <p className="text-[clamp(10px,1.3vw,13px)] text-pencil">Certificate of completion</p>
                </header>

                <div>
                    <p className="text-[clamp(11px,1.6vw,16px)] text-pencil">This certifies that</p>
                    <p className="mt-[1%] font-display text-[clamp(26px,6vw,60px)] leading-[1.05] font-extrabold tracking-tight" style={{ color: 'var(--d)' }}>{cert.student_name}</p>
                    <p className="mt-[2%] text-[clamp(11px,1.6vw,16px)] text-pencil">has completed every lesson of</p>
                    <p className="mt-[0.5%] font-display text-[clamp(17px,3.2vw,32px)] leading-tight font-bold" style={{ color: 'var(--c)' }}>{cert.course_title}</p>
                </div>

                <footer className="grid grid-cols-3 items-end gap-4 text-[clamp(9px,1.2vw,13px)]">
                    <div>
                        <p className="font-bold text-graphite">{date(cert.issued_at, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        <p className="border-t border-graphite/30 pt-1 text-pencil">Date issued</p>
                    </div>
                    <div>
                        <p className="font-display text-[1.25em] font-bold italic text-graphite">{signatory || ' '}</p>
                        <p className="border-t border-graphite/30 pt-1 text-pencil">{cert.institute?.settings?.certificate_signatory ? 'Authorised by' : 'Instructor'}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-mono text-[0.72em] leading-tight break-all text-graphite">{cert.code}</p>
                        <p className="border-t border-graphite/30 pt-1 text-pencil">Verify at {verifyUrl.replace(/^https?:\/\//, '').replace(`/${cert.code}`, '')}</p>
                    </div>
                </footer>
            </div>
        </article>
    );
}
