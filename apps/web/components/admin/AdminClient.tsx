"use client";

// Ops dashboard (R19): live sessions with participants + duration, force-end any
// session, session history, AND real user authentication metrics (signups,
// confirmation status, role breakdown). Polls live snapshot (3s) and auth (30s).
import { useState } from "react";
import useSWR from "swr";
import {
  Users,
  Clock,
  Radio,
  Square,
  Trash2,
  UserPlus,
  Shield,
  ShieldCheck,
  Activity,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from "lucide-react";
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

interface AuthMetrics {
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

function since(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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
  const { data: authMetrics } = useSWR<AuthMetrics>(
    "/api/admin/auth-metrics",
    fetcher,
    { refreshInterval: 30000 },
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

  const confirmRate = authMetrics
    ? authMetrics.totalUsers > 0
      ? Math.round((authMetrics.confirmedUsers / (authMetrics.confirmedUsers + authMetrics.unconfirmedUsers)) * 100)
      : 0
    : null;

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="text-xl sm:text-2xl font-medium tracking-tight">Operations</h1>
      <p className="text-fg-muted text-sm mt-1 mb-6 sm:mb-8">Live sessions, user authentication metrics, and full history.</p>

      {/* ── Auth metrics section ──────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-sm font-medium text-fg-muted mb-4 flex items-center gap-2">
          <Shield size={14} /> User Authentication
        </h2>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            icon={<Users size={16} />}
            label="Total Users"
            value={authMetrics?.totalUsers}
            color="var(--accent)"
          />
          <StatCard
            icon={<ShieldCheck size={16} />}
            label="Agents"
            value={authMetrics?.totalAgents}
            color="var(--cyan)"
          />
          <StatCard
            icon={<Shield size={16} />}
            label="Admins"
            value={authMetrics?.totalAdmins}
            color="var(--amber)"
          />
          <StatCard
            icon={<UserPlus size={16} />}
            label="Signups (7d)"
            value={authMetrics?.signupsLast7d}
            color="var(--success)"
          />
          <StatCard
            icon={<CheckCircle2 size={16} />}
            label="Confirmed"
            value={confirmRate !== null ? `${confirmRate}%` : undefined}
            color="var(--success)"
          />
          <StatCard
            icon={<Activity size={16} />}
            label="Active Sessions"
            value={authMetrics?.activeSessions}
            color="var(--danger)"
          />
        </div>

        {/* Session stats bar */}
        {authMetrics && (
          <div className="card p-4 mb-6 flex flex-wrap items-center gap-6 text-sm">
            <span className="text-fg-muted flex items-center gap-1.5">
              <TrendingUp size={13} /> Signups (30d):
              <span className="text-fg font-medium">{authMetrics.signupsLast30d}</span>
            </span>
            <span className="text-fg-muted flex items-center gap-1.5">
              Total sessions:
              <span className="text-fg font-medium">{authMetrics.totalSessions}</span>
            </span>
            <span className="text-fg-muted flex items-center gap-1.5">
              Active:
              <span className="text-[var(--success)] font-medium">{authMetrics.activeSessions}</span>
            </span>
            <span className="text-fg-muted flex items-center gap-1.5">
              Ended:
              <span className="text-fg font-medium">{authMetrics.endedSessions}</span>
            </span>
            <span className="text-fg-muted flex items-center gap-1.5">
              Unconfirmed:
              <span className="text-[var(--amber)] font-medium">{authMetrics.unconfirmedUsers}</span>
            </span>
          </div>
        )}

        {/* Recent users table */}
        {authMetrics && authMetrics.recentUsers.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-panel-border">
              <span className="text-sm font-medium text-fg-muted">Recent Users</span>
            </div>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fg-subtle border-b border-panel-border">
                    <th className="font-medium px-4 sm:px-5 py-2.5">Email</th>
                    <th className="font-medium px-4 sm:px-5 py-2.5">Role</th>
                    <th className="font-medium px-4 sm:px-5 py-2.5 hidden sm:table-cell">Status</th>
                    <th className="font-medium px-4 sm:px-5 py-2.5 hidden md:table-cell">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {authMetrics.recentUsers.map((u) => (
                    <tr key={u.id} className="border-b border-panel-border last:border-0">
                      <td className="px-4 sm:px-5 py-3 font-medium truncate max-w-[200px]">{u.email}</td>
                      <td className="px-4 sm:px-5 py-3">
                        <span
                          className={`pill ${u.role === "admin" ? "text-[var(--amber)]" : "text-[var(--cyan)]"}`}
                        >
                          {u.role === "admin" ? <Shield size={11} /> : <ShieldCheck size={11} />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 hidden sm:table-cell">
                        <span
                          className={`pill ${u.confirmed ? "text-[var(--success)]" : "text-[var(--amber)]"}`}
                        >
                          {u.confirmed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          {u.confirmed ? "confirmed" : "pending"}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 text-fg-muted hidden md:table-cell">{timeAgo(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Live sessions section ─────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-sm font-medium text-fg-muted mb-3 flex items-center gap-2">
          <span className="live-dot" /> Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <div className="card p-8 text-center text-fg-subtle text-sm">No live sessions right now.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* ── History section ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-3">History ({history.length})</h2>
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fg-subtle border-b border-panel-border">
                  <th className="font-medium px-4 sm:px-5 py-3">Session</th>
                  <th className="font-medium px-4 sm:px-5 py-3 hidden sm:table-cell">Started</th>
                  <th className="font-medium px-4 sm:px-5 py-3">Status</th>
                  <th className="font-medium px-4 sm:px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} className="border-b border-panel-border last:border-0">
                    <td className="px-4 sm:px-5 py-3.5 font-medium">{s.title || "Support session"}</td>
                    <td className="px-4 sm:px-5 py-3.5 text-fg-muted hidden sm:table-cell">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-4 sm:px-5 py-3.5">
                      <span className={`pill ${s.status === "active" ? "text-[var(--success)]" : ""}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-5 py-3.5 text-right">
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
        </div>
      </section>
    </main>
  );
}

/* ── Stat card sub-component ─────────────────────────────────────────────── */
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number | string;
  color: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-2" id={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-2 text-fg-subtle text-xs">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <span className="text-xl font-semibold tracking-tight" style={{ color }}>
        {value ?? <span className="text-fg-subtle animate-pulse">—</span>}
      </span>
    </div>
  );
}
