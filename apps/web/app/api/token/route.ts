// LiveKit token minting — THE enforcement point for roles (R13–R15).
//   • Agent path:    authenticated owner/admin of the session → roomAdmin grants.
//   • Customer path: valid, active invite only → join + publish/subscribe, no admin.
// Never cached; per-user and security-sensitive.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById, getSessionByInvite } from "@/lib/sessions";
import { mintToken } from "@/lib/livekit/token";

export const dynamic = "force-dynamic";

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}

export async function POST(request: Request) {
  let body: { sessionId?: string; inviteId?: string; name?: string; clientId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const user = await getAuthedUser();
  const noStore = { "Cache-Control": "no-store" };

  // ── Agent path ──────────────────────────────────────────────────────────
  if (user && body.sessionId) {
    const session = await getSessionById(body.sessionId);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (user.role !== "admin" && session.agent_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (session.status !== "active") {
      return NextResponse.json({ error: "Session has ended" }, { status: 403 });
    }

    const token = await mintToken({
      room: session.room_name,
      identity: `agent-${user.id}`,
      name: user.email || "Agent",
      isAgent: true,
    });
    return NextResponse.json(
      {
        token,
        url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
        room: session.room_name,
        sessionId: session.id,
        role: "agent",
      },
      { headers: noStore },
    );
  }

  // ── Customer path ───────────────────────────────────────────────────────
  if (body.inviteId) {
    const session = await getSessionByInvite(body.inviteId);
    if (!session || session.status !== "active") {
      return NextResponse.json({ error: "This invite isn't valid anymore" }, { status: 403 });
    }
    const name = (body.name || "Customer").trim().slice(0, 60);
    const clientId = sanitize(body.clientId || Math.random().toString(36).slice(2));

    const token = await mintToken({
      room: session.room_name,
      identity: `customer-${clientId}`,
      name,
      isAgent: false,
    });
    return NextResponse.json(
      {
        token,
        url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
        room: session.room_name,
        sessionId: session.id,
        role: "customer",
      },
      { headers: noStore },
    );
  }

  return NextResponse.json({ error: "Missing sessionId or inviteId" }, { status: 400 });
}
