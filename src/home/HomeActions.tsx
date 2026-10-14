import { IconBook, IconList } from './HomeIcons'
import { taskBadge } from './homeModel'
import type { HomeTask } from './homeModel'

type Props = {
  tasks: ReadonlyArray<HomeTask>
  /** タスク完了の状態：2つとも副ボタンにして、追加の学習を強いない */
  quiet: boolean
  disabled?: boolean
  onSubjects: () => void
  onTasks: () => void
}

/** 連続日数のすぐ下の2つのボタン：「教科を記録する」（主）と「タスクを見る」（副） */
export function HomeActions({ tasks, quiet, disabled = false, onSubjects, onTasks }: Props) {
  const badge = taskBadge(tasks)
  return (
    <div className="home-actions">
      <button type="button" className={quiet ? 'act-btn act-sub' : 'act-btn act-main'} disabled={disabled} onClick={onSubjects} aria-haspopup="dialog">
        <IconBook />
        <span>教科を記録する</span>
      </button>
      <button type="button" className="act-btn act-sub" onClick={onTasks} aria-haspopup="dialog">
        {badge && <span className={badge.kind === 'left' ? 'act-badge is-left' : 'act-badge is-done'}>{badge.text}</span>}
        <IconList />
        <span>タスクを見る</span>
      </button>
    </div>
  )
}
