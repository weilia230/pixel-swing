-- 在 Supabase SQL Editor 执行一次。服务端仅使用 service_role， anon/authenticated 无直读权限。
create table if not exists public.saves (
  uuid uuid primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  saved_at bigint not null check (saved_at >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;
revoke all on table public.saves from anon, authenticated;
grant select, insert, update on table public.saves to service_role;

-- 单条 upsert 在冲突时持有行锁；WHERE 条件保证只有更新的 savedAt 才能覆盖。
-- 无论本次是否实际更新，都返回数据库中的最终版本，便于调用方识别旧写入。
create or replace function public.upsert_save(
  p_uuid uuid,
  p_data jsonb,
  p_saved_at bigint
)
returns setof public.saves
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.saves as target (uuid, data, saved_at)
  values (p_uuid, p_data, p_saved_at)
  on conflict (uuid) do update
    set data = excluded.data,
        saved_at = excluded.saved_at,
        updated_at = now()
    where target.saved_at < excluded.saved_at;

  return query
    select * from public.saves
    where uuid = p_uuid;
end;
$$;

revoke all on function public.upsert_save(uuid, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.upsert_save(uuid, jsonb, bigint) to service_role;
