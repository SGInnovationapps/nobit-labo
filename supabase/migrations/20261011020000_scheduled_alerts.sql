-- アラートの定時生成。運営が画面09を開いたときの生成（refresh_alerts）と同じ関数を、pg_cron から1時間おきに呼ぶ。
-- pg_cron が使えない環境（ローカルのテスト用 Postgres など）では、スケジュール登録だけを飛ばす。

create table public.alert_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  error text,
  duration_ms integer not null default 0
);
comment on table public.alert_runs is 'アラートの定時生成の実行記録（直近30日分）。運営だけが読める。';
alter table public.alert_runs enable row level security;
create policy alert_runs_select on public.alert_runs for select to authenticated
  using ((select private.is_operator()));
revoke all on public.alert_runs from anon, authenticated;
grant select on public.alert_runs to authenticated;

-- 定時の本体。失敗しても例外を外へ出さず、記録だけ残す（次の回でやり直せる）。
create function private.run_scheduled_alerts(p_now timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := clock_timestamp();
  v_error text;
begin
  -- 同時に2本走らせない（手動実行と重なったときなど）
  if not pg_try_advisory_xact_lock(hashtext('nobit.run_scheduled_alerts')) then
    return false;
  end if;
  begin
    perform private.generate_alerts(p_now);
    perform private.generate_mission_alerts(p_now);
  exception when others then
    v_error := sqlerrm;
  end;
  insert into public.alert_runs (ran_at, ok, error, duration_ms)
  values (p_now, v_error is null, v_error, (extract(milliseconds from clock_timestamp() - v_start))::integer);
  delete from public.alert_runs where ran_at < p_now - interval '30 days';
  return v_error is null;
end;
$$;
revoke all on function private.run_scheduled_alerts(timestamptz) from public, anon, authenticated;

-- 管理画面が「最後にいつ自動生成されたか」を知るための関数（運営だけ）
create function public.alert_last_run()
returns table (ran_at timestamptz, ok boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  return query
    select r.ran_at, r.ok from public.alert_runs r order by r.ran_at desc limit 1;
end;
$$;
revoke all on function public.alert_last_run() from public, anon;
grant execute on function public.alert_last_run() to authenticated;

-- 毎時5分（UTC の毎時5分は JST でも毎時5分）。「未着手」の16時判定は16:05 に拾える。
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'nobit-generate-alerts';
    perform cron.schedule('nobit-generate-alerts', '5 * * * *', 'select private.run_scheduled_alerts()');
  else
    raise notice 'pg_cron が使えないため、定時のスケジュール登録を飛ばしました';
  end if;
end;
$$;
