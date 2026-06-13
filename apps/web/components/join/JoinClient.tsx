"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Video, Loader2, Mic, Camera, ShieldAlert } from "lucide-react";
import { CallRoom } from "@/components/call/CallRoom";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Phase = "loading" | "invalid" | "prelobby" | "incall" | "left";

function getClientId(inviteId: string): string {
  const key = `clarivue:cid:${inviteId}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 24);
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function JoinClient({ inviteId }: { inviteId: string }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [title, setTitle] = useState("Support session");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [conn, setConn] = useState<{
    token: string;
    url: string;
    identity: string;
    sessionId: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/invite/${inviteId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.valid) {
          setTitle(j.title);
          setPhase("prelobby");
        } else {
          setPhase("invalid");
        }
      })
      .catch(() => setPhase("invalid"));
  }, [inviteId]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    try {
      // Pre-acquire camera + mic permissions BEFORE connecting to LiveKit.
      // This forces the browser permission dialog to appear clearly.
      // Without this, LiveKitRoom's internal getUserMedia can silently fail
      // on some browsers (especially mobile), leaving the user with no media.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        // Release the tracks immediately — LiveKit will re-acquire them.
        stream.getTracks().forEach((t) => t.stop());
      } catch (mediaErr) {
        // If camera fails, try audio-only (user might not have a camera)
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getTracks().forEach((t) => t.stop());
          toast("Camera not available — joining with audio only", "info");
        } catch {
          toast("Please allow camera and microphone access to join the call", "error");
          setJoining(false);
          return;
        }
      }

      const clientId = getClientId(inviteId);
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, name: name.trim(), clientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not join the call");
      setConn({
        token: json.token,
        url: json.url,
        identity: `customer-${clientId}`,
        sessionId: json.sessionId,
      });
      setPhase("incall");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not join", "error");
      setJoining(false);
    }
  }

  // ── Invalid / expired invite ───────────────────────────────────────────
  if (phase === "invalid") {
    return (
      <Shell>
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-danger/12 text-danger mx-auto mb-5">
          <ShieldAlert size={24} />
        </span>
        <h1 className="text-xl font-medium">This invite isn&apos;t valid anymore</h1>
        <p className="text-fg-muted text-sm mt-2">
          The session may have ended or the link is incorrect. Please ask your agent for a new invite.
        </p>
        <Link href="/" className="btn btn-ghost mt-6">
          Go home
        </Link>
      </Shell>
    );
  }

  if (phase === "left") {
    return (
      <Shell>
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-accent/12 text-accent mx-auto mb-5">
          <Video size={24} />
        </span>
        <h1 className="text-xl font-medium">You&apos;ve left the call</h1>
        <p className="text-fg-muted text-sm mt-2">Thanks for using ClariVue. You can close this tab.</p>
        <button type="button" onClick={() => setPhase("prelobby")} className="btn btn-ghost mt-6">
          Rejoin
        </button>
      </Shell>
    );
  }

  if (phase === "loading") {
    return (
      <Shell>
        <Loader2 className="animate-spin text-accent mx-auto" />
        <p className="text-fg-muted text-sm mt-3">Checking your invite…</p>
      </Shell>
    );
  }

  if (phase === "incall" && conn) {
    return (
      <CallRoom
        token={conn.token}
        serverUrl={conn.url}
        sessionId={conn.sessionId}
        inviteId={inviteId}
        role="customer"
        senderIdentity={conn.identity}
        senderName={name.trim()}
        sessionTitle={title}
        onLeave={() => {
          setConn(null);
          setPhase("left");
        }}
      />
    );
  }

  // ── Pre-lobby (name + permissions note) ────────────────────────────────
  return (
    <Shell>
      <span className="grid place-items-center w-12 h-12 rounded-xl bg-accent/15 text-accent mx-auto mb-5">
        <Video size={22} />
      </span>
      <h1 className="text-xl font-medium">Join the call</h1>
      <p className="text-fg-muted text-sm mt-1.5 mb-6">
        You&apos;re joining <span className="text-fg">{title}</span>. No account needed.
      </p>

      <form onSubmit={join} className="flex flex-col gap-3 text-left">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-fg-muted">Your name</span>
          <input
            autoFocus
            className="field"
            placeholder="e.g. Jordan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </label>
        <Button type="submit" loading={joining} disabled={!name.trim()} className="w-full mt-1">
          Join the call
        </Button>
      </form>

      <p className="text-xs text-fg-subtle mt-5 flex items-center justify-center gap-3">
        <span className="inline-flex items-center gap-1">
          <Camera size={13} /> Camera
        </span>
        <span className="inline-flex items-center gap-1">
          <Mic size={13} /> Microphone
        </span>
        <span>· your browser will ask permission</span>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 grid place-items-center px-4 py-16">
      <div className="card w-full max-w-md p-8 text-center">{children}</div>
    </main>
  );
}
