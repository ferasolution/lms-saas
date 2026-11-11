// Stroke icons drawn on a 24px grid. Kept in one file so the app needs no icon library.
const PATHS = {
    home: 'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h13M8 7h7',
    users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 9v-1a4 4 0 0 0-3-3.9M15 3.2a3.5 3.5 0 0 1 0 6.6',
    plus: 'M12 5v14M5 12h14',
    search: 'm20 20-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
    x: 'M6 6l12 12M18 6 6 18',
    menu: 'M4 6h16M4 12h16M4 18h16',
    check: 'm5 12.5 4.5 4.5L19 7',
    more: 'M12 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm0 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm0 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
    edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
    school: 'M12 3 2 8l10 5 10-5-10-5Zm-6 7.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5M22 8v6',
    academy: 'M4 4h16v12H4zM8 20h8M12 16v4M10 8.5v3.5l3-1.75L10 8.5Z',
    building: 'M4 21V5l8-2v18M12 7l8 2v12M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    quiz: 'M9 9a3 3 0 1 1 3.9 2.9c-.6.2-.9.7-.9 1.3V14M12 17.5h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
    award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8.5 14 7 22l5-3 5 3-1.5-8',
    wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm13 7h.01',
    palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.5-1-1.5-1-2.5s.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5ZM7.5 11h.01M10 7.5h.01M15 7.5h.01',
    video: 'M15 10l5-3v10l-5-3M3 6h12v12H3z',
    clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 1 1 8 0v4',
    sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z',
    phone: 'M7 2h10v20H7zM11 18h2',
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.8, title }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 ${className}`}
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
        >
            {title && <title>{title}</title>}
            <path d={PATHS[name] ?? ''} />
        </svg>
    );
}
