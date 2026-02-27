create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  asset_type text not null check (asset_type in ('metal','etf')),
  asset_symbol text not null,
  direction text not null check (direction in ('above','below')),
  target_price numeric not null check (target_price > 0),
  is_active boolean not null default true,
  last_is_condition_met boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_price_alerts_active_asset on public.price_alerts(is_active, asset_type, asset_symbol);

create or replace function public.set_updated_at_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_price_alerts_updated_at on public.price_alerts;
create trigger trg_price_alerts_updated_at
before update on public.price_alerts
for each row execute function public.set_updated_at_timestamp();
