-- Bước 2/2: bật khóa riêng tư (RLS). Chạy sau khi bước 1 thành công.
alter table public.sources enable row level security;
alter table public.notes enable row level security;

drop policy if exists "own sources" on public.sources;
drop policy if exists "own notes" on public.notes;

create policy "own sources" on public.sources for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own notes" on public.notes for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
