"use client";

// Floating call controls — mute, camera, screen share, chat, leave (+ agent extras).
import { useLocalParticipant } from "@livekit/components-react";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MessageSquare, PhoneOff } from "lucide-react";
import { clsx } from "@/lib/clsx";

interface Props {
  chatOpen: boolean;
  onToggleChat: () => void;
  unread: number;
  onLeave: () => void;
  extra?: React.ReactNode; // agent-only controls (e.g. record)
}

function CtrlButton({
  on = false,
  onClick,
  label,
  children,
  danger,
}: {
  on?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={clsx(
        "grid place-items-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border transition-all",
        danger
          ? "bg-[var(--danger)] border-transparent text-white hover:brightness-110"
          : on
            ? "bg-white/10 border-panel-border text-fg hover:bg-white/15"
            : "bg-[var(--danger)]/15 border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/25",
      )}
    >
      {children}
    </button>
  );
}

export function ControlBar({ chatOpen, onToggleChat, unread, onLeave, extra }: Props) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();

  return (
    <div className="glass rounded-full px-2 sm:px-3 py-2 sm:py-2.5 flex items-center gap-1.5 sm:gap-2 shadow-2xl">
      <CtrlButton
        on={isMicrophoneEnabled}
        onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {isMicrophoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}
      </CtrlButton>

      <CtrlButton
        on={isCameraEnabled}
        onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
      >
        {isCameraEnabled ? <Video size={17} /> : <VideoOff size={17} />}
      </CtrlButton>

      <CtrlButton
        on={isScreenShareEnabled}
        onClick={() =>
          localParticipant.setScreenShareEnabled(!isScreenShareEnabled).catch(() => {})
        }
        label={isScreenShareEnabled ? "Stop sharing screen" : "Share screen"}
      >
        <MonitorUp size={17} />
      </CtrlButton>

      <div className="w-px h-6 sm:h-7 bg-panel-border mx-0.5 sm:mx-1" />

      <button
        type="button"
        onClick={onToggleChat}
        aria-label="Toggle chat"
        aria-pressed={chatOpen}
        title="Chat"
        className={clsx(
          "relative grid place-items-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border transition-all",
          chatOpen
            ? "bg-accent/20 border-accent/40 text-accent"
            : "bg-white/10 border-panel-border text-fg hover:bg-white/15",
        )}
      >
        <MessageSquare size={17} />
        {unread > 0 && !chatOpen && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-[var(--danger)] text-white text-[11px] grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {extra}

      <div className="w-px h-6 sm:h-7 bg-panel-border mx-0.5 sm:mx-1" />

      <button
        type="button"
        onClick={onLeave}
        aria-label="Leave call"
        title="Leave"
        className="grid place-items-center h-10 sm:h-12 px-3 sm:px-5 rounded-full bg-danger text-white font-medium hover:brightness-110 transition-all gap-2 text-sm sm:text-base"
      >
        <PhoneOff size={16} /> <span className="hidden sm:inline">Leave</span>
      </button>
    </div>
  );
}
