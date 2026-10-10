import { useCallback, useEffect, useState } from 'react'
import { dateLabel, jstDate } from '../home/homeModel'
import type { Club } from './adminApi'
import { addClubEvent, loadClubEvents, removeClubEvent } from './adminApi'
import { dateProblem, EVENT_KINDS, eventErrorMessage, kindLabel, noteProblem, NOTE_MAX, splitEvents } from './eventsModel'
import type { ClubEvent, EventKind } from './eventsModel'

type ViewProps = {
  clubName: string
  events: ClubEvent[]
  today: string
  busy: boolean
  error: string | null
  notice: string | null
  onAdd: (date: string, kind: EventKind, note: string) => void
  onRemove: (id: string) => void
}

export function ClubEventsView({ clubName, events, today, busy, error, notice, onAdd, onRemove }: ViewProps) {
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<EventKind>('tournament')
  const [note, setNote] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const { upcoming, past } = splitEvents(events, today)
  const problem = date === '' ? null : dateProblem(date, today, events)
  const nProblem = noteProblem(note)
  const canAdd = date !== '' && !problem && !nProblem && !busy

  return (
    <>
      <div className="adm-title-row">
        <h1 className="adm-h1">大会日程<span className="adm-grade">{clubName}</span></h1>
      </div>
      <p className="muted">
        登録した日は、このクラブの生徒の「休息日」になります。休息チケットは使わず、連続記録は途切れません。休息日は学習日には数えません。
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="adm-notice" role="status">{notice}</p>}

      <section className="adm-section" aria-labelledby="ev-add">
        <h2 id="ev-add">日程を追加する</h2>
        <div className="adm-inline-form">
          <div className="field">
            <label htmlFor="ev-date">日付</label>
            <input id="ev-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <fieldset className="choices adm-choices">
            <legend className="adm-sr">種別</legend>
            {EVENT_KINDS.map((k) => (
              <label className="choice" key={k.key}>
                <input type="radio" name="ev-kind" checked={kind === k.key} onChange={() => setKind(k.key)} />
                <span className="choice-face">{k.label}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="adm-inline-form">
          <div className="field">
            <label htmlFor="ev-note">メモ（任意・{NOTE_MAX}文字まで）</label>
            <input id="ev-note" type="text" value={note} placeholder="例：県大会" onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary" disabled={!canAdd} onClick={() => { onAdd(date, kind, note); setDate(''); setNote('') }}>
            追加する
          </button>
        </div>
        {(problem || nProblem) && <p className="error" role="alert">{problem ?? nProblem}</p>}
      </section>

      <section className="adm-section" aria-labelledby="ev-up">
        <h2 id="ev-up">これからの日程</h2>
        {upcoming.length === 0 ? (
          <p className="muted">登録されている日程はありません。</p>
        ) : (
          <ul className="ev-list">
            {upcoming.map((e) => (
              <li key={e.id} className="ev-row">
                <div className="ev-main">
                  <span className="ev-date">{dateLabel(e.date)}</span>
                  <span className="ev-kind">{kindLabel(e.kind)}</span>
                  {e.note && <span className="ev-note">{e.note}</span>}
                  {e.date === today && <span className="ev-today">今日</span>}
                </div>
                {confirmId === e.id ? (
                  <div className="adm-actions-row">
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirmId(null); onRemove(e.id) }}>削除する</button>
                    <button type="button" className="btn btn-quiet" onClick={() => setConfirmId(null)}>やめる</button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-quiet" onClick={() => setConfirmId(e.id)} aria-label={`${dateLabel(e.date)}の${kindLabel(e.kind)}を削除`}>
                    削除
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="adm-section" aria-labelledby="ev-past">
          <h2 id="ev-past">過去の日程</h2>
          <p className="muted">過去の日程は、連続記録に使われているため変更できません。</p>
          <ul className="ev-list">
            {past.map((e) => (
              <li key={e.id} className="ev-row ev-row-past">
                <div className="ev-main">
                  <span className="ev-date">{dateLabel(e.date)}</span>
                  <span className="ev-kind">{kindLabel(e.kind)}</span>
                  {e.note && <span className="ev-note">{e.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export default function ClubEvents({ club }: { club: Club }) {
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const today = jstDate(Date.now())

  const reload = useCallback(async () => {
    // 過去は直近90日分だけ読む
    const from = jstDate(Date.now() - 90 * 86400000)
    setEvents(await loadClubEvents(club.id, from))
    setLoaded(true)
  }, [club.id])

  useEffect(() => {
    setLoaded(false)
    reload().catch((e) => {
      console.error(e)
      setError('日程を読み込めませんでした。')
    })
  }, [reload])

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      await reload()
      setNotice(done)
    } catch (e) {
      console.error(e)
      setError(eventErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!loaded && !error) return <p className="lead">読み込み中です…</p>
  return (
    <ClubEventsView
      clubName={club.name}
      events={events}
      today={today}
      busy={busy}
      error={error}
      notice={notice}
      onAdd={(d, k, n) => void run(() => addClubEvent(club.id, d, k, n), '日程を追加しました。')}
      onRemove={(id) => void run(() => removeClubEvent(id), '日程を削除しました。')}
    />
  )
}
