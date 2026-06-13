import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/TopBar";
import { AdminClient } from "@/components/admin/AdminClient";
import type { Session } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login?redirect=/admin");
  if (user.role !== "admin") redirect("/agent/dashboard");

  const admin = createAdminClient();
  const { data: history } = await admin
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <TopBar email={user.email} showAdmin />
      <AdminClient initialHistory={(history ?? []) as Session[]} />
    </>
  );
}
