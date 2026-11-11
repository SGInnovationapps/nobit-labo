-- 公式LINE からの送信（再開の声かけ）：予約・結果の記録・送れない理由
begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@example.test'), ('00000000-0000-0000-0000-0000000000f2', 'f2@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@example.test'), ('00000000-0000-0000-0000-0000000000f4', 'f4@example.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'f5@example.test'), ('00000000-0000-0000-0000-0000000000f6', 'f6@example.test'),
  ('00000000-0000-0000-0000-0000000000f9', 'op-f@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000f1', 'student', 'f1', 8), ('00000000-0000-0000-0000-0000000000f2', 'student', 'f2', 8),
  ('00000000-0000-0000-0000-0000000000f3', 'student', 'f3', 8), ('00000000-0000-0000-0000-0000000000f4', 'student', 'f4', 8),
  ('00000000-0000-0000-0000-0000000000f5', 'student', 'f5', 8), ('00000000-0000-0000-0000-0000000000f6', 'student', 'f6', 8),
  ('00000000-0000-0000-0000-0000000000f9', 'operator', '［運営］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111f1', '［クラブ名］F');
insert into public.club_members (club_id, user_id, member_role, status)
select '11111111-1111-1111-1111-1111111111f1', id, 'student', 'approved' from public.users where role = 'student' and display_name like 'f%';
insert into public.line_accounts (user_id, line_user_id, friend_status, contact_allowed) values
  ('00000000-0000-0000-0000-0000000000f1', 'Uf1000000000000000000000000000001', 'friend', true),
  ('00000000-0000-0000-0000-0000000000f2', 'Uf2000000000000000000000000000002', 'friend', false),
  ('00000000-0000-0000-0000-0000000000f3', 'Uf3000000000000000000000000000003', 'blocked', true),
  ('00000000-0000-0000-0000-0000000000f5', 'Uf5000000000000000000000000000005', 'friend', true),
  ('00000000-0000-0000-0000-0000000000f6', 'Uf6000000000000000000000000000006', 'unknown', true);
insert into public.alerts (id, club_id, student_id, kind, cause, detail, occurred_on) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f1', 'gap', 'absence', '{"missing_days":3}', current_date),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f1', 'task_overdue', 'overdue', '{"overdue":1}', current_date),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f2', 'gap', 'absence', '{}', current_date),
  ('aaaaaaaa-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f3', 'gap', 'absence', '{}', current_date),
  ('aaaaaaaa-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f4', 'streak_broken', 'absence', '{}', current_date),
  ('aaaaaaaa-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f5', 'task_overdue', 'overdue', '{}', current_date),
  ('aaaaaaaa-0000-0000-0000-0000000000f7', '11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f6', 'streak_broken', 'absence', '{}', current_date);

create temp table r as select public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000a1","aaaaaaaa-0000-0000-0000-0000000000a2"],"text":"今日も、ひとつ育てよう。"}]') as v;

select throws_ok($$select public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f1', '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000a1"],"text":"x"}]')$$,
  'P0001', 'forbidden', '運営でなければ予約できない');
select is((select (v -> 0 ->> 'ok')::boolean from r), true, '友だちで連絡を受け取る生徒には予約できる');
select is((select v -> 0 ->> 'line_user_id' from r), 'Uf1000000000000000000000000000001', 'LINE のユーザー ID を返す');
select ok((select (v -> 0 ->> 'retry_key') is not null from r), '再送キーを返す');
select is((select status from public.line_pushes where id = (select (v -> 0 ->> 'push_id')::uuid from r)), 'pending', '送信中として記録する');

-- 送れない理由
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000a1"],"text":"x"}]') -> 0 ->> 'reason', 'sending', '送信中のアラートは、もう一度予約できない');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000b1"],"text":"x"}]') -> 0 ->> 'reason', 'contact_off', '連絡を止めた生徒には送らない');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000c1"],"text":"x"}]') -> 0 ->> 'reason', 'blocked', 'ブロック中の生徒には送らない');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000d1"],"text":"x"}]') -> 0 ->> 'reason', 'no_line', 'LINE の記録がない生徒には送れない');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000e1"],"text":"x"}]') -> 0 ->> 'reason', 'not_push_kind', '再開の声かけ以外は送れない');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000b1","aaaaaaaa-0000-0000-0000-0000000000c1"],"text":"x"}]') -> 0 ->> 'reason', 'invalid', '2人分をまとめては送れない');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000f7"],"text":"  "}]') -> 0 ->> 'reason', 'invalid', '空の文面は送れない');

-- 届いた：アラートは連絡済み（LINE で送った）
select public.finish_alert_push((select (v -> 0 ->> 'push_id')::uuid from r), true, 'req-1', null);
select is((select status from public.line_pushes where id = (select (v -> 0 ->> 'push_id')::uuid from r)), 'sent', '送れた記録');
select is((select count(*)::int from public.alerts where id in ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a2')
  and status = 'contacted' and send_method = 'line_api' and contacted_by = '00000000-0000-0000-0000-0000000000f9'), 2, 'まとめたアラートが連絡済みになる');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000a1"],"text":"x"}]') -> 0 ->> 'reason', 'not_open', '連絡済みのものは送らない');

-- 届かなかった：アラートは対応待ちのまま、もう一度送れる（友だちか分からない生徒にも予約はできる）
create temp table r2 as select public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000f7"],"text":"また始めよう"}]') as v;
select is((select (v -> 0 ->> 'ok')::boolean from r2), true, '友だちか分からない生徒にも予約できる');
select public.finish_alert_push((select (v -> 0 ->> 'push_id')::uuid from r2), false, null, 'http_400');
select is((select status from public.alerts where id = 'aaaaaaaa-0000-0000-0000-0000000000f7'), 'open', '届かなければ対応待ちのまま');
select is(public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9',
  '[{"alert_ids":["aaaaaaaa-0000-0000-0000-0000000000f7"],"text":"また始めよう"}]') -> 0 ->> 'ok', 'true', '失敗したものは、もう一度送れる');

-- 権限
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', true); end $$;
select throws_ok($$select public.reserve_alert_pushes('00000000-0000-0000-0000-0000000000f9', '[]')$$, '42501', null, '画面からは予約を呼べない（Edge Function だけ）');
select ok((select count(*) from public.line_pushes) >= 2, '運営は送信の記録を読める');
select is(public.undo_alerts_contacted(array['aaaaaaaa-0000-0000-0000-0000000000a1'::uuid]), 0, 'LINE で送ったものは、連絡済みを取り消せない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true); end $$;
select is((select count(*)::int from public.line_pushes), 0, '生徒は送信の記録を読めない');

select * from finish();
rollback;
