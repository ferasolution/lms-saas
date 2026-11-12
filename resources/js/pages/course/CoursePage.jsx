import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { EmptyState, Skeleton } from '../../components/ui';
import Workspace from './Workspace';
import CourseDetail from './CourseDetail';

/** /:tenant/courses/:id — the builder for people who manage the course, the course page for everyone else. */
export default function CoursePage() {
    const { id } = useParams();
    const ctx = useOutletContext();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(() => api(`courses/${id}/curriculum`, { tenant: ctx.tenant })
        .then((d) => { setData(d); setError(null); return d; })
        .catch(setError), [id, ctx.tenant]);

    useEffect(() => { setData(null); load(); }, [load]);

    if (error) {
        return <EmptyState icon="search" title="Course not found">It may have been removed, or it isn’t published yet.</EmptyState>;
    }
    if (!data) {
        return (
            <div className="space-y-6" role="status" aria-label="Loading">
                <Skeleton className="h-10 w-80" />
                <Skeleton className="h-48 rounded-2xl" />
                <Skeleton className="h-64 rounded-2xl" />
            </div>
        );
    }

    return data.can_manage
        ? <Workspace data={data} reload={load} {...ctx} />
        : <CourseDetail data={data} reload={load} {...ctx} />;
}
