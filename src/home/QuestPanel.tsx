import { QUEST_ALL_BONUS, QUEST_COINS, questCoinsEarned, questCoinsLeft, questSummary } from './homeModel'
import type { Quest } from './homeModel'

/** デイリークエスト：達成数は分数で。状態は文字でも示す。1つ3コイン、全部達成でさらに5 */
export function QuestPanel({ quests }: { quests: ReadonlyArray<Quest> }) {
  const left = questCoinsLeft(quests)
  const earned = questCoinsEarned(quests)
  const allDone = quests.length > 0 && quests.every((q) => q.done)

  return (
    <section className="section quests" aria-labelledby="quest-h">
      <h2 id="quest-h" className="quests-title">
        デイリークエスト <span className="num quests-sum">{questSummary(quests)}</span>
      </h2>
      <ul className="quest-list">
        {quests.map((q) => (
          <li key={q.key} className={q.done ? 'quest is-done' : 'quest'}>
            <span className="quest-label">{q.label}</span>
            <span className="quest-progress num">{q.progress}</span>
            <span className="quest-coins">
              <span className="num">{QUEST_COINS}</span>コイン
            </span>
            <span className="quest-state">{q.done ? '達成' : '未達成'}</span>
          </li>
        ))}
        {quests.length > 0 && (
          <li className={allDone ? 'quest quest-bonus is-done' : 'quest quest-bonus'}>
            <span className="quest-label">全部達成のボーナス</span>
            <span className="quest-progress num">{quests.filter((q) => q.done).length} / {quests.length}</span>
            <span className="quest-coins"><span className="num">{QUEST_ALL_BONUS}</span>コイン</span>
            <span className="quest-state">{allDone ? '達成' : '未達成'}</span>
          </li>
        )}
      </ul>
      <p className="quest-foot">
        {allDone
          ? <>今日のクエストは全部達成。<span className="num">{earned}</span>コイン受け取りました。</>
          : <>あと<span className="num">{left}</span>コイン分、残っています。</>}
      </p>
    </section>
  )
}
