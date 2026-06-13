-- Storage buckets for recordings + shared files (private; served via signed URLs).
insert into storage.buckets (id, name, public) values
  ('recordings', 'recordings', false),
  ('session-files', 'session-files', false)
on conflict (id) do nothing;

-- Create the judging agent via the app signup page, or scripted with the service key
-- (supabase.auth.admin.createUser({ email, password, email_confirm: true })).
-- Do NOT hand-insert into auth.users.
