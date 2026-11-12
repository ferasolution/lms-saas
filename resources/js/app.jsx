import '@fontsource/bricolage-grotesque/latin-500.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import { lazy, StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import Register from './pages/Register';
import FindInstitute from './pages/FindInstitute';
import Login from './pages/Login';
import TenantLayout from './pages/TenantLayout';
import Overview from './pages/Overview';
import Courses from './pages/Courses';
import People from './pages/People';
import CoursePage from './pages/course/CoursePage';
import QuizEditor from './pages/course/QuizEditor';
import Player from './pages/Player';
import MyLearning from './pages/MyLearning';
import { CertificateList, PublicCertificate, TenantCertificate } from './pages/Certificates';
import Payments from './pages/Payments';
import Grading from './pages/Grading';
import Academics from './pages/school/Academics';
import Admissions from './pages/school/Admissions';
import Apply from './pages/school/Apply';
import Attendance from './pages/school/Attendance';
import Diary from './pages/school/Diary';
import Students from './pages/school/Students';
import Timetable from './pages/school/Timetable';
import Fees from './pages/school/Fees';
import FeePrint from './pages/school/FeePrint';
import Exams from './pages/school/Exams';
import ReportCard from './pages/school/ReportCard';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import { PlatformLogin } from './pages/Platform';
import ConsoleLayout from './pages/platform/ConsoleLayout';
import ConsoleOverview from './pages/platform/ConsoleOverview';
import { ConsoleTenant, ConsoleTenants } from './pages/platform/ConsoleTenants';
import { ConsoleActivity, ConsoleHealth, ConsolePayments, ConsoleSettings, ConsoleSubscriptions, ConsoleUsers } from './pages/platform/ConsoleMore';
import Billing from './pages/Billing';
import { ConsoleAnnouncements, ConsolePlans } from './pages/platform/ConsolePlans';
import Verify from './pages/Verify';

// The marketing page carries 3D and animation libraries; app pages don't need them.
const Landing = lazy(() => import('./pages/Landing'));
import PlatformSetup from './pages/PlatformSetup';
import Install from './pages/Install';

const TITLES = { '/': 'Fera EduSphere', '/register': 'Create your institute', '/login': 'Sign in', '/install': 'Install' };

function ScrollAndTitle() {
    const { pathname, hash } = useLocation();
    useEffect(() => {
        if (!hash) window.scrollTo(0, 0);
        const last = pathname.split('/').filter(Boolean).pop();
        const section = { courses: 'Courses', people: 'People', login: 'Sign in', my: 'My learning', certificates: 'Certificates', payments: 'Payments', settings: 'Settings', profile: 'Profile', platform: 'Owner console', billing: 'Billing', institutes: 'Institutes', subscriptions: 'Plan payments', users: 'Users', activity: 'Activity', health: 'System health', verify: 'Verify certificate' }[last];
        document.title = TITLES[pathname] ?? (section ? `${section} · Fera EduSphere` : 'Fera EduSphere');
    }, [pathname, hash]);
    return null;
}

function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <ScrollAndTitle />
                <Routes>
                    <Route path="/" element={<Suspense fallback={<div className="min-h-screen bg-[#0d1d4a]" />}><Landing /></Suspense>} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/login" element={<FindInstitute />} />
                    <Route path="/install" element={<Install />} />
                    <Route path="/platform/setup" element={<PlatformSetup />} />
                    <Route path="/platform/login" element={<PlatformLogin />} />
                    <Route path="/platform" element={<ConsoleLayout />}>
                        <Route index element={<ConsoleOverview />} />
                        <Route path="institutes" element={<ConsoleTenants />} />
                        <Route path="institutes/:id" element={<ConsoleTenant />} />
                        <Route path="subscriptions" element={<ConsoleSubscriptions />} />
                        <Route path="payments" element={<ConsolePayments />} />
                        <Route path="users" element={<ConsoleUsers />} />
                        <Route path="plans" element={<ConsolePlans />} />
                        <Route path="announcements" element={<ConsoleAnnouncements />} />
                        <Route path="activity" element={<ConsoleActivity />} />
                        <Route path="health" element={<ConsoleHealth />} />
                        <Route path="settings" element={<ConsoleSettings />} />
                    </Route>
                    <Route path="/verify" element={<Verify />} />
                    <Route path="/verify/:code" element={<PublicCertificate />} />
                    <Route path="/:tenant/login" element={<Login />} />
                    <Route path="/:tenant/apply" element={<Apply />} />
                    <Route path="/:tenant/fees/invoices/:id/print" element={<FeePrint />} />
                    <Route path="/:tenant/exams/:id/report/:studentId" element={<ReportCard />} />
                    <Route path="/:tenant/fees/receipts/:id/:paymentId" element={<FeePrint />} />
                    <Route path="/:tenant" element={<TenantLayout />}>
                        <Route index element={<Overview />} />
                        <Route path="my" element={<MyLearning />} />
                        <Route path="courses" element={<Courses />} />
                        <Route path="grading" element={<Grading />} />
                        <Route path="students" element={<Students />} />
                        <Route path="attendance" element={<Attendance />} />
                        <Route path="diary" element={<Diary />} />
                        <Route path="timetable" element={<Timetable />} />
                        <Route path="admissions" element={<Admissions />} />
                        <Route path="academics" element={<Academics />} />
                        <Route path="fees" element={<Fees />} />
                        <Route path="exams" element={<Exams />} />
                        <Route path="exams/:id" element={<Exams />} />
                        <Route path="family" element={<Navigate to=".." relative="path" replace />} />
                        <Route path="courses/:id" element={<CoursePage />} />
                        <Route path="courses/:id/quiz/:quizId" element={<QuizEditor />} />
                        <Route path="learn/:courseId" element={<Player />} />
                        <Route path="learn/:courseId/:lessonId" element={<Player />} />
                        <Route path="certificates" element={<CertificateList />} />
                        <Route path="certificates/:code" element={<TenantCertificate />} />
                        <Route path="people" element={<People />} />
                        <Route path="payments" element={<Payments />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="billing" element={<Billing />} />
                        <Route path="profile" element={<Profile />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </ToastProvider>
        </BrowserRouter>
    );
}

createRoot(document.getElementById('app')).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
