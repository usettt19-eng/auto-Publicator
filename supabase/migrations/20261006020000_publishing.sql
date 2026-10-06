-- Fase 4: publicación automática.

-- En qué paso falló el reel, para que "Reintentar" sepa desde dónde seguir.
alter table reels
  add column failed_stage text check (failed_stage in ('script', 'render', 'publish'));

-- Pasa a `publishing` los reels aprobados cuya hora llegó y encola su publicación.
-- Todo en una sentencia: varios workers no pueden encolar el mismo reel dos veces.
create function enqueue_due_publications(p_limit integer default 20)
returns integer
language sql
as $$
  with due as (
    select id from reels
    where status = 'approved' and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update reels r
    set status = 'publishing', updated_at = now()
    from due
    where r.id = due.id
    returning r.id, r.workspace_id
  ),
  queued as (
    insert into jobs (workspace_id, kind, payload)
    select workspace_id, 'publish_reel', jsonb_build_object('reelId', id) from claimed
    returning 1
  )
  select count(*)::integer from queued;
$$;

revoke execute on function enqueue_due_publications(integer) from public, anon, authenticated;
