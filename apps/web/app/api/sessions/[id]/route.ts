// Session detail (agent owner or admin). Returns the full record for the session page.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById } from "@/lib/sessions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSessionById(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && session.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [participants, events, messages, files, recordings] = await Promise.all([
    admin.from("session_participants").select("*").eq("session_id", id).order("joined_at"),
    admin.from("session_events").select("*").eq("session_id", id).order("created_at"),
    admin.from("chat_messages").select("*").eq("session_id", id).order("created_at"),
    admin.from("shared_files").select("*").eq("session_id", id).order("created_at"),
    admin.from("recordings").select("*").eq("session_id", id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json(
    {
      session,
      participants: participants.data ?? [],
      events: events.data ?? [],
      messages: messages.data ?? [],
      files: files.data ?? [],
      recordings: recordings.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
