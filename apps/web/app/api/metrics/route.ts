// Prometheus exposition (R20). Standard text format scrapable by Prometheus/Grafana.
// LiveKit also exposes its own /metrics; this adds app-level signals.
import { metrics } from "@/lib/metrics";
import { roomService } from "@/lib/livekit/roomService";
import { createAdminClient } from "@/lib/supabase/admin";
import { cached, K } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = metrics();

  try {
    const snapshot = await cached(K.metrics(), 10, async () => {
      const admin = createAdminClient();
      const [{ count }, rooms] = await Promise.all([
        admin.from("sessions").select("*", { count: "exact", head: true }).eq("status", "active"),
        roomService().listRooms().catch(() => []),
      ]);
      const participants = rooms.reduce((sum, r) => sum + (r.numParticipants ?? 0), 0);
      return { activeSessions: count ?? 0, liveRooms: rooms.length, participants };
    });

    m.activeSessions.set(snapshot.activeSessions);
    m.liveRooms.set(snapshot.liveRooms);
    m.connectedParticipants.set(snapshot.participants);
  } catch {
    m.errors.inc();
  }

  const body = await m.registry.metrics();
  return new Response(body, {
    headers: { "Content-Type": m.registry.contentType, "Cache-Control": "no-store" },
  });
}
