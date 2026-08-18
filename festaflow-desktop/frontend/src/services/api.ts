const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function getToken() { return localStorage.getItem("festaflow_token"); }
export function setToken(token: string) { localStorage.setItem("festaflow_token", token); }
export function clearToken() { localStorage.removeItem("festaflow_token"); }

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || "Erro na API.", response.status);
  return data as T;
}
