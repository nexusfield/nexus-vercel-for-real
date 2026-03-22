-- User profile facets for personalized prompt assembly

create extension if not exists pgcrypto;

create table if not exists user_profile (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  category text not null,
  content text not null,
  confidence text not null default 'established' check (confidence in ('emerging', 'established', 'foundational')),
  source text not null default 'manual',
  created_at text not null,
  updated_at text not null,
  active boolean not null default true
);

create index if not exists idx_user_profile_user_id on user_profile(user_id);
create index if not exists idx_user_profile_category on user_profile(category);
create index if not exists idx_user_profile_active on user_profile(active);
