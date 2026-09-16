type ApiResponse<T = unknown> = { data: T };

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type LocalUser = {
    userId: string;
    email: string;
    name: string;
};

type Credentials = { email?: string; password?: string; name?: string };
type ApiFailure = Error & { code?: string; status?: number; requestId?: string };
type WsConnection = {
    connectionId: string | null;
    ready: Promise<void>;
    onMessage: (handler: (message: unknown) => void) => void;
    onOpen: (handler: () => void) => void;
    onClose: (handler: () => void) => void;
    onError: (error: unknown) => void;
    disconnect: () => void;
};

const USER_KEY = 'pitchline.auth.user';
const SESSION_KEY = 'pitchline_session_token';
// Keep browser API calls same-origin so the HttpOnly pitchline_session cookie is always sent to the same Vercel host.
const API_BASE = '';
const GET_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

function emitMutation(method: RequestMethod, url: string, status: number) {
    if (typeof window === 'undefined' || method === 'GET') return;
    window.dispatchEvent(new CustomEvent('pitchline:api-mutation', {
        detail: { method, path: url, status, at: Date.now() }
    }));
}

function sleep(ms: number) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function readSessionToken() {
    try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function writeSessionToken(token: string | null) {
    try {
        if (token) sessionStorage.setItem(SESSION_KEY, token);
        else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* optional browser storage */ }
}

async function request<T = unknown>(method: RequestMethod, url: string, body?: unknown, attempt = 0): Promise<ApiResponse<T>> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeout = controller ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : undefined;
    try {
        const sessionToken = readSessionToken();
        const headers: Record<string, string> = body === undefined
            ? { Accept: 'application/json', 'X-Pitchline-Client': 'web' }
            : { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Pitchline-Client': 'web' };
        if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
        const response = await fetch(`${API_BASE}${url}`, {
            method,
            credentials: 'include',
            cache: method === 'GET' ? 'no-store' : 'default',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller?.signal,
        });

        const responseToken = response.headers.get('X-Pitchline-Session');
        if (responseToken) writeSessionToken(responseToken);
        const requestId = response.headers.get('X-Request-Id') || undefined;
        const text = await response.text();
        let data: unknown = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }

        // A protected GET without a session is treated as empty data. Mutations remain hard failures.
        if (response.status === 401 && method === 'GET') {
            return { data: null as T };
        }

        if (!response.ok) {
            const payload = typeof data === 'object' && data !== null ? data as { message?: unknown; error?: unknown; code?: unknown } : {};
            const message = payload.message != null
                ? String(payload.message)
                : typeof payload.error === 'string'
                    ? payload.error
                    : payload.error && typeof payload.error === 'object' && 'message' in payload.error
                        ? String((payload.error as { message?: unknown }).message)
                        : `Request failed (${response.status})`;
            const failure = new Error(message) as ApiFailure;
            failure.code = payload.code != null ? String(payload.code) : `http_${response.status}`;
            failure.status = response.status;
            failure.requestId = requestId;
            throw failure;
        }
        emitMutation(method, url, response.status);
        return { data: data as T };
    } catch (error) {
        const canRetry = method === 'GET' && attempt < GET_RETRIES && (!('status' in (error as object)) || Number((error as ApiFailure).status || 0) >= 500);
        if (canRetry) {
            await sleep(350 * (attempt + 1));
            return request<T>(method, url, body, attempt + 1);
        }
        throw error;
    } finally {
        if (timeout) window.clearTimeout(timeout);
    }
}

function readStoredUser(): LocalUser | null {
    try {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as LocalUser;
        return parsed?.userId && parsed?.email ? parsed : null;
    } catch { return null; }
}

function writeStoredUser(user: LocalUser | null) {
    try {
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pitchline:auth-change', { detail: user }));
    } catch { /* optional browser storage */ }
}

export const api = {
    get: <T = unknown>(url: string) => request<T>('GET', url),
    post: <T = unknown>(url: string, body?: unknown) => request<T>('POST', url, body),
    put: <T = unknown>(url: string, body?: unknown) => request<T>('PUT', url, body),
    delete: <T = unknown>(url: string, body?: unknown) => request<T>('DELETE', url, body),
};

async function promptCredentials() {
    if (typeof window === 'undefined') return {};
    const email = window.prompt('Pitchline email address') || '';
    const password = window.prompt('Pitchline password') || '';
    return { email, password };
}

export const auth = {
    isSignedIn: () => Boolean(readStoredUser()),
    getUser: async (): Promise<LocalUser | null> => {
        try {
            const response = await request<{ user: LocalUser; role?: string }>('GET', '/api/auth/me');
            if (!response.data?.user) {
                writeStoredUser(null);
                writeSessionToken(null);
                return null;
            }
            writeStoredUser(response.data.user);
            return response.data.user;
        } catch {
            writeStoredUser(null);
            writeSessionToken(null);
            return null;
        }
    },
    getAccessToken: async (): Promise<string | null> => readSessionToken() || null,
    signIn: async (credentials: Credentials = {}): Promise<{ user: LocalUser; accessToken: string; expiresIn: number }> => {
        const supplied = credentials.email || credentials.password ? credentials : await promptCredentials();
        if (!supplied.email || !supplied.password) {
            const failure = new Error('Email and password are required.') as ApiFailure;
            failure.code = 'credentials_required';
            throw failure;
        }
        const response = await request<{ user: LocalUser; accessToken?: string; expiresIn: number }>('POST', '/api/auth/sign-in', {
            email: supplied.email,
            password: supplied.password,
        });
        writeStoredUser(response.data.user);
        const token = response.data.accessToken || readSessionToken();
        if (token) writeSessionToken(token);
        return { ...response.data, accessToken: token || '' };
    },
    signUp: async (credentials: Credentials): Promise<{ user: LocalUser; accessToken: string; expiresIn: number }> => {
        const response = await request<{ user: LocalUser; accessToken?: string; expiresIn: number }>('POST', '/api/auth/sign-up', credentials);
        writeStoredUser(response.data.user);
        const token = response.data.accessToken || readSessionToken();
        if (token) writeSessionToken(token);
        return { ...response.data, accessToken: token || '' };
    },
    signOut: async (): Promise<void> => {
        try { await request('POST', '/api/auth/sign-out'); } finally { writeStoredUser(null); writeSessionToken(null); }
    },
};

function parseInviteCode(): string | null {
    try {
        const queryCode = new URLSearchParams(window.location.search).get('invite');
        if (queryCode) return queryCode;
    } catch { /* ignore browser URL failures */ }
    try { return localStorage.getItem('pitchline.pendingInvite'); } catch { return null; }
}

export const invitesClient = {
    getPendingCode: () => parseInviteCode(),
    clearPendingCode: () => { try { localStorage.removeItem('pitchline.pendingInvite'); } catch { /* ignore */ } },
};

export const notifications = {
    subscribe: async (): Promise<void> => {
        if (typeof Notification === 'undefined') throw new Error('Browser notifications are not supported.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    },
    onMessage: (_handler: (message: unknown) => void) => () => undefined,
};

export const ws = {
    connect: (): WsConnection => {
        let closeHandler: () => void = () => undefined;
        let connected = true;
        const connectionId = `vercel-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
        return {
            connectionId,
            ready: Promise.resolve(),
            onMessage: (_handler) => undefined,
            onOpen: (handler) => queueMicrotask(handler),
            onClose: (handler) => { closeHandler = handler; },
            onError: (_error) => undefined,
            disconnect: () => { if (!connected) return; connected = false; closeHandler(); },
        };
    },
};
