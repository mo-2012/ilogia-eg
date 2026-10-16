-- eLearn: ONE-SHOT, re-runnable setup (MySQL -> Supabase). Does not touch your existing profiles/user_roles data.
-- Run once in Supabase SQL Editor. Auth (passwords, sessions, email OTP) is owned by Supabase Auth,
-- so users.password_hash, users.api_token and otp_requests are intentionally NOT migrated.

create extension if not exists pgcrypto;

-- ---------- Admin check: uses EXISTING profiles.is_platform_admin (no new roles/profiles tables) ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------- Catalogue ----------
create table if not exists public.plans (
  id bigint generated always as identity primary key,
  name text not null,
  price_label text not null,
  period text,
  duration_days int,
  features jsonb not null default '[]',
  cta text default 'اشترك الآن',
  highlight boolean not null default false,
  sort_order int not null default 0
);
create table if not exists public.grades (
  id bigint generated always as identity primary key,
  name text not null, stage text not null, sort_order int not null default 0
);
create table if not exists public.subjects (
  id bigint generated always as identity primary key,
  name text not null, icon text, sort_order int not null default 0
);
create table if not exists public.videos (
  id bigint generated always as identity primary key,
  title text not null,
  unit text,
  grade_id bigint references public.grades(id) on delete set null,
  subject_id bigint references public.subjects(id) on delete set null,
  academic_year text,
  duration text default '00:00',
  level text default 'مبتدئ',
  is_free boolean not null default false,
  video_url text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.library_items (
  id bigint generated always as identity primary key,
  title text not null,
  unit text,
  grade_id bigint references public.grades(id) on delete set null,
  subject_id bigint references public.subjects(id) on delete set null,
  academic_year text,
  type text default 'ملف PDF',
  is_free boolean not null default false,
  file_path text not null,            -- path in 'library' bucket, or external URL
  created_at timestamptz not null default now()
);
create index on public.videos (subject_id, grade_id);
create index on public.library_items (subject_id, grade_id);

-- ---------- Subscriptions + receipts ----------
create table if not exists public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id bigint not null references public.plans(id),
  status text not null default 'pending' check (status in ('pending','active','rejected','expired')),
  payment_method text,
  receipt_path text,                  -- path in private 'receipts' bucket: <user_id>/<file>
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  expires_at timestamptz
);
create index on public.subscriptions (user_id, id desc);
create index on public.subscriptions (status);

-- ---------- RPCs (privileged logic lives in the DB, not the browser) ----------
create or replace function public.activate_free_plan(p_plan_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d int; pr text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select duration_days, price_label into d, pr from plans where id = p_plan_id;
  if not found or pr <> '0' then raise exception 'plan is not free'; end if;
  insert into subscriptions (user_id, plan_id, status, payment_method, expires_at)
  values (auth.uid(), p_plan_id, 'active', 'free', case when d is null then null else now() + make_interval(days => d) end);
end $$;

create or replace function public.review_subscription(p_id bigint, p_action text, p_reason text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare d int; exp timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_action not in ('active','rejected') then raise exception 'bad action'; end if;
  if p_action = 'active' then
    select p.duration_days into d from subscriptions s join plans p on p.id = s.plan_id where s.id = p_id;
    if not found then raise exception 'not found'; end if;
    exp := case when d is null then null else now() + make_interval(days => d) end;
  end if;
  update subscriptions set status = p_action, reviewed_at = now(), reviewed_by = auth.uid(),
         expires_at = exp, rejection_reason = case when p_action = 'rejected' then p_reason end
  where id = p_id;
  return exp;
end $$;

-- Replaces the "expire on every request" hack in bootstrap.php. Schedule with pg_cron (hourly) or call lazily.
create or replace function public.expire_subscriptions() returns void
language sql security definer set search_path = public as $$
  update subscriptions set status = 'expired' where status = 'active' and expires_at is not null and expires_at <= now();
$$;

-- Current user's latest subscription (replaces api/me.php)
create or replace view public.my_subscription with (security_invoker = true) as
select s.id, s.status, s.expires_at, p.name as plan_name,
       greatest(ceil(extract(epoch from (s.expires_at - now())) / 86400), 0)::int as days_left
from public.subscriptions s join public.plans p on p.id = s.plan_id
where s.user_id = auth.uid() order by s.id desc limit 1;

-- ---------- Row Level Security ----------
alter table public.plans enable row level security;
alter table public.grades enable row level security;
alter table public.subjects enable row level security;
alter table public.videos enable row level security;
alter table public.library_items enable row level security;
alter table public.subscriptions enable row level security;

-- Admins can read all profiles (your existing policies for students stay untouched)
drop policy if exists ilearn_profiles_admin_read on public.profiles;
create policy ilearn_profiles_admin_read on public.profiles for select using (public.is_admin());


-- Public catalogue: anyone reads; only admins write
do $$ declare t text; begin
  foreach t in array array['plans','grades','subjects','videos','library_items'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('drop policy if exists %I_admin_write on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
    execute format('create policy %I_admin_write on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop; end $$;

-- Subscriptions: students create only their own PENDING row; status changes only via review_subscription()
drop policy if exists subs_read on public.subscriptions;
create policy subs_read on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists subs_insert on public.subscriptions;
create policy subs_insert on public.subscriptions for insert
  with check (user_id = auth.uid() and status = 'pending' and reviewed_at is null and expires_at is null);

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values
  ('receipts','receipts', false),
  ('library','library', false),
  ('avatars','avatars', true)
on conflict (id) do nothing;

drop policy if exists receipts_upload on storage.objects;
create policy receipts_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists library_read on storage.objects;
create policy library_read on storage.objects for select to authenticated using (bucket_id = 'library');
drop policy if exists library_admin on storage.objects;
create policy library_admin on storage.objects for all to authenticated
  using (bucket_id = 'library' and public.is_admin()) with check (bucket_id = 'library' and public.is_admin());
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Seed data (from schema.sql) ----------
insert into public.plans (name, price_label, period, duration_days, features, cta, highlight, sort_order)
select a,b,c,d::int,e::jsonb,f,g::boolean,h::int from (values
('المجانية','0','للأبد',null::int,'["كل فيديوهات المبتدئين","محرر أكواد كامل","مجتمع الدعم"]','ابدأ مجاناً',false,1),
('المحترف','199','شهرياً',30,'["كل الفيديوهات بدون استثناء","المكتبة الكاملة (PDF + ملفات)","مشاريع تطبيقية مع حلول","دعم فني أولوية"]','اشترك الآن',true,2),
('سنوي','1499','سنوياً (وفّر 40%)',365,'["كل مميزات باقة المحترف","شهادة إتمام معتمدة","جلسة استشارة شهرية"]','اشترك الآن',false,3)) v(a,b,c,d,e,f,g,h) where not exists (select 1 from public.plans);

insert into public.grades (name, stage, sort_order)
select a,b,c::int from (values
('عام — كل المراحل','عام',0),('الصف الأول الابتدائي','ابتدائي',1),('الصف الثاني الابتدائي','ابتدائي',2),
('الصف الثالث الابتدائي','ابتدائي',3),('الصف الرابع الابتدائي','ابتدائي',4),('الصف الخامس الابتدائي','ابتدائي',5),
('الصف السادس الابتدائي','ابتدائي',6),('الصف الأول الإعدادي','اعدادي',7),('الصف الثاني الإعدادي','اعدادي',8),
('الصف الثالث الإعدادي','اعدادي',9)) v(a,b,c) where not exists (select 1 from public.grades);

insert into public.subjects (name, icon, sort_order)
select a,b,c::int from (values
('البرمجة','code',0),('اللغة العربية','book',1),('الرياضيات','math',2),('العلوم','science',3),
('الدراسات الاجتماعية','globe',4),('اللغة الإنجليزية','lang',5),('التكنولوجيا','tech',6)) v(a,b,c) where not exists (select 1 from public.subjects);


-- ---------- Protect the admin flag (students must not promote themselves) ----------
create or replace function public.protect_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin and auth.uid() is not null
     and not coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'only admins can change is_platform_admin';
  end if;
  return new;
end $$;
drop trigger if exists protect_admin_flag on public.profiles;
create trigger protect_admin_flag before update on public.profiles
  for each row execute function public.protect_admin_flag();

-- ---------- Make sure every existing auth user has a profile row ----------
do $$ begin
  insert into public.profiles (id, email, full_name)
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', '')
  from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
exception when others then
  raise notice 'Could not backfill profiles automatically: %', sqlerrm;
end $$;

-- ---------- Make this email an admin (change it, then run the whole file) ----------
do $$ declare v_email text := 'admin@gmail.com'; n int; begin
  update public.profiles set is_platform_admin = true where lower(email) = lower(v_email);
  get diagnostics n = row_count;
  if n = 0 then raise notice 'No account with email % yet. Create it in Authentication > Users, then run this file again.', v_email; end if;
end $$;

notify pgrst, 'reload schema';

-- Check (run separately): select email, is_platform_admin from public.profiles where is_platform_admin;
