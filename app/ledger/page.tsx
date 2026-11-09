import { LedgerGrid } from "@/components/LedgerGrid";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function LedgerPage() {
  const cfg = getConfig();
  return <LedgerGrid tz={cfg.timezone} fx={cfg.demoFxUsdEur} />;
}
