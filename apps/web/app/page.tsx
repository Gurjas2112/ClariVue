import Link from "next/link";
import { Video, ShieldCheck, Radio, MessageSquare, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Video size={18} />
          </span>
          <span className="text-lg font-medium tracking-tight">ClariVue</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost">
            Agent sign in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Get started <ArrowRight size={16} />
          </Link>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
        <span className="pill mx-auto mb-6">
          <ShieldCheck size={14} className="text-[var(--cyan)]" /> Self-hosted · media never leaves your servers
        </span>
        <h1 className="text-5xl sm:text-6xl font-medium tracking-tight leading-[1.05] max-w-3xl mx-auto">
          See the problem.
          <br />
          <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--cyan)] bg-clip-text text-transparent">
            Solve it live.
          </span>
        </h1>
        <p className="text-lg text-[var(--fg-muted)] mt-6 max-w-xl mx-auto">
          Voice calls go blind the moment an issue needs to be seen. ClariVue puts your
          support agent and customer on video in one tap — recorded, chatted, and
          reviewable, all on infrastructure you own.
        </p>
        <div className="flex items-center justify-center gap-3 mt-9">
          <Link href="/signup" className="btn btn-primary px-6 py-3">
            Start a support session <ArrowRight size={16} />
          </Link>
          <Link href="/login" className="btn btn-ghost px-6 py-3">
            Agent sign in
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-20 text-left">
          <Feature
            icon={<Radio size={18} />}
            title="Server-routed video"
            body="Audio and video flow through our own LiveKit SFU — no peer-to-peer, no third-party video clouds."
          />
          <Feature
            icon={<MessageSquare size={18} />}
            title="Chat + recording"
            body="In-call messaging and file sharing, with one-tap recording the agent can download after the call."
          />
          <Feature
            icon={<ShieldCheck size={18} />}
            title="Roles enforced"
            body="Agents create and end sessions; customers join by invite only. Access is checked server-side."
          />
        </div>
      </section>

      <footer className="border-t border-[var(--panel-border)] py-6 text-center text-sm text-[var(--fg-subtle)]">
        ClariVue · real-time video support, owned end to end.
      </footer>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card p-6">
      <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--accent)]/12 text-[var(--accent)] mb-4">
        {icon}
      </span>
      <h3 className="font-medium mb-1.5">{title}</h3>
      <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{body}</p>
    </div>
  );
}
