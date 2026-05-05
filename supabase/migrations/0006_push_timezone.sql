alter table push_subscriptions add column if not exists timezone text not null default 'UTC';
