// Start recording (R16) — agent only. Room-composite egress → Supabase Storage MP4.
// Requires the egress container (docker compose --profile recording up) + S3 keys.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById } from "@/lib/sessions";
import { egressClient, buildFileOutput } from "@/lib/livekit/egress";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidate, K } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let sessionId = "";
  try {
    sessionId = String((await request.json())?.sessionId ?? "");
  } catch {
    /* handled below */
  }
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  const session = await getSessionById(sessionId);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && session.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filepath = `${sessionId}/${Date.now()}.mp4`;

  try {
    const info = await egressClient().startRoomCompositeEgress(
      session.room_name,
      buildFileOutput(filepath),
    );

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("recordings")
      .insert({
        session_id: sessionId,
        egress_id: info.egressId,
        status: "in_progress",
        storage_path: filepath,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await admin.from("session_events").insert({
      session_id: sessionId,
      type: "recording_started",
      identity: user.email,
      metadata: { egressId: info.egressId },
    });
    await invalidate(K.recording(sessionId));

    return NextResponse.json({ recording: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Could not start recording. Ensure the egress service is running (docker compose --profile recording up) and Supabase S3 keys are set.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
