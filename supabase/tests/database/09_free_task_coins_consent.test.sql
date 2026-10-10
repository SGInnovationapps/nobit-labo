-- 自由登録は 3 コイン／閲覧範囲の版 2
begin;
select plan(6);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test');
insert into public.users (id, role, display_name, grade) values ('00000000-0000-0000-0000-0000000000d1', 'student', 'd1', 9);
insert into public.clubs (id, name, allow_free_tasks) values ('11111111-1111-1111-1111-1111111111d1', '［クラブ名］D', true);
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d1', 'student', 'approved');

select is((select max(version) from public.consent_scope_versions), 2, '閲覧範囲の最新の版は 2');
select ok((select summary from public.consent_scope_versions where version = 2) like '%教科タグ・タイマー%', '版 2 の要約に教科タグ・タイマーが入る');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;

select lives_ok($$select public.register_free_task('英単語 20個', '英語')$$, '自由登録できる');
select is((select reward_coins from public.tasks where kind = 'free'), 3, '（旧）自由登録のタスクの reward_coins は残るが、v1.7 では付与に使わない');
select is((public.complete_task((select id from public.user_tasks limit 1)) ->> 'coins_granted')::int, 1, 'v1.7：自分のタスクの完了は、学習した日の 1 コインだけ');
select is((select balance from public.coin_balances), 1, '残高は 1');

select * from finish();
rollback;
