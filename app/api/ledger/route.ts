import { respond } from "@/lib/http";
import { fetchLedger } from "@/lib/ledger";

export const maxDuration = 30;

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  return respond(async () => ({ rows: await fetchLedger({ fresh }) }));
}
