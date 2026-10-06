-- Fase 6: claves de API (servidor MCP), analíticas y facturación.

-- ---------------------------------------------------------------------------
-- Claves de API para el servidor MCP. Solo se guarda el hash SHA-256.
-- ---------------------------------------------------------------------------
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table api_keys enable row level security;
-- Los miembros ven las claves del workspace (sin el hash: la app solo selecciona columnas seguras)
-- y las crean o revocan desde el servidor.
create policy "members read" on api_keys for select using (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Métricas por reel (última lectura de la Insights API)
-- ---------------------------------------------------------------------------
create table reel_metrics (
  reel_id uuid primary key references reels (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  views integer not null default 0,
  reach integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  total_interactions integer not null default 0,
  avg_watch_time_ms integer,
  fetched_at timestamptz not null default now()
);

alter table reel_metrics enable row level security;
create policy "members read" on reel_metrics for select using (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Resumen semanal generado por Claude
-- ---------------------------------------------------------------------------
create table weekly_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  week_start date not null,
  report jsonb not null,
  stats jsonb not null,
  ideas_added integer not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, week_start)
);

alter table weekly_reports enable row level security;
create policy "members read" on weekly_reports for select using (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Facturación
-- ---------------------------------------------------------------------------
alter table subscriptions
  add column status text,
  add column cancel_at_period_end boolean not null default false;

create unique index subscriptions_customer_idx on subscriptions (stripe_customer_id) where stripe_customer_id is not null;

-- ---------------------------------------------------------------------------
-- Trabajos periódicos (los encola el scheduler del worker)
-- ---------------------------------------------------------------------------

-- Sincroniza métricas de los workspaces con reels publicados en los últimos 30 días,
-- como mucho una vez cada p_interval y sin duplicar trabajos pendientes.
create function enqueue_insight_syncs(p_interval interval default '6 hours')
returns integer
language sql
as $$
  with candidates as (
    select distinct r.workspace_id
    from reels r
    where r.status = 'published' and r.published_at > now() - interval '30 days'
  ),
  due as (
    select c.workspace_id from candidates c
    where not exists (
      select 1 from jobs j
      where j.workspace_id = c.workspace_id and j.kind = 'sync_insights'
        and (j.status in ('queued', 'running') or j.created_at > now() - p_interval)
    )
  ),
  queued as (
    insert into jobs (workspace_id, kind, payload)
    select workspace_id, 'sync_insights', '{}'::jsonb from due
    returning 1
  )
  select count(*)::integer from queued;
$$;

-- Un informe por workspace y semana (lunes UTC), si ha publicado algo en los últimos 30 días.
create function enqueue_weekly_reports()
returns integer
language sql
as $$
  with due as (
    select distinct r.workspace_id
    from reels r
    where r.status = 'published' and r.published_at > now() - interval '30 days'
      and not exists (
        select 1 from weekly_reports w
        where w.workspace_id = r.workspace_id and w.week_start = date_trunc('week', now())::date
      )
      and not exists (
        select 1 from jobs j
        where j.workspace_id = r.workspace_id and j.kind = 'weekly_report' and j.status in ('queued', 'running')
      )
  ),
  queued as (
    insert into jobs (workspace_id, kind, payload)
    select workspace_id, 'weekly_report', '{}'::jsonb from due
    returning 1
  )
  select count(*)::integer from queued;
$$;

revoke execute on function enqueue_insight_syncs(interval) from public, anon, authenticated;
revoke execute on function enqueue_weekly_reports() from public, anon, authenticated;
