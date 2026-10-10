-- 無料ガチャ：条件・1 日 1 回・確率の境目・重複のコイン交換・設定・見える範囲
begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'e3@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000e1', 'student', 'e1', 7),
  ('00000000-0000-0000-0000-0000000000e2', 'student', 'e2', 8),
  ('00000000-0000-0000-0000-0000000000e3', 'club_admin', '［管理者名］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111e1', '［クラブ名］E');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e2', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e3', 'club_admin', 'approved');

select is((select count(*)::int from public.items where active), 15, '景品は 15 個');
select is((select count(*)::int from public.items where rarity = 'normal'), 7, 'ノーマル 7');
select is((select count(*)::int from public.items where rarity = 'rare'), 5, 'レア 5');
select is((select count(*)::int from public.items where rarity = 'super_rare'), 3, 'スーパーレア 3');

-- 記録がない日は引けない
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true); end $$;
select throws_ok($$select public.draw_gacha()$$, 'P0001', 'no_record_today', '記録のない日は引けない');

-- 教科タグを記録すると引ける
select lives_ok($$select public.record_study_tag('数学')$$, '教科タグで学習記録');
reset role;

-- 確率の境目（roll 0.69 = ノーマル、0.70 = レア、0.95 = スーパーレア）。実際の抽選関数に固定の乱数を渡す
select is((private.draw_gacha_at('00000000-0000-0000-0000-0000000000e1', now(), 0.69, 0.0) ->> 'rarity'), 'normal', 'roll 0.69 はノーマル');
select throws_ok($$select private.draw_gacha_at('00000000-0000-0000-0000-0000000000e1', now(), 0.99, 0.0)$$, 'P0001', 'already_drawn', '1 日 1 回');

-- 翌日（別の日付）に、同じ景品が当たると重複 → コインに交換
delete from public.gacha_draws where student_id = '00000000-0000-0000-0000-0000000000e1';
select is((private.draw_gacha_at('00000000-0000-0000-0000-0000000000e1', now(), 0.69, 0.0) ->> 'duplicate')::boolean, true, '同じ景品は重複');
select is((select coins_granted from public.gacha_draws where student_id = '00000000-0000-0000-0000-0000000000e1'), 5, 'ノーマルの重複は 5 コイン');
select is((select count(*)::int from public.user_items where student_id = '00000000-0000-0000-0000-0000000000e1'), 1, '重複では所持は増えない');

delete from public.gacha_draws where student_id = '00000000-0000-0000-0000-0000000000e1';
select is((private.draw_gacha_at('00000000-0000-0000-0000-0000000000e1', now(), 0.70, 0.0) ->> 'rarity'), 'rare', 'roll 0.70 はレア');
delete from public.gacha_draws where student_id = '00000000-0000-0000-0000-0000000000e1';
select is((private.draw_gacha_at('00000000-0000-0000-0000-0000000000e1', now(), 0.95, 0.99) ->> 'rarity'), 'super_rare', 'roll 0.95 はスーパーレア');
select is((select count(*)::int from public.user_items where student_id = '00000000-0000-0000-0000-0000000000e1'), 3, '所持は 3 個（ノーマル・レア・スーパーレア）');

-- 残高：教科タグ 1 + 重複 5
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-0000000000e1'), 6, '残高は台帳の合計（1 + 5）');

-- 称号に設定する
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true); end $$;
select is((select public.equip_item(i.id) from public.items i where i.code = 'title_partner'), true, '称号に設定できる');
select is((select count(*)::int from public.user_items where equipped), 1, '設定中は 1 つ');
select is((select public.equip_item(i.id) from public.items i where i.code = 'title_partner'), false, 'もう一度選ぶと外れる');
select throws_ok($$select public.equip_item(id) from public.items where code = 'title_idea'$$, 'P0001', 'item_not_owned', '持っていない景品は設定できない');

-- 見える範囲
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true); end $$;
select is((select count(*)::int from public.user_items), 0, '他の生徒の所持は見えない');
select throws_ok($$insert into public.user_items (club_id, student_id, item_id, category) select '11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e2', id, category from public.items limit 1$$, '42501', null, '景品を直接書けない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3"}', true); end $$;
select is((select count(*)::int from public.user_items) + (select count(*)::int from public.gacha_draws), 0, 'クラブ管理者には所持・ガチャの履歴が見えない');

select * from finish();
rollback;
