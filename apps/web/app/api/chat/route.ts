// In-call chat persistence (R11, R12). Real-time delivery rides the LiveKit data
// channel; this route durably records messages and serves history after the call.
import { NextResponse } from "next/server";
import { canAccessSession } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidate, K } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    sessionId?: string;
    inviteId?: string;
    body?: string;
    senderIdentity?: string;
    senderRole?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const text = (body.body ?? "").trim();
  if (!body.sessionId || !text) {
    return NextResponse.json({ error: "Missing sessionId or body" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  const access = await canAccessSession({ sessionId: body.sessionId, inviteId: body.inviteId });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_messages")
    .insert({
      session_id: body.sessionId,
      sender_identity: (body.senderIdentity ?? "unknown").slice(0, 80),
      sender_role: access.role,
      body: text,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await invalidate(K.chat(body.sessionId));
  return NextResponse.json({ message: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const inviteId = url.searchParams.get("invite") ?? undefined;
  if (!sessionId) return NextResponse.json({ error: "Missing session" }, { status: 400 });

  const access = await canAccessSession({ sessionId, inviteId });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
