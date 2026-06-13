// Stop recording (R16) — agent only. The egress_ended webhook flips status to ready.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById } from "@/lib/sessions";
import { egressClient } from "@/lib/livekit/egress";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidate, K } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let recordingId = "";
  try {
    recordingId = String((await request.json())?.recordingId ?? "");
  } catch {
    /* handled below */
  }
  if (!recordingId) return NextResponse.json({ error: "Missing recordingId" }, { status: 400 });

  const admin = createAdminClient();
  const { data: rec } = await admin.from("recordings").select("*").eq("id", recordingId).single();
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getSessionById(rec.session_id);
  if (!session || (user.role !== "admin" && session.agent_id !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (rec.egress_id) await egressClient().stopEgress(rec.egress_id);
  } catch {
    /* egress may have already stopped; still mark processing */
  }

  await admin.from("recordings").update({ status: "processing" }).eq("id", recordingId);
  await invalidate(K.recording(rec.session_id));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
