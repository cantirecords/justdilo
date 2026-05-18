-- Enable org/team feature for the admin account only.
update public.profiles
set orgs_enabled = true
where email = 'yorohn@duck.com';
