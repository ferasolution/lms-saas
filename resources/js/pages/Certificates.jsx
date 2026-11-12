import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { date } from '../lib/format';
import Icon from '../components/Icon';
import Certificate from '../components/Certificate';
import { Button, EmptyState, PageHeader, Skeleton, useToast } from '../components/ui';

export function CertificateList() {
    const { tenant } = useOutletContext();
    const [certs, setCerts] = useState(null);
    useEffect(() => { api('my/certificates', { tenant }).then((r) => setCerts(r.data)); }, [tenant]);

    return (
        <div>
            <PageHeader title="Certificates" description="Earned by finishing every lesson of a course." />
            <div className="mt-8">
                {certs === null ? <Skeleton className="h-40 rounded-2xl" /> : certs.length === 0 ? (
                    <EmptyState icon="award" title="No certificates yet" action={<Button as={Link} to={`/${tenant}/my`}>Go to my learning</Button>}>
                        Finish a course and your certificate appears here.
                    </EmptyState>
                ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {certs.map((c) => (
                            <li key={c.code}>
                                <Link to={`/${tenant}/certificates/${c.code}`} className="group margin-line block overflow-hidden rounded-2xl border border-rule bg-white p-5 pl-7 transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(18,40,95,.35)]">
                                    <Icon name="award" size={28} className="text-ink" />
                                    <p className="mt-3 text-lg leading-snug font-bold text-ink-deep group-hover:underline">{c.course?.title}</p>
                                    <p className="mt-1 text-sm text-pencil">Issued {date(c.issued_at)}</p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export function TenantCertificate() {
    const { tenant } = useOutletContext();
    return (
        <div>
            <Link to={`/${tenant}/certificates`} className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-pencil hover:text-ink print:hidden">
                <Icon name="arrowLeft" size={16} />All certificates
            </Link>
            <CertificateBody />
        </div>
    );
}

export function PublicCertificate() {
    return (
        <div className="min-h-screen bg-paper px-4 py-10 sm:px-8 print:bg-white print:p-0">
            <CertificateBody publicView />
        </div>
    );
}

function CertificateBody({ publicView = false }) {
    const { code } = useParams();
    const toast = useToast();
    const [cert, setCert] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => { api(`certificates/${code}`).then(setCert).catch(setError); }, [code]);

    async function share() {
        const url = `${window.location.origin}/verify/${code}`;
        try {
            if (navigator.share) await navigator.share({ title: cert.course_title, url });
            else { await navigator.clipboard.writeText(url); toast('Verification link copied'); }
        } catch { /* cancelled */ }
    }

    if (error) {
        return <EmptyState icon="shield" title="Certificate not found">No certificate matches this code. Check the link or the code printed on the certificate.</EmptyState>;
    }
    if (!cert) return <Skeleton className="mx-auto aspect-[1.414/1] w-full max-w-4xl" />;

    return (
        <>
            {publicView && (
                <div className="mx-auto mb-6 flex max-w-4xl items-center gap-3 rounded-xl bg-leaf-50 px-4 py-3 text-leaf ring-1 ring-leaf/20 print:hidden">
                    <Icon name="shield" size={22} />
                    <p><strong>Genuine certificate.</strong> Issued by {cert.institute.name} to {cert.student_name} on {date(cert.issued_at)}.</p>
                </div>
            )}
            <Certificate cert={cert} />
            <div className="mx-auto mt-6 flex max-w-4xl flex-wrap justify-center gap-2 print:hidden">
                <Button icon="printer" onClick={() => window.print()}>Print or save as PDF</Button>
                <Button variant="secondary" icon="external" onClick={share}>Share verification link</Button>
            </div>
        </>
    );
}
