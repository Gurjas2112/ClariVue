// Sessions collection. POST = create (agent only). GET = list the agent's sessions.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { createSession } from "@/lib/sessions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let title: string | undefined;
  try {
    const body = await request.json();
    title = body?.title;
  } catch {
    /* title optional */
  }

  try {
    const session = await createSession(user.id, title);
    return NextResponse.json(
      { session },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create session" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  // Admins see everything; agents see only their own sessions.
  const query = admin.from("sessions").select("*").order("created_at", { ascending: false });
  const { data, error } = user.role === "admin" ? await query : await query.eq("agent_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
