"use client";

// Agent-only recording control (R16). Start/stop egress + live status pill that
// transitions ● Recording → Processing… → ✓ Ready (download).
import { useState } from "react";
import useSWR from "swr";
import { Circle, Square, Loader2, Download } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { Recording } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function RecordingControl({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const { data, mutate } = useSWR<{ recording: Recording | null }>(
    `/api/recordings?session=${sessionId}`,
    fetcher,
    { refreshInterval: 4000 },
  );
  const rec = data?.recording ?? null;
  const isRecording = rec?.status === "in_progress";

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (isRecording) {
        const res = await fetch("/api/recordings/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordingId: rec!.id }),
        });
        if (!res.ok) throw new Error();
        toast("Recording stopped — processing", "info");
      } else {
        const res = await fetch("/api/recordings/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not start recording");
        toast("Recording started", "success");
      }
      mutate();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Recording action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {rec && rec.status !== "in_progress" && (
        <span className="pill">
          {rec.status === "processing" ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Processing…
            </>
          ) : rec.status === "ready" ? (
            <a
              href={`/api/recordings/${rec.id}/download`}
              className="inline-flex items-center gap-1.5 text-[var(--success)]"
            >
              <Download size={12} /> Recording ready
            </a>
          ) : (
            rec.status
          )}
        </span>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title={isRecording ? "Stop recording" : "Start recording"}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
        className={`grid place-items-center h-12 px-4 rounded-full border transition-all gap-2 text-sm font-medium disabled:opacity-50 ${
          isRecording
            ? "bg-[var(--danger)] border-transparent text-white"
            : "bg-white/10 border-panel-border text-fg hover:bg-white/15"
        }`}
    >
      {busy ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isRecording ? (
        <>
          <Square size={15} /> Stop
        </>
      ) : (
        <>
          <Circle size={15} className="text-[var(--danger)] fill-[var(--danger)]" /> Record
        </>
      )}
      </button>
    </div>
  );
}
