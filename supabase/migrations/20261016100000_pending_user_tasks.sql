-- 承認待ちの生徒にも、配信タスクを展開できるようにする
--
-- 不具合：クラブに配信タスクがあると、承認待ちの生徒がホームを開いたときに sync_today_tasks が
-- not_approved_student で失敗し、画面全体が「読み込めませんでした」になっていた。
-- user_tasks の挿入前のトリガーだけが、承認済みの所属を求めたまま残っていたため
-- （仕様書 v1.7「承認待ちの間もアプリを使え、記録は保持する」。他の書き込みは
-- private.my_usable_club_id() で承認待ちも通るよう直してあった）。
--
-- 見える範囲は変えない。承認待ちの記録は、これまでどおりクラブ管理者には見えず
-- （user_tasks_select などの RLS が private.is_approved_student() で絞る）、
-- クラブ全体の合計にも数えない（集計は status = 'approved' のまま）。

create or replace function private.user_tasks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
begin
  select t.club_id, t.kind, t.owner_id
    into v_task
    from public.tasks t
   where t.id = new.task_id;
  if not found then
    raise exception 'task_not_found';
  end if;

  if v_task.kind = 'free' and v_task.owner_id is distinct from new.student_id then
    raise exception 'free_task_owner_mismatch';
  end if;

  -- 承認待ち（pending）も通す。退会（left）と、所属のない生徒は通さない
  if not exists (
    select 1
      from public.club_members cm
     where cm.user_id = new.student_id
       and cm.club_id = v_task.club_id
       and cm.member_role = 'student'
       and cm.status in ('approved', 'pending')
  ) then
    raise exception 'not_approved_student';
  end if;

  new.club_id := v_task.club_id;
  new.is_free := (v_task.kind = 'free');
  return new;
end;
$$;
