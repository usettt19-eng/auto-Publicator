-- Fase 5: comentarios, DMs y reglas de palabra clave.

-- Qué hacer con los comentarios que no activan ninguna regla.
alter table workspaces
  add column comment_reply_mode text not null default 'approval'
    check (comment_reply_mode in ('off', 'approval', 'auto'));

alter table keyword_rules
  add column match_in text not null default 'both' check (match_in in ('comments', 'dms', 'both')),
  add column times_triggered integer not null default 0;

alter table comments
  add column instagram_account_id uuid references instagram_accounts (id) on delete set null,
  add column ig_media_id text,
  add column ig_parent_id text,
  add column from_ig_id text,
  add column category text,
  add column dm_sent boolean not null default false,
  add column replied_at timestamptz,
  add column error text;

alter table comments drop constraint comments_reply_status_check;
alter table comments add constraint comments_reply_status_check
  check (reply_status in ('none', 'pending_approval', 'sending', 'sent', 'skipped', 'failed'));

create index comments_workspace_status_idx on comments (workspace_id, reply_status, created_at desc);

alter table dms
  add column instagram_account_id uuid references instagram_accounts (id) on delete set null,
  add column ig_message_id text unique,
  add column ig_username text,
  -- Respuesta automática a un DM entrante: único para no contestar dos veces al mismo mensaje.
  add column source_dm_id uuid unique references dms (id) on delete set null;

create index dms_workspace_idx on dms (workspace_id, created_at desc);

-- Suma un uso a la regla (estadística en el panel).
create function bump_keyword_rule(p_rule uuid)
returns void
language sql
as $$
  update keyword_rules set times_triggered = times_triggered + 1 where id = p_rule;
$$;

revoke execute on function bump_keyword_rule(uuid) from public, anon, authenticated;
