# ClariVue — Interview Preparation Q&A

> **Prepared for:** Pre-Placement Interview (PPI) — Atomberg Technologies  
> **Candidate:** Gurjas Gandhi  
> **Project:** ClariVue — Real-time, self-hosted video support platform  
> **Live App:** [https://clari-vue.vercel.app](https://clari-vue.vercel.app)  
> **Prototype Video:** [▶ Watch the walkthrough](https://drive.google.com/file/d/1bHCXDfK0uxA1szTW6mHbl1PQhFolRS4t/view?usp=sharing)

---

## Table of Contents

1. [System Design & Architecture (Scenario-Based)](#1-system-design--architecture-scenario-based)
2. [Coding Deep-Dives (Every Key File Explained)](#2-coding-deep-dives-every-key-file-explained)
3. [System Workflow & Data Flow](#3-system-workflow--data-flow)
4. [Security & Access Control](#4-security--access-control)
5. [Database Design & RLS](#5-database-design--rls)
6. [Real-Time Communication & WebRTC](#6-real-time-communication--webrtc)
7. [Recording & File Sharing Pipeline](#7-recording--file-sharing-pipeline)
8. [Caching, Metrics & Observability](#8-caching-metrics--observability)
9. [Deployment & DevOps](#9-deployment--devops)
10. [Problem Statement Requirement Coverage (R1–R20)](#10-problem-statement-requirement-coverage-r1r20)
11. [Potential Follow-Up / Tough Questions](#11-potential-follow-up--tough-questions)
12. [Steps to Run the System Locally (Demo Guide)](#12-steps-to-run-the-system-locally-demo-guide)

---

## 1. System Design & Architecture (Scenario-Based)

### Q1: Walk us through the high-level architecture of ClariVue. Why did you split it into two planes?

**Answer:**

ClariVue is split into two distinct planes:

```
┌─────────────────────────────────────────────────────────────────────┐
│  APP PLANE (Stateless, Serverless-friendly)                        │
│  ┌──────────────────────────────────────────────────┐              │
│  │  Next.js 16 (App Router)                         │              │
│  │  ├─ UI: React 19 + @livekit/components-react     │              │
│  │  ├─ API: Route Handlers (token, sessions, chat,  │              │
│  │  │       files, recordings, webhooks, metrics)    │              │
│  │  └─ Auth: Supabase Auth + proxy.ts middleware     │              │
│  └──────────────────────────────────────────────────┘              │
│           ▲                    ▲                                    │
│           │ HTTPS              │ Supabase client                   │
│           ▼                    ▼                                    │
│  ┌────────────┐     ┌──────────────────────────────┐              │
│  │  Browser   │     │  Supabase (Managed)          │              │
│  └────────────┘     │  ├─ Postgres + RLS           │              │
│        │            │  ├─ Auth (JWT cookies)        │              │
│        │ WebRTC     │  └─ Storage (recordings/files)│              │
│        ▼            └──────────────────────────────┘              │
│  ┌──────────────────────────────────────────────────┐              │
│  │  MEDIA PLANE (Self-hosted, Docker)               │              │
│  │  ├─ LiveKit SFU (ws :7880, ICE/TCP :7881)       │              │
│  │  ├─ Egress (room-composite MP4 recording)        │              │
│  │  └─ Redis (LiveKit state + PubSub)               │              │
│  └──────────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

**Why the split:**
- A WebRTC SFU needs a **wide UDP port range + a stable IP**. HTTP-only PaaS (Railway, Render, Heroku) only route HTTP/TCP — they can't expose raw UDP.
- The app backend needs **no UDP** at all — it's pure HTTP request-response. So it lives as Next.js route handlers co-located with the UI on Vercel.
- This decoupling means: the app plane is **stateless and horizontally scalable** (serverless functions on Vercel), while the media plane runs on infrastructure that can expose UDP (Docker locally, a VM in prod).
- The brief's **hard constraint**: media must flow through **our own server** (no P2P, no third-party hosted video API like Twilio/Daily). Self-hosting LiveKit satisfies this.

---

### Q2: Why did you choose LiveKit as the SFU? Why not build your own WebRTC server or use a hosted service?

**Answer:**

| Option | Verdict |
|--------|---------|
| **Build own SFU** | Enormous complexity (SRTP, DTLS, ICE, codec negotiation). Weeks of work for a hackathon. |
| **Hosted service (Twilio, Daily, etc.)** | The problem statement explicitly forbids third-party hosted video APIs. |
| **Self-hosted LiveKit** | Open source, server-routed by design (no P2P), has token-based role enforcement, webhooks, recording (Egress), and a mature React SDK. We run it ourselves → full control. |

LiveKit gives us:
1. **Server-routed media** — all audio/video flows through the SFU, never P2P.
2. **Token-based permissions** — `roomAdmin`, `roomCreate`, `roomJoin`, `canPublish`, `canSubscribe` are set server-side.
3. **Webhooks** — `participant_joined`, `participant_left`, `room_finished`, `egress_ended` → we persist everything.
4. **Egress** — room-composite MP4 recording to S3-compatible storage (Supabase Storage).
5. **Data channels** — real-time chat without a separate WebSocket server.

---

### Q3: Scenario — What happens when an agent creates a session and a customer joins? Trace the entire flow.

**Answer (step-by-step):**

```
AGENT BROWSER                   NEXT.JS API                 SUPABASE                LIVEKIT SFU
    │                              │                           │                       │
    │ POST /api/sessions           │                           │                       │
    │ (auth cookie)  ──────────►   │                           │                       │
    │                              │ getAuthedUser()           │                       │
    │                              │ ────────────────────────► │                       │
    │                              │ ◄──── user {id, role}     │                       │
    │                              │                           │                       │
    │                              │ INSERT sessions           │                       │
    │                              │   room_name: clarivue-xxx │                       │
    │                              │   invite_id: <128-bit>    │                       │
    │                              │ ────────────────────────► │                       │
    │                              │ ◄──── session row         │                       │
    │ ◄── {session, inviteUrl}     │                           │                       │
    │                              │                           │                       │
    │ POST /api/token              │                           │                       │
    │  {sessionId}   ──────────►   │                           │                       │
    │                              │ verify ownership          │                       │
    │                              │ mintToken(roomAdmin=true) │                       │
    │                              │ ──────────────────────────────────────────────►   │
    │ ◄── {token, wss://url}       │                           │                       │
    │                              │                           │                       │
    │ LiveKitRoom.connect(token) ──────────────────────────────────────────────────►   │
    │ ◄── WebRTC media established │                           │                       │
    │                              │                           │                       │
    │                              │ ◄── webhook: participant_joined ──────────────   │
    │                              │ UPSERT session_participants                       │
    │                              │ INSERT session_events                              │
```

Then for the **customer**:

```
CUSTOMER BROWSER                NEXT.JS API                 SUPABASE                LIVEKIT SFU
    │                              │                           │                       │
    │ GET /api/invite/{inviteId}   │                           │                       │
    │ (preview: valid? title?)  ►  │                           │                       │
    │                              │ getSessionByInvite()      │                       │
    │                              │ ────────────────────────► │                       │
    │ ◄── {valid: true, title}     │                           │                       │
    │                              │                           │                       │
    │ POST /api/token              │                           │                       │
    │  {inviteId, name}  ────────► │                           │                       │
    │                              │ validate invite → active? │                       │
    │                              │ mintToken(roomAdmin=false)│                       │
    │ ◄── {token, wss://url}       │                           │                       │
    │                              │                           │                       │
    │ LiveKitRoom.connect(token) ──────────────────────────────────────────────────►   │
    │ ◄── WebRTC media ← both see/hear each other                                     │
```

**Key design decisions visible here:**
- Agent token gets `roomAdmin: true, roomCreate: true` → can control the room.
- Customer token gets `roomJoin: true, canPublish: true, canSubscribe: true` → can only participate.
- Customer identity is **namespaced** as `customer-{clientId}` → can never impersonate `agent-{userId}`.
- All role enforcement happens in `POST /api/token` — the **single choke point**.

---

### Q4: Scenario — The customer drops due to a network issue. What happens? Explain the reconnect grace window.

**Answer:**

1. LiveKit detects the participant disconnect → fires `participant_left` webhook to our API.
2. The webhook handler (`/api/webhooks/livekit`) does **NOT** immediately treat this as a permanent leave:

```typescript
// In the webhook handler:
case "participant_left": {
  const now = new Date().toISOString();
  await admin
    .from("session_participants")
    .update({ disconnected_at: now, left_at: now })
    .eq("session_id", sid)
    .eq("identity", p.identity);
  // ...
}
```

3. `disconnected_at` is set to the current timestamp — this **starts the grace window**.

4. If the customer reconnects within `RECONNECT_GRACE_SECONDS` (default 30s), the `participant_joined` webhook fires again:

```typescript
case "participant_joined": {
  // Check if they recently disconnected
  const { data: existing } = await admin
    .from("session_participants")
    .select("id, disconnected_at, reconnect_count")
    .eq("session_id", sid)
    .eq("identity", p.identity)
    .maybeSingle();

  const within =
    existing?.disconnected_at &&
    Date.now() - new Date(existing.disconnected_at).getTime() <= GRACE_SECONDS * 1000;

  // If within grace window: bump reconnect_count, suppress join event
  // If outside: treat as new join, emit event
  if (!within) {
    await admin.from("session_events").insert({
      session_id: sid,
      type: "participant_joined",
      // ...
    });
  }
}
```

5. **Within grace**: `reconnect_count` increments, `disconnected_at` clears, **no new join event** is emitted → the reconnect is **silent** to the session history.
6. **Outside grace (>30s)**: treated as a fresh join, a new `participant_joined` event is logged.

**Why this matters:** It prevents noisy session logs full of "left → joined → left → joined" from flaky mobile networks. The agent sees a smooth experience.

---

### Q5: Scenario — What if 1000 agents are creating sessions simultaneously? How does the system scale?

**Answer:**

**App plane scaling (horizontal):**
- Next.js route handlers on Vercel are **serverless functions** — they scale horizontally to thousands of concurrent requests automatically.
- Each request is stateless: it reads the auth cookie, hits Supabase, and returns.
- No in-memory state in the app layer (the singleton pattern for LiveKit clients is per-function instance, not shared globally).

**Database scaling:**
- Supabase Postgres with connection pooling via Supavisor (session pooler).
- Indexes on hot paths: `sessions_agent_idx`, `sessions_invite_idx`, `sp_session_idx`.
- RLS policies use indexed columns (`agent_id`, `auth.uid()`).

**Media plane scaling (the bottleneck):**
- Single-node LiveKit is the current limitation (acknowledged in the docs).
- LiveKit supports **multi-node clustering** via Redis for horizontal SFU scaling.
- Each room is pinned to one node; new rooms can be routed to the least-loaded node.
- For the hackathon: single-node is fine for many small concurrent calls.

**Caching layer:**
- Upstash Redis (HTTP, serverless-safe) caches hot reads: invite lookups, admin live snapshot, recording status, metrics.
- TTLs prevent stale data; all invalidation funnels through the webhook handler.

---

### Q6: Why not use WebSockets for chat? Why LiveKit's data channel?

**Answer:**

LiveKit's data channel is **already open** as part of the WebRTC connection:
- No additional WebSocket server to deploy or manage.
- Messages travel over the same encrypted DTLS transport as media.
- `reliable: true` ensures ordered, guaranteed delivery (like TCP within the WebRTC connection).
- The `useDataChannel("chat")` React hook from `@livekit/components-react` gives us pub/sub out of the box.

Chat is a **dual-write** system:
1. **Real-time delivery**: via the LiveKit data channel (instant, in-call).
2. **Durable persistence**: via `POST /api/chat` → Supabase (survives beyond the call).

On join, the chat panel **hydrates** prior history from `GET /api/chat?session={id}` so a late-joining participant sees the full conversation.

---

## 2. Coding Deep-Dives (Every Key File Explained)

### 2.1 Token Minting — `app/api/token/route.ts` (THE enforcement point)

**What it does:** This is the **single security choke point** for the entire system. Every participant (agent or customer) must obtain a LiveKit token from this endpoint before they can join a room.

**Code walkthrough:**

```typescript
// TWO PATHS — Agent and Customer
export async function POST(request: Request) {
  const body = await request.json();
  const user = await getAuthedUser(); // Checks Supabase auth cookie

  // ── Agent path ──
  if (user && body.sessionId) {
    const session = await getSessionById(body.sessionId);
    // 1. Session must exist
    // 2. User must own it OR be admin
    // 3. Session must be active
    if (user.role !== "admin" && session.agent_id !== user.id) → 403
    if (session.status !== "active") → 403

    const token = await mintToken({
      room: session.room_name,
      identity: `agent-${user.id}`,  // Namespaced identity
      isAgent: true,                  // → roomAdmin + roomCreate
    });
    return { token, url, room, sessionId, role: "agent" };
  }

  // ── Customer path ──
  if (body.inviteId) {
    const session = await getSessionByInvite(body.inviteId);
    // 1. Invite must map to an active session
    if (!session || session.status !== "active") → 403

    const token = await mintToken({
      room: session.room_name,
      identity: `customer-${clientId}`,  // Namespaced — can't impersonate
      isAgent: false,                     // → join + publish only, NO admin
    });
    return { token, url, room, sessionId, role: "customer" };
  }
}
```

**Why this design matters:**
- **Single enforcement point** — all role logic is here, not scattered across routes.
- **Server-side only** — the client never decides its own permissions.
- **Identity namespacing** — `agent-` vs `customer-` prefixes prevent identity spoofing.
- **`force-dynamic` + `no-store`** — tokens are never cached; each is unique and short-lived (4h TTL).

---

### 2.2 Token Generation — `lib/livekit/token.ts`

```typescript
export async function mintToken({ room, identity, name, isAgent }: MintTokenArgs) {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity, name, ttl: '4h' },
  );

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // CRITICAL: only agents get admin powers
    roomAdmin: isAgent,
    roomCreate: isAgent,
  });

  return at.toJwt(); // Returns a signed JWT
}
```

**Key points:**
- The JWT is **signed with the LiveKit API secret** — can't be forged client-side.
- `roomAdmin: true` lets agents do: delete room, mute others, kick participants.
- `roomCreate: true` lets the room be auto-created when the agent connects.
- Customers get `false` for both → they can only participate, never control.

---

### 2.3 Session Management — `lib/sessions.ts`

```typescript
export async function createSession(agentId: string, title?: string): Promise<Session> {
  const admin = createAdminClient(); // Service key — bypasses RLS
  const { data } = await admin.from("sessions").insert({
    room_name: newRoomName(),   // "clarivue-{random8}" — unique per session
    invite_id: newInviteId(),   // 16 random bytes → base64url (~22 chars, 128-bit entropy)
    agent_id: agentId,
    title: title?.trim() || "Support session",
    status: "active",
  }).select("*").single();

  await invalidate(K.liveSessions()); // Bust cache so admin sees it immediately
  return data as Session;
}
```

**Invite ID security** (`lib/invites.ts`):
```typescript
import { randomBytes } from 'crypto';

export function newInviteId(): string {
  return randomBytes(16).toString('base64url'); // 128-bit entropy
}
```
- 128 bits = 3.4 × 10³⁸ possibilities → brute-forcing is cryptographically infeasible.
- URL-safe encoding → works directly in URLs without escaping.

---

### 2.4 Webhook Handler — `app/api/webhooks/livekit/route.ts`

This is the **single place room state changes are recorded**. It handles:

| Event | Action |
|-------|--------|
| `participant_joined` | Upsert participant row, handle reconnect grace, emit event |
| `participant_left` | Set `disconnected_at` + `left_at`, emit event |
| `room_finished` | Mark session `ended`, invalidate caches |
| `egress_started/ended` | Update recording status (`in_progress` → `ready`/`failed`) |

**Security:** Every webhook is verified with `WebhookReceiver`:
```typescript
const event = await webhookReceiver().receive(body, auth);
// If unsigned or tampered → throws → 401 response
```

**Reconnect grace** (explained in Q4 above) is implemented here with:
```typescript
const GRACE_SECONDS = Number(process.env.RECONNECT_GRACE_SECONDS ?? 30);

const within =
  existing?.disconnected_at &&
  Date.now() - new Date(existing.disconnected_at).getTime() <= GRACE_SECONDS * 1000;
```

---

### 2.5 Chat Persistence — `app/api/chat/route.ts`

**Dual path for chat:**

```typescript
// POST: persist a message (called after data channel broadcast)
export async function POST(request: Request) {
  // 1. Validate access (agent via auth, customer via invite)
  const access = await canAccessSession({ sessionId, inviteId });
  if (!access) → 403

  // 2. Insert into chat_messages
  await admin.from("chat_messages").insert({
    session_id: body.sessionId,
    sender_identity: body.senderIdentity,
    sender_role: access.role,    // Role determined server-side, not from client
    body: text,
  });
}

// GET: retrieve chat history (used on join for hydration + post-call review)
export async function GET(request: Request) {
  const access = await canAccessSession({ sessionId, inviteId });
  if (!access) → 403

  const { data } = await admin.from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
}
```

**Important:** `sender_role` is set from `access.role` (determined server-side), not from the client-provided `senderRole`. This prevents role spoofing.

---

### 2.6 Access Control — `lib/access.ts`

This is the shared authorization function used by chat, files, and any session-scoped action:

```typescript
export async function canAccessSession(args: {
  sessionId: string;
  inviteId?: string;
}): Promise<SessionAccess | null> {
  const session = await getSessionById(args.sessionId);
  if (!session) return null;

  // Path 1: Authenticated user (agent/admin)
  const user = await getAuthedUser();
  if (user && (user.role === "admin" || session.agent_id === user.id)) {
    return { session, role: user.role };
  }

  // Path 2: Anonymous customer via valid invite
  if (args.inviteId) {
    const byInvite = await getSessionByInvite(args.inviteId);
    if (byInvite && byInvite.id === session.id && byInvite.status === "active") {
      return { session, role: "customer" };
    }
  }

  return null; // Denied
}
```

**Three checks for customer access:**
1. The invite must map to a real session.
2. That session must match the requested `sessionId` (prevents using invite A to access session B).
3. The session must be `active` (ended sessions can't be joined).

---

### 2.7 Authentication — `lib/auth.ts`

```typescript
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();        // Server client bound to request cookies
  const { data: { user } } = await supabase.auth.getUser(); // getUser(), NOT getSession()
  if (!user) return null;

  const admin = createAdminClient();             // Service key to read profiles
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    role: (profile?.role as Role) ?? "agent",
  };
}
```

**Why `getUser()` instead of `getSession()`:**
- `getUser()` makes a **round-trip to Supabase Auth** to verify the JWT is still valid.
- `getSession()` only reads the local JWT without verification — a revoked session would still pass.
- This is the **secure** approach recommended by Supabase for server-side auth checks.

---

### 2.8 Three Supabase Clients — `lib/supabase/`

| Client | File | Purpose | Key |
|--------|------|---------|-----|
| **Browser** | `client.ts` | Client Components, locked by RLS | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Server** | `server.ts` | Server Components / Route Handlers, reads auth cookies | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + cookies |
| **Admin** | `admin.ts` | Service-role, **bypasses RLS** | `SUPABASE_SERVICE_KEY` (never `NEXT_PUBLIC_`) |

**Why three?**
- The browser client uses the publishable anon key — safe to expose, locked down by RLS.
- The server client reads the request cookies to get the authenticated user — used for `getAuthedUser()`.
- The admin client uses the service key to bypass RLS — this is how **anonymous customers' validated reads/writes** reach the database (after invite validation in API routes).

**Critical security rule:** The service key is `SUPABASE_SERVICE_KEY`, NOT `NEXT_PUBLIC_SUPABASE_SERVICE_KEY`. The `NEXT_PUBLIC_` prefix would expose it to the browser bundle.

---

### 2.9 File Sharing — `app/api/files/route.ts`

```typescript
// Validation pipeline:
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB limit
const ALLOWED = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain",
  "application/msword", /* .doc */
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", /* .docx */
  /* ... spreadsheets ... */
];

// Flow:
// 1. Parse FormData
// 2. Validate access (canAccessSession)
// 3. Check file size (≤ 25 MB)
// 4. Check MIME type (whitelist)
// 5. Upload to Supabase Storage (private bucket, service key)
// 6. Record metadata in shared_files table
// 7. Generate short-lived signed URL (1 hour)
// 8. Return URL for in-chat rendering
```

**Why server-mediated uploads?** Anonymous customers can't write to Supabase Storage directly (no auth token). The server validates the invite, then uploads using the service key.

---

### 2.10 Recording Pipeline — `app/api/recordings/start/route.ts` & `stop/route.ts`

**Start recording:**
```typescript
// 1. Verify agent ownership
// 2. Call LiveKit Egress API
const info = await egressClient().startRoomCompositeEgress(
  session.room_name,
  buildFileOutput(filepath),  // S3 output config → Supabase Storage
);

// 3. Insert recording row with status "in_progress"
// 4. Log event "recording_started"
```

**Stop recording:**
```typescript
// 1. Verify ownership
// 2. Call egressClient().stopEgress(rec.egress_id)
// 3. Update status to "processing"
// 4. The egress_ended webhook will flip it to "ready" or "failed"
```

**S3 output config** (`lib/livekit/egress.ts`):
```typescript
export function buildFileOutput(filepath: string): EncodedFileOutput {
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: process.env.SUPABASE_S3_ACCESS_KEY,
        secret: process.env.SUPABASE_S3_SECRET_KEY,
        region: 'ap-southeast-1',
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/s3`,
        bucket: 'recordings',
        forcePathStyle: true,  // Required for Supabase's S3-compatible API
      }),
    },
  });
}
```

**Recording lifecycle state machine:**
```
Agent clicks Record → POST /api/recordings/start
  → startRoomCompositeEgress() → INSERT recording (status: "in_progress")

Agent clicks Stop → POST /api/recordings/stop
  → stopEgress() → UPDATE recording (status: "processing")

LiveKit Egress finishes → webhook "egress_ended"
  → UPDATE recording (status: "ready", ready_at: now())

Agent downloads → GET /api/recordings/{id}/download
  → createSignedUrl() → redirect to signed S3 URL
```

---

### 2.11 Admin Dashboard — `components/admin/AdminClient.tsx`

The admin dashboard uses **SWR** for polling with different intervals:

| Data | Endpoint | Poll Interval |
|------|----------|---------------|
| Live sessions + participants | `/api/admin/live` | 3 seconds |
| Session history | `/api/sessions` | 10 seconds |
| Auth metrics (users, signups, confirmations) | `/api/admin/auth-metrics` | 30 seconds |

**`/api/admin/live`** merges LiveKit room state with Supabase session data:
```typescript
const rooms = await roomService().listRooms();         // From LiveKit
const participants = await roomService().listParticipants(room.name);
// Cross-reference with sessions table for title, agent, timestamps
```

**`/api/admin/auth-metrics`** provides real user authentication data:
```typescript
// From profiles table: totalUsers, agents, admins, signups (7d/30d)
// From auth.admin.listUsers(): email_confirmed_at → confirmed vs pending
// From sessions table: total/active/ended counts
```

---

### 2.12 Proxy (Middleware) — `proxy.ts`

```typescript
export async function proxy(request: NextRequest) {
  // 1. Create Supabase server client bound to cookies
  // 2. Refresh the auth session (extends cookie TTL)
  // 3. Check if path is protected (/agent/* or /admin/*)
  // 4. If protected and no user → redirect to /login?redirect={path}
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**Important:** This is **UX only**, not a security boundary. The real security is `getAuthedUser()` in every API route handler.

---

### 2.13 Cache Layer — `lib/cache.ts`

```typescript
// Optional Upstash Redis cache — falls through gracefully if not configured
export async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  if (!redis) return fetcher();  // No cache? Just fetch.
  try {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    // Cache read failure must never break the request
  }
  const fresh = await fetcher();
  try {
    if (fresh !== null && fresh !== undefined) await redis.set(key, fresh, { ex: ttl });
  } catch { /* ignore write failures */ }
  return fresh;
}
```

**Cache key scheme:**
```typescript
export const K = {
  invite: (id: string) => `invite:${id}`,       // Invite validation (TTL: 60s)
  liveSessions: () => 'live:sessions',           // Admin live snapshot (TTL: 5s)
  recording: (sessionId: string) => `rec:${sessionId}`,
  metrics: () => 'metrics:snapshot',             // Prometheus metrics (TTL: 10s)
  chat: (sessionId: string) => `chat:${sessionId}`,
};
```

**Invalidation is centralized:** All cache busting happens in the webhook handler — the single place room state changes. This prevents the cache from silently drifting.

---

### 2.14 Prometheus Metrics — `lib/metrics.ts` & `app/api/metrics/route.ts`

```typescript
// Singleton registry (survives hot reloads via globalThis)
const g = globalThis as unknown as { __clarivueMetrics?: MetricsBundle };

// Custom gauges:
// clarivue_active_sessions   — sessions marked active in DB
// clarivue_connected_participants — total across all live rooms
// clarivue_live_rooms        — number of LiveKit rooms
// clarivue_errors_total      — handled application errors (counter)

// Plus Node.js default metrics (GC, event loop, memory, etc.)
```

The `/api/metrics` endpoint returns standard Prometheus text format, scrapable by Prometheus/Grafana.

---

### 2.15 Call Room UI — `components/call/CallRoom.tsx`

```typescript
export function CallRoom({ token, serverUrl, sessionId, role, ... }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  return (
    <LiveKitRoom token={token} serverUrl={serverUrl} connect audio video>
      {/* Stage — video tiles for all participants */}
      <Stage />

      {/* Floating controls — mic, camera, screen share, chat, leave */}
      <ControlBar ... />

      {/* Chat side panel — data channel + API persistence */}
      <ChatPanel ... />

      {/* Renders audio from all remote participants */}
      <RoomAudioRenderer />
      <StartAudio label="Click to enable audio" />
    </LiveKitRoom>
  );
}
```

**LiveKitRoom** handles: WebRTC connection, ICE negotiation, SDP exchange, media track management, reconnection — all via the `@livekit/components-react` SDK.

---

### 2.16 Control Bar — `components/call/ControlBar.tsx`

```typescript
const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
  useLocalParticipant();

// Toggle microphone:
localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)

// Toggle camera:
localParticipant.setCameraEnabled(!isCameraEnabled)

// Toggle screen share:
localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
```

Each control is a `CtrlButton` with appropriate ARIA labels and visual state (green = on, red tint = off).

---

### 2.17 Chat Panel — `components/call/ChatPanel.tsx`

**Real-time messaging flow:**

```typescript
// 1. Hook into LiveKit data channel
const { message, send } = useDataChannel("chat");

// 2. Broadcast a message to all peers
function broadcast(payload: ChatWirePayload) {
  send(encoder.encode(JSON.stringify(payload)), { reliable: true });
}

// 3. Send: broadcast + local append + API persist
async function sendMessage(e: React.FormEvent) {
  broadcast(payload);           // Instant delivery to peer
  setMessages(prev => [...prev, localMsg]);  // Show locally immediately
  fetch("/api/chat", { ... }); // Persist to DB (fire-and-forget)
}

// 4. Receive: listen for data channel messages
useEffect(() => {
  if (!message) return;
  const p = JSON.parse(decoder.decode(message.payload)) as ChatWirePayload;
  setMessages(prev => [...prev, remoteMsg]);
  if (!open) onIncoming(); // Trigger unread badge
}, [message]);

// 5. Hydrate: load prior history on mount
useEffect(() => {
  fetch(`/api/chat?session=${sessionId}`).then(/* populate messages */);
}, []);
```

**File sharing** is integrated into the same panel:
```typescript
async function uploadFile(file: File) {
  // 1. Upload via /api/files → returns signed URL
  // 2. Broadcast file card via data channel
  // 3. Append to local messages with kind: "file"
}
```

---

### 2.18 Auth Signup — `app/api/auth/signup/route.ts`

```typescript
// 1. Validate email + password (min 6 chars)
// 2. Call supabase.auth.signUp() → sends confirmation email via Gmail SMTP
// 3. Create profiles row via admin client (service key)
// 4. Check for duplicate accounts (identities array empty = existing unconfirmed user)
// 5. Return { confirmationSent: true }
```

### 2.19 Auth Callback — `app/auth/callback/route.ts`

Handles **two** verification paths:
```typescript
// Path 1: PKCE code exchange (if URL has ?code=...)
if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) → redirect to /agent/dashboard
}

// Path 2: Token-hash OTP (if URL has ?token_hash=...&type=signup)
if (token_hash && type) {
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (!error) → redirect to /agent/dashboard
}
```

**Why dual-path?** Supabase can send either format depending on the project's auth configuration. Supporting both ensures email confirmation always works.

---

## 3. System Workflow & Data Flow

### End-to-End Session Lifecycle

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  1. SIGNUP   │────►│  2. LOGIN    │────►│  3. DASHBOARD  │────►│  4. CREATE   │
│  /signup     │     │  /login      │     │  /agent/dash   │     │  SESSION     │
│              │     │              │     │  (SSR + client) │     │  POST /api/  │
│  signUp() →  │     │  signIn() →  │     │                │     │  sessions    │
│  confirm     │     │  cookie set  │     │  See sessions  │     │              │
│  email       │     │              │     │  + Start button│     │  room_name + │
└─────────────┘     └──────────────┘     └────────────────┘     │  invite_id   │
                                                                  └──────┬───────┘
                                                                         │
                                                                         ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  8. REVIEW   │◄────│  7. END      │◄────│  6. IN-CALL    │◄────│  5. JOIN     │
│  Session     │     │  POST /api/  │     │  - A/V (SFU)   │     │  POST /api/  │
│  record page │     │  sessions/   │     │  - Chat (DC)   │     │  token       │
│              │     │  {id}/end    │     │  - File share  │     │              │
│  chat, files │     │              │     │  - Screen share│     │  Agent gets  │
│  participants│     │  deleteRoom()│     │  - Record      │     │  roomAdmin   │
│  events      │     │  endSession()│     │                │     │  Customer    │
│  recordings  │     │              │     │  Webhooks ──►  │     │  gets join   │
└─────────────┘     └──────────────┘     │  persist all   │     └──────────────┘
                                          └────────────────┘
```

### Data Flow During a Call

```
BROWSER A (Agent)                         BROWSER B (Customer)
    │                                          │
    │◄──── WebRTC media (SFU-routed) ────────►│
    │                                          │
    │◄──── Data channel (chat + files) ──────►│
    │                                          │
    │── POST /api/chat ──► Supabase ◄── POST /api/chat ──│
    │                                          │
    │── POST /api/files ──► Storage ◄── POST /api/files ──│
    │                                          │
    │                  LiveKit SFU             │
    │              ┌──────────────┐            │
    │              │ Webhooks ──────────► Next.js API
    │              │ participant_joined   ──► Supabase
    │              │ participant_left     ──► (participants,
    │              │ room_finished        ──►  events,
    │              │ egress_ended         ──►  recordings)
    │              └──────────────┘
```

---

## 4. Security & Access Control

### Q: How do you prevent a customer from performing agent actions?

**Multi-layer defense:**

| Layer | Mechanism | What it prevents |
|-------|-----------|-----------------|
| **LiveKit token grants** | Customers get `roomAdmin: false, roomCreate: false` | Can't delete room, kick people, or create rooms |
| **Identity namespacing** | `customer-{id}` vs `agent-{userId}` | Can't impersonate an agent |
| **API route auth** | `getAuthedUser()` checks Supabase auth | Customers can't hit `/api/sessions`, `/api/recordings/*`, `/api/admin/*` |
| **Access validation** | `canAccessSession()` validates invite for customer paths | Can't access sessions they weren't invited to |
| **RLS policies** | `agent_id = auth.uid() OR is_admin()` | Even with a leaked service key, RLS adds defense-in-depth |
| **Invite validation** | `getSessionByInvite()` checks status is `active` | Ended session invites are dead links |

### Q: What about CSRF/XSS?

- **CSRF:** Supabase Auth uses `httpOnly`, `SameSite=Lax` cookies. API routes validate the cookie server-side via `getUser()`.
- **XSS:** Next.js auto-escapes JSX. User input (chat messages, names) is stored as plain text and rendered as text nodes, not HTML.
- **Service key protection:** `SUPABASE_SERVICE_KEY` is NOT prefixed with `NEXT_PUBLIC_` → never bundled into client JavaScript.

---

## 5. Database Design & RLS

### Schema Overview

```sql
profiles           -- One row per authenticated agent/admin
  ├── id (FK → auth.users)
  ├── email, role ('agent' | 'admin'), created_at

sessions           -- A support call owned by an agent
  ├── id (PK), room_name (UNIQUE), invite_id (UNIQUE)
  ├── agent_id (FK → profiles), title, status, timestamps

session_participants  -- Presence tracking
  ├── session_id + identity (UNIQUE)
  ├── display_name, role, joined_at, left_at
  ├── disconnected_at (for reconnect grace)
  ├── reconnect_count

session_events      -- Append-only audit log
  ├── session_id, type, identity, metadata (JSONB)

chat_messages       -- Persisted chat
  ├── session_id, sender_identity, sender_role, body

shared_files        -- File metadata
  ├── session_id, storage_path, file_name, mime_type, size_bytes

recordings          -- Egress lifecycle
  ├── session_id, egress_id, status, storage_path, ready_at
```

### RLS Policy Design

```sql
-- Every table has RLS enabled
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Helper function (SECURITY DEFINER = runs as the function owner)
CREATE FUNCTION public.is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

-- Sessions: agent sees own, admin sees all
CREATE POLICY sessions_owner_select ON sessions
  FOR SELECT USING (agent_id = auth.uid() OR public.is_admin());

-- Child tables: visible if parent session is visible
CREATE POLICY sp_owner_select ON session_participants
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = session_id AND (s.agent_id = auth.uid() OR public.is_admin())
  ));

-- NO INSERT/UPDATE/DELETE policies for child tables
-- All mutations go through the service key (bypasses RLS)
-- This keeps the anon/auth client locked down by default
```

**Why no write policies?** All writes happen through API routes using the service key. The browser client (anon key) can only SELECT. This is simpler and more secure than trying to write complex RLS write policies.

---

## 6. Real-Time Communication & WebRTC

### Q: Explain how WebRTC works in ClariVue. What is an SFU?

**SFU (Selective Forwarding Unit):**
- In P2P WebRTC, each participant sends their media directly to every other participant → O(n²) connections.
- An SFU sits in the middle: each participant sends one stream **up** to the SFU, and the SFU **forwards** it to all other participants → O(n) connections per participant.
- LiveKit is an SFU. All media flows: `Browser → LiveKit → Other Browsers`.

**Connection flow:**
```
1. Browser gets a LiveKit token (JWT with room + identity + grants)
2. Browser connects to LiveKit via WebSocket (ws:// or wss://)
3. WebSocket carries: SDP offer/answer, ICE candidates, room events
4. Media flows over WebRTC (SRTP over DTLS, typically UDP)
5. If UDP is blocked → ICE/TCP fallback on port 7881
```

**ICE/TCP fallback** is critical for Docker Desktop, where UDP candidates from inside the container aren't reachable across the Docker VM boundary. Port 7881 provides reliable TCP transport.

### Q: What is the data channel and how do you use it?

- WebRTC data channels are bidirectional, peer-to-peer (through the SFU) data pipes.
- LiveKit exposes them as named channels (we use `"chat"`).
- `useDataChannel("chat")` from `@livekit/components-react` gives us `send()` and `message`.
- Messages are `TextEncoder`'d JSON payloads of type `ChatWirePayload`.
- `reliable: true` ensures in-order, guaranteed delivery (TCP semantics).

---

## 7. Recording & File Sharing Pipeline

### Q: Walk through the recording lifecycle.

```
         Agent clicks Record
              │
              ▼
    POST /api/recordings/start
    ├─ getAuthedUser() → verify agent
    ├─ getSessionById() → verify ownership
    ├─ egressClient().startRoomCompositeEgress()
    │     └─ LiveKit Egress container captures all video+audio
    │     └─ Writes MP4 to Supabase Storage via S3 protocol
    ├─ INSERT recordings (status: "in_progress")
    └─ INSERT session_events (type: "recording_started")
              │
              │  UI shows red "● Recording" pill
              │
              ▼
    Agent clicks Stop
    POST /api/recordings/stop
    ├─ egressClient().stopEgress(egressId)
    ├─ UPDATE recordings (status: "processing")
              │
              │  UI shows "⟳ Processing…" pill
              │
              ▼
    LiveKit Egress finishes processing
    → webhook "egress_ended" → /api/webhooks/livekit
    ├─ Check EgressStatus.EGRESS_COMPLETE
    ├─ UPDATE recordings (status: "ready", ready_at: now())
              │
              │  UI shows "✓ Recording ready" pill with download link
              │
              ▼
    Agent clicks Download
    GET /api/recordings/{id}/download
    └─ createSignedUrl() → redirect to signed S3 URL (temporary)
```

### Q: How does file sharing work for anonymous customers?

The customer **cannot directly upload** to Supabase Storage (no auth token). The flow:

1. Customer selects a file in the ChatPanel.
2. `uploadFile()` sends a `FormData` POST to `/api/files`.
3. The API route calls `canAccessSession({ sessionId, inviteId })` — validates the invite.
4. If valid, it uploads the file using the **service key** (bypasses Storage RLS).
5. It records metadata in `shared_files` table.
6. Returns a **signed URL** (1-hour expiry) for the file.
7. The customer broadcasts the file card via the data channel → the agent sees it instantly.

---

## 8. Caching, Metrics & Observability

### Q: Explain your caching strategy.

**Architecture:** Cache-aside pattern over Upstash Redis (HTTP, serverless-safe).

```
Request → Check Redis cache
  ├─ HIT → return cached data
  └─ MISS → fetch from source → store in Redis (with TTL) → return
```

**Key design decisions:**
1. **Optional:** If `UPSTASH_REDIS_REST_URL` is unset, every call falls through to the source. Local dev is zero-config.
2. **Fail-open:** Cache read/write errors are swallowed → the request always succeeds via the source.
3. **Centralized invalidation:** All cache busting happens in the webhook handler — the single mutation point for room state.
4. **Never cache auth/tokens:** Auth responses and LiveKit tokens are always `no-store`.

### Q: What Prometheus metrics do you expose?

| Metric | Type | Description |
|--------|------|-------------|
| `clarivue_active_sessions` | Gauge | Sessions with status `active` |
| `clarivue_connected_participants` | Gauge | Total connected across all rooms |
| `clarivue_live_rooms` | Gauge | Number of LiveKit rooms |
| `clarivue_errors_total` | Counter | Handled application errors |
| Node.js defaults | Various | GC, event loop lag, memory, file descriptors |

---

## 9. Deployment & DevOps

### Q: How is the app deployed?

```
┌──────────────────────────────────────────────────────┐
│  VERCEL (Cloud)                                       │
│  ├─ Next.js app (UI + API routes)                     │
│  └─ Env vars: Supabase keys, LiveKit tunnel URL       │
│          ▲                                            │
│          │ HTTPS                                      │
│          │                                            │
│  ┌───────┴────────────────────────────────────────┐  │
│  │  SUPABASE (Cloud, ap-southeast-1)              │  │
│  │  ├─ Postgres + RLS                             │  │
│  │  ├─ Auth (JWT, email confirmation via SMTP)    │  │
│  │  └─ Storage (recordings + files)               │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  CLOUDFLARED TUNNEL (ephemeral public URL)      │  │
│  │  trycloudflare.com → localhost:7880             │  │
│  └───────────────────────────────┬────────────────┘  │
│                                   │                   │
│  ┌───────────────────────────────┴────────────────┐  │
│  │  LOCAL DOCKER (Self-hosted media plane)         │  │
│  │  ├─ LiveKit SFU (:7880 signal, :7881 ICE/TCP)  │  │
│  │  ├─ Egress (recording, --profile recording)     │  │
│  │  └─ Redis                                       │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Q: What happens when the cloudflared tunnel drops?

`trycloudflare` quick tunnels are **ephemeral** — they die on machine sleep or network blips.

When the tunnel drops:
1. `NEXT_PUBLIC_LIVEKIT_URL` (baked into the client bundle at build time) points to a dead URL.
2. Live video and recording-start break.

**Recovery:** One PowerShell script does everything:
```powershell
powershell -ExecutionPolicy Bypass -File infra\redeploy-tunnel.ps1
```
This: restarts `cloudflared` → gets a new URL → updates Vercel env vars → redeploys the app.

### Docker Compose

```yaml
services:
  redis:           # State store for LiveKit
    image: redis:7-alpine
    ports: ["6379:6379"]

  livekit:          # Self-hosted SFU
    image: livekit/livekit-server:latest
    ports:
      - "7880:7880"                 # WebSocket signal
      - "7881:7881"                 # ICE/TCP fallback
      - "50000-50019:50000-50019/udp"  # ICE/UDP

  egress:           # Recording (optional profile)
    image: livekit/egress:latest
    profiles: ["recording"]
    cap_add: [SYS_ADMIN]   # Required for Chrome headless (room composite)
    shm_size: "1gb"        # Shared memory for Chrome
```

---

## 10. Problem Statement Requirement Coverage (R1–R20)

| # | Requirement | Type | Implementation | File(s) |
|---|-------------|------|----------------|---------|
| R1 | Agent creates session with invite link | MH | `POST /api/sessions` → generates `room_name` + `invite_id` (128-bit random) | `app/api/sessions/route.ts`, `lib/sessions.ts`, `lib/invites.ts` |
| R2 | Both join from browser, no install | MH | Next.js + LiveKit web SDK | `components/call/CallRoom.tsx` |
| R3 | Track who's in a session | MH | `session_participants` table + LiveKit webhooks | `app/api/webhooks/livekit/route.ts` |
| R4 | Either party ends; connections closed | MH | `POST /api/sessions/[id]/end` → `RoomServiceClient.deleteRoom()` | `app/api/sessions/[id]/end/route.ts` |
| R5 | Session history persisted & queryable | MH | `sessions` + `session_events` tables, session record page | `app/api/sessions/[id]/route.ts` |
| R6 | Real-time A/V both directions | MH | LiveKit SFU (verified by two-browser test) | `components/call/Stage.tsx`, LiveKit SDK |
| R7 | Media routes through server, no P2P | MH | Self-hosted LiveKit SFU — server-routed by design | `infra/docker-compose.yml` |
| R8 | Stable under normal network | MH | ICE/TCP fallback on :7881 | `infra/livekit/livekit.yaml` |
| R9 | Mute audio / disable video | MH | `localParticipant.setMicrophoneEnabled()` / `.setCameraEnabled()` | `components/call/ControlBar.tsx` |
| R10 | In-call text chat, real-time | MH | LiveKit data channel (`useDataChannel("chat")`) | `components/call/ChatPanel.tsx` |
| R11 | Chat persisted | MH | `POST /api/chat` → `chat_messages` table | `app/api/chat/route.ts` |
| R12 | Chat retrievable after call | MH | `GET /api/chat` + session record page | `app/api/chat/route.ts`, `app/api/sessions/[id]/route.ts` |
| R13 | Role: Agent (create/end/record) | MH | Supabase auth + `roomAdmin`/`roomCreate` token grants | `app/api/token/route.ts`, `lib/livekit/token.ts` |
| R14 | Role: Customer (join by invite) | MH | Invite validation + join-only token grants | `app/api/token/route.ts` |
| R15 | Access enforced server-side | MH | `getAuthedUser()` in every privileged route | `lib/auth.ts`, all route handlers |
| R16 | Recording: start/stop/status/download | B | LiveKit Egress → Supabase Storage MP4 | `app/api/recordings/start/route.ts`, `stop/route.ts` |
| R17 | File sharing in chat | B | Server-mediated upload → Storage → signed URLs | `app/api/files/route.ts`, `ChatPanel.tsx` |
| R18 | Reconnect grace, silent re-entry | B | `disconnected_at` + 30s grace window in webhook handler | `app/api/webhooks/livekit/route.ts` |
| R19 | Admin dashboard | B | Live sessions + participants + force-end + auth metrics | `components/admin/AdminClient.tsx`, `app/api/admin/*` |
| R20 | Observability metrics | B | `/api/metrics` Prometheus exposition | `lib/metrics.ts`, `app/api/metrics/route.ts` |

**MH** = Must-Have (all 15 satisfied), **B** = Bonus (all 5 built)

---

## 11. Potential Follow-Up / Tough Questions

### Q: What would you change for production at scale?

1. **LiveKit clustering:** Multi-node LiveKit with Redis for room routing. Each node handles a subset of rooms.
2. **Database connection pooling:** PgBouncer or Supavisor in transaction mode for high concurrency.
3. **CDN for static assets:** Vercel already provides this, but recordings could use CloudFront.
4. **Rate limiting:** Add rate limiting on token minting, signup, and file upload endpoints.
5. **Monitoring:** Grafana dashboards consuming Prometheus metrics + LiveKit's native metrics.
6. **Named Cloudflare tunnel:** Replace ephemeral `trycloudflare` with a stable named tunnel on a custom domain.
7. **LiveKit on a VM:** Run on a public-IP VM (AWS EC2, GCP Compute) instead of local Docker for global accessibility.

### Q: How would you handle 10,000 concurrent users?

- **App plane:** Vercel auto-scales serverless functions. Each function handles one request, no shared state.
- **Database:** Read replicas for heavy read paths. Connection pooling. Indexes already optimize hot queries.
- **Media plane:** LiveKit multi-node clustering. Each room is pinned to one node; load balancing at the room level.
- **Caching:** Upstash Redis absorbs repeated invite lookups, admin snapshots, and metrics reads.

### Q: Why did you use Next.js route handlers instead of a separate Express/Fastify backend?

- **Colocation:** UI and API in one codebase → shared TypeScript types, no API version mismatch.
- **Deployment simplicity:** One Vercel deployment handles everything.
- **Serverless-friendly:** Route handlers are individual functions, not a monolithic server.
- **SSR integration:** Server Components can directly query the database (e.g., `AgentDashboard` page).

### Q: How do you ensure the service key never leaks to the client?

1. `SUPABASE_SERVICE_KEY` — no `NEXT_PUBLIC_` prefix → Next.js excludes it from the client bundle.
2. All admin client files import `'server-only'` — if accidentally imported in a client component, the build fails.
3. The `admin.ts` file has a comment: "Never import this into a Client Component."

### Q: What testing strategy did you use?

**Automated E2E tests** with Playwright (two real browser instances with fake camera/mic):

1. **`media-gate-test.mjs`** — Agent logs in → creates session → customer joins → asserts both see 2 live videos (self + remote) → sends chat message → asserts delivery → shares file → asserts delivery.
2. **`admin-test.mjs`** — Tests admin access control and dashboard rendering.

Both run headless against `http://localhost:3000` with `--use-fake-device-for-media-stream`.

### Q: If a customer's browser doesn't support WebRTC, what happens?

LiveKit's web SDK checks for WebRTC support. If the browser doesn't support it:
- The SDK throws an error during connection.
- The UI would show a connection error state.
- Practical impact: negligible — WebRTC is supported in all modern browsers (Chrome, Firefox, Safari, Edge).

### Q: How do you handle CORS?

- Next.js route handlers on the same domain → no CORS issues for the app.
- LiveKit uses its own CORS headers for WebSocket signaling.
- Supabase client handles CORS for auth/storage via their SDK.

### Q: What happens if the LiveKit server goes down during a call?

1. All WebRTC connections drop immediately (media plane failure).
2. LiveKit won't fire `room_finished` webhook (it's down).
3. The session stays `active` in the database.
4. When LiveKit comes back, the room no longer exists → the session is effectively orphaned.
5. **Admin can force-end** the session from the dashboard (doesn't need LiveKit).
6. For production: LiveKit supports **multi-node failover** to handle this.

### Q: Explain the difference between `force-dynamic` and normal route behavior.

```typescript
export const dynamic = "force-dynamic";
```
This tells Next.js to **never statically generate** this route — always run the handler on each request. Without it, Next.js might try to pre-render the route at build time (which would fail because it needs request cookies, dynamic data, etc.).

Combined with `Cache-Control: no-store` in response headers, this ensures:
- The route is never pre-rendered.
- The response is never cached by CDN/browser.
- Every request gets fresh, per-user data.

---

## 12. Steps to Run the System Locally (Demo Guide)

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20.9+ (developed on 26) | Runtime for Next.js |
| **Docker Desktop** | Latest | Local media plane |
| **npm** | Comes with Node | Package manager |
| **Supabase project** | Free tier | Database, Auth, Storage |
| **Git** | Latest | Version control |

### Step 1: Clone & Install

```bash
# Clone the repository
git clone https://github.com/Gurjas2112/ClariVue.git
cd ClariVue

# Install root tooling (DB scripts, Playwright)
npm install

# Install web app dependencies
cd apps/web && npm install && cd ../..
```

### Step 2: Start the Media Plane (Docker)

```bash
cd infra
docker compose up -d        # Starts Redis + LiveKit SFU

# (Optional) For recording support:
# SUPABASE_S3_ACCESS_KEY=... SUPABASE_S3_SECRET_KEY=... docker compose --profile recording up -d

cd ..
```

**Verify:** `docker ps` should show `redis` and `livekit` containers running.

LiveKit listens on:
- `ws://localhost:7880` — WebSocket signaling
- `:7881` — ICE/TCP fallback
- `:50000-50019/udp` — ICE/UDP

### Step 3: Set Up Database (Supabase)

**Option A — Automated:**
```bash
# Get your session-pooler connection string from:
# Supabase Dashboard → Project Settings → Database → Connection string (Session mode)
DB_URL="postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres" \
  npm run db:apply
```

**Option B — Manual:**
1. Open Supabase SQL Editor.
2. Paste contents of `supabase/migrations/0001_init.sql` → Run.
3. Paste contents of `supabase/seed.sql` → Run.

### Step 4: Configure Environment

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:
```env
# Supabase (from Dashboard → Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-role-key>

# LiveKit (local Docker defaults)
LIVEKIT_URL=http://localhost:7880
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 5: Start the App

```bash
cd apps/web

# Option A: Development mode (compiles routes on demand, slower first load)
npm run dev

# Option B: Production mode (recommended for demo — instant routes)
npm run build && npm start
```

App is now live at **http://localhost:3000**.

### Step 6: Create Demo Accounts

1. **Sign up an agent:**
   - Go to `http://localhost:3000/signup`
   - Enter email + password
   - Check email for confirmation link → click to confirm
   - Sign in at `/login`

2. **Promote to admin (optional):**
   ```sql
   -- Run in Supabase SQL Editor:
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

3. **Seed demo data (optional):**
   ```bash
   DB_URL="...pooler..." node scripts/seed-demo.mjs
   ```

### Step 7: Demo Script (What to Show the Interviewer)

1. **Agent login** → `/login` with agent credentials.
2. **Create session** → Click "Start support session" → copy invite link.
3. **Customer joins** → Open invite link in incognito/second browser → enter name → join.
4. **Show two-way video** — both participants see and hear each other.
5. **Mute/camera controls** — toggle mic, camera, screen share.
6. **Chat** — send messages back and forth (appears in real-time).
7. **File sharing** — share an image or PDF (renders inline in chat).
8. **Recording** *(if egress is running)* — Start recording → stop → processing → ready → download.
9. **Admin dashboard** → `/admin` → show auth metrics, live sessions, force-end.
10. **End call** → click Leave or End session.
11. **Session record** → view the post-call record: participants, chat transcript, shared files, events.

### Step 8: Run Automated Tests

```bash
# Media test: proves two-way video + chat + file sharing through the SFU
node scripts/media-gate-test.mjs

# Admin test: proves access control + dashboard rendering
node scripts/admin-test.mjs
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm run dev` is slow | Use `npm run build && npm start` instead (OneDrive I/O issue) |
| Video doesn't connect | Check `docker ps` — LiveKit must be running. Check port 7880/7881 |
| Auth errors | Verify Supabase keys in `.env.local`. Run `getUser()` debug. |
| Recording fails | Need egress container (`--profile recording`) + S3 keys |
| Email confirmation not arriving | Check Supabase SMTP settings (Custom SMTP → Gmail App Password) |
| Database errors | Run `npm run db:apply` again or check SQL in Supabase Editor |

---

## Quick Reference: Complete File Structure

```
ClariVue/
├── apps/web/                          # Next.js 16 application
│   ├── app/
│   │   ├── page.tsx                   # Landing page
│   │   ├── layout.tsx                 # Root layout
│   │   ├── globals.css                # Global styles (Tailwind v4)
│   │   ├── login/page.tsx             # Agent login form
│   │   ├── signup/page.tsx            # Agent signup form
│   │   ├── auth/callback/route.ts     # Email confirmation handler (PKCE + OTP)
│   │   ├── admin/page.tsx             # Admin dashboard page
│   │   ├── agent/
│   │   │   ├── dashboard/page.tsx     # Agent dashboard (SSR + client)
│   │   │   └── session/[id]/page.tsx  # In-call / session record page
│   │   ├── join/[inviteId]/page.tsx   # Customer join page
│   │   └── api/
│   │       ├── token/route.ts         # ★ Token minting (THE enforcement point)
│   │       ├── sessions/
│   │       │   ├── route.ts           # POST: create session | GET: list sessions
│   │       │   └── [id]/
│   │       │       ├── route.ts       # GET: session detail + all related data
│   │       │       ├── end/route.ts   # POST: end session + close LiveKit room
│   │       │       └── delete/route.ts# DELETE: delete session + all data
│   │       ├── chat/route.ts          # POST: persist chat | GET: chat history
│   │       ├── files/route.ts         # POST: upload file (server-mediated)
│   │       ├── invite/[inviteId]/route.ts # GET: invite preview (valid? title?)
│   │       ├── recordings/
│   │       │   ├── route.ts           # GET: recording status for a session
│   │       │   ├── start/route.ts     # POST: start egress recording
│   │       │   ├── stop/route.ts      # POST: stop egress recording
│   │       │   └── [id]/download/     # GET: signed URL redirect for download
│   │       ├── webhooks/livekit/route.ts # POST: webhook sink (ALL room state changes)
│   │       ├── metrics/route.ts       # GET: Prometheus metrics exposition
│   │       ├── auth/signup/route.ts   # POST: agent signup + confirmation email
│   │       └── admin/
│   │           ├── live/route.ts      # GET: live rooms + participants (admin only)
│   │           └── auth-metrics/route.ts # GET: user auth metrics (admin only)
│   ├── components/
│   │   ├── TopBar.tsx                 # Navigation bar with admin link
│   │   ├── call/
│   │   │   ├── CallRoom.tsx           # In-call experience wrapper
│   │   │   ├── Stage.tsx              # Video tile grid
│   │   │   ├── ControlBar.tsx         # Mic/cam/screen/chat/leave controls
│   │   │   ├── ChatPanel.tsx          # Chat sidebar (data channel + persistence)
│   │   │   ├── RecordingControl.tsx   # Start/stop recording + status pill
│   │   │   ├── EndSessionButton.tsx   # End session button
│   │   │   ├── StatusPills.tsx        # Connection status indicators
│   │   │   └── ConnectionState.tsx    # Connection quality banner
│   │   ├── admin/AdminClient.tsx      # Full admin dashboard (live + history + metrics)
│   │   ├── agent/DashboardClient.tsx  # Agent dashboard (create session + list)
│   │   ├── auth/                      # Auth form components
│   │   ├── join/                      # Customer join form component
│   │   └── ui/                        # Shared UI primitives (Toast, etc.)
│   ├── lib/
│   │   ├── auth.ts                    # ★ getAuthedUser() — security boundary
│   │   ├── access.ts                  # ★ canAccessSession() — shared authz
│   │   ├── sessions.ts               # Session CRUD (createSession, getSessionById, etc.)
│   │   ├── invites.ts                 # newInviteId() + newRoomName() (crypto random)
│   │   ├── cache.ts                   # Cache-aside over Upstash Redis (optional)
│   │   ├── metrics.ts                 # Prometheus registry (singleton)
│   │   ├── types.ts                   # Shared TypeScript types
│   │   ├── clsx.ts                    # CSS class utility
│   │   ├── livekit/
│   │   │   ├── token.ts              # mintToken() — JWT generation with grants
│   │   │   ├── roomService.ts        # RoomServiceClient wrapper + closeRoom()
│   │   │   ├── egress.ts             # EgressClient + S3 output builder
│   │   │   └── webhook.ts            # WebhookReceiver (signature validation)
│   │   └── supabase/
│   │       ├── client.ts             # Browser client (anon key, RLS-locked)
│   │       ├── server.ts             # Server client (auth cookies)
│   │       └── admin.ts              # ★ Service-role client (bypasses RLS)
│   ├── proxy.ts                       # Next.js middleware (session refresh + route guard)
│   ├── .env.example                   # Environment template
│   └── package.json                   # Dependencies
├── infra/
│   ├── docker-compose.yml             # Redis + LiveKit + Egress (recording profile)
│   ├── livekit/
│   │   ├── livekit.yaml              # LiveKit server config (keys, ports, webhooks)
│   │   └── egress.yaml               # Egress config (S3 output)
│   └── redeploy-tunnel.ps1           # Cloudflared tunnel recovery script
├── supabase/
│   ├── migrations/0001_init.sql       # Full schema + RLS policies
│   └── seed.sql                       # Storage bucket creation
├── scripts/
│   ├── apply-db.mjs                   # Schema migration runner
│   ├── seed-demo.mjs                  # Demo account/session seeder
│   ├── media-gate-test.mjs            # ★ E2E test: media + chat + files
│   ├── admin-test.mjs                 # E2E test: admin access + dashboard
│   └── recording-test.mjs            # E2E test: recording lifecycle
├── essential_docs/
│   ├── ARCHITECTURE.md                # System design + R1–R20 traceability matrix
│   ├── WORKFLOW.md                    # Setup, run, deploy, PS coverage
│   └── Interview_preparation_Q&A.md  # ★ THIS FILE
├── package.json                       # Root monorepo (npm workspaces)
└── vercel.json                        # Vercel deployment config
```

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Agent | `agent@clarivue.demo` | `clarivue123` |
| Admin | `admin@clarivue.demo` | `clarivue123` |

**Ready-made invite:** `/join/demo-call` (pre-seeded active session).

---

> **Good luck with the interview, Gurjas! 🚀**  
> Remember: you built this end-to-end — design, code, deployment. Own every answer with confidence.
