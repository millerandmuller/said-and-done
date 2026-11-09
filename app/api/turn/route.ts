import { respond } from "@/lib/http";
import { interpretTurn, type Draft } from "@/lib/turn";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json()) as { utterance: string; draft: Draft | null; focusSku?: string };
  return respond(() => interpretTurn(body.utterance, body.draft, body.focusSku));
}
