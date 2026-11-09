import { startCheckout } from "@/lib/checkout";
import { respond } from "@/lib/http";
import type { Sale } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { sale } = (await req.json()) as { sale: Sale };
  return respond(() => startCheckout(sale));
}
