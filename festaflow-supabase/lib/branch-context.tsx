"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Branch = { id: string; name: string; city: string; state: string };

type BranchContextValue = {
  branches: Branch[];
  activeBranchId: string | null;
  activeBranch: Branch | null;
  setActiveBranchId: (id: string) => void;
  loading: boolean;
};

const STORAGE_KEY = "festaflow:activeBranchId";
const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/branches");
      const data: Branch[] = res.ok ? await res.json().catch(() => []) : [];
      if (cancelled) return;
      setBranches(data);
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
  }, []);

  function setActiveBranchId(id: string) {
    if (!branches.some((b) => b.id === id)) return;
    setActiveBranchIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  return (
    <BranchContext.Provider value={{ branches, activeBranchId, activeBranch, setActiveBranchId, loading }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
