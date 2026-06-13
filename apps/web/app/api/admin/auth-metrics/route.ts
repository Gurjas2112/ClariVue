// Admin auth metrics — real user authentication data for the ops dashboard.
// Queries profiles (role/count) and auth.users (confirmation status) via the
// service-role client. Admin-only; polled by the dashboard every 30s.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export interface AuthMetrics {
  totalUsers: number;
  totalAgents: number;
  totalAdmins: number;
  confirmedUsers: number;
  unconfirmedUsers: number;
  signupsLast7d: number;
  signupsLast30d: number;
  totalSessions: number;
  activeSessions: number;
  endedSessions: number;
  recentUsers: {
    id: string;
    email: string;
    role: string;
    confirmed: boolean;
    created_at: string;
  }[];
}

export async function GET() {
  const user = await getAuthedUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Fetch all profiles (agents + admins)
  const { data: profiles, count: profileCount } = await admin
    .from("profiles")
    .select("id, email, role, created_at", { count: "exact" });

  const allProfiles = profiles ?? [];
  const totalUsers = profileCount ?? allProfiles.length;
  const totalAgents = allProfiles.filter((p) => p.role === "agent").length;
  const totalAdmins = allProfiles.filter((p) => p.role === "admin").length;

  // Calculate signups over time windows
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const signupsLast7d = allProfiles.filter((p) => p.created_at && p.created_at >= d7).length;
  const signupsLast30d = allProfiles.filter((p) => p.created_at && p.created_at >= d30).length;

  // Fetch confirmed/unconfirmed from auth.users via the admin API
  // The service-role client can list auth users
  let confirmedUsers = 0;
  let unconfirmedUsers = 0;
  const confirmedMap = new Map<string, boolean>();

  try {
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUsers = authData?.users ?? [];
    confirmedUsers = authUsers.filter((u) => u.email_confirmed_at).length;
    unconfirmedUsers = authUsers.filter((u) => !u.email_confirmed_at).length;
    authUsers.forEach((u) => {
      confirmedMap.set(u.id, !!u.email_confirmed_at);
    });
  } catch {
    // If auth admin API fails, estimate from profiles
    confirmedUsers = totalUsers;
    unconfirmedUsers = 0;
  }

  // Session stats
  const { count: totalSessionCount } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true });

  const { count: activeSessionCount } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const totalSessions = totalSessionCount ?? 0;
  const activeSessions = activeSessionCount ?? 0;
  const endedSessions = totalSessions - activeSessions;

  // Recent users (last 15, newest first)
  const recentUsers = allProfiles
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      email: p.email,
      role: p.role,
      confirmed: confirmedMap.get(p.id) ?? true,
      created_at: p.created_at ?? new Date().toISOString(),
    }));

  const metrics: AuthMetrics = {
    totalUsers,
    totalAgents,
    totalAdmins,
    confirmedUsers,
    unconfirmedUsers,
    signupsLast7d,
    signupsLast30d,
    totalSessions,
    activeSessions,
    endedSessions,
    recentUsers,
  };

  return NextResponse.json(metrics, { headers: { "Cache-Control": "no-store" } });
}
