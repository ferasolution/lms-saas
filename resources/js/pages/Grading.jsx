import { useOutletContext } from 'react-router-dom';
import GradingQueue from '../components/GradingQueue';
import { PageHeader } from '../components/ui';

export default function Grading() {
    const { tenant } = useOutletContext();
    return (
        <div className="space-y-6">
            <PageHeader title="Grading" description="Assignments students have handed in across your courses." />
            <GradingQueue tenant={tenant} />
        </div>
    );
}
