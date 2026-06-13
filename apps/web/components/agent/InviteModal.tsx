"use client";

import { useState } from "react";
import { Copy, Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function InviteModal({
  url,
  onClose,
  onOpen,
}: {
  url: string;
  onClose: () => void;
  onOpen: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 animate-[fadeIn_150ms_ease]"
      onClick={onClose}
    >
      <div className="card w-full max-w-lg p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-medium tracking-tight">Session ready</h2>
          <button onClick={onClose} aria-label="Close" className="text-fg-subtle hover:text-fg">
            <X size={18} />
          </button>
        </div>
        <p className="text-fg-muted text-sm mb-5">
          Share this link with your customer. They join straight from the browser — no account.
        </p>

        <div className="flex gap-2">
          <input readOnly value={url} className="field font-mono text-xs" aria-label="Invite link" />
          <button onClick={copy} className="btn btn-ghost shrink-0" aria-label="Copy invite link">
            {copied ? <Check size={16} className="text-[var(--success)]" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-7">
          <button onClick={onClose} className="btn btn-ghost">
            Close
          </button>
          <Button onClick={onOpen}>
            Join the call <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
