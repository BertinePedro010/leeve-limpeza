import { requireUser } from "@/lib/auth";
import SaasApp from "@/components/SaasApp";

export default async function AppPage() {
  await requireUser();
  return <SaasApp />;
}
