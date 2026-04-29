alter table tasks
  add column if not exists category text
    check (category in ('personal','business','health','finance','social','home','travel','shopping'));
