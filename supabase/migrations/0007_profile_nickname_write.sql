-- Allow users to update their own profile (needed for nickname save)
drop policy if exists "profiles owner update" on profiles;
create policy "profiles owner update" on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
