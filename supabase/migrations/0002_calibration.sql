-- Phase 2 · cross-decision calibration: prediction + real-world outcome per decision.
alter table public.decisions add column if not exists predicted_p_hold numeric;
alter table public.decisions add column if not exists outcome text
  check (outcome in ('held','failed'));
alter table public.decisions add column if not exists resolved_at timestamptz;
alter table public.decisions add column if not exists materialized_categories text[];
-- resolved, scored decisions are what calibration reads:
create index if not exists decisions_user_resolved
  on public.decisions (user_id) where outcome is not null;
