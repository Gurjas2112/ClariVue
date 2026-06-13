import { JoinClient } from "@/components/join/JoinClient";

export const dynamic = "force-dynamic";

export default async function JoinPage(props: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await props.params;
  return <JoinClient inviteId={inviteId} />;
}
