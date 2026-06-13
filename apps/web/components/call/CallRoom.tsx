"use client";

// The in-call experience. Wraps LiveKitRoom (SFU-routed media) and composes the
// stage, controls, status pills, chat, and connection state into one screen.
import { useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio } from "@livekit/components-react";
import "@livekit/components-styles";
import { Stage } from "./Stage";
import { ControlBar } from "./ControlBar";
import { ChatPanel } from "./ChatPanel";
import { StatusPills } from "./StatusPills";
import { ConnectionBanner } from "./ConnectionState";
import type { Role } from "@/lib/types";

interface Props {
  token: string;
  serverUrl: string;
  sessionId: string;
  inviteId?: string;
  role: Role;
  senderIdentity: string;
  senderName: string;
  sessionTitle: string;
  onLeave: () => void;
  agentControls?: React.ReactNode; // record control (agent only)
}

export function CallRoom({
  token,
  serverUrl,
  sessionId,
  inviteId,
  role,
  senderIdentity,
  senderName,
  sessionTitle,
  onLeave,
  agentControls,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  function toggleChat() {
    setChatOpen((o) => {
      if (!o) setUnread(0);
      return !o;
    });
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio
      video
      onDisconnected={onLeave}
      data-lk-theme="default"
      className="flex-1 flex flex-col"
      style={{ background: "transparent" }}
    >
      <div className="flex-1 flex min-h-0">
        {/* Stage */}
        <div className="relative flex-1 flex flex-col min-w-0 p-3 sm:p-4">
          <ConnectionBanner />

          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="live-dot shrink-0" />
              <span className="font-medium truncate">{sessionTitle}</span>
            </div>
            <StatusPills />
          </div>

          <div className="flex-1 min-h-0">
            <Stage />
          </div>

          {/* Floating controls */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
            <ControlBar
              chatOpen={chatOpen}
              onToggleChat={toggleChat}
              unread={unread}
              onLeave={onLeave}
              extra={agentControls}
            />
          </div>
        </div>

        {/* Chat */}
        <ChatPanel
          sessionId={sessionId}
          inviteId={inviteId}
          senderIdentity={senderIdentity}
          senderName={senderName}
          senderRole={role}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onIncoming={() => setUnread((n) => n + 1)}
        />
      </div>

      <RoomAudioRenderer />
      <StartAudio label="Click to enable audio" />
    </LiveKitRoom>
  );
}
