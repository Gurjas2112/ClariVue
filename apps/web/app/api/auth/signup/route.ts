// Agent signup. Sends a confirmation email via Supabase Auth (custom Gmail SMTP).
// The user clicks the link → /auth/callback exchanges the code → session starts.
// Also creates a profiles row via the service key so the profile exists once confirmed.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();

  // Standard signup — sends a confirmation email via the configured SMTP.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      data: { role: "agent" },
    },
  });

  if (error) {
    const msg = /already.*registered|exists/i.test(error.message)
      ? "An account with this email already exists. Try signing in."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Mirror the profile row (id ↔ auth.users) using the admin client.
  // The profile will be ready when the user confirms their email.
  if (data.user) {
    const admin = createAdminClient();
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id: data.user.id, email, role: "agent" }, { onConflict: "id" });
    if (pErr) {
      console.error("Profile creation error:", pErr.message);
      // Don't fail the signup — profile can be created on first login too.
    }
  }

  // Check if Supabase returned an existing unconfirmed user (identities array is empty)
  const alreadyExists = data.user && data.user.identities && data.user.identities.length === 0;
  if (alreadyExists) {
    return NextResponse.json(
      { error: "An account with this email already exists. Try signing in." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: true, confirmationSent: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
