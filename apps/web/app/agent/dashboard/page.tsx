import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/TopBar";
import { DashboardClient } from "@/components/agent/DashboardClient";
import type { Session } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AgentDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Security boundary: never render agent tools without a verified user.
  if (!user) redirect("/login?redirect=/agent/dashboard");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: sessions } = await admin
    .from("sessions")
    .select("*")
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar email={user.email} showAdmin={profile?.role === "admin"} />
      <DashboardClient initialSessions={(sessions ?? []) as Session[]} />
    </>
  );
}
