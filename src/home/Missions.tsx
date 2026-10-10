import { useCallback, useEffect, useState } from 'react'
import { jstDate } from './homeModel'
import { joinMission, loadMissions } from './missionApi'
import { METRIC_LABEL, METRIC_UNIT, missionErrorMessage, percentOf, periodLabel, resultText, rewardLines, splitMissions, timeNote } from './missionModel'
import type { Mission } from './missionModel'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'

type ViewProps = {
  missions: Mission[] | null
  today: string
  error: string | null
  busy: boolean
  onJoin: (id: string) => void
  onTab: (tab: Tab) => void
}

function Bar({ label, progress, goal, unit, done }: { label: string; progress: number; goal: number; unit: string; done: boolean }) {
  return (
    <div className="mis-bar">
      <p className="mis-bar-head">
        <span>{label}</span>
        <span><span className="num mis-num">{progress}</span> / <span className="num">{goal}</span> {unit}{done && <span className="mis-done">　達成</span>}</span>
      </p>
      <div className="mis-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(progress, goal)}>
        <i style={{ width: `${percentOf(progress, goal)}%` }} />
      </div>
    </div>
  )
}

function Card({ m, today, busy, onJoin }: { m: Mission; today: string; busy: boolean; onJoin: (id: string) => void }) {
  const unit = METRIC_UNIT[m.metric]
  const rewards = rewardLines(m)
  return (
    <article className="mis-card" aria-labelledby={`mis-${m.id}`}>
      <h3 id={`mis-${m.id}`}>{m.title}</h3>
      <p className="mis-time">{periodLabel(m.startsOn, m.endsOn)}　{timeNote(m, today)}</p>
      {m.description && <p className="mis-desc">{m.description}</p>}
      <p className="muted mis-metric">数えるもの：{METRIC_LABEL[m.metric]}</p>

      {m.status === 'active' && (
        <>
          <Bar label="クラブ全体" progress={m.clubProgress} goal={m.clubGoal} unit={unit} done={m.clubProgress >= m.clubGoal} />
          {m.joined ? (
            <Bar label="あなた" progress={m.myProgress} goal={m.personalGoal} unit={unit} done={m.myProgress >= m.personalGoal} />
          ) : (
            <p className="muted">参加すると、あなたの進みが数えられます。</p>
          )}
          <p className="muted mis-people">参加している人　<span className="num">{m.participants}</span> 人</p>
        </>
      )}
      {rewards.length > 0 && (
        <ul className="mis-rewards" aria-label="報酬">
          {rewards.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {m.status === 'active' && !m.joined && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onJoin(m.id)}>参加する</button>
      )}
      {m.status === 'active' && m.joined && <p className="mis-joined">参加しています</p>}
    </article>
  )
}

export function MissionsView({ missions, today, error, busy, onJoin, onTab }: ViewProps) {
  const g = missions ? splitMissions(missions) : null
  return (
    <div className="home missions">
      <header className="home-head">
        <h1 className="brand">ミッション</h1>
        <p className="muted home-sub">クラブのみんなで進めます。自分とクラブ全体の数字だけが見えます。</p>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {!missions && !error && <p className="muted" role="status">読み込み中…</p>}

      {g && (
        <>
          <section className="section" aria-labelledby="mis-now">
            <h2 id="mis-now">いまのミッション</h2>
            {g.current.length === 0 ? (
              <p className="muted">いま配信中のミッションはありません。</p>
            ) : (
              g.current.map((m) => <Card key={m.id} m={m} today={today} busy={busy} onJoin={onJoin} />)
            )}
          </section>

          {g.past.length > 0 && (
            <section className="section" aria-labelledby="mis-past">
              <h2 id="mis-past">これまでのミッション</h2>
              <ul className="mis-past">
                {g.past.map((m) => {
                  const r = resultText(m)
                  return (
                    <li key={m.id}>
                      <p className="mis-past-title">{m.title}<span className="muted">　{periodLabel(m.startsOn, m.endsOn)}</span></p>
                      <p className="mis-past-result">{r.club}　{r.me}</p>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
      <TabBar current="ミッション" onSelect={onTab} />
    </div>
  )
}

export function Missions({ onTab }: { onTab: (tab: Tab) => void }) {
  const [missions, setMissions] = useState<Mission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setMissions(await loadMissions())
    } catch (e) {
      console.error(e)
      setError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function onJoin(id: string) {
    setBusy(true)
    setError(null)
    try {
      await joinMission(id)
    } catch (e) {
      console.error(e)
      setError(missionErrorMessage(e))
    } finally {
      await load()
      setBusy(false)
    }
  }

  return <MissionsView missions={missions} today={jstDate(Date.now())} error={error} busy={busy} onJoin={(id) => void onJoin(id)} onTab={onTab} />
}
