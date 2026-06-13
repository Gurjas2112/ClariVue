// Latest recording status for a session (R16) — agent owner / admin. Polled by the
// in-call recording pill so it can transition in progress → processing → ready.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById } from "@/lib/sessions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session");
  if (!sessionId) return NextResponse.json({ error: "Missing session" }, { status: 400 });

  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSessionById(sessionId);
  if (!session || (user.role !== "admin" && session.agent_id !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("recordings")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);

  return NextResponse.json(
    { recording: data?.[0] ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
