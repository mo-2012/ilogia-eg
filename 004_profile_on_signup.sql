-- Creates a profiles row automatically for every NEW user (Google or email).
-- Safe to re-run. Does not touch existing rows.
create or replace function public.ilearn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;   -- never block signup because of the profile insert
end $$;

drop trigger if exists ilearn_on_auth_user_created on auth.users;
create trigger ilearn_on_auth_user_created
  after insert on auth.users
  for each row execute function public.ilearn_handle_new_user();

-- Backfill anyone who already signed in but has no profile
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')
from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
