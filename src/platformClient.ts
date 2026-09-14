type ApiResponse<T = unknown> = { data: T };

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type LocalUser = {
    userId: string;
    email: string;
    name: string;
};

type Credentials = { email?: string; password?: string; name?: string };

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
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request<T = unknown>(method: RequestMethod, url: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${API_BASE}${url}`, {
        method,
        credentials: 'include',
        headers: body === undefined
            ? { Accept: 'application/json' }
            : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message?: unknown }).message)
            : typeof data === 'object' && data !== null && 'error' in data
                ? String((data as { error?: unknown }).error)
                : `Request failed (${response.status})`;
        throw new Error(message);
    }
    return { data: data as T };
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
            const response = await request<{ user: LocalUser }>('GET', '/api/auth/me');
            writeStoredUser(response.data.user);
            return response.data.user;
        } catch {
            writeStoredUser(null);
            return null;
        }
    },
    getAccessToken: async (): Promise<string | null> => null,
    signIn: async (credentials: Credentials = {}): Promise<{ user: LocalUser; accessToken: string; expiresIn: number }> => {
        const supplied = credentials.email || credentials.password ? credentials : await promptCredentials();
        const response = await request<{ user: LocalUser; accessToken: string; expiresIn: number }>('POST', '/api/auth/sign-in', {
            email: supplied.email,
            password: supplied.password,
        });
        writeStoredUser(response.data.user);
        return response.data;
    },
    signUp: async (credentials: Credentials): Promise<{ user: LocalUser; accessToken: string; expiresIn: number }> => {
        const response = await request<{ user: LocalUser; accessToken: string; expiresIn: number }>('POST', '/api/auth/sign-up', credentials);
        writeStoredUser(response.data.user);
        return response.data;
    },
    signOut: async (): Promise<void> => {
        try { await request('POST', '/api/auth/sign-out'); } finally { writeStoredUser(null); }
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
