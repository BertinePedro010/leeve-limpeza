import { apiFetch, clearToken, setToken } from "./api";
import { User } from "../types";

export async function login(email: string, password: string) {
  const data = await apiFetch<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setToken(data.token);
  localStorage.setItem("festaflow_user", JSON.stringify(data.user));
  return data.user;
}

export async function recover(email: string) {
  return apiFetch<{ message: string }>("/auth/recover", { method: "POST", body: JSON.stringify({ email }) });
}

export function logout() {
  clearToken();
  localStorage.removeItem("festaflow_user");
}

export function storedUser(): User | null {
  const raw = localStorage.getItem("festaflow_user");
  return raw ? JSON.parse(raw) : null;
}
