"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Works even without a session (signOut() on an already-logged-out browser
// is a safe no-op) - this screen must never assume a session exists, since
// it is also the first thing an authenticated user sees after the lock
// kicks in mid-session (see app/app/page.tsx and components/ui.tsx).
export default function BlockedScreenClient() {
  const supabase = createSupabaseBrowserClient();

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/login";
  }

  return (
    <button onClick={logout} className="mt-6 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
      Sair
    </button>
  );
}
