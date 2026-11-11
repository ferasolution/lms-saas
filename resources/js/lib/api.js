// Small fetch wrapper for the Laravel API.
// Each institute keeps its own token, keyed by slug, so one browser can be
// signed in to more than one institute.

const tokenKey = (slug) => `lms.token.${slug}`;

export const session = {
    token(slug) {
        try { return localStorage.getItem(tokenKey(slug)); } catch { return null; }
    },
    save(slug, token) {
        try { localStorage.setItem(tokenKey(slug), token); } catch { /* storage unavailable */ }
    },
    clear(slug) {
        try { localStorage.removeItem(tokenKey(slug)); } catch { /* storage unavailable */ }
    },
};

export class ApiError extends Error {
    constructor(status, body) {
        super(body?.message || `Request failed (${status})`);
        this.status = status;
        this.errors = body?.errors || {};
    }
}

export async function api(path, { method = 'GET', body, tenant, token } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (tenant) headers['X-Tenant'] = tenant;
    const bearer = token ?? (tenant ? session.token(tenant) : null);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const res = await fetch(`/api/${path.replace(/^\//, '')}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = res.status === 204 ? null : await res.json().catch(() => null);

    if (!res.ok) throw new ApiError(res.status, data);
    return data;
}

// First validation message for a field, if any.
export const fieldError = (err, field) => err?.errors?.[field]?.[0];
