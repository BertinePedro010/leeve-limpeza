import { useCallback, useState } from "react";

export interface Toast { id: string; message: string; type: "success" | "error" | "info" }

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, toast, removeToast: (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)) };
}
