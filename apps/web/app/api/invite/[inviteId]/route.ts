// Public invite preview for the customer join screen — no token, minimal info.
import { NextResponse } from "next/server";
import { getSessionByInvite } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await ctx.params;
  const session = await getSessionByInvite(inviteId);

  if (!session || session.status !== "active") {
    return NextResponse.json({ valid: false }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { valid: true, title: session.title ?? "Support session" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
