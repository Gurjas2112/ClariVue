"use client";

// Ops dashboard (R19): live sessions with participants + duration, force-end any
// session, and session history. Polls the live snapshot (server caches it 5s).
import { useState } from "react";
import useSWR from "swr";
import { Users, Clock, Radio, Square, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { Session } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface LiveRoom {
  room: string;
  sessionId: string;
  title: string;
  createdAt: string | null;
  numParticipants: number;
  participants: { identity: string; name: string; role: string; joinedAt: number }[];
}

function since(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function AdminClient({ initialHistory }: { initialHistory: Session[] }) {
  const { toast } = useToast();
  const { data: liveData, mutate: mutateLive } = useSWR<{ live: LiveRoom[] }>(
    "/api/admin/live",
    fetcher,
    { refreshInterval: 3000 },
  );
  const { data: histData, mutate: mutateHist } = useSWR<{ sessions: Session[] }>(
    "/api/sessions",
    fetcher,
    { fallbackData: { sessions: initialHistory }, refreshInterval: 10000 },
  );

  const live = liveData?.live ?? [];
  const history = histData?.sessions ?? [];
  const [ending, setEnding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function forceEnd(sessionId: string) {
    if (!confirm("Force-end this session for everyone?")) return;
    setEnding(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast("Session ended", "success");
      mutateLive();
      mutateHist();
    } catch {
      toast("Could not end session", "error");
    } finally {
      setEnding(null);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Delete this session and all its data? This cannot be undone.")) return;
    setDeleting(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/delete`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Session deleted", "success");
      mutateHist();
    } catch {
      toast("Could not delete session", "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-medium tracking-tight">Operations</h1>
      <p className="text-fg-muted text-sm mt-1 mb-8">Live sessions and full history.</p>

      <section className="mb-12">
        <h2 className="text-sm font-medium text-fg-muted mb-3 flex items-center gap-2">
          <span className="live-dot" /> Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <div className="card p-8 text-center text-fg-subtle text-sm">No live sessions right now.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {live.map((r) => (
              <div key={r.room} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className="font-medium truncate">{r.title}</span>
                  <span className="pill text-[var(--success)]">
                    <Radio size={11} /> live
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-fg-muted mb-4">
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={13} /> {r.numParticipants}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={13} /> {since(r.createdAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {r.participants.map((p) => (
                    <span key={p.identity} className="pill">
                      {p.name || p.role} · {p.role}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => forceEnd(r.sessionId)}
                  disabled={ending === r.sessionId}
                  className="btn btn-danger w-full text-sm py-2 disabled:opacity-50"
                >
                  <Square size={14} /> Force end
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-3">History ({history.length})</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-subtle border-b border-panel-border">
                <th className="font-medium px-5 py-3">Session</th>
                <th className="font-medium px-5 py-3">Started</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id} className="border-b border-panel-border last:border-0">
                  <td className="px-5 py-3.5 font-medium">{s.title || "Support session"}</td>
                  <td className="px-5 py-3.5 text-fg-muted">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <span className={`pill ${s.status === "active" ? "text-[var(--success)]" : ""}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {s.status === "ended" && (
                      <button
                        type="button"
                        className="btn btn-danger px-2 py-1.5 text-sm disabled:opacity-50"
                        title="Delete session"
                        disabled={deleting === s.id}
                        onClick={() => deleteSession(s.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
