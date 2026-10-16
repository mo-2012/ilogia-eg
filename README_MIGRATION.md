# eLearn — Supabase migration package

## Status
- DONE: supabase/000_run_this_once.sql (tables, RLS, storage, RPCs, seed), js/supabase.js (client + services)
- NOT DONE: index.html and admin.html still call the old PHP API (api/*.php). They must be rewired to js/supabase.js. Redesign not started.

## Setup
1. Supabase > SQL Editor: run supabase/000_run_this_once.sql
2. Authentication > Providers: enable Email (and Google if wanted)
3. Register an account, then promote it to admin (SQL at bottom of 000_run_this_once.sql)
4. Schedule public.expire_subscriptions() hourly with pg_cron

## Security
- The old api/ folder is excluded on purpose: its config.php held the MySQL password, admin key and EmailJS private key. Rotate them.
- Only the public publishable key is used in js/supabase.js.

## Update: admin.html is now on Supabase
- admin.html logs in with an admin email/password (Supabase Auth); js/admin-adapter.js maps its old api/*.php calls to Supabase. No PHP needed for admin.
- Upload the whole folder keeping js/ next to admin.html. Run 000_run_this_once.sql and promote your account to admin first.
- index.html redesigned (ivory/navy/lime identity from the logo) and wired to Supabase. Fake stats, FAQ and the code playground were removed.
