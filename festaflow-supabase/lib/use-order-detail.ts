"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/components/ui";

// Shared on-demand detail cache for the "listing returns a slim summary,
// full detail loads per-id on demand" split (see components/SaasApp.tsx
// OrderFormModal/PrintOrder/RecurrenceModal and GET /api/orders/[id]). One
// instance lives at the top of SaasAppShell (same level as the `orders`
// summary array) and is threaded down as a prop - never re-created per view,
// so a request already in flight for one id is shared by every consumer
// asking for it at the same time (e.g. OrdersView's "Imprimir" and "Editar"
// clicked in quick succession on the same row).
//
// Validity policy (deliberately simple - no TTL, no external cache):
// - `get(id)` is a synchronous cache read only - it never triggers a
//   request. Callers check it first for an instant cache-hit render, then
//   fall back to `fetch(id)` on a miss.
// - `fetch(id)` always performs a GET (deduped per id - a second call for
//   the same id while one is already in flight returns that SAME promise
//   instead of firing a second request) and writes the result to the cache
//   on success. A rejected fetch never writes to the cache, so a failed
//   load can always be retried.
// - A successful response is cached only if the active branch is still the
//   one that was active when the request was MADE (checked via
//   `branchIdRef` at resolution time) - a response that arrives after the
//   user has switched branches is still handed back to whichever caller
//   awaited it (so an already-open modal is not left hanging), it just
//   never pollutes the cache for the new branch.
// - The whole cache is cleared by the caller whenever the active branch
//   changes - SaasAppShell's existing branch-reset effect calls `clear()`
//   alongside its other resets, so no entry ever survives a branch switch.
// - `set(detail)` lets a caller store a full detail object it already has
//   from another response (a PUT/POST/cancel's own return value) without an
//   extra GET - this is how saving an OS updates both the summary list and
//   this cache from the exact same response.
// - `invalidate(id)` drops one entry (used after DELETE).
export type OrderDetailCache<TDetail extends { id: string }> = {
  get: (id: string) => TDetail | undefined;
  fetch: (id: string) => Promise<TDetail>;
  set: (detail: TDetail) => void;
  invalidate: (id: string) => void;
  clear: () => void;
};

export function useOrderDetailCache<TDetail extends { id: string }>(branchId: string | null): OrderDetailCache<TDetail> {
  const [cache, setCache] = useState<Map<string, TDetail>>(() => new Map());
  const inFlight = useRef<Map<string, Promise<TDetail>>>(new Map());
  const branchIdRef = useRef(branchId);
  branchIdRef.current = branchId;

  const get = useCallback((id: string) => cache.get(id), [cache]);

  const fetchDetail = useCallback((id: string): Promise<TDetail> => {
    const existing = inFlight.current.get(id);
    if (existing) return existing;
    const requestedBranchId = branchIdRef.current;
    const promise = api<TDetail>(`/api/orders/${id}`)
      .then((detail) => {
        inFlight.current.delete(id);
        if (branchIdRef.current === requestedBranchId) {
          setCache((prev) => {
            const next = new Map(prev);
            next.set(id, detail);
            return next;
          });
        }
        return detail;
      })
      .catch((err) => {
        inFlight.current.delete(id);
        throw err;
      });
    inFlight.current.set(id, promise);
    return promise;
  }, []);

  const set = useCallback((detail: TDetail) => {
    setCache((prev) => {
      const next = new Map(prev);
      next.set(detail.id, detail);
      return next;
    });
  }, []);

  const invalidate = useCallback((id: string) => {
    setCache((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setCache(new Map());
    inFlight.current.clear();
  }, []);

  // Memoized so the returned object keeps a stable identity across renders
  // (every member is already individually stable via useCallback) - safe to
  // pass as a prop and reference in dependency arrays without causing
  // unrelated re-renders or effect loops in consumers.
  return useMemo(() => ({ get, fetch: fetchDetail, set, invalidate, clear }), [get, fetchDetail, set, invalidate, clear]);
}
