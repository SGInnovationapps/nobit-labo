import { questSummary } from './homeModel'
import type { Quest } from './homeModel'

/** デイリークエスト：達成数は分数で。状態は文字でも示す（コインは付けない［仮］） */
export function QuestPanel({ quests }: { quests: ReadonlyArray<Quest> }) {
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
            <span className="quest-state">{q.done ? '達成' : '未達成'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
