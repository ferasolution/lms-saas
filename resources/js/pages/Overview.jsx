import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';

export default function Overview() {
    const { me, tenant, canTeach } = useOutletContext();
    const [courses, setCourses] = useState(null);

    useEffect(() => {
        api('courses?per_page=5', { tenant }).then(setCourses).catch(() => setCourses({ data: [], meta: { total: 0 } }));
    }, [tenant]);

    const firstName = me.user.name.split(' ')[0];

    return (
        <div className="max-w-3xl">
            <h1 className="text-3xl font-bold sm:text-4xl">Hello, {firstName}</h1>

            {courses && courses.meta.total === 0 ? (
                <div className="mt-10 border-l-2 border-rule pl-5">
                    <h2 className="text-xl font-bold">
                        {canTeach ? 'Add your first course' : 'No courses yet'}
                    </h2>
                    <p className="mt-2 text-pencil">
                        {canTeach
                            ? 'Start with a title. You can add sections, lessons and quizzes after.'
                            : 'Courses will appear here once your institute publishes them.'}
                    </p>
                    {canTeach && <Link to={`/${tenant}/courses`} className="btn-ink mt-5">Add a course</Link>}
                </div>
            ) : (
                <section className="mt-10">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-xl font-bold">Recent courses</h2>
                        <Link to={`/${tenant}/courses`} className="text-ink underline">All courses</Link>
                    </div>
                    <ul className="ruled mt-4 leading-8">
                        {(courses?.data ?? []).map((c) => (
                            <li key={c.id} className="flex justify-between gap-4">
                                <span className="truncate text-graphite">{c.title}</span>
                                <span className="shrink-0 text-sm text-pencil capitalize">{c.status}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
