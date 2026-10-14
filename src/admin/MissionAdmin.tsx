import { useCallback, useEffect, useState } from 'react'
import { dateLabel, jstDate } from '../home/homeModel'
import { METRIC_LABEL, METRIC_UNIT, periodLabel } from '../home/missionModel'
import type { MissionMetric } from '../home/missionModel'
import type { Club } from './adminApi'
import { cancelClubMission, createClubMission, loadAdminMissions } from './adminApi'
import { bulkResultText, checkDraft, DESCRIPTION_MAX, draftFromMission, emptyDraft, missionAdminError, reachedRate, splitAdmin, TITLE_MAX } from './missionAdminModel'
import type { AdminMission, BulkResult, MissionDraft } from './missionAdminModel'

type ViewProps = {
  clubName: string
  /** 表示中のクラブと、配信先に選べるクラブ。2つ以上あるときだけ、クラブの選択を出す */
  clubId?: string
  clubs?: ReadonlyArray<{ id: string; name: string }>
  missions: AdminMission[]
  today: string
  busy: boolean
  error: string | null
  notice: string | null
  onCreate: (d: MissionDraft, clubIds: string[]) => void
  onCancel: (id: string) => void
}

function MissionBlock({ m, busy, onCancel, onDuplicate, canCancel }: { m: AdminMission; busy: boolean; onCancel: (id: string) => void; onDuplicate: (m: AdminMission) => void; canCancel: boolean }) {
  const unit = METRIC_UNIT[m.metric]
  const rate = reachedRate(m)
  const [confirm, setConfirm] = useState(false)
  return (
    <article className="msn-card" aria-labelledby={`msn-${m.id}`}>
      <div className="msn-head">
        <h3 id={`msn-${m.id}`}>{m.title}</h3>
        <p className="msn-status">{m.status === 'active' ? '配信中' : m.status === 'upcoming' ? 'これから' : '終了'}</p>
      </div>
      <p className="muted">{periodLabel(m.startsOn, m.endsOn)}　数えるもの：{METRIC_LABEL[m.metric]}</p>
      <dl className="adm-meta msn-stats">
        <div><dt>クラブ全体の進み</dt><dd><span className="num">{m.clubProgress}</span> / <span className="num">{m.clubGoal}</span> {unit}{m.clubProgress >= m.clubGoal ? '　達成' : ''}</dd></div>
        <div><dt>参加人数</dt><dd><span className="num">{m.participants}</span> 人</dd></div>
        <div><dt>個人目標（{m.personalGoal}{unit}）に届いた人</dt><dd><span className="num">{m.personalReached}</span> 人{rate !== null ? `（${rate}%）` : ''}</dd></div>
        <div><dt>報酬</dt><dd>個人 <span className="num">{m.rewardPersonalCoins}</span> ／ クラブ <span className="num">{m.rewardClubCoins}</span> コイン</dd></div>
      </dl>
      {m.students.length > 0 && (
        <details className="msn-students">
          <summary>生徒ごとの進み（{m.students.length}人）</summary>
          <ul>
            {m.students.map((s) => (
              <li key={s.studentId}>
                <span>{s.displayName ?? '（表示名が未入力）'}</span>
                <span><span className="num">{s.progress}</span> / {m.personalGoal} {unit}{s.progress >= m.personalGoal ? '　達成' : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="adm-actions-row">
        <button type="button" className="btn btn-secondary" onClick={() => onDuplicate(m)}>複製する</button>
      </div>
      {canCancel && (confirm ? (
        <div className="adm-actions-row">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirm(false); onCancel(m.id) }}>取り消す</button>
          <button type="button" className="btn btn-quiet" onClick={() => setConfirm(false)}>やめる</button>
        </div>
      ) : (
        <button type="button" className="btn btn-quiet" onClick={() => setConfirm(true)}>このミッションを取り消す</button>
      ))}
    </article>
  )
}

export function MissionAdminView({ clubName, clubId = '', clubs = [], missions, today, busy, error, notice, onCreate, onCancel }: ViewProps) {
  const [draft, setDraft] = useState<MissionDraft>(() => emptyDraft(today))
  const [open, setOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [clubIds, setClubIds] = useState<string[]>(clubId ? [clubId] : [])
  const pickClubs = clubs.length > 1
  const duplicate = (m: AdminMission) => { setDraft(draftFromMission(m, today)); setDuplicating(true); setClubIds(clubId ? [clubId] : []); setOpen(true); window.scrollTo({ top: 0 }) }
  const g = splitAdmin(missions)
  const check = checkDraft(draft, today, missions)
  const set = (patch: Partial<MissionDraft>) => setDraft({ ...draft, ...patch })

  return (
    <>
      <div className="adm-title-row">
        <h1 className="adm-h1">クラブミッション<span className="adm-grade">{clubName}</span></h1>
        {!open && <button type="button" className="btn btn-primary adm-inline" onClick={() => { setDuplicating(false); setDraft(emptyDraft(today)); setClubIds(clubId ? [clubId] : []); setOpen(true) }}>ミッションを作る</button>}
      </div>
      <p className="muted">クラブ全体の目標と、個人の目標を決めます。生徒には、自分とクラブ全体の数字だけが見えます。</p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="adm-notice" role="status">{notice}</p>}

      {open && (
        <section className="adm-section" aria-labelledby="msn-new">
          <h2 id="msn-new">{duplicating ? 'ミッションを複製する' : 'ミッションを作る'}</h2>
          {duplicating && <p className="muted">タイトル・数えるもの・目標・報酬を引き継ぎました。期間は同じ長さで、今日から始めます。</p>}
          <div className="field">
            <label htmlFor="msn-title">タイトル（{TITLE_MAX}文字まで）</label>
            <input id="msn-title" type="text" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="例：秋の学習チャレンジ" />
          </div>
          <div className="field">
            <label htmlFor="msn-desc">説明（任意・{DESCRIPTION_MAX}文字まで）</label>
            <input id="msn-desc" type="text" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <fieldset className="choices adm-choices msn-metric">
            <legend>数えるもの</legend>
            {(['records', 'study_days'] as MissionMetric[]).map((k) => (
              <label className="choice" key={k}>
                <input type="radio" name="msn-metric" checked={draft.metric === k} onChange={() => set({ metric: k })} />
                <span className="choice-face">{METRIC_LABEL[k]}</span>
              </label>
            ))}
          </fieldset>
          <div className="adm-inline-form">
            <div className="field"><label htmlFor="msn-from">開始日</label><input id="msn-from" type="date" value={draft.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></div>
            <div className="field"><label htmlFor="msn-to">終了日</label><input id="msn-to" type="date" value={draft.endsOn} onChange={(e) => set({ endsOn: e.target.value })} /></div>
          </div>
          <div className="adm-inline-form">
            <div className="field"><label htmlFor="msn-cg">クラブの目標（{METRIC_UNIT[draft.metric]}）</label><input id="msn-cg" type="number" inputMode="numeric" min={1} value={draft.clubGoal} onChange={(e) => set({ clubGoal: e.target.value })} /></div>
            <div className="field"><label htmlFor="msn-pg">個人の目標（{METRIC_UNIT[draft.metric]}）</label><input id="msn-pg" type="number" inputMode="numeric" min={1} value={draft.personalGoal} onChange={(e) => set({ personalGoal: e.target.value })} /></div>
          </div>
          <div className="adm-inline-form">
            <div className="field"><label htmlFor="msn-rp">個人の報酬（コイン）</label><input id="msn-rp" type="number" inputMode="numeric" min={0} value={draft.rewardPersonal} onChange={(e) => set({ rewardPersonal: e.target.value })} /></div>
            <div className="field"><label htmlFor="msn-rc">クラブの報酬（コイン）</label><input id="msn-rc" type="number" inputMode="numeric" min={0} value={draft.rewardClub} onChange={(e) => set({ rewardClub: e.target.value })} /></div>
          </div>
          {pickClubs && (
            <fieldset className="adm-club-pick">
              <legend>作るクラブ（複数選べます）</legend>
              <div className="adm-actions-row">
                <button type="button" className="btn btn-quiet" onClick={() => setClubIds(clubs.map((c) => c.id))}>すべて選ぶ</button>
                <button type="button" className="btn btn-quiet" onClick={() => setClubIds([])}>選びなおす</button>
              </div>
              {clubs.map((c) => (
                <label className="agree adm-all" key={c.id}>
                  <input type="checkbox" checked={clubIds.includes(c.id)} onChange={(e) => setClubIds(e.target.checked ? [...clubIds, c.id] : clubIds.filter((x) => x !== c.id))} />
                  <span>{c.name}</span>
                </label>
              ))}
              <p className="muted">期間が重なるクラブは作れません（作れたクラブだけに作ります）。</p>
            </fieldset>
          )}
          <p className="muted">クラブの報酬は、参加して1回以上記録した全員に付きます。開始日と終了の前日には、アラートが出ます。</p>
          {draft.title !== '' && check.problem && <p className="error" role="alert">{check.problem}</p>}
          <div className="adm-actions-row">
            <button type="button" className="btn btn-primary" disabled={busy || check.value === null || (pickClubs && clubIds.length === 0)} onClick={() => { onCreate(draft, pickClubs ? clubIds : clubId ? [clubId] : []); setOpen(false); setDuplicating(false); setDraft(emptyDraft(today)) }}>{pickClubs && clubIds.length > 1 ? `${clubIds.length}クラブに作る` : '作る'}</button>
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>やめる</button>
          </div>
        </section>
      )}

      <section className="adm-section" aria-labelledby="msn-now">
        <h2 id="msn-now">配信中・これから</h2>
        {g.current.length === 0 ? <p className="muted">配信中のミッションはありません。</p> : g.current.map((m) => <MissionBlock key={m.id} m={m} busy={busy} onCancel={onCancel} onDuplicate={duplicate} canCancel />)}
      </section>

      {g.past.length > 0 && (
        <section className="adm-section" aria-labelledby="msn-past">
          <h2 id="msn-past">これまでのミッション</h2>
          {g.past.map((m) => <MissionBlock key={m.id} m={m} busy={busy} onCancel={onCancel} onDuplicate={duplicate} canCancel={false} />)}
        </section>
      )}
      <p className="muted">今日：{dateLabel(today)}</p>
    </>
  )
}

export default function MissionAdmin({ club, clubs = [] }: { club: Club; clubs?: Club[] }) {
  const [missions, setMissions] = useState<AdminMission[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const today = jstDate(Date.now())

  const reload = useCallback(async () => setMissions(await loadAdminMissions(club.id)), [club.id])
  useEffect(() => {
    setMissions(null)
    reload().catch((e) => { console.error(e); setError('読み込めませんでした。') })
  }, [reload])

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true); setError(null); setNotice(null)
    try { await action(); await reload(); setNotice(done) } catch (e) { console.error(e); setError(missionAdminError(e)) } finally { setBusy(false) }
  }

  if (!missions) return error ? <p className="error" role="alert">{error}</p> : <p className="lead">読み込み中です…</p>
  return (
    <MissionAdminView
      clubName={club.name} clubId={club.id} clubs={clubs} missions={missions} today={today} busy={busy} error={error} notice={notice}
      onCreate={(d, clubIds) => {
        const c = checkDraft(d, today, missions)
        if (!c.value) return
        const value = c.value
        const targets = clubIds.length > 0 ? clubIds : [club.id]
        void (async () => {
          setBusy(true); setError(null); setNotice(null)
          // 1クラブずつ作る（期間が重なるクラブがあっても、ほかのクラブは作る）
          const results: BulkResult[] = []
          for (const id of targets) {
            const name = clubs.find((x) => x.id === id)?.name ?? club.name
            try { await createClubMission(id, value); results.push({ clubName: name, error: null }) } catch (e) { console.error(e); results.push({ clubName: name, error: missionAdminError(e) }) }
          }
          const r = bulkResultText(results)
          try { await reload() } catch (e) { console.error(e) }
          if (r.allFailed) setError(r.text); else setNotice(r.text)
          setBusy(false)
        })()
      }}
      onCancel={(id) => void run(() => cancelClubMission(id), 'ミッションを取り消しました。')}
    />
  )
}
