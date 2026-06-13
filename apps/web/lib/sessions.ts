// Server-side session data access. All mutations use the service key (bypasses RLS);
// privileged callers are gated in the route handlers before reaching here.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cached, invalidate, K } from "@/lib/cache";
import { newInviteId, newRoomName } from "@/lib/invites";
import type { Session } from "@/lib/types";

export async function createSession(agentId: string, title?: string): Promise<Session> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sessions")
    .insert({
      room_name: newRoomName(),
      invite_id: newInviteId(),
      agent_id: agentId,
      title: title?.trim() || "Support session",
      status: "active",
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "Failed to create session");
  await invalidate(K.liveSessions());
  return data as Session;
}

// Cached invite lookup — runs on every join and token mint.
export async function getSessionByInvite(inviteId: string): Promise<Session | null> {
  return cached(K.invite(inviteId), 60, async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("sessions")
      .select("*")
      .eq("invite_id", inviteId)
      .single();
    return (data as Session) ?? null;
  });
}

export async function getSessionById(id: string): Promise<Session | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("sessions").select("*").eq("id", id).single();
  return (data as Session) ?? null;
}

export async function endSession(session: Session): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", session.id);
  await invalidate(K.liveSessions(), K.invite(session.invite_id));
}
