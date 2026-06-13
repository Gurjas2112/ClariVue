<p align="center">
  <img src="essential_docs/atomquest_hackathon_finale_logo.png" alt="Atomberg" height="52" />
</p>

# ClariVue

**Real-time, self-hosted video support platform for customer support teams.**

> Built for the **AtomQuest Hackathon 1.0 — Grand Finale**. Full setup + architecture walkthrough in
> [`WORKFLOW.md`](./essential_docs/WORKFLOW.md); system design + R1–R20 traceability in [`ARCHITECTURE.md`](./essential_docs/ARCHITECTURE.md).

A support **agent** creates a call session and invites a **customer** via a link. Both join from
the browser — no install — onto live audio/video routed through **our own media server** (a
self-hosted [LiveKit](https://livekit.io) SFU, never a third-party hosted video API). They chat
in-call, the agent can record, and every session (presence, chat, files, recording) is persisted
and reviewable afterward.

> Built for the AtomQuest Hackathon 1.0 Finale. See [`ARCHITECTURE.md`](./essential_docs/ARCHITECTURE.md) for the system design and the
> requirement-by-requirement traceability matrix.

---

## Demo credentials (for judging)

| Role | Email | Password |
|------|-------|----------|
| Agent | `agent@clarivue.demo` | `clarivue123` |
| Admin | `admin@clarivue.demo` | `clarivue123` |

- **Agent flow:** log in → **Start support session** → copy the invite link → open it in a second
  browser/incognito window → join as the customer. Both see and hear each other.
- **Ready-made invite link:** `/join/demo-call` (a pre-seeded active session owned by the demo agent).
- **Admin flow:** log in as admin → **Admin** (top-right) → live sessions, participants, force-end.

Anyone can also sign up a fresh agent account at `/signup` — a confirmation email will be sent
via Gmail SMTP; click the link to activate, then sign in.

---

## What it does (must-haves)

- **Session management** — agents create sessions with a unique, unguessable invite link; either
  participant can end the call (the LiveKit room is closed cleanly); full session history is
  persisted and queryable.
- **Audio & video** — both parties see/hear each other in real time, **routed through the SFU**
  (no P2P); mute audio / disable video any time; screen share.
- **In-call chat** — real-time over the LiveKit data channel, persisted to Postgres, retrievable
  after the call.
- **Roles, enforced server-side** — agents create/end/record; customers join by valid invite only
  and cannot perform agent actions. Every privileged route verifies the user with Supabase
  `getUser()`; client guards are UX only.

## Bonus features

- **Recording** (LiveKit Egress → Supabase Storage, status pill in-progress → processing → ready →
  download) — *requires the egress profile + S3 keys, see below.*
- **File sharing** in chat (images/PDF/docs) — stored privately, served via signed URLs, available
  in the session record.
- **Reconnect grace** — a dropped participant who returns within 30s re-enters silently (identity
  persisted; the re-join is not surfaced as a new join).
- **Admin dashboard** — live sessions with participants & duration, history, force-end any session.
- **Observability** — Prometheus metrics at `/api/metrics` (active sessions, connected
  participants, live rooms, errors); LiveKit exposes its own metrics too.

---

## Architecture at a glance

```
Browser (Next.js UI + @livekit/components-react)
   │  HTTPS  ┌─────────────────────────────────────────────┐
   ├────────►│ Next.js App API (token mint, auth gate,      │──► Supabase (Postgres + Auth + Storage)
   │         │ sessions, chat, files, recordings, webhooks) │
   │         └─────────────────────────────────────────────┘
   │  WebRTC (media)                ▲ webhooks (participant/room/egress)
   └────────►  LiveKit SFU (self-hosted) ──► Egress ──► Supabase Storage (recordings)
                     │
                   Redis
```

The app backend is co-located with the UI as Next.js route handlers; the **media plane** (LiveKit +
Egress + Redis) runs separately so WebRTC's UDP/TCP traffic never touches the app server. Full
detail and the requirements matrix are in [`ARCHITECTURE.md`](./essential_docs/ARCHITECTURE.md).

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind v4 · LiveKit (self-hosted SFU + Egress) ·
Supabase (Postgres, Auth, Storage) · Redis · Prometheus.

---

## Live deployment

**Live app: https://clari-vue.vercel.app**

| Plane | Where it runs |
|-------|---------------|
| App (UI + API route handlers) | **Vercel** (`clari-vue` project, root directory `apps/web`) |
| Database · Auth · Storage | **Supabase** cloud (`nwbzqmeqmqfajqkpuapr`, ap-southeast-1) |
| Media plane (LiveKit SFU + Egress + Redis) | **self-hosted** in local Docker, exposed to the cloud via a **cloudflared tunnel** |

Because the SFU is self-hosted (the brief forbids third-party hosted video), the Vercel app reaches
LiveKit through a public **cloudflared tunnel** to the local Docker stack. That keeps media on *our
own* server while still giving a public URL.

### How it's deployed
```bash
# 1. expose the local LiveKit SFU publicly (keep this running)
cloudflared tunnel --url http://localhost:7880        # → https://<name>.trycloudflare.com

# 2. point the app at it (Vercel env, production)
#    LIVEKIT_URL            = https://<name>.trycloudflare.com   (server SDK)
#    NEXT_PUBLIC_LIVEKIT_URL = wss://<name>.trycloudflare.com    (browser signal)
#    plus the Supabase + S3 keys (see apps/web/.env.example)

# 3. deploy apps/web to the clari-vue project
cd apps/web && vercel --prod
```
> **Monorepo note:** the Next.js app lives in `apps/web`. Set the Vercel project's **Root Directory**
> to `apps/web` (Settings → Build & Deployment) so `git push` auto-deploys build correctly. Recording
> additionally needs the local **Egress** container running (`--profile recording`) and the Supabase
> **S3 access keys** set as Vercel env vars.

### ⚠️ Operating the live demo — cloudflared tunnel recovery
`trycloudflare` quick tunnels are **ephemeral and will drop** (machine sleep, network blip, time).
When the tunnel dies, **live video and recording-start break** until it's restored. Because
`NEXT_PUBLIC_LIVEKIT_URL` is **inlined at build time**, the new URL only takes effect after a redeploy.
Recovery is three steps:

```bash
# 1. restart the tunnel → note the NEW https URL
cloudflared tunnel --url http://localhost:7880

# 2. update BOTH LiveKit URLs on Vercel (production)
cd apps/web
vercel env rm  LIVEKIT_URL production --yes
echo "https://<new-name>.trycloudflare.com" | vercel env add LIVEKIT_URL production
vercel env rm  NEXT_PUBLIC_LIVEKIT_URL production --yes
echo "wss://<new-name>.trycloudflare.com"   | vercel env add NEXT_PUBLIC_LIVEKIT_URL production

# 3. redeploy so the new wss URL is baked into the client bundle
vercel --prod
```
Also keep these **running locally** the whole time: `docker compose -f infra/docker-compose.yml
--profile recording up -d` (LiveKit + Egress + Redis). For a hands-off demo, replace the quick tunnel
with a **named Cloudflare tunnel** (your own domain — stable URL) or run LiveKit on a small
**public-IP VM** so there's nothing to babysit.

---

## End-to-end workflow (at a glance)

1. **Local dev** — `docker compose up -d` (media plane) → apply DB schema (`npm run db:apply`) →
   `cd apps/web && npm run dev`.
2. **Verify** — `node scripts/media-gate-test.mjs` (SFU media + chat + files) and
   `node scripts/recording-test.mjs` (record → ready) and `node scripts/admin-test.mjs`.
3. **Deploy** — start the cloudflared tunnel, set Vercel env (Supabase + LiveKit tunnel URLs +
   S3 keys), `vercel --prod`.
4. **Operate** — keep the tunnel + Docker media plane up; on a tunnel drop, run the 3-step recovery
   above.

Full depth — PS-requirement coverage, architecture, install/run/test — is in
[`WORKFLOW.md`](./essential_docs/WORKFLOW.md).

---

## Run it locally

### Prerequisites
- Node 20.9+ (developed on Node 26), Docker Desktop, and a Supabase project.
- `pnpm` optional; this repo uses **npm** (pnpm isn't required).

### 1. Media plane (Docker)
```bash
cd infra
docker compose up -d            # redis + LiveKit SFU (enough for calls + chat)
```
LiveKit listens on `ws://localhost:7880` (signal), `7881` (ICE/TCP fallback — reliable on Docker
Desktop), and a small UDP range. Webhooks post to `http://host.docker.internal:3000/api/webhooks/livekit`.

### 2. Database (Supabase)
The schema + storage buckets are in `supabase/`. Apply them to your project (no psql needed):
```bash
# session-pooler connection string from Supabase → Project Settings → Database
DB_URL="postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres" \
  npm run db:apply
```
(Or paste `supabase/migrations/0001_init.sql` then `supabase/seed.sql` into the Supabase SQL editor.)

### 3. App env
```bash
cp apps/web/.env.example apps/web/.env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
# LiveKit values default to the local Docker dev keys (devkey/secret)
```

### 4. Start the app
```bash
cd apps/web
npm install
npm run dev        # http://localhost:3000
# or, for a snappy demo with no per-route compile: npm run build && npm start
```

> **Tip:** on Windows/OneDrive, `npm run build && npm start` is noticeably faster than `dev`
> (the dev server compiles each route on first hit). The demo and tests were validated against the
> production server.

### 5. (Optional) Seed demo accounts + session
```bash
# create the agent/admin via /signup, promote admin in SQL (set role='admin'), then:
DB_URL="...pooler..." node scripts/seed-demo.mjs
```

### Enabling recording (bonus)
Recording uses LiveKit Egress writing to Supabase Storage (S3-compatible):
1. In Supabase → **Storage → S3 access keys**, generate an access key + secret.
2. Export them and start the egress container:
   ```bash
   SUPABASE_S3_ACCESS_KEY=... SUPABASE_S3_SECRET_KEY=... \
     docker compose -f infra/docker-compose.yml --profile recording up -d
   ```
3. In a call, the agent's **Record** button now captures to the `recordings` bucket; the pill goes
   in-progress → processing → ready → download.

---

## Tests / verification

Two-browser end-to-end checks (fake camera/mic via Chromium) prove the hard parts:
```bash
node scripts/media-gate-test.mjs   # SFU media both ways + real-time chat + file sharing
node scripts/admin-test.mjs        # admin access control + dashboard render
```
Both run against a server on `http://localhost:3000`.

---

## Repo layout

```
apps/web/        Next.js app — UI + app API (route handlers), LiveKit/Supabase libs
infra/           docker-compose + LiveKit/Egress config (local media plane)
supabase/        SQL migration + seed (schema, RLS, storage buckets)
scripts/         db apply, demo seed, e2e verification tests
essential_docs/ARCHITECTURE.md  system design + requirements traceability matrix
essential_docs/WORKFLOW.md      setup, run, architecture, PS-requirement coverage
```

---

## Author

<p align="left">
  <img src="essential_docs/my_photo.jpeg" alt="Gurjas Gandhi" width="72" height="72" style="border-radius:50%" />
</p>

**Gurjas Gandhi** — design, build, and deployment of ClariVue for the AtomQuest Hackathon 1.0 Grand
Finale.
