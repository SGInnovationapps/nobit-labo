-- =============================================================================
-- 014_roster_settings.sql  会員名簿のビューと、会員規約の改定（工程5-6・5-8）
--
-- 【このファイルで作るもの】
--   staff_roster     会員名簿（1行が1人の子）。学年・年齢はデータベースの関数で計算する
--                      学年（grade_label）・学年の数（grade_number、並べ替え用）・年齢（age_on）・クラス名・
--                      保護者のLINEがいくつつながっているか・最後に同意した規約の版と方法
--   publish_terms()  会員規約を改定する（新しい版を公開する）。版の番号は1つずつ上がる
--
-- 【決めたこと】
--   - staff_roster は security_invoker = true。読む人の権限（RLS）でそのまま絞られる。
--     そのうえで職員（事務担当・コーチ）だけに出す（保護者が読んでも0行）
--   - 学年は grade_label の値をそのまま使う（画面で計算し直さない。仕様書 4-1-1）
--   - 保護者のつながり・規約の同意は、読む人に見える分だけ数える（コーチには見えないので 0 と空）
--   - publish_terms は security invoker。事務担当だけ（それ以外は not_allowed）。
--     クラブの行を押さえてから次の番号を決めるので、同時に2人が改定しても番号は重ならない。
--     本文が空・2万文字を超える → invalid_input、いまの版と同じ本文 → unchanged
--   - 前の版は消さない（同意の記録が指しているため）。改定すると、保護者は次に開いたとき同意し直す（工程4-9）
--   - クラスの追加・変更は、事務担当が classes に直接書く（007 の許可のとおり。関数は作らない）
--
-- 001〜013 は書き換えない。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- staff_roster：会員名簿
-- -----------------------------------------------------------------------------
create view staff_roster with (security_invoker = true) as
select
  m.id                          as member_id,
  m.member_no,
  m.status,
  m.family_name,
  m.given_name,
  m.family_kana,
  m.given_kana,
  m.birth_date,
  grade_label(m.birth_date)     as grade,
  grade_number(m.birth_date)    as grade_no,
  age_on(m.birth_date)          as age,
  m.class_id,
  c.name                        as class_name,
  m.care_flag,
  m.applied_at,
  m.approved_at,
  m.withdrawn_on,
  (select count(*) from guardian_members gm where gm.member_id = m.id)::integer as guardian_count,
  lc.version                    as consent_version,
  lc.method                     as consent_method
from members m
left join classes c on c.id = m.class_id
left join lateral (
  select v.version, t.method
    from terms_consents t
    join terms_versions v on v.id = t.terms_version_id
   where t.member_id = m.id
   order by v.version desc, t.consented_at desc
   limit 1
) as lc on true
where is_staff();

comment on view staff_roster is '会員名簿（職員だけ）。学年・年齢はデータベースの関数で計算する。読む人の権限で絞られる（security_invoker）';

revoke all on staff_roster from public, anon;
grant select on staff_roster to authenticated;


-- -----------------------------------------------------------------------------
-- publish_terms：会員規約を改定する
-- 返すもの {"result": "ok", "version": 3} か {"result": "not_allowed" | "invalid_input" | "unchanged"}
-- -----------------------------------------------------------------------------
create or replace function publish_terms(p_body text)
returns jsonb
language plpgsql volatile security invoker set search_path = public, pg_temp
as $$
declare
  v_club    uuid := current_club_id();
  v_body    text := btrim(coalesce(p_body, ''), E' \t\r\n');
  v_latest  record;
  v_next    integer;
begin
  -- --- 1. 事務担当だけ --------------------------------------------------------------
  if v_club is null or not is_admin() then
    return jsonb_build_object('result', 'not_allowed');
  end if;

  -- --- 2. 本文 -----------------------------------------------------------------------
  if char_length(v_body) not between 1 and 20000 then
    return jsonb_build_object('result', 'invalid_input');
  end if;

  -- --- 3. 次の版の番号（クラブの行を押さえて、同時の改定を1つずつにする）----------------
  perform 1 from clubs where id = v_club for update;
  select version, body into v_latest
    from terms_versions
   where club_id = v_club
   order by version desc
   limit 1;
  if v_latest.body is not distinct from v_body then
    return jsonb_build_object('result', 'unchanged');
  end if;
  v_next := coalesce(v_latest.version, 0) + 1;

  insert into terms_versions (club_id, version, body)
  values (v_club, v_next, v_body);

  return jsonb_build_object('result', 'ok', 'version', v_next);
end;
$$;

comment on function publish_terms(text) is '会員規約を改定する（新しい版を公開する。事務担当だけ）';

revoke all on function publish_terms(text) from public, anon;
grant execute on function publish_terms(text) to authenticated;


-- =============================================================================
-- 検査（1つでも当てはまれば、このファイルの適用が失敗する）
-- =============================================================================
do $$
declare
  v_name text;
begin
  -- (1) security_invoker が付いていないビューがないか
  for v_name in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce('security_invoker=true' = any (c.reloptions), false)
  loop
    raise exception 'security_invoker が付いていないビューがあります: %', v_name;
  end loop;

  -- (2) 未ログインの人が読めない・呼べないか、ログインした人は読める・呼べるか
  if has_table_privilege('anon', 'public.staff_roster', 'select') then
    raise exception 'staff_roster を未ログインの人が読める状態になっています';
  end if;
  if not has_table_privilege('authenticated', 'public.staff_roster', 'select') then
    raise exception 'staff_roster をログインした人が読めません';
  end if;
  if has_function_privilege('anon', 'public.publish_terms(text)', 'execute') then
    raise exception 'publish_terms を未ログインの人が呼べる状態になっています';
  end if;
  if not has_function_privilege('authenticated', 'public.publish_terms(text)', 'execute') then
    raise exception 'publish_terms をログインした人が呼べません';
  end if;

  -- (3) publish_terms が security definer になっていないか
  if (select prosecdef from pg_proc where oid = 'public.publish_terms(text)'::regprocedure) then
    raise exception 'publish_terms が security definer になっています';
  end if;
end;
$$;
