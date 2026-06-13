"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function TopBar({ email, showAdmin }: { email?: string; showAdmin?: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-panel-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/agent/dashboard" className="flex items-center gap-2">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-accent/15 text-accent">
            <Video size={16} />
          </span>
          <span className="font-medium tracking-tight">ClariVue</span>
        </Link>
        <div className="flex items-center gap-4">
          {showAdmin && (
            <Link href="/admin" className="text-sm text-fg-muted hover:text-fg">
              Admin
            </Link>
          )}
          {email && <span className="text-sm text-fg-subtle hidden sm:inline">{email}</span>}
          <button
            onClick={signOut}
            className="btn btn-ghost px-3 py-1.5 text-sm"
            aria-label="Sign out"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
