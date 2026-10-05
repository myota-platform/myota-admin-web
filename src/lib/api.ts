const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const OBSERVABILITY_COOKIE = 'myota_admin_access';

function syncObservabilityCookie(token: string): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (!token) {
    document.cookie = `${OBSERVABILITY_COOKIE}=; Path=/observability; Max-Age=0; SameSite=Strict${secure}`;
    return;
  }
  let maxAge = 600;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(window.atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    if (Number.isFinite(claims.exp)) maxAge = Math.max(1, claims.exp - Math.floor(Date.now() / 1000));
  } catch {
    // The API will validate the token; this only bounds the helper cookie.
  }
  document.cookie = `${OBSERVABILITY_COOKIE}=${encodeURIComponent(token)}; Path=/observability; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function accessToken(): string {
  const token = localStorage.getItem('myota_admin_access') || '';
  syncObservabilityCookie(token);
  return token;
}

export function clearSession(): void {
  localStorage.removeItem('myota_admin_access');
  localStorage.removeItem('myota_admin_refresh');
  syncObservabilityCookie('');
}

export function saveSession(data: { accessToken: string; refreshToken?: string }): void {
  localStorage.setItem('myota_admin_access', data.accessToken);
  syncObservabilityCookie(data.accessToken);
  if (data.refreshToken) localStorage.setItem('myota_admin_refresh', data.refreshToken);
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = localStorage.getItem('myota_admin_refresh');
  if (!refreshToken) return false;
  const response = await fetch(`${API_BASE}/v1/identity/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return false;
  saveSession(await response.json());
  return true;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  // FormData must keep the browser-generated multipart boundary. Treating it
  // as JSON forces large files through an in-memory string conversion.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = accessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const method = (options.method || 'GET').toUpperCase();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    ...(method === 'GET' ? { cache: 'no-store' as RequestCache } : {}),
  });
  if (response.status === 403 && retry && await refreshSession()) return apiRequest<T>(path, options, false);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.detail || body.message || body.error || response.statusText, response.status);
  return body as T;
}
