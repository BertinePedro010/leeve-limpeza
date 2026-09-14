import { requireUser } from "@/lib/auth";
import SaasApp from "@/components/SaasApp";
import { AppErrorBoundary } from "@/components/ErrorBoundary";

export default async function AppPage() {
  await requireUser();
  return (
    <AppErrorBoundary>
      <SaasApp />
    </AppErrorBoundary>
  );
}
