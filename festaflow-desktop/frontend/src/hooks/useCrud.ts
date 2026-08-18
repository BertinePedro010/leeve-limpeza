import { useCallback, useEffect, useState } from "react";
import { crudService } from "../services/crud";

export function useCrud<T extends { id: string }, P = Partial<T>>(resource: string) {
  const service = crudService<T, P>(resource);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setLoading(true); setItems(await service.list()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao carregar."); }
    finally { setLoading(false); }
  }, [resource]);

  useEffect(() => { load(); }, [load]);

  const create = async (payload: P) => { await service.create(payload); await load(); };
  const update = async (id: string, payload: P) => { await service.update(id, payload); await load(); };
  const remove = async (id: string) => { await service.remove(id); await load(); };

  return { items, loading, error, load, create, update, remove };
}
