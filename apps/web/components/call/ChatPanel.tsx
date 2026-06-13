"use client";

// In-call chat. Real-time via the LiveKit data channel; durably persisted through
// /api/chat and hydrated with prior history on join. File cards render inline (R17).
import { useEffect, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { X, Send, Paperclip, FileText, Download, Loader2 } from "lucide-react";
import type { ChatWirePayload, Role } from "@/lib/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface UiMessage {
  id: string;
  senderName: string;
  senderRole: Role;
  body: string;
  kind: "chat" | "file";
  fileName?: string;
  fileUrl?: string;
  ts: number;
  mine: boolean;
}

interface Props {
  sessionId: string;
  inviteId?: string;
  senderIdentity: string;
  senderName: string;
  senderRole: Role;
  open: boolean;
  onClose: () => void;
  onIncoming: () => void;
}

export function ChatPanel({
  sessionId,
  inviteId,
  senderIdentity,
  senderName,
  senderRole,
  open,
  onClose,
  onIncoming,
}: Props) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { message, send } = useDataChannel("chat");

  // Hydrate prior history on mount.
  useEffect(() => {
    const params = new URLSearchParams({ session: sessionId });
    if (inviteId) params.set("invite", inviteId);
    fetch(`/api/chat?${params}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((json) => {
        const hydrated: UiMessage[] = (json.messages ?? []).map(
          (m: { id: string; sender_identity: string; sender_role: Role; body: string; created_at: string }) => ({
            id: m.id,
            senderName: m.sender_identity === senderIdentity ? senderName : m.sender_role,
            senderRole: m.sender_role,
            body: m.body,
            kind: "chat" as const,
            ts: new Date(m.created_at).getTime(),
            mine: m.sender_identity === senderIdentity,
          }),
        );
        setMessages(hydrated);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Receive realtime messages from peers.
  useEffect(() => {
    if (!message) return;
    try {
      const p = JSON.parse(decoder.decode(message.payload)) as ChatWirePayload;
      setMessages((prev) => [
        ...prev,
        {
          id: `${p.ts}-${p.senderName}`,
          senderName: p.senderName,
          senderRole: p.senderRole,
          body: p.body,
          kind: p.kind,
          fileName: p.fileName,
          fileUrl: p.fileUrl,
          ts: p.ts,
          mine: false,
        },
      ]);
      if (!open) onIncoming();
    } catch {
      /* ignore malformed */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function broadcast(payload: ChatWirePayload) {
    send(encoder.encode(JSON.stringify(payload)), { reliable: true });
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");

    const payload: ChatWirePayload = {
      kind: "chat",
      body: text,
      senderName,
      senderRole,
      ts: Date.now(),
    };
    broadcast(payload);
    setMessages((prev) => [
      ...prev,
      { id: `${payload.ts}-me`, senderName, senderRole, body: text, kind: "chat", ts: payload.ts, mine: true },
    ]);

    // Persist (real-time delivery already happened over the data channel).
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, inviteId, body: text, senderIdentity, senderRole }),
    }).catch(() => {});
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sessionId", sessionId);
      if (inviteId) fd.append("inviteId", inviteId);
      fd.append("senderIdentity", senderIdentity);

      const res = await fetch("/api/files", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");

      const payload: ChatWirePayload = {
        kind: "file",
        body: file.name,
        senderName,
        senderRole,
        fileName: file.name,
        fileUrl: json.url,
        mimeType: file.type,
        sizeBytes: file.size,
        ts: Date.now(),
      };
      broadcast(payload);
      setMessages((prev) => [
        ...prev,
        {
          id: `${payload.ts}-me`,
          senderName,
          senderRole,
          body: file.name,
          kind: "file",
          fileName: file.name,
          fileUrl: json.url,
          ts: payload.ts,
          mine: true,
        },
      ]);
    } catch {
      /* surfaced by the disabled state resetting; keep chat resilient */
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <aside
      className={`glass flex flex-col transition-all duration-200 overflow-hidden ${
        open
          ? "w-full h-full sm:w-[340px] sm:h-auto opacity-100"
          : "w-0 h-0 sm:h-auto opacity-0"
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-panel-border shrink-0">
        <span className="font-medium">Chat</span>
        <button type="button" onClick={onClose} aria-label="Close chat" className="text-fg-subtle hover:text-fg">
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-fg-subtle text-center mt-6">No messages yet. Say hello 👋</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
            {!m.mine && (
              <span className="text-[11px] text-fg-subtle mb-1 px-1 capitalize">{m.senderName}</span>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                m.mine ? "bg-accent text-white rounded-br-sm" : "bg-white/8 text-fg rounded-bl-sm"
              }`}
            >
              {m.kind === "file" ? (
                <a
                  href={m.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 underline-offset-2 hover:underline"
                >
                  <FileText size={16} /> {m.fileName} <Download size={14} />
                </a>
              ) : (
                m.body
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="p-3 border-t border-panel-border shrink-0 flex gap-2">
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Share a file"
          className="btn btn-ghost px-3 shrink-0 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message"
          aria-label="Message"
          className="field"
        />
        <button type="submit" aria-label="Send" className="btn btn-primary px-3 shrink-0">
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
