import { Counter } from "@/components/Counter";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Counter sellerName={getConfig().sellerName} />;
}
