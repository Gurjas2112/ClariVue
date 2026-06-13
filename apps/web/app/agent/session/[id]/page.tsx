import { redirect, notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById } from "@/lib/sessions";
import { AgentSessionClient } from "@/components/agent/AgentSessionClient";

export const dynamic = "force-dynamic";

export default async function AgentSessionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getAuthedUser();
  if (!user) redirect(`/login?redirect=/agent/session/${id}`);

  const session = await getSessionById(id);
  if (!session) notFound();
  if (user.role !== "admin" && session.agent_id !== user.id) redirect("/agent/dashboard");

  return (
    <AgentSessionClient
      sessionId={session.id}
      sessionTitle={session.title ?? "Support session"}
      status={session.status}
      identity={`agent-${user.id}`}
      name={user.email}
    />
  );
}
