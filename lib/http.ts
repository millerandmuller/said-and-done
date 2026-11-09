// Route-handler wrapper: every failure becomes JSON with a short message the counter can speak.
import { NextResponse } from "next/server";

export async function respond<T>(work: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await work());
  } catch (e) {
    const message = (e as Error).message || "Something went wrong.";
    console.error("[api]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
