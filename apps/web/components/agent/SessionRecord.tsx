"use client";

// Post-call record: participants, event log, chat transcript, shared files, recording.
// Proves history/chat are retrievable after the call ends (R5, R12, R16, R17).
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, FileText, Download, Loader2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import type { ChatMessage, Recording, SessionEvent, SessionParticipant, SharedFile } from "@/lib/types";

interface RecordData {
  participants: SessionParticipant[];
  events: SessionEvent[];
  messages: ChatMessage[];
  files: SharedFile[];
  recordings: Recording[];
}

export function SessionRecord({ sessionId, title }: { sessionId: string; title: string }) {
  const [data, setData] = useState<RecordData | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData({ participants: [], events: [], messages: [], files: [], recordings: [] }));
  }, [sessionId]);

  return (
    <>
      <TopBar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/agent/dashboard" className="text-sm text-fg-muted hover:text-fg inline-flex items-center gap-1.5 mb-4 sm:mb-5">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
          <h1 className="text-xl sm:text-2xl font-medium tracking-tight">{title}</h1>
          <span className="pill w-fit">ended</span>
        </div>
        <p className="text-fg-muted text-sm mb-6 sm:mb-8">Session record · everything from this call.</p>

        {!data ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="animate-spin text-accent" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-5">
            <RecordingCard recordings={data.recordings} />

            <Card title={`Participants (${data.participants.length})`}>
              {data.participants.length === 0 ? (
                <Empty>No participants recorded.</Empty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.participants.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="capitalize font-medium">{p.display_name || p.identity}</span>
                        <span className="pill">{p.role}</span>
                      </span>
                      <span className="text-fg-subtle inline-flex items-center gap-1.5">
                        <Clock size={12} /> {new Date(p.joined_at).toLocaleTimeString()}
                        {p.reconnect_count > 0 && (
                          <span className="text-amber"> · {p.reconnect_count} reconnect</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`Chat transcript (${data.messages.length})`}>
              {data.messages.length === 0 ? (
                <Empty>No messages were exchanged.</Empty>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto">
                  {data.messages.map((m) => (
                    <div key={m.id} className="text-sm">
                      <span className="text-fg-subtle capitalize mr-2">{m.sender_role}:</span>
                      <span>{m.body}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title={`Shared files (${data.files.length})`}>
              {data.files.length === 0 ? (
                <Empty>No files were shared.</Empty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.files.map((f) => (
                    <li key={f.id}>
                      <a
                        href={`/api/files/${f.id}/download`}
                        className="flex items-center gap-2 text-sm text-accent hover:underline"
                      >
                        <FileText size={15} /> {f.file_name} <Download size={13} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`Event log (${data.events.length})`} wide>
              {data.events.length === 0 ? (
                <Empty>No events recorded.</Empty>
              ) : (
                <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                  {data.events.map((e) => (
                    <li key={e.id} className="text-sm flex items-center gap-2">
                      <span className="text-fg-subtle font-mono text-xs">
                        {new Date(e.created_at).toLocaleTimeString()}
                      </span>
                      <span className="pill">{e.type}</span>
                      {e.identity && <span className="text-fg-muted">{e.identity}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </main>
    </>
  );
}

function RecordingCard({ recordings }: { recordings: Recording[] }) {
  const latest = recordings[0];
  return (
    <Card title="Recording">
      {!latest ? (
        <Empty>This session was not recorded.</Empty>
      ) : latest.status === "ready" ? (
        <a href={`/api/recordings/${latest.id}/download`} className="btn btn-primary">
          <Download size={16} /> Download MP4
        </a>
      ) : (
        <span className="pill">
          {latest.status === "in_progress" ? "Recording…" : latest.status === "processing" ? "Processing…" : latest.status}
        </span>
      )}
    </Card>
  );
}

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`card p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="font-medium mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-fg-subtle">{children}</p>;
}
