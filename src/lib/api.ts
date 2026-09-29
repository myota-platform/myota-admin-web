const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function accessToken(): string {
  return localStorage.getItem('myota_admin_access') || '';
}

export function clearSession(): void {
  localStorage.removeItem('myota_admin_access');
  localStorage.removeItem('myota_admin_refresh');
}

export function saveSession(data: { accessToken: string; refreshToken?: string }): void {
  localStorage.setItem('myota_admin_access', data.accessToken);
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
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = accessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 403 && retry && await refreshSession()) return apiRequest<T>(path, options, false);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.detail || body.message || body.error || response.statusText, response.status);
  return body as T;
}
