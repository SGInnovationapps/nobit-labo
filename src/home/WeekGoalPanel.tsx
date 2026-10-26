import { useState } from 'react'
import { IconNext } from './HomeIcons'
import {
  previousRewardNote, subjectQuestProgress, WEEK_TARGET_OPTIONS, WEEKLY_QUEST_COINS, WEEKLY_QUEST_DAYS, weekGoalNote,
} from './weekModel'
import type { WeekInfo } from './weekModel'

type Props = {
  info: WeekInfo
  busy: boolean
  error: string | null
  notice: string | null
  onSetTarget: (days: number) => void
  /** ごほうびのガチャを引く（コレクションで開く） */
  onReward?: () => void
}

/**
 * 今週の目標（月〜日）：学習した日 / 目標の日数を数字で。達成した週は、ごほうびのガチャ1回。
 * ウィークリークエスト「同じ教科を週3日」も、ここに並べる。届かない週でも責めない
 */
export function WeekGoalPanel({ info, busy, error, notice, onSetTarget, onReward }: Props) {
  const [editing, setEditing] = useState(false)
  const days = info.studyDates.length
  const ratio = Math.min(1, days / info.targetDays)
  const quest = subjectQuestProgress(info)
  const prev = previousRewardNote(info)
  const changed = info.nextTargetDays !== info.targetDays

  return (
    <section className="section week-goal" aria-labelledby="wg-h">
      <div className="today-head">
        <h2 id="wg-h">今週の目標</h2>
        <span className="week-goal-sum">
          <span className="num">{days}</span> / <span className="num">{info.targetDays}</span>日
          <span className={info.goalAchieved ? 'week-goal-state is-done' : 'week-goal-state'}>{info.goalAchieved ? '達成' : '未達成'}</span>
        </span>
      </div>
      <div className="next-bar" role="progressbar" aria-valuemin={0} aria-valuemax={info.targetDays} aria-valuenow={Math.min(days, info.targetDays)} aria-label="今週の目標の進み">
        <i style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p className="week-goal-note">{weekGoalNote(info)}</p>
      {prev && <p className="week-goal-note">{prev}</p>}

      {info.rewardAvailable && onReward && (
        <button type="button" className="gacha-row is-filled" onClick={onReward}>
          <span>ごほうびのガチャを引く</span>
          <small>週の目標　1回</small>
          <IconNext />
        </button>
      )}

      <ul className="quest-list week-quest" aria-label="ウィークリークエスト">
        <li className={quest.done ? 'quest is-done' : 'quest'}>
          <span className="quest-label">
            同じ教科を週{WEEKLY_QUEST_DAYS}日
            {quest.label && <span className="week-quest-subject">{quest.label}</span>}
          </span>
          <span className="quest-progress num">{quest.days} / {WEEKLY_QUEST_DAYS}</span>
          <span className="quest-coins"><span className="num">{WEEKLY_QUEST_COINS}</span>コイン</span>
          <span className="quest-state">{quest.done ? '達成' : '未達成'}</span>
        </li>
      </ul>

      {changed && !notice && <p className="week-goal-note">来週から、目標は<span className="num">{info.nextTargetDays}</span>日です。</p>}
      {notice && <p className="week-goal-note" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {editing ? (
        <div className="week-target" role="group" aria-label="目標の日数を選ぶ">
          <p className="week-goal-note">1週間（月〜日）に学習する日の数。記録した週は、来週から変わります。</p>
          <div className="week-target-options">
            {WEEK_TARGET_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className="week-target-btn"
                aria-pressed={info.nextTargetDays === n}
                disabled={busy}
                onClick={() => { setEditing(false); onSetTarget(n) }}
              >
                <span className="num">{n}</span>日
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>やめる</button>
        </div>
      ) : (
        <button type="button" className="btn btn-quiet week-target-open" disabled={busy} onClick={() => setEditing(true)}>
          目標の日数を変える
        </button>
      )}
    </section>
  )
}
