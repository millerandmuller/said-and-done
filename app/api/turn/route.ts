import { respond } from "@/lib/http";
import { interpretTurn, type Draft } from "@/lib/turn";

export const maxDuration = 30;

export async function POST(req: Request) {
  return respond(async () => {
    const body = (await req.json().catch(() => null)) as { utterance?: unknown; draft?: Draft | null; focusSku?: string } | null;
    if (!body || typeof body.utterance !== "string" || body.utterance.length > 2000) throw new Error("Bad request.");
    const draft = body.draft && Array.isArray(body.draft.items) && body.draft.items.every((i) => i && typeof i === "object") ? body.draft : null;
    return interpretTurn(body.utterance, draft, body.focusSku);
  });
}
