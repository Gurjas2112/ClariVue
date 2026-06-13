"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Video } from "lucide-react";
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

  const redirectTo = params.get("redirect") || "/agent/dashboard";
  const isSignup = mode === "signup";

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
