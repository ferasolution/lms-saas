import '@fontsource/bricolage-grotesque/latin-500.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import Landing from './pages/Landing';
import Register from './pages/Register';
import FindInstitute from './pages/FindInstitute';
import Login from './pages/Login';
import TenantLayout from './pages/TenantLayout';
import Overview from './pages/Overview';
import Courses from './pages/Courses';
import People from './pages/People';
import PlatformSetup from './pages/PlatformSetup';
import Install from './pages/Install';

const TITLES = { '/': 'Fera Learn', '/register': 'Create your institute', '/login': 'Sign in', '/install': 'Install' };

function ScrollAndTitle() {
    const { pathname, hash } = useLocation();
    useEffect(() => {
        if (!hash) window.scrollTo(0, 0);
        const last = pathname.split('/').filter(Boolean).pop();
        const section = { courses: 'Courses', people: 'People', login: 'Sign in' }[last];
        document.title = TITLES[pathname] ?? (section ? `${section} · Fera Learn` : 'Fera Learn');
    }, [pathname, hash]);
    return null;
}

function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <ScrollAndTitle />
                <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/login" element={<FindInstitute />} />
                    <Route path="/install" element={<Install />} />
                    <Route path="/platform/setup" element={<PlatformSetup />} />
                    <Route path="/:tenant/login" element={<Login />} />
                    <Route path="/:tenant" element={<TenantLayout />}>
                        <Route index element={<Overview />} />
                        <Route path="courses" element={<Courses />} />
                        <Route path="people" element={<People />} />
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
