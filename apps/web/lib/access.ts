// Shared authorization for session-scoped customer/agent actions (chat, files).
// An agent reaches a session via auth+ownership; a customer via a valid, active
// invite that maps to that exact session. Anyone else is denied.
import "server-only";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById, getSessionByInvite } from "@/lib/sessions";
import type { Role, Session } from "@/lib/types";

export interface SessionAccess {
  session: Session;
  role: Role;
}

export async function canAccessSession(args: {
  sessionId: string;
  inviteId?: string;
}): Promise<SessionAccess | null> {
  const session = await getSessionById(args.sessionId);
  if (!session) return null;

  const user = await getAuthedUser();
  if (user && (user.role === "admin" || session.agent_id === user.id)) {
    return { session, role: user.role };
  }

  if (args.inviteId) {
    const byInvite = await getSessionByInvite(args.inviteId);
    if (byInvite && byInvite.id === session.id && byInvite.status === "active") {
      return { session, role: "customer" };
    }
  }

  return null;
}
