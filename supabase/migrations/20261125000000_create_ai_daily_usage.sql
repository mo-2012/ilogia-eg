-- Migration: AI Usage Quota and Rate Limiting
-- Prevents API credit depletion and excessive prompt usage

create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;

-- Only authenticated users can see their own daily usage
create policy "Users can view their own AI usage"
  on public.ai_daily_usage for select
  to authenticated
  using (auth.uid() = user_id);

-- Atomic RPC to check and increment daily quota
create or replace function public.check_and_increment_ai_quota(
  p_daily_limit int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
  v_is_subscribed boolean := false;
  v_effective_limit int := coalesce(p_daily_limit, 30);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- 1. Check if user has an active paid subscription for higher tier (100 requests/day)
  begin
    select exists (
      select 1 from public.subscriptions
      where user_id = v_user_id
        and status = 'active'
        and (expires_at is null or expires_at > now())
    ) into v_is_subscribed;
  exception when undefined_table then
    v_is_subscribed := false;
  end;

  if v_is_subscribed then
    v_effective_limit := greatest(v_effective_limit, 100);
  end if;

  -- 2. Check current usage count
  select request_count into v_count
  from public.ai_daily_usage
  where user_id = v_user_id and usage_date = current_date;

  if v_count is not null and v_count >= v_effective_limit then
    return jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'limit', v_effective_limit,
      'remaining', 0
    );
  end if;

  -- 3. Increment or insert
  insert into public.ai_daily_usage (user_id, usage_date, request_count, updated_at)
  values (v_user_id, current_date, 1, now())
  on conflict (user_id, usage_date) do update
  set request_count = ai_daily_usage.request_count + 1,
      updated_at = now()
  returning request_count into v_count;

  return jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'limit', v_effective_limit,
    'remaining', greatest(0, v_effective_limit - v_count)
  );
end;
$$;

revoke all on function public.check_and_increment_ai_quota(int) from public, anon;
grant execute on function public.check_and_increment_ai_quota(int) to authenticated;
