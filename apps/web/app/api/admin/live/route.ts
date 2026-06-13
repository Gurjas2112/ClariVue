// Admin live snapshot (R19): LiveKit rooms merged with their session rows +
// connected participants. Cached 5s to keep dashboard polling cheap.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { roomService } from "@/lib/livekit/roomService";
import { createAdminClient } from "@/lib/supabase/admin";
import { cached, K } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthedUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const live = await cached(K.liveSessions(), 5, async () => {
    const rooms = await roomService().listRooms().catch(() => []);
    const admin = createAdminClient();

    const results = await Promise.all(
      rooms.map(async (room) => {
        const [{ data: session }, participants] = await Promise.all([
          admin.from("sessions").select("id, title, agent_id, created_at").eq("room_name", room.name).single(),
          roomService().listParticipants(room.name).catch(() => []),
        ]);
        return {
          room: room.name,
          sessionId: session?.id ?? null,
          title: session?.title ?? room.name,
          createdAt: session?.created_at ?? null,
          numParticipants: room.numParticipants ?? participants.length,
          participants: participants.map((p) => ({
            identity: p.identity,
            name: p.name,
            role: p.identity.startsWith("agent-") ? "agent" : "customer",
            joinedAt: Number(p.joinedAt),
          })),
        };
      }),
    );
    return results.filter((r) => r.sessionId);
  });

  return NextResponse.json({ live }, { headers: { "Cache-Control": "no-store" } });
}
