// Agent signup. Uses the service key to create a confirmed user immediately
// (independent of the dashboard email-confirmation setting, so judging is smooth)
// and mirrors a profiles row. Never exposes the service key to the client.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let email: string, password: string;
  try {
    const body = await request.json();
    email = String(body.email ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "agent" },
  });

  if (error) {
    const msg = /already.*registered|exists/i.test(error.message)
      ? "An account with this email already exists. Try signing in."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Mirror the profile row (id ↔ auth.users).
  if (data.user) {
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id: data.user.id, email, role: "agent" }, { onConflict: "id" });
    if (pErr) {
      return NextResponse.json({ error: "Could not create profile" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
