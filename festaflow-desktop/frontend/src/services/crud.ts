import { apiFetch } from "./api";

export function crudService<T, CreatePayload = Partial<T>>(resource: string) {
  return {
    list: () => apiFetch<T[]>(`/${resource}`),
    create: (payload: CreatePayload) => apiFetch<T>(`/${resource}`, { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: CreatePayload) => apiFetch<T>(`/${resource}/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => apiFetch<void>(`/${resource}/${id}`, { method: "DELETE" }),
  };
}
