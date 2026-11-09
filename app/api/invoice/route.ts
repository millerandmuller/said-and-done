import { startCheckout } from "@/lib/checkout";
import { respond } from "@/lib/http";
import type { Sale } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  return respond(async () => {
    const body = (await req.json().catch(() => null)) as { sale?: Sale; saleKey?: string } | null;
    if (!body?.sale) throw new Error("Missing sale.");
    return startCheckout(body.sale, body.saleKey);
  });
}
