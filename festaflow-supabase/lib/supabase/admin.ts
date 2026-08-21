import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client - server-only, NEVER import from a "use
// client" file or expose to the browser. Used exclusively by the admin
// user-management routes (app/api/users/**) to create/update rows in
// Supabase's own `auth.users` table, which Prisma never touches directly
// (Prisma only ever reads/writes the `public` schema - see profiles/
// user_branches in schema.prisma).
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY sao obrigatorias para gerenciar usuarios.");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
