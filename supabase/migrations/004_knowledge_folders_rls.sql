-- Allow API (using anon key) to read/write knowledge_folders.
-- Run this in Supabase SQL Editor if "New folder" does nothing or tree is empty.

alter table knowledge_folders enable row level security;

create policy "Allow all for anon"
  on knowledge_folders
  for all
  to anon
  using (true)
  with check (true);

-- Allow service role as well (e.g. if you use it later)
create policy "Allow all for service_role"
  on knowledge_folders
  for all
  to service_role
  using (true)
  with check (true);
