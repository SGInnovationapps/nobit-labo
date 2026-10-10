-- v1.7 ③：クラブ管理者の「見たよ」（1タップ）と、生徒のホームに出す送り主の名前
-- 「見たよ」は応援コメントの一種（kind = 'seen'）。同じ生徒に、同じ管理者が1日1回まで。

alter table public.support_comments
  add column kind text not null default 'comment' check (kind in ('comment', 'seen')),
  add column seen_on date;

create unique index support_seen_once_a_day
  on public.support_comments (student_id, author_id, seen_on) where kind = 'seen';

-- 直接の書き込みは「コメント」だけ。「見たよ」は send_seen() から
drop policy support_comments_insert on public.support_comments;
create policy support_comments_insert on public.support_comments for insert to authenticated
  with check (
    kind = 'comment'
    and author_id = (select auth.uid())
    and (select private.is_club_admin(club_id))
    and exists (
      select 1 from public.club_members cm
      where cm.user_id = support_comments.student_id
        and cm.club_id = support_comments.club_id
        and cm.member_role = 'student'
        and cm.status = 'approved'
    )
  );

create function public.send_seen(p_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select cm.club_id into v_club
    from public.club_members cm
   where cm.user_id = p_student_id and cm.member_role = 'student' and cm.status = 'approved';
  if v_club is null then
    raise exception 'student_not_found';
  end if;
  if not private.is_club_admin(v_club) then
    raise exception 'forbidden';
  end if;
  insert into public.support_comments (club_id, student_id, author_id, body, kind, seen_on)
  values (v_club, p_student_id, v_uid, '見たよ', 'seen', private.jst_today())
  on conflict (student_id, author_id, seen_on) where kind = 'seen' do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.send_seen(uuid) from public, anon, authenticated;
grant execute on function public.send_seen(uuid) to authenticated;

-- 生徒のホーム用：自分宛ての最新の応援と、送り主の名前（送り主の users は生徒には読めないため）
create function public.my_latest_support()
returns table (body text, kind text, created_at timestamptz, author_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select sc.body, sc.kind, sc.created_at, u.display_name
    from public.support_comments sc
    join public.users u on u.id = sc.author_id
   where sc.student_id = (select auth.uid())
   order by sc.created_at desc
   limit 1
$$;
revoke all on function public.my_latest_support() from public, anon, authenticated;
grant execute on function public.my_latest_support() to authenticated;
