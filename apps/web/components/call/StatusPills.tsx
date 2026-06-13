"use client";

// Top-right status: live timer + participant count (+ recording pill slot).
import { useEffect, useState } from "react";
import { useParticipants } from "@livekit/components-react";
import { Users, Radio } from "lucide-react";

export function StatusPills({ recordingSlot }: { recordingSlot?: React.ReactNode }) {
  const participants = useParticipants();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="flex items-center gap-2">
      <span className="pill">
        <Radio size={12} className="text-[var(--success)]" /> {mm}:{ss}
      </span>
      <span className="pill">
        <Users size={12} /> {participants.length}
      </span>
      {recordingSlot}
    </div>
  );
}
