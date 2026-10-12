import { redirect } from "next/navigation";
import { requireDeveloper, DevAuthError } from "@/lib/dev-auth";
import DevPanelClient from "@/components/DevPanelClient";

// Independent gate from requireUser()/`/login` on purpose - this route (and
// /dev/login) must stay reachable even while the system is globally
// blocked, and must not depend on the common app menu/shell at all.
//
// Forced dynamic on purpose: requireDeveloper() only reaches cookies() AFTER
// its DEVELOPER_USER_ID env-var check. In any build where that var is unset
// (e.g. this repo's default .env.local), Next's static optimizer never
// observes a dynamic API call on this trace and would otherwise prerender
// this page as static HTML - baking in whatever the env var happened to be
// at build time instead of checking the real session on every request. A
// security gate must never be allowed to depend on that build-time
// coincidence.
export const dynamic = "force-dynamic";

export default async function DevPage() {
  try {
    await requireDeveloper();
  } catch (error) {
    if (error instanceof DevAuthError) redirect("/dev/login");
    throw error;
  }
  return <DevPanelClient />;
}
