// Prometheus metrics registry (singleton across hot reloads). Bonus R20.
import "server-only";
import client from "prom-client";

interface MetricsBundle {
  registry: client.Registry;
  activeSessions: client.Gauge;
  connectedParticipants: client.Gauge;
  liveRooms: client.Gauge;
  errors: client.Counter;
}

const g = globalThis as unknown as { __clarivueMetrics?: MetricsBundle };

export function metrics(): MetricsBundle {
  if (!g.__clarivueMetrics) {
    const registry = new client.Registry();
    registry.setDefaultLabels({ app: "clarivue" });
    client.collectDefaultMetrics({ register: registry });

    const activeSessions = new client.Gauge({
      name: "clarivue_active_sessions",
      help: "Sessions currently marked active",
      registers: [registry],
    });
    const connectedParticipants = new client.Gauge({
      name: "clarivue_connected_participants",
      help: "Participants currently connected across all live rooms",
      registers: [registry],
    });
    const liveRooms = new client.Gauge({
      name: "clarivue_live_rooms",
      help: "Live LiveKit rooms",
      registers: [registry],
    });
    const errors = new client.Counter({
      name: "clarivue_errors_total",
      help: "Total handled application errors",
      registers: [registry],
    });

    g.__clarivueMetrics = { registry, activeSessions, connectedParticipants, liveRooms, errors };
  }
  return g.__clarivueMetrics;
}

export function recordError(): void {
  try {
    metrics().errors.inc();
  } catch {
    /* never throw from metrics */
  }
}
