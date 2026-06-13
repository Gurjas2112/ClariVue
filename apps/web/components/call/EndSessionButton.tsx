"use client";

import { useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { PhoneOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Agent-only: ends the session for everyone (closes the LiveKit room server-side).
export function EndSessionButton({
  sessionId,
  onEnded,
}: {
  sessionId: string;
  onEnded: () => void;
}) {
  const room = useRoomContext();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function end() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to end session");
      await room.disconnect();
      onEnded();
    } catch {
      toast("Could not end the session", "error");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={end}
      disabled={busy}
      title="End session for everyone"
      className="grid place-items-center h-12 px-4 rounded-full bg-danger/15 border border-danger/30 text-danger hover:bg-danger/25 transition-all gap-2 text-sm font-medium disabled:opacity-50"
    >
      <PhoneOff size={17} /> End session
    </button>
  );
}
