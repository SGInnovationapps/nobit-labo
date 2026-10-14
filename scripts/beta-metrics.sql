-- β版の試験運用で見る数字（運営が Supabase の SQL Editor で実行する。読むだけで、何も書き換えない）
-- 仕様書 9章：見る指標は、アプリの起動数ではなく、学習記録をした生徒の割合・週あたりの学習日数・タイマーの利用率・アラート後の学習再開率
-- 週は月曜〜日曜（JST）。生徒数は、いま承認済みの生徒（承認待ち・退会は数えない）。
-- 3つのクエリは、1つずつ選んで実行する。

-- ■ 1. クラブ・週ごとの記録（直近8週、新しい週から）
with weeks as (
  select (date_trunc('week', private.jst_today()::timestamp)::date - 7 * n) as week_start
  from generate_series(0, 7) as n
), students as (
  select cm.club_id, cm.user_id
  from public.club_members cm
  join public.users u on u.id = cm.user_id and u.role = 'student'
  where cm.member_role = 'student' and cm.status = 'approved'
)
select
  c.name as クラブ,
  w.week_start as 週の初め,
  count(distinct s.user_id) as 生徒,
  count(distinct o.student_id) as 開いた生徒,
  count(distinct a.student_id) as 記録した生徒,
  round(100.0 * count(distinct a.student_id) / nullif(count(distinct s.user_id), 0)) as 記録した割合_pct,
  round(count(distinct a.id)::numeric / nullif(count(distinct s.user_id), 0), 1) as 学習日数_平均,
  count(distinct r.student_id) as タイマーを使った生徒,
  round(100.0 * count(distinct r.student_id) / nullif(count(distinct s.user_id), 0)) as タイマー利用_pct
from public.clubs c
cross join weeks w
left join students s on s.club_id = c.id
left join public.app_opens o
  on o.student_id = s.user_id and o.club_id = c.id and o.opened_on between w.week_start and w.week_start + 6
left join public.daily_activity a
  on a.student_id = s.user_id and a.club_id = c.id and a.activity_date between w.week_start and w.week_start + 6
left join public.study_records r
  on r.student_id = s.user_id and r.club_id = c.id and r.kind = 'timer' and r.record_date between w.week_start and w.week_start + 6
group by c.name, w.week_start
order by c.name, w.week_start desc;

-- ■ 2. アラートの種類ごとの、連絡後の学習再開（直近28日に連絡したもの）
select
  a.kind as 種類,
  count(*) as 連絡した,
  count(*) filter (where a.resumed_after_contact) as 再開した,
  round(100.0 * count(*) filter (where a.resumed_after_contact) / nullif(count(*), 0)) as 再開率_pct,
  count(*) filter (where a.status = 'contacted') as まだ再開待ち
from public.alerts a
where a.contacted_at >= now() - interval '28 days'
group by a.kind
order by 連絡した desc;

-- ■ 3. 画面のエラー（直近14日、日ごと）。多い文面は、管理画面の対応アラートの上で開いて確かめる
select
  private.jst_date(e.last_at) as 日付,
  e.app as 画面,
  count(*) as 種類の数,
  sum(e.repeats) as 回数,
  count(distinct e.user_id) as 人数
from public.client_errors e
where e.last_at >= now() - interval '14 days'
group by 1, 2
order by 1 desc, 2;
