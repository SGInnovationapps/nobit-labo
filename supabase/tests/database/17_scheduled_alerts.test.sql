-- アラートの定時生成：実行記録、同時実行の抑止、権限
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d7', 'd7@example.test'), ('00000000-0000-0000-0000-0000000000d8', 'd8@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000d7', 'operator', '［運営］', null),
  ('00000000-0000-0000-0000-0000000000d8', 'club_admin', '［管理者名］', null);

select ok(private.run_scheduled_alerts(now()), '定時の生成が成功する');
select is((select count(*)::int from public.alert_runs where ok), 1, '実行記録が1件残る');
select ok(private.run_scheduled_alerts(now() + interval '1 hour'), '続けて実行できる（二重生成にならない）');
select is((select count(*)::int from public.alert_runs), 2, '記録が2件になる');

-- 30日より古い記録は消える
insert into public.alert_runs (ran_at, ok) values (now() - interval '40 days', true);
select private.run_scheduled_alerts(now() + interval '2 hours');
select is((select count(*)::int from public.alert_runs where ran_at < now() - interval '30 days'), 0, '30日より古い記録は消える');

-- 運営は最終実行を読める
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d7","role":"authenticated"}', true);
select is((select count(*)::int from public.alert_last_run()), 1, '運営は最終実行を読める');
select ok((select ok from public.alert_last_run()), '最終実行は成功');
select is((select count(*)::int from public.alert_runs), 3, '運営は実行記録を読める');

-- クラブ管理者は読めない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d8","role":"authenticated"}', true);
select throws_ok('select * from public.alert_last_run()', 'P0001', 'forbidden', 'クラブ管理者は読めない');

select * from finish();
rollback;
