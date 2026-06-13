// Delete a session (agent owner or admin, ended sessions only).
// Cascade-deletes related session_events, session_participants, chat_messages,
// recordings, and storage files.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById } from "@/lib/sessions";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidate, K } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSessionById(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the owning agent or an admin can delete
  if (user.role !== "admin" && session.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only ended sessions may be deleted
  if (session.status === "active") {
    return NextResponse.json(
      { error: "End the session before deleting it" },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

  // Delete recordings from storage, then from DB
  const { data: recs } = await admin
    .from("recordings")
    .select("id, storage_path")
    .eq("session_id", session.id);

  if (recs?.length) {
    const paths = recs.map((r) => r.storage_path).filter(Boolean);
    if (paths.length) {
      await admin.storage.from("recordings").remove(paths);
    }
    await admin.from("recordings").delete().eq("session_id", session.id);
  }

  // Delete uploaded files from storage
  const { data: files } = await admin
    .from("chat_messages")
    .select("file_url")
    .eq("session_id", session.id)
    .not("file_url", "is", null);

  if (files?.length) {
    const filePaths = files
      .map((f) => {
        // Extract path from full URL or relative path
        const match = f.file_url?.match(/session-files\/(.+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];
    if (filePaths.length) {
      await admin.storage.from("session-files").remove(filePaths);
    }
  }

  // Delete related data (order matters for FK constraints)
  await admin.from("chat_messages").delete().eq("session_id", session.id);
  await admin.from("session_events").delete().eq("session_id", session.id);
  await admin.from("session_participants").delete().eq("session_id", session.id);
  await admin.from("sessions").delete().eq("id", session.id);

  // Invalidate caches
  await invalidate(K.liveSessions(), K.invite(session.invite_id));

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
