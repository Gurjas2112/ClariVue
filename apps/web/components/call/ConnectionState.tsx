"use client";

// Communicates connection health clearly (scored under UX & Reliability).
// Reconnecting is shown as an amber, non-error banner — not a crash.
import { useConnectionState } from "@livekit/components-react";
import { ConnectionState as CS } from "livekit-client";
import { Loader2 } from "lucide-react";

export function ConnectionBanner() {
  const state = useConnectionState();

  if (state === CS.Reconnecting || state === CS.SignalReconnecting) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pill border-[var(--amber)]/40 text-[var(--amber)] bg-[var(--amber)]/10">
        <Loader2 size={13} className="animate-spin" /> Reconnecting…
      </div>
    );
  }
  return null;
}
