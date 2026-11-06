-- Private storage for the presentation (run after schema.sql). Only the admin's GitHub identity can read or upload.
insert into storage.buckets (id, name, public) values ('deck', 'deck', false) on conflict (id) do nothing;
drop policy if exists deck_admin_read on storage.objects;
create policy deck_admin_read on storage.objects for select to authenticated using (bucket_id = 'deck' and public.is_admin());
drop policy if exists deck_admin_insert on storage.objects;
create policy deck_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'deck' and public.is_admin());
drop policy if exists deck_admin_update on storage.objects;
create policy deck_admin_update on storage.objects for update to authenticated using (bucket_id = 'deck' and public.is_admin());
