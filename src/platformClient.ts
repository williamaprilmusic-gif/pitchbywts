type ApiResponse<T = unknown> = { data: T };

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type LocalUser = {
    userId: string;
    email?: string;
    name?: string;
    scope: string;
};

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
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

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
        return parsed?.userId ? parsed : null;
    } catch {
        return null;
    }
}

function writeStoredUser(user: LocalUser | null) {
    try {
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
    } catch {
        // Optional browser storage failure should not break the app shell.
    }
}

export const api = {
    get: <T = unknown>(url: string) => request<T>('GET', url),
    post: <T = unknown>(url: string, body?: unknown) => request<T>('POST', url, body),
    put: <T = unknown>(url: string, body?: unknown) => request<T>('PUT', url, body),
    delete: <T = unknown>(url: string, body?: unknown) => request<T>('DELETE', url, body),
};

export const auth = {
    isSignedIn: () => Boolean(readStoredUser()),
    getUser: async (): Promise<LocalUser | null> => readStoredUser(),
    getAccessToken: async (): Promise<string | null> => null,
    signIn: async (): Promise<{ user: LocalUser; accessToken: string; expiresIn: number }> => {
        throw Object.assign(new Error('Pitchline authentication is not configured on Vercel yet.'), {
            code: 'auth_unavailable',
        });
    },
    signOut: async (): Promise<void> => {
        writeStoredUser(null);
    },
};

function parseInviteCode(): string | null {
    try {
        const queryCode = new URLSearchParams(window.location.search).get('invite');
        if (queryCode) return queryCode;
    } catch {
        // Ignore malformed browser URL access.
    }
    try {
        return localStorage.getItem('pitchline.pendingInvite');
    } catch {
        return null;
    }
}

export const invitesClient = {
    getPendingCode: () => parseInviteCode(),
    clearPendingCode: () => {
        try {
            localStorage.removeItem('pitchline.pendingInvite');
        } catch {
            // Ignore optional storage failures.
        }
    },
};

export const notifications = {
    subscribe: async (): Promise<void> => {
        if (typeof Notification === 'undefined') {
            throw new Error('Browser notifications are not supported.');
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Notification permission was not granted.');
        }
    },
    onMessage: (_handler: (message: unknown) => void) => () => undefined,
};

export const ws = {
    connect: (): WsConnection => {
        let closeHandler: () => void = () => undefined;
        let connected = true;
        const fallbackRandomId = `${Date.now()}-${Math.random()}`;
        const connectionId = `vercel-${crypto.randomUUID?.() || fallbackRandomId}`;
        const ready = Promise.resolve();

        return {
            connectionId,
            ready,
            onMessage: (_handler) => undefined,
            onOpen: (_handler) => undefined,
            onClose: (handler) => { closeHandler = handler; },
            onError: (_handler) => undefined,
            disconnect: () => {
                if (!connected) return;
                connected = false;
                closeHandler();
            },
        };
    },
};
