import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import TenantLayout from './pages/TenantLayout';
import Overview from './pages/Overview';
import Courses from './pages/Courses';
import People from './pages/People';
import PlatformSetup from './pages/PlatformSetup';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/platform/setup" element={<PlatformSetup />} />
                <Route path="/:tenant/login" element={<Login />} />
                <Route path="/:tenant" element={<TenantLayout />}>
                    <Route index element={<Overview />} />
                    <Route path="courses" element={<Courses />} />
                    <Route path="people" element={<People />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

createRoot(document.getElementById('app')).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
