import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import CourseCover from '../components/CourseCover';
import { Badge, Button, EmptyState, PageHeader, Progress, Skeleton, Tabs } from '../components/ui';

export function useMyCourses(tenant) {
    const [items, setItems] = useState(null);
    useEffect(() => { api('my/courses', { tenant }).then((r) => setItems(r.data)).catch(() => setItems([])); }, [tenant]);
    return items;
}

export function MyCourseCard({ item, tenant, wide = false }) {
    const done = item.status === 'completed';
    const to = `/${tenant}/learn/${item.course.id}${item.next_lesson ? `/${item.next_lesson.id}` : ''}`;
    return (
        <article className={`group flex overflow-hidden rounded-2xl border border-rule bg-white transition hover:shadow-[0_12px_32px_-16px_rgba(18,40,95,.35)] ${wide ? 'flex-col sm:flex-row' : 'flex-col'}`}>
            <Link to={to} className={`relative block shrink-0 ${wide ? 'sm:w-56' : ''}`}>
                <CourseCover course={item.course} className={`w-full ${wide ? 'h-36 sm:h-full' : 'h-36'}`} />
                <span className="absolute inset-0 grid place-items-center bg-ink-deep/0 transition group-hover:bg-ink-deep/30">
                    <span className="grid h-12 w-12 scale-90 place-items-center rounded-full bg-white text-ink opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
                        <Icon name="play" size={20} />
                    </span>
                </span>
            </Link>
            <div className="flex flex-1 flex-col p-5">
                {done && <span className="mb-2"><Badge tone="published" dot>Completed</Badge></span>}
                <h3 className="text-lg leading-snug font-bold"><Link to={`/${tenant}/courses/${item.course.id}`} className="hover:underline">{item.course.title}</Link></h3>
                {item.course.instructor && <p className="text-sm text-pencil">{item.course.instructor.name}</p>}
                <div className="mt-4 flex items-center gap-3">
                    <Progress value={item.progress_percent} className="flex-1" label={`${item.course.title} progress`} />
                    <span className="text-sm font-bold tabular-nums text-ink-deep">{item.progress_percent}%</span>
                </div>
                {!done && item.next_lesson && (
                    <p className="mt-3 truncate text-sm text-pencil">Next: <span className="text-graphite">{item.next_lesson.title}</span></p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {done ? (
                        <>
                            {item.certificate_code && <Button size="sm" icon="award" as={Link} to={`/${tenant}/certificates/${item.certificate_code}`}>Certificate</Button>}
                            <Button size="sm" variant="secondary" as={Link} to={to}>Review</Button>
                        </>
                    ) : (
                        <Button size="sm" iconRight="arrowRight" as={Link} to={to}>{item.progress_percent ? 'Continue' : 'Start'}</Button>
                    )}
                </div>
            </div>
        </article>
    );
}

export default function MyLearning() {
    const { tenant } = useOutletContext();
    const items = useMyCourses(tenant);
    const [tab, setTab] = useState('progress');
    const inProgress = items?.filter((i) => i.status !== 'completed') ?? [];
    const completed = items?.filter((i) => i.status === 'completed') ?? [];
    const list = tab === 'progress' ? inProgress : completed;

    return (
        <div>
            <PageHeader title="My learning" description="Pick up where you left off."
                actions={<Button variant="secondary" icon="search" as={Link} to={`/${tenant}/courses`}>Find a course</Button>} />
            <Tabs className="mt-8" value={tab} onChange={setTab} tabs={[
                { value: 'progress', label: 'In progress', count: items ? inProgress.length : null },
                { value: 'completed', label: 'Completed', count: items ? completed.length : null },
            ]} />
            <div className="mt-6">
                {items === null ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
                ) : list.length === 0 ? (
                    tab === 'progress'
                        ? <EmptyState icon="book" title="Nothing in progress" action={<Button as={Link} to={`/${tenant}/courses`}>Browse courses</Button>}>Enrol in a course and it shows up here.</EmptyState>
                        : <EmptyState icon="award" title="No finished courses yet">Complete every lesson in a course to see it here.</EmptyState>
                ) : (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {list.map((item) => <MyCourseCard key={item.course.id} item={item} tenant={tenant} />)}
                    </div>
                )}
            </div>
        </div>
    );
}
