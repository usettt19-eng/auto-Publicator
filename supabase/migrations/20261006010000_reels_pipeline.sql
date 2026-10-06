-- Fases 2-3: ideas, pipeline de reels, cola de trabajos, uso y almacenamiento.

alter table reel_ideas
  add column status text not null default 'planned'
    check (status in ('planned', 'in_production', 'discarded'));

alter table reels
  add column title text,
  add column error text,
  add column duration_seconds numeric;

alter table workspaces
  add column posting_hour smallint not null default 18 check (posting_hour between 0 and 23);

alter table approval_events drop constraint approval_events_action_check;
alter table approval_events add constraint approval_events_action_check
  check (action in ('approved', 'rejected', 'changes_requested', 'edited', 'rescheduled', 'unapproved', 'retried'));

create index jobs_queue_idx on jobs (run_after) where status = 'queued';
create index reels_workspace_status_idx on reels (workspace_id, status);

-- Toma el siguiente trabajo pendiente de forma atómica (varios workers no cogen el mismo).
create function claim_job(p_kinds text[])
returns setof jobs
language sql
as $$
  update jobs
  set status = 'running', attempts = attempts + 1, updated_at = now()
  where id = (
    select id from jobs
    where status = 'queued' and run_after <= now() and kind = any (p_kinds)
    order by run_after
    for update skip locked
    limit 1
  )
  returning *;
$$;

-- Suma uso del periodo y devuelve el nuevo total.
create function increment_usage(p_workspace uuid, p_period date, p_field text, p_amount integer default 1)
returns integer
language plpgsql
as $$
declare
  total integer;
begin
  if p_field not in ('reels_generated', 'reels_published') then
    raise exception 'campo de uso no válido: %', p_field;
  end if;
  insert into usage_counters (workspace_id, period_start)
  values (p_workspace, p_period)
  on conflict do nothing;
  execute format(
    'update usage_counters set %1$I = %1$I + $1 where workspace_id = $2 and period_start = $3 returning %1$I',
    p_field
  ) into total using p_amount, p_workspace, p_period;
  return total;
end;
$$;

-- Solo el servidor (service role) llama a estas funciones.
revoke execute on function claim_job(text[]) from public, anon, authenticated;
revoke execute on function increment_usage(uuid, date, text, integer) from public, anon, authenticated;

-- Bucket público para videos, miniaturas y audio: Instagram necesita una URL pública del video.
-- Las rutas incluyen UUIDs no adivinables; la escritura solo la hace el service role.
insert into storage.buckets (id, name, public)
values ('reels', 'reels', true)
on conflict (id) do nothing;
