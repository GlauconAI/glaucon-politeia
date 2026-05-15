create or replace function public.prompt_hourly_stats(since_at timestamptz)
returns table(hour timestamptz, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with series as (
    select generate_series(
      date_trunc('hour', now()) - interval '23 hours',
      date_trunc('hour', now()),
      interval '1 hour'
    ) as hour
  )
  select
    series.hour,
    count(prompts.id) as count
  from series
  left join public.prompts
    on date_trunc('hour', prompts.created_at) = series.hour
    and prompts.created_at >= since_at
    and prompts.deleted_at is null
  group by series.hour
  order by series.hour asc;
$$;

create or replace function public.archive_old_prompts(cutoff_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_count integer;
begin
  update public.prompts
  set deleted_at = now()
  where created_at < cutoff_at
    and deleted_at is null;

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;
