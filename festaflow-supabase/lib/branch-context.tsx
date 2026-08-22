"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Branch = { id: string; name: string; city: string; state: string; active: boolean };

type BranchContextValue = {
  branches: Branch[];
  activeBranchId: string | null;
  activeBranch: Branch | null;
  setActiveBranchId: (id: string) => void;
  loading: boolean;
  // Re-fetches /api/branches and updates `branches` in place, without
  // touching activeBranchId - lets screens that mutate branches (BranchesView)
  // refresh the shared list after a create/edit instead of keeping their own
  // parallel copy fetched from the same endpoint.
  refetch: () => Promise<void>;
};

const STORAGE_KEY = "leeveLimpeza:activeBranchId";
const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBranches = useCallback(async (): Promise<Branch[]> => {
    const res = await fetch("/api/branches");
    const data: Branch[] = res.ok ? await res.json().catch(() => []) : [];
    setBranches(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await fetchBranches();
      if (cancelled) return;
      const stored = localStorage.getItem(STORAGE_KEY);
      const restored = data.find((b) => b.id === stored);
      const next = restored?.id ?? data[0]?.id ?? null;
      setActiveBranchIdState(next);
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [fetchBranches]);

  const refetch = useCallback(async () => { await fetchBranches(); }, [fetchBranches]);

  function setActiveBranchId(id: string) {
    if (!branches.some((b) => b.id === id)) return;
    setActiveBranchIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  return (
    <BranchContext.Provider value={{ branches, activeBranchId, activeBranch, setActiveBranchId, loading, refetch }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
