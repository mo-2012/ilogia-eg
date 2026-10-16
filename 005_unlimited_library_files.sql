-- Removes any per-file cap / type restriction on the 'library' bucket. Safe to re-run.
insert into storage.buckets (id, name, public) values ('library','library',false) on conflict (id) do nothing;
update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'library';

-- Check: file_size_limit must be NULL
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'library';

-- Shows how much storage the library uses (MB)
select count(*) as files, round(coalesce(sum((metadata->>'size')::bigint),0)/1048576.0,1) as total_mb
from storage.objects where bucket_id = 'library';
