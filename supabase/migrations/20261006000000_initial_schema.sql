-- Auto-Publicator: esquema inicial.
-- Incluye todas las tablas del modelo de datos; la fase 1 usa workspaces,
-- instagram_accounts, instagram_tokens, brand_audits, brand_kits y content_pillars.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type audit_status as enum ('pending', 'scraping', 'analyzing', 'completed', 'failed');
create type reel_status as enum (
  'idea', 'queued', 'scripting', 'rendering', 'ready', 'changes_requested',
  'approved', 'rejected', 'publishing', 'published', 'failed'
);
create type job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type plan_tier as enum ('free', 'self_serve', 'done_for_you');

-- ---------------------------------------------------------------------------
-- Workspaces y membresía
-- ---------------------------------------------------------------------------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  website_url text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- security definer evita recursión de RLS al consultar workspace_members.
create function is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

-- Al crear un workspace, el dueño pasa a ser miembro automáticamente.
create function add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger workspaces_add_owner
after insert on workspaces
for each row execute function add_owner_as_member();

-- ---------------------------------------------------------------------------
-- Instagram
-- ---------------------------------------------------------------------------
create table instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  ig_user_id text not null,
  username text not null,
  account_type text,
  profile_picture_url text,
  followers_count integer,
  media_count integer,
  connected_at timestamptz not null default now(),
  unique (workspace_id, ig_user_id)
);

-- Tokens cifrados (AES-256-GCM en la app). Sin políticas RLS: solo service role.
create table instagram_tokens (
  instagram_account_id uuid primary key references instagram_accounts (id) on delete cascade,
  access_token_encrypted text not null,
  expires_at timestamptz not null,
  scopes text[] not null default '{}',
  refreshed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auditoría y Brand Kit
-- ---------------------------------------------------------------------------
create table brand_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  website_url text not null,
  status audit_status not null default 'pending',
  website_snapshot jsonb,
  instagram_snapshot jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces (id) on delete cascade,
  source_audit_id uuid references brand_audits (id) on delete set null,
  kit jsonb not null,
  edited_by_user boolean not null default false,
  updated_at timestamptz not null default now()
);

create table content_pillars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null,
  description text not null default '',
  example_topics text[] not null default '{}',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reels (fases 2-4)
-- ---------------------------------------------------------------------------
create table reel_ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  pillar_id uuid references content_pillars (id) on delete set null,
  title text not null,
  hook text,
  format text,
  planned_for date,
  created_at timestamptz not null default now()
);

create table reels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  idea_id uuid references reel_ideas (id) on delete set null,
  instagram_account_id uuid references instagram_accounts (id) on delete set null,
  status reel_status not null default 'queued',
  script_json jsonb,
  video_url text,
  thumbnail_url text,
  caption text,
  scheduled_at timestamptz,
  published_at timestamptz,
  ig_container_id text,
  ig_media_id text unique,
  ig_permalink text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reels_due_idx on reels (scheduled_at) where status = 'approved';

create table approval_events (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references reels (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('approved', 'rejected', 'changes_requested', 'edited', 'rescheduled')),
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Comentarios y DMs (fase 5)
-- ---------------------------------------------------------------------------
create table keyword_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  keyword text not null,
  comment_reply text,
  dm_message text not null,
  link_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, keyword)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  reel_id uuid references reels (id) on delete set null,
  ig_comment_id text not null unique,
  ig_username text,
  text text not null,
  reply_text text,
  reply_status text not null default 'none' check (reply_status in ('none', 'pending_approval', 'sent', 'skipped')),
  matched_rule_id uuid references keyword_rules (id) on delete set null,
  created_at timestamptz not null default now()
);

create table dms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  ig_thread_id text,
  ig_user_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  text text not null,
  source_comment_id uuid references comments (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Infraestructura: trabajos, suscripciones y uso
-- ---------------------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  status job_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  tier plan_tier not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table usage_counters (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  period_start date not null,
  reels_generated integer not null default 0,
  reels_published integer not null default 0,
  primary key (workspace_id, period_start)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table instagram_accounts enable row level security;
alter table instagram_tokens enable row level security;
alter table brand_audits enable row level security;
alter table brand_kits enable row level security;
alter table content_pillars enable row level security;
alter table reel_ideas enable row level security;
alter table reels enable row level security;
alter table approval_events enable row level security;
alter table keyword_rules enable row level security;
alter table comments enable row level security;
alter table dms enable row level security;
alter table jobs enable row level security;
alter table subscriptions enable row level security;
alter table usage_counters enable row level security;

create policy "owner creates workspace" on workspaces
  for insert with check (owner_id = auth.uid());
create policy "members read workspace" on workspaces
  for select using (owner_id = auth.uid() or is_workspace_member(id));
create policy "owner updates workspace" on workspaces
  for update using (owner_id = auth.uid());
create policy "owner deletes workspace" on workspaces
  for delete using (owner_id = auth.uid());

create policy "members read membership" on workspace_members
  for select using (is_workspace_member(workspace_id));

-- Tablas con acceso completo para miembros del workspace.
create policy "members manage" on brand_kits
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
create policy "members manage" on content_pillars
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
create policy "members manage" on reel_ideas
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
create policy "members manage" on keyword_rules
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

-- Tablas de solo lectura para miembros; las escrituras las hace el servidor (service role).
create policy "members read" on instagram_accounts
  for select using (is_workspace_member(workspace_id));
create policy "members read" on brand_audits
  for select using (is_workspace_member(workspace_id));
create policy "members read" on reels
  for select using (is_workspace_member(workspace_id));
create policy "members read" on comments
  for select using (is_workspace_member(workspace_id));
create policy "members read" on dms
  for select using (is_workspace_member(workspace_id));
create policy "members read" on jobs
  for select using (is_workspace_member(workspace_id));
create policy "members read" on subscriptions
  for select using (is_workspace_member(workspace_id));
create policy "members read" on usage_counters
  for select using (is_workspace_member(workspace_id));
create policy "members read" on approval_events
  for select using (
    exists (select 1 from reels r where r.id = reel_id and is_workspace_member(r.workspace_id))
  );

-- instagram_tokens: RLS activado sin políticas => inaccesible con la anon key.
