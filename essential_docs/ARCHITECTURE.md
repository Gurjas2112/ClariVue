# ClariVue — Architecture

Self-hosted, real-time video support platform. This document covers the system design, the data
model, the security model, and a requirement-by-requirement traceability matrix.

---

## 1. System overview

ClariVue separates two planes:

- **App plane** — the Next.js application: UI (React + `@livekit/components-react`) *and* the app
  backend as App-Router **route handlers**. It mints LiveKit tokens, enforces roles, and persists
  everything to Supabase. Stateless and serverless-friendly.
- **Media plane** — a **self-hosted LiveKit SFU** (+ Egress + Redis). All audio/video flows through
  it; clients never connect peer-to-peer and we never use a third-party hosted video API. This is
  the hard constraint of the brief, and the reason media lives in its own plane: WebRTC needs
  UDP/TCP traffic that has no business touching the app server.

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js UI<br/>LiveKit web SDK]
  end

  subgraph App["App plane (Next.js)"]
    API[Route handlers<br/>token · sessions · chat · files<br/>recordings · webhooks · metrics]
    PX[proxy.ts<br/>session refresh + route guard]
  end

  subgraph Media["Media plane (self-hosted, Docker/Fly)"]
    LK[LiveKit SFU]
    EG[Egress]
    RD[(Redis)]
  end

  subgraph Supabase["Supabase (managed)"]
    PG[(Postgres + RLS)]
    AU[Auth]
    ST[(Storage<br/>recordings · files)]
  end

  UI -- HTTPS --> API
  UI <-- "WebRTC media" --> LK
  API -- mint token / room control --> LK
  LK -- webhooks: participant/room/egress --> API
  LK <--> RD
  EG --> ST
  LK --> EG
  API <--> PG
  API <--> AU
  API <--> ST
  UI -. auth cookies .-> PX
```

### Why this split (and why not Railway)
A WebRTC SFU needs a wide UDP port range + a stable IP. Railway/Render/Heroku only route HTTP/TCP,
so the media plane runs on infrastructure that exposes raw UDP/TCP (locally: Docker; for a stable
public deployment: a VM with a dedicated IP). The app backend needs no UDP, so it lives as Next.js
route handlers co-located with the UI — no separate API service to operate. Locally everything is
`localhost`; on Docker Desktop, clients use LiveKit's **ICE/TCP fallback** (port 7881) because the
container's UDP candidates aren't reachable across the Docker VM boundary.

### Deployment (live)
The live app runs at **https://clari-vue.vercel.app**: the Next.js app is on **Vercel**, the database/
auth/storage on **Supabase** cloud, and the self-hosted **LiveKit + Egress + Redis** run in local
Docker, exposed to the cloud through a **cloudflared tunnel** (so media still flows through *our own*
SFU — never a third-party hosted video API). `NEXT_PUBLIC_LIVEKIT_URL` (wss → the tunnel) is the
browser signal URL; `LIVEKIT_URL` (https → the tunnel) is the server SDK URL; LiveKit posts webhooks
back to the public Vercel URL.

```mermaid
flowchart LR
  subgraph Cloud
    B[Customer / Agent browser]
    V["Vercel — Next.js app + API"]
    SB[("Supabase<br/>Postgres · Auth · Storage")]
  end
  subgraph Tunnel["cloudflared tunnel (public wss/https)"]
    CF[trycloudflare URL]
  end
  subgraph Local["Local Docker (self-hosted media plane)"]
    LK[LiveKit SFU]
    EG[Egress]
    RD[(Redis)]
  end
  B -- HTTPS --> V
  B -- "wss signal" --> CF --> LK
  V -- "room control / start egress" --> CF
  V <--> SB
  LK -- "webhooks → /api/webhooks/livekit" --> V
  LK --> EG -- "MP4 upload (S3)" --> SB
  LK <--> RD
```

> **Operational note:** `trycloudflare` quick tunnels are ephemeral. If the tunnel drops, restart it,
> update `LIVEKIT_URL` + `NEXT_PUBLIC_LIVEKIT_URL` on Vercel, and redeploy (the public URL is inlined
> at build time). A named Cloudflare tunnel or a public-IP VM removes this fragility. See
> [`WORKFLOW.md`](./WORKFLOW.md) §10.

---

## 2. Key flows

### Create + join a session
```mermaid
sequenceDiagram
  participant A as Agent (browser)
  participant API as Next.js API
  participant DB as Supabase
  participant C as Customer (browser)
  participant LK as LiveKit SFU

  A->>API: POST /api/sessions (auth cookie)
  API->>API: getUser() — must be an agent
  API->>DB: insert session (room_name, opaque invite_id)
  API-->>A: session + /join/{invite_id}
  A->>API: POST /api/token {sessionId}
  API->>LK: (token grants roomAdmin/roomCreate)
  A->>LK: connect (publishes A/V)

  C->>API: GET /api/invite/{id}  (preview)
  C->>API: POST /api/token {inviteId, name}
  API->>DB: validate invite → active session?
  API-->>C: token (join + publish only, no admin)
  C->>LK: connect (publishes A/V)
  LK-->>API: webhook participant_joined ×2
  API->>DB: upsert participants + events
```

### Agent authentication & email confirmation

```mermaid
sequenceDiagram
  participant U as Agent (browser)
  participant API as Next.js API
  participant SB as Supabase Auth
  participant Email as Gmail SMTP
  participant CB as /auth/callback

  U->>API: POST /api/auth/signup {email, password}
  API->>SB: supabase.auth.signUp()
  SB->>Email: confirmation email (link with token_hash + type)
  API->>SB: profiles.upsert (role=agent)
  API-->>U: {confirmationSent: true}

  U->>Email: clicks confirmation link
  Email-->>CB: GET /auth/callback?token_hash=…&type=signup
  CB->>SB: supabase.auth.verifyOtp({token_hash, type})
  SB-->>CB: session established
  CB-->>U: redirect → /agent/dashboard

  Note over CB: Also handles PKCE code flow<br/>(code param instead of token_hash)
```

### Token minting — the single enforcement point (R13–R15)
All role logic lives in `POST /api/token`:
- **Agent path:** requires a Supabase-verified user who owns the session (or admin) → grants
  `roomAdmin` + `roomCreate`.
- **Customer path:** requires a valid, **active** invite that maps to the room → grants `roomJoin`
  + publish/subscribe only. No admin grants. Identity is namespaced (`customer-…`) so it can never
  impersonate an agent.

Privileged routes (`/api/sessions` POST, `/end`, `/recordings/*`, `/admin/*`) independently verify
`getUser()` and ownership. Client-side guards (`proxy.ts`, redirects) are UX only.

### Recording lifecycle (R16)
`recordings/start` → `EgressClient.startRoomCompositeEgress` → row `in_progress`. `recordings/stop`
→ `stopEgress` → `processing`. The signed LiveKit `egress_ended` webhook → `ready`. The UI pill
reflects each transition; download is a short-lived signed Storage URL.

---

## 3. Data model (Supabase Postgres)

`profiles · sessions · session_participants · session_events · chat_messages · shared_files ·
recordings` (see `supabase/migrations/0001_init.sql`).

- `profiles` mirrors `auth.users` — one row per authenticated agent/admin with `id`, `email`,
  `role`, `created_at`. Used for role checks, auth metrics, and the admin user table.
- `sessions` carry a unique `room_name` and an opaque `invite_id`.
- `session_participants` track presence with `joined_at` / `left_at` / `disconnected_at` /
  `reconnect_count` (the reconnect grace window).
- `session_events` is an append-only log (joins, leaves, room/egress lifecycle) → queryable history.

### Security model
- **RLS is on for every table.** Authenticated agents can read only their own sessions and children
  (`agent_id = auth.uid()`); admins read all (`is_admin()`).
- **Customers are anonymous** — they never use a Supabase client key for privileged data. Every
  customer read/write (join, chat, file upload) goes through a **server route** that validates the
  invite and then uses the **service key** (which bypasses RLS). This keeps the browser locked by
  default while letting validated customers participate.
- Auth/token routes are `dynamic = 'force-dynamic'` + `Cache-Control: no-store` (never cache a
  `Set-Cookie` or a per-user token). The service key is server-only, never `NEXT_PUBLIC_`.
- LiveKit webhooks are verified with `WebhookReceiver` (unsigned requests rejected). Invite ids are
  unguessable random tokens. File uploads are mime/size-checked, stored per-session, served via
  signed URLs.

### Customer invite security — why no authentication is required

Customers join sessions via an **invite link** (`/join/{inviteId}`). No Supabase account or login is
needed. This is secure by design:

| Defence | Detail |
|---------|--------|
| **Unguessable invite** | The `inviteId` is 16 random bytes (base64url, ~22 chars), equivalent to 128 bits of entropy. Brute-forcing is cryptographically infeasible. |
| **Time-limited** | The invite is only valid while the session status is `active`. Once the agent (or admin) ends the session, the invite is dead — no dangling links. |
| **Minimal privileges** | A customer token grants `roomJoin` + publish/subscribe only — no `roomAdmin`, no `roomCreate`, no data deletion. |
| **Namespaced identity** | Customer identities are prefixed `customer-` and cannot impersonate an `agent-` identity. |
| **Server-side validation** | Every customer action (join, chat, file upload) is validated on the server by checking the invite before using the service key. The browser never gets a Supabase auth token. |
| **No sensitive data exposure** | The invite preview endpoint (`GET /api/invite/{id}`) returns only `{valid, title}` — no session IDs, agent info, or internal data. |

This matches industry practice: Google Meet, Zoom, and Microsoft Teams all use link-based joining
without requiring the guest to create an account.

---

## 4. Caching

A cache-aside layer over **Upstash Redis (HTTP)** sits in front of hot reads (invite validation,
admin live snapshot, recording status, metrics, chat hydrate). It is **optional** — when the
`UPSTASH_*` env vars are absent the helper transparently falls through to the source, so local dev
is zero-config. All invalidation funnels through the LiveKit webhook handler (the single place room
state changes), so the cache can't silently drift. Authenticated/token responses are never cached.

---

## 5. Admin dashboard & auth metrics

The admin dashboard (`/admin`) provides two categories of operational visibility:

### Session operations (R19)
- **Live sessions**: real-time view of all active LiveKit rooms with participant list, duration,
  and a force-end button. Polled every 3 seconds via `/api/admin/live`.
- **Session history**: all sessions (newest first) with status, timestamps, and delete actions.
  Polled every 10 seconds via `/api/sessions`.

### User authentication metrics
- **Stat cards**: total users, agents, admins, signups (last 7 days), email confirmation rate,
  active sessions — all fetched from the `profiles` table and `auth.users` via the service-role
  client.
- **Session summary bar**: 30-day signups, total/active/ended sessions, unconfirmed user count.
- **Recent users table**: last 15 registrations with email, role, confirmation status (confirmed
  vs pending), and relative join time.

All auth metrics are served by `GET /api/admin/auth-metrics` (admin-only, polled every 30 seconds)
using the Supabase admin API to read `auth.users` for confirmation status and the `profiles` table
for role/count data.

---

## 6. Requirements traceability

| # | Requirement | Type | Where | Status |
|---|---|---|---|---|
| R1 | Agent creates session, invite link/token | MH | `POST /api/sessions`, `/join/[inviteId]` | ✅ verified |
| R2 | Both join from browser, no install | MH | Next.js + LiveKit web SDK | ✅ verified |
| R3 | Track who's in a session at any time | MH | `session_participants` + webhooks | ✅ verified |
| R4 | Either party ends; connections closed | MH | `/api/sessions/[id]/end` → `deleteRoom` | ✅ |
| R5 | Session history persisted & queryable | MH | `sessions`, `session_events`, record view | ✅ verified |
| R6 | Real-time A/V both directions | MH | LiveKit SFU | ✅ verified (2-browser test) |
| R7 | Media routes through server, no P2P | MH | self-hosted LiveKit SFU | ✅ verified |
| R8 | Stable under normal network | MH | ICE/TCP fallback on :7881 | ✅ |
| R9 | Mute audio / disable video anytime | MH | control bar | ✅ |
| R10 | In-call text chat, real-time | MH | LiveKit data channel | ✅ verified |
| R11 | Chat persisted | MH | `chat_messages` via `/api/chat` | ✅ verified |
| R12 | Chat retrievable after call | MH | `GET /api/chat`, session record | ✅ verified |
| R13 | Role: Agent (create/end/record) | MH | token grants + route checks | ✅ verified |
| R14 | Role: Customer (join by invite only) | MH | invite validation, no admin grants | ✅ verified |
| R15 | Access enforced server-side | MH | `getUser()` in privileged routes | ✅ verified |
| R16 | Recording: start/stop, status, download | B | Egress + `recordings` + signed URL | ✅ built (needs S3 keys to capture) |
| R17 | File sharing in chat | B | Storage + `shared_files` + signed URLs | ✅ verified |
| R18 | Reconnect grace, silent re-entry | B | `disconnected_at` + grace in webhook | ✅ built |
| R19 | Admin dashboard: live, history, force-end, **auth metrics** | B | `/admin` + `RoomServiceClient` + `/api/admin/auth-metrics` | ✅ verified |
| R20 | Observability metrics | B | `/api/metrics` (Prometheus) | ✅ verified |

MH = must-have, B = bonus. "verified" = exercised by an automated two-browser test or a direct check
(see `scripts/`).

---

## 7. Technology choices

| Layer | Choice | Why |
|---|---|---|
| Frontend + App API | Next.js 16 (App Router, TS) | One codebase for UI + backend route handlers |
| Media SFU | self-hosted LiveKit | OSS, server-routed media, token-based roles, webhooks, egress, metrics |
| Recording | LiveKit Egress → Supabase Storage | OSS room-composite MP4 |
| Auth | Supabase Auth | agents only; instant signups for the demo |
| Database | Supabase Postgres + RLS | sessions, presence, chat, files, recordings |
| Storage | Supabase Storage | private buckets, signed URLs |
| Cache | Upstash Redis (optional) | serverless-safe hot-read cache |
| Local dev | Docker Compose | LiveKit + Egress + Redis identical to prod |
| Metrics | Prometheus (`prom-client` + LiveKit native) | standard scrape format |
