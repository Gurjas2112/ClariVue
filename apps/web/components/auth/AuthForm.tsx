"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Video, Mail, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const redirectTo = params.get("redirect") || "/agent/dashboard";
  const isSignup = mode === "signup";
  const error = params.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Sign up failed");

        // Email confirmation required — show the "check your email" screen.
        if (json.confirmationSent) {
          setConfirmationSent(true);
          setLoading(false);
          return;
        }
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);

      toast(isSignup ? "Welcome to ClariVue" : "Signed in", "success");
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
      setLoading(false);
    }
  }

  // ── Confirmation sent screen ──────────────────────────────────────────
  if (confirmationSent) {
    return (
      <main className="flex-1 grid place-items-center px-4 py-16">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-5 grid place-items-center w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-400">
            <CheckCircle size={28} />
          </div>
          <h1 className="text-2xl font-medium tracking-tight mb-2">Check your email</h1>
          <p className="text-[var(--fg-muted)] text-sm mb-6 leading-relaxed">
            We&apos;ve sent a confirmation link to{" "}
            <span className="text-[var(--fg)] font-medium">{email}</span>.
            <br />
            Click the link in the email to activate your account, then come back and sign in.
          </p>
          <div className="flex items-center gap-2 justify-center text-xs text-[var(--fg-muted)] mb-6">
            <Mail size={14} />
            <span>Sent from ClariVue via Gmail</span>
          </div>
          <Link href="/login">
            <Button className="w-full">Go to sign in</Button>
          </Link>
        </div>
      </main>
    );
  }

  // ── Auth form ──────────────────────────────────────────────────────────
  return (
    <main className="flex-1 grid place-items-center px-4 py-16">
      <div className="card w-full max-w-md p-8">
        <Link href="/" className="inline-flex items-center gap-2 mb-7">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Video size={18} />
          </span>
          <span className="text-lg font-medium tracking-tight">ClariVue</span>
        </Link>

        <h1 className="text-2xl font-medium tracking-tight mb-1">
          {isSignup ? "Create your agent account" : "Agent sign in"}
        </h1>
        <p className="text-[var(--fg-muted)] text-sm mb-7">
          {isSignup
            ? "Set up support sessions and invite customers in one tap."
            : "Sign in to create and run support sessions."}
        </p>

        {error === "confirmation_failed" && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            Email confirmation failed or expired. Please try signing up again.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[var(--fg-muted)]">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              className="field"
              placeholder="agent@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[var(--fg-muted)]">Password</span>
            <input
              type="password"
              required
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {!isSignup && (
            <div className="flex flex-col gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setEmail("admin@clarivue.demo");
                  setPassword("clarivue123");
                }}
                className="text-xs text-left p-2.5 rounded-lg border border-dashed border-[var(--accent)]/30 hover:border-[var(--accent)] bg-[var(--accent)]/5 hover:bg-[var(--accent)]/10 text-[var(--accent)] transition-all cursor-pointer"
              >
                <div className="font-semibold text-white mb-0.5">⚡ Auto-fill Admin Credentials</div>
                <div className="text-[var(--fg-muted)] font-mono">
                  admin@clarivue.demo / clarivue123
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail("agent@clarivue.demo");
                  setPassword("clarivue123");
                }}
                className="text-xs text-left p-2.5 rounded-lg border border-dashed border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 transition-all cursor-pointer"
              >
                <div className="font-semibold text-white mb-0.5">⚡ Auto-fill Agent Credentials</div>
                <div className="text-[var(--fg-muted)] font-mono">
                  agent@clarivue.demo / clarivue123
                </div>
              </button>
            </div>
          )}

          <Button type="submit" loading={loading} className="mt-2 w-full">
            {isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="text-sm text-[var(--fg-muted)] mt-6 text-center">
          {isSignup ? "Already have an account? " : "Need an account? "}
          <Link
            href={isSignup ? "/login" : "/signup"}
            className="text-[var(--accent)] hover:underline"
          >
            {isSignup ? "Sign in" : "Sign up"}
          </Link>
        </p>
      </div>
    </main>
  );
}
