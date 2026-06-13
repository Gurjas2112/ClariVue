// Auth callback handler — Supabase redirects here after email confirmation.
// Handles BOTH the PKCE code exchange AND the token_hash+type OTP verification
// flow that Supabase uses for email confirmations (the email template can send
// either format depending on the project's auth config).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "email"
    | "signup"
    | "recovery"
    | "invite"
    | "magiclink"
    | null;
  const next = searchParams.get("next") ?? "/agent/dashboard";

  const supabase = await createClient();

  // Path 1: PKCE code exchange (OAuth, magic-link, or PKCE-enabled email confirm)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // If code exchange fails, fall through to try token_hash or show error.
  }

  // Path 2: Token-hash OTP verification (default Supabase email confirmation)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If nothing worked, redirect to login with an error hint.
  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
