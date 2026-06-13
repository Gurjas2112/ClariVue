// Auth callback handler — Supabase redirects here after email confirmation.
// Exchanges the auth code (PKCE) for a session, then redirects to the dashboard.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/agent/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If the code exchange fails or there's no code, redirect to login with an error hint.
  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
