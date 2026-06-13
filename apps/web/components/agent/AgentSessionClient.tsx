"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { CallRoom } from "@/components/call/CallRoom";
import { EndSessionButton } from "@/components/call/EndSessionButton";
import { RecordingControl } from "@/components/call/RecordingControl";
import { SessionRecord } from "@/components/agent/SessionRecord";
import { useToast } from "@/components/ui/Toast";
import type { SessionStatus } from "@/lib/types";

interface Props {
  sessionId: string;
  sessionTitle: string;
  status: SessionStatus;
  identity: string;
  name: string;
}

export function AgentSessionClient({ sessionId, sessionTitle, status, identity, name }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [ended, setEnded] = useState(status === "ended");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ended) return;
    let cancelled = false;

    async function connectToSession() {
      // Best-effort: pre-acquire camera + mic permissions to trigger the
      // browser dialog. If denied, proceed anyway — user can enable from control bar.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getTracks().forEach((t) => t.stop());
        } catch {
          // Both denied — warn but don't block joining
          toast("Camera and microphone blocked — you can enable them from the control bar", "info");
        }
      }

      try {
        const r = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Could not join");
        if (!cancelled) setConn({ token: json.token, url: json.url });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not join");
      }
    }

    connectToSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId, ended]);

  function leave() {
    router.push("/agent/dashboard");
    router.refresh();
  }

  if (ended) return <SessionRecord sessionId={sessionId} title={sessionTitle} />;

  if (error) {
    return (
      <Centered>
        <p className="text-fg-muted">{error}</p>
        <Link href="/agent/dashboard" className="btn btn-ghost mt-4">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
      </Centered>
    );
  }

  if (!conn) {
    return (
      <Centered>
        <Loader2 className="animate-spin text-accent" />
        <p className="text-fg-muted mt-3">Connecting to the session…</p>
      </Centered>
    );
  }

  return (
    <CallRoom
      token={conn.token}
      serverUrl={conn.url}
      sessionId={sessionId}
      role="agent"
      senderIdentity={identity}
      senderName={name}
      sessionTitle={sessionTitle}
      onLeave={leave}
      agentControls={
        <>
          <RecordingControl sessionId={sessionId} />
          <EndSessionButton
            sessionId={sessionId}
            onEnded={() => {
              toast("Session ended", "success");
              setEnded(true);
            }}
          />
        </>
      }
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 grid place-items-center px-4 text-center">{children}</main>;
}
