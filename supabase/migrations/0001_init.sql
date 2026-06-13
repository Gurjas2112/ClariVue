-- ClariVue schema — sessions, presence, chat, files, recordings.
-- RLS is ON everywhere. Agents reach only their own rows; admins see all.
-- Customers are anonymous and never touch these tables directly — all customer
-- reads/writes go through server API routes using the service key after invite
-- validation, so the service role (which bypasses RLS) is the only customer path.

create type session_status as enum ('active', 'ended');
create type recording_status as enum ('in_progress', 'processing', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated agent/admin (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  role text not null default 'agent',          -- 'agent' | 'admin'
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- sessions: a support call owned by an agent
-- ---------------------------------------------------------------------------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  room_name text unique not null,
  invite_id text unique not null,               -- opaque id used in /join/[inviteId]
  agent_id uuid references profiles(id) on delete set null,
  title text,
  status session_status not null default 'active',
  created_at timestamptz default now(),
  ended_at timestamptz
);
create index sessions_agent_idx on sessions (agent_id, created_at desc);
create index sessions_invite_idx on sessions (invite_id);

-- ---------------------------------------------------------------------------
-- session_participants: who was in a session and when (presence + history)
-- ---------------------------------------------------------------------------
create table session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  identity text not null,
  display_name text,
  role text not null,                           -- 'agent' | 'customer'
  joined_at timestamptz default now(),
  left_at timestamptz,
  disconnected_at timestamptz,                  -- set on drop, for reconnect grace window
  reconnect_count int default 0
);
create index sp_session_idx on session_participants (session_id);
create unique index sp_session_identity_idx on session_participants (session_id, identity);

-- ---------------------------------------------------------------------------
-- session_events: append-only event log (joins, leaves, recording lifecycle)
-- ---------------------------------------------------------------------------
create table session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  type text not null,                           -- participant_joined | participant_left | room_finished | egress_* | ...
  identity text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index se_session_idx on session_events (session_id, created_at);

-- ---------------------------------------------------------------------------
-- chat_messages: persisted in-call chat
-- ---------------------------------------------------------------------------
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  sender_identity text not null,
  sender_role text not null,
  body text not null,
  created_at timestamptz default now()
);
create index cm_session_idx on chat_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- shared_files: files exchanged in chat (bonus R17)
-- ---------------------------------------------------------------------------
create table shared_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  sender_identity text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now()
);
create index sf_session_idx on shared_files (session_id, created_at);

-- ---------------------------------------------------------------------------
-- recordings: egress lifecycle (bonus R16)
-- ---------------------------------------------------------------------------
create table recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  egress_id text,
  status recording_status not null default 'in_progress',
  storage_path text,
  duration_seconds int,
  created_at timestamptz default now(),
  ready_at timestamptz
);
create index rec_session_idx on recordings (session_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table session_participants enable row level security;
alter table session_events enable row level security;
alter table chat_messages enable row level security;
alter table shared_files enable row level security;
alter table recordings enable row level security;

-- helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- profiles: a user sees/edits their own row; admins see all
create policy profiles_self_select on profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_insert on profiles
  for insert with check (id = auth.uid());
create policy profiles_self_update on profiles
  for update using (id = auth.uid());

-- sessions: agent owns their sessions; admins see all. (No client writes — service key only.)
create policy sessions_owner_select on sessions
  for select using (agent_id = auth.uid() or public.is_admin());

-- child tables: visible if the parent session is visible to the user
create policy sp_owner_select on session_participants
  for select using (exists (
    select 1 from sessions s
    where s.id = session_id and (s.agent_id = auth.uid() or public.is_admin())
  ));
create policy se_owner_select on session_events
  for select using (exists (
    select 1 from sessions s
    where s.id = session_id and (s.agent_id = auth.uid() or public.is_admin())
  ));
create policy cm_owner_select on chat_messages
  for select using (exists (
    select 1 from sessions s
    where s.id = session_id and (s.agent_id = auth.uid() or public.is_admin())
  ));
create policy sf_owner_select on shared_files
  for select using (exists (
    select 1 from sessions s
    where s.id = session_id and (s.agent_id = auth.uid() or public.is_admin())
  ));
create policy rec_owner_select on recordings
  for select using (exists (
    select 1 from sessions s
    where s.id = session_id and (s.agent_id = auth.uid() or public.is_admin())
  ));

-- NOTE: no INSERT/UPDATE/DELETE policies for the child tables or sessions writes.
-- Those mutations happen exclusively via the service key in server API routes,
-- which bypasses RLS. This keeps the anon/auth client locked down by default.
