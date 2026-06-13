import Link from "next/link";
import Image from "next/image";
import { Video, ShieldCheck, Radio, MessageSquare, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Video size={18} />
          </span>
          <span className="text-lg font-medium tracking-tight">ClariVue</span>
        </div>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link href="/login" className="btn btn-ghost text-xs sm:text-sm px-3 sm:px-4">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary text-xs sm:text-sm px-3 sm:px-4">
            Get started <ArrowRight size={14} className="hidden sm:inline" />
          </Link>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-16 sm:pb-24 text-center">
        <span className="pill mx-auto mb-6 text-[11px] sm:text-xs">
          <ShieldCheck size={14} className="text-[var(--cyan)]" /> Self-hosted · media never leaves your servers
        </span>
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-medium tracking-tight leading-[1.1] sm:leading-[1.05] max-w-3xl mx-auto">
          See the problem.
          <br />
          <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--cyan)] bg-clip-text text-transparent">
            Solve it live.
          </span>
        </h1>
        <p className="text-base sm:text-lg text-[var(--fg-muted)] mt-4 sm:mt-6 max-w-xl mx-auto px-2">
          Voice calls go blind the moment an issue needs to be seen. ClariVue puts your
          support agent and customer on video in one tap — recorded, chatted, and
          reviewable, all on infrastructure you own.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-7 sm:mt-9 px-4 sm:px-0">
          <Link href="/signup" className="btn btn-primary px-6 py-3 w-full sm:w-auto">
            Start a support session <ArrowRight size={16} />
          </Link>
          <Link href="/login" className="btn btn-ghost px-6 py-3 w-full sm:w-auto">
            Agent sign in
          </Link>
        </div>

        <div className="grid gap-4 mt-14 sm:mt-20 text-left sm:grid-cols-2 lg:grid-cols-3">
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

      <footer className="border-t border-panel-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between sm:gap-6">
          <div className="flex items-center gap-3 text-sm text-fg-muted">
            <span>Built for</span>
            <span className="grid place-items-center bg-white rounded-lg px-2.5 py-1.5">
              <Image src="/atomberg_logo.png" alt="Atomberg" width={92} height={24} className="h-6 w-auto" />
            </span>
            <a
              href="https://unstop.com/p/atomquest-hackathon-2026-atomberg-technologies-pvt-ltd-1681528"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4 fill-current" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <title>Unstop</title>
                <path d="M12 0C5.394 0 0 5.394 0 12s5.394 12 12 12 12-5.394 12-12S18.606 0 12 0Zm-1.2 16.86H8.303v-1.127c-.715 1.091-1.588 1.552-2.897 1.552-2.085 0-3.248-1.2-3.248-3.333V7.248h2.509v6.182c0 1.164.533 1.722 1.6 1.722 1.224 0 2.012-.752 2.012-1.891V7.236h2.509v9.625zm8.533 0v-5.939c0-1.14-.533-1.721-1.6-1.721-1.224 0-2.012.752-2.012 1.89v5.77h-2.509V7.237h2.497V8.63c.715-1.09 1.588-1.551 2.897-1.551 2.085 0 3.249 1.2 3.249 3.333v6.449z" />
              </svg>
              <span>AtomQuest Hackathon 1.0</span>
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/Gurjas2112" target="_blank" rel="noopener noreferrer" className="relative group">
              <Image
                src="/gurjas.jpeg"
                alt="Gurjas Gandhi"
                width={36}
                height={36}
                className="rounded-full object-cover w-9 h-9 border border-panel-border group-hover:border-white transition-colors"
              />
              <span className="absolute -bottom-1 -right-1 bg-neutral-900 text-white p-0.5 rounded-full border border-panel-border flex items-center justify-center">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
                  <path d="M9 18c-4.51 2-5-2-7-2"/>
                </svg>
              </span>
            </a>
            <div className="text-sm leading-tight flex flex-col gap-0.5">
              <a
                href="https://github.com/Gurjas2112"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-white transition-colors flex items-center gap-1"
              >
                <span>Gurjas Gandhi</span>
              </a>
              <a
                href="https://github.com/Gurjas2112/ClariVue"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg-subtle hover:text-white transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
                  <path d="M9 18c-4.51 2-5-2-7-2"/>
                </svg>
                <span>ClariVue · owned end to end</span>
              </a>
            </div>
          </div>
        </div>
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
