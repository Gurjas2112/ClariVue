"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Video, Clock, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { InviteModal } from "@/components/agent/InviteModal";
import type { Session } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmtDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DashboardClient({ initialSessions }: { initialSessions: Session[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<{ session: Session; url: string } | null>(null);

  const { data, mutate } = useSWR<{ sessions: Session[] }>("/api/sessions", fetcher, {
    fallbackData: { sessions: initialSessions },
    refreshInterval: 10000,
  });
  const sessions = data?.sessions ?? [];

  // Live updates without polling churn.
  useEffect(() => {
    const ch = supabase
      .channel("dash-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => mutate())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, mutate]);

  async function startSession() {
    setCreating(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Support session" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start session");
      mutate();
      const url = `${window.location.origin}/join/${json.session.invite_id}`;
      setInvite({ session: json.session, url });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start session", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Support sessions</h1>
          <p className="text-fg-muted text-sm mt-1">
            Start a session, then share the invite link with your customer.
          </p>
        </div>
        <Button onClick={startSession} loading={creating} className="px-5 py-3">
          <Plus size={17} /> Start support session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-accent/12 text-accent mx-auto mb-5">
            <Video size={24} />
          </span>
          <h2 className="text-lg font-medium">No sessions yet</h2>
          <p className="text-fg-muted text-sm mt-1.5 max-w-sm mx-auto">
            Start your first support session and invite a customer to join from their browser —
            no install needed.
          </p>
          <Button onClick={startSession} loading={creating} className="mt-6">
            <Plus size={16} /> Start support session
          </Button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-subtle border-b border-panel-border">
                <th className="font-medium px-5 py-3">Session</th>
                <th className="font-medium px-5 py-3">Started</th>
                <th className="font-medium px-5 py-3">Duration</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-panel-border last:border-0">
                  <td className="px-5 py-4 font-medium">{s.title || "Support session"}</td>
                  <td className="px-5 py-4 text-fg-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock size={13} /> {new Date(s.created_at).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-fg-muted">{fmtDuration(s.created_at, s.ended_at)}</td>
                  <td className="px-5 py-4">
                    {s.status === "active" ? (
                      <span className="pill text-[var(--success)]">
                        <Radio size={12} /> active
                      </span>
                    ) : (
                      <span className="pill">ended</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {s.status === "active" && (
                        <button
                          className="btn btn-ghost px-3 py-1.5 text-sm"
                          onClick={() =>
                            setInvite({
                              session: s,
                              url: `${window.location.origin}/join/${s.invite_id}`,
                            })
                          }
                        >
                          Invite link
                        </button>
                      )}
                      <button
                        className="btn btn-primary px-3 py-1.5 text-sm"
                        onClick={() => router.push(`/agent/session/${s.id}`)}
                      >
                        {s.status === "active" ? "Open" : "View record"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invite && (
        <InviteModal
          url={invite.url}
          onClose={() => setInvite(null)}
          onOpen={() => router.push(`/agent/session/${invite.session.id}`)}
        />
      )}
    </main>
  );
}
