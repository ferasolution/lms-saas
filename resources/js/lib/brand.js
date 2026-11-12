// Institute colour themes. The whole UI reads --color-ink*, so switching a
// theme is just three CSS variables. The red margin line always stays.
export const BRANDS = {
    ink: { label: 'Ink blue', ink: '#1b3a8c', deep: '#12285f', tint: '#eef3fc' },
    emerald: { label: 'Emerald', ink: '#17694a', deep: '#0e4430', tint: '#e8f5ee' },
    plum: { label: 'Plum', ink: '#6b3d8f', deep: '#47265f', tint: '#f4eefa' },
    teal: { label: 'Teal', ink: '#1d6b78', deep: '#12464f', tint: '#e8f4f6' },
    maroon: { label: 'Maroon', ink: '#8c1d3a', deep: '#5e1226', tint: '#fbeef1' },
    slate: { label: 'Slate', ink: '#334155', deep: '#1e293b', tint: '#f1f5f9' },
};

export function applyBrand(key) {
    const b = BRANDS[key] ?? BRANDS.ink;
    const root = document.documentElement.style;
    root.setProperty('--color-ink', b.ink);
    root.setProperty('--color-ink-deep', b.deep);
    root.setProperty('--color-ink-50', b.tint);
}

export function resetBrand() {
    applyBrand('ink');
}
