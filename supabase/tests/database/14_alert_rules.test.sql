-- アラートの設定：クラブ作成で初期値、運営だけが読み書き、条件の検証、自動送信はまだ選べない
begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'b1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000b1', 'operator', '［運営］', null),
  ('00000000-0000-0000-0000-0000000000b2', 'club_admin', '［管理者名］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111b1', '［クラブ名］');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000b2', 'club_admin', 'approved');

select is((select count(*)::int from public.alert_rules where club_id = '11111111-1111-1111-1111-1111111111b1'), 7, 'クラブを作ると 7 種類の初期値ができる');
select is((select threshold_days from public.alert_rules where club_id = '11111111-1111-1111-1111-1111111111b1' and kind = 'gap'), 3, '記録が空いた日数の初期値は 3');
select is((select count(*)::int from public.alert_rules where send_method = 'manual' and club_id = '11111111-1111-1111-1111-1111111111b1'), 7, '送り方の初期値はすべて手動');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', true); end $$;
select is((select count(*)::int from public.alert_rules), 0, 'クラブ管理者は設定を読めない');
select throws_ok($$select public.save_alert_rule('11111111-1111-1111-1111-1111111111b1','gap',true,5,'manual','x')$$, 'P0001', 'forbidden', 'クラブ管理者は保存できない');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;
select is((select count(*)::int from public.alert_rules), 7, '運営は読める');
select lives_ok($$select public.save_alert_rule('11111111-1111-1111-1111-1111111111b1','gap',false,5,'manual','  また、いっしょに始めよう。  ')$$, '運営は保存できる');
select is((select threshold_days from public.alert_rules where kind = 'gap'), 5, '日数が変わる');
select is((select template from public.alert_rules where kind = 'gap'), 'また、いっしょに始めよう。', '文面は前後の空白を取って保存');
select is((select enabled from public.alert_rules where kind = 'gap'), false, 'オフにできる');
select throws_ok($$select public.save_alert_rule('11111111-1111-1111-1111-1111111111b1','gap',true,0,'manual','x')$$, 'P0001', 'invalid_threshold', '日数は 1〜30');
select throws_ok($$select public.save_alert_rule('11111111-1111-1111-1111-1111111111b1','badge_earned',true,null,'auto','x')$$, 'P0001', 'auto_not_available', '自動送信はまだ選べない');
select throws_ok($$select public.save_alert_rule('11111111-1111-1111-1111-1111111111b1','badge_earned',true,null,'manual','   ')$$, 'P0001', 'invalid_template', '文面は空にできない');

select * from finish();
rollback;
