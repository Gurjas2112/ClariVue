// LiveKit webhook sink — the single place room state changes are recorded.
// Validates the signature with WebhookReceiver (rejects unsigned), then persists
// presence (session_participants), the event log (session_events), recording
// lifecycle (recordings), and funnels all cache invalidation.
import { NextResponse } from "next/server";
import { webhookReceiver } from "@/lib/livekit/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidate, K } from "@/lib/cache";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const GRACE_SECONDS = Number(process.env.RECONNECT_GRACE_SECONDS ?? 30);

function roleFromIdentity(identity: string): Role {
  return identity.startsWith("agent-") ? "agent" : "customer";
}

export async function POST(request: Request) {
  const body = await request.text();
  const auth = request.headers.get("Authorization") ?? undefined;

  let event;
  try {
    event = await webhookReceiver().receive(body, auth);
  } catch {
    // Unsigned or tampered — reject.
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const admin = createAdminClient();
  const roomName = event.room?.name;
  if (!roomName) return NextResponse.json({ ok: true });

  const { data: session } = await admin
    .from("sessions")
    .select("id, invite_id")
    .eq("room_name", roomName)
    .single();
  if (!session) return NextResponse.json({ ok: true });

  const sid = session.id;
  const p = event.participant;

  switch (event.event) {
    case "participant_joined": {
      if (!p) break;
      const role = roleFromIdentity(p.identity);

      // Reconnect grace (R18): if this identity dropped within the window, treat
      // this as a silent re-entry — bump reconnect_count, don't emit a join event.
      const { data: existing } = await admin
        .from("session_participants")
        .select("id, disconnected_at, reconnect_count")
        .eq("session_id", sid)
        .eq("identity", p.identity)
        .maybeSingle();

      const within =
        existing?.disconnected_at &&
        Date.now() - new Date(existing.disconnected_at).getTime() <= GRACE_SECONDS * 1000;

      await admin.from("session_participants").upsert(
        {
          session_id: sid,
          identity: p.identity,
          display_name: p.name || null,
          role,
          joined_at: existing ? undefined : new Date().toISOString(),
          left_at: null,
          disconnected_at: null,
          reconnect_count: within ? (existing!.reconnect_count ?? 0) + 1 : existing?.reconnect_count ?? 0,
        },
        { onConflict: "session_id,identity" },
      );

      if (!within) {
        await admin.from("session_events").insert({
          session_id: sid,
          type: "participant_joined",
          identity: p.identity,
          metadata: { name: p.name, role },
        });
      }
      await invalidate(K.liveSessions());
      break;
    }

    case "participant_left": {
      if (!p) break;
      // Mark the drop time and start the grace window. We record left_at too so
      // history is complete even if they never come back.
      const now = new Date().toISOString();
      await admin
        .from("session_participants")
        .update({ disconnected_at: now, left_at: now })
        .eq("session_id", sid)
        .eq("identity", p.identity);

      await admin.from("session_events").insert({
        session_id: sid,
        type: "participant_left",
        identity: p.identity,
      });
      await invalidate(K.liveSessions());
      break;
    }

    case "room_finished": {
      await admin
        .from("sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", sid)
        .eq("status", "active");
      await admin.from("session_events").insert({ session_id: sid, type: "room_finished" });
      await invalidate(K.liveSessions(), K.invite(session.invite_id));
      break;
    }

    case "egress_started":
    case "egress_updated":
    case "egress_ended": {
      const info = event.egressInfo;
      if (info) {
        const ended = event.event === "egress_ended";
        // On egress_ended the MP4 is uploaded to Supabase Storage → ready (R16).
        await admin
          .from("recordings")
          .update(
            ended
              ? { status: "ready", ready_at: new Date().toISOString() }
              : { status: "in_progress" },
          )
          .eq("egress_id", info.egressId);
        await admin.from("session_events").insert({
          session_id: sid,
          type: event.event,
          metadata: { egressId: info.egressId, status: String(info.status) },
        });
      }
      await invalidate(K.recording(sid));
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
