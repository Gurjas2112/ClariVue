// End a session (agent owner or admin). Closes the LiveKit room so all connections
// drop cleanly, then marks the session ended. R4.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById, endSession } from "@/lib/sessions";
import { closeRoom } from "@/lib/livekit/roomService";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSessionById(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && session.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await closeRoom(session.room_name);
  await endSession(session);

  const admin = createAdminClient();
  await admin.from("session_events").insert({
    session_id: session.id,
    type: "session_ended",
    identity: user.email,
    metadata: { by: user.role },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
