import { useCallback, useEffect, useRef, useState } from 'react'
import { forgetInvite, readInvite, rememberInvite } from './lib/invite'
import { signInWithLine } from './lib/lineLogin'
import { InviteError, joinClub, loadSnapshot, recordConsent, saveProfile } from './lib/onboardingApi'
import { deriveStep, gradeLabel, progressOf } from './lib/steps'
import type { Snapshot } from './lib/steps'
import { ConsentStep } from './screens/ConsentStep'
import { Notice } from './screens/Notice'
import { ProfileStep } from './screens/ProfileStep'
import { Home } from './home/Home'
import { Collection } from './home/Collection'
import { Reflect } from './home/Reflect'
import type { Tab } from './home/TabBar'
import { Shell } from './screens/Shell'

type Phase =
  | { kind: 'loading' }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: Snapshot; inviteInvalid: boolean }

const SAVE_ERROR = '保存できませんでした。通信を確認して、もう一度お試しください。'

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('ホーム')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void boot()

    async function boot() {
      try {
        // ログインのやり直し（リダイレクト）で URL が変わる前に、招待コードを控える
        const invite = readInvite()
        if (invite) rememberInvite(invite)

        if ((await signInWithLine()) === 'redirecting') {
          setPhase({ kind: 'redirecting' })
          return
        }

        let snapshot = await loadSnapshot()
        let inviteInvalid = false
        const code = invite ?? readInvite()
        const needsJoin = !snapshot.membership || snapshot.membership.status === 'left'
        if (snapshot.role === 'student' && needsJoin && code) {
          try {
            await joinClub(code)
            snapshot = await loadSnapshot()
            forgetInvite()
          } catch (e) {
            if (!(e instanceof InviteError)) throw e
            forgetInvite()
            inviteInvalid = true
          }
        }
        setPhase({ kind: 'ready', snapshot, inviteInvalid })
      } catch (e) {
        console.error(e)
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    const snapshot = await loadSnapshot()
    setPhase((p) => (p.kind === 'ready' ? { ...p, snapshot } : p))
  }, [])

  // 承認待ちのまま別の画面から戻ったとき、状態を読み直す
  useEffect(() => {
    if (phase.kind !== 'ready') return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [phase.kind, refresh])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      await refresh()
    } catch (e) {
      console.error(e)
      setActionError(SAVE_ERROR)
    } finally {
      setBusy(false)
    }
  }

  if (phase.kind === 'loading' || phase.kind === 'redirecting') {
    return (
      <Shell progress={null}>
        <p className="muted" role="status">
          {phase.kind === 'loading' ? '読み込み中…' : 'LINE のログインへ移動しています…'}
        </p>
      </Shell>
    )
  }

  if (phase.kind === 'error') {
    return (
      <Shell progress={null}>
        <Notice title="うまく開けませんでした" action={{ label: 'もう一度開く', onClick: () => location.reload() }}>
          <p>通信を確認して、もう一度お試しください。続くときは、クラブの管理者に知らせてください。</p>
          <p className="muted">{phase.message}</p>
        </Notice>
      </Shell>
    )
  }

  const { snapshot, inviteInvalid } = phase
  const step = deriveStep(snapshot)
  const clubName = snapshot.membership?.clubName ?? null

  if (step.name === 'approved' && snapshot.membership) {
    return (
      <div className="shell">
        {tab === 'コレクション' ? (
          <Collection displayName={snapshot.displayName} grade={snapshot.grade} onTab={setTab} />
        ) : tab === 'ふりかえり' ? (
          <Reflect onTab={setTab} />
        ) : (
          <Home clubId={snapshot.membership.clubId} clubName={clubName} displayName={snapshot.displayName} onTab={setTab} />
        )}
      </div>
    )
  }

  return (
    <Shell progress={progressOf(step)}>
      {step.name === 'not_student' && (
        <Notice title="この画面は生徒用です">
          <p>クラブの管理者と運営の方は、管理画面からログインしてください。</p>
        </Notice>
      )}

      {step.name === 'need_invite' && (
        <Notice title={inviteInvalid ? '招待リンクが正しくありません' : '招待リンクから開いてください'}>
          <p className="copy-main">きょうのキミが、明日のキミを育てる。</p>
          <p>
            NOBIT! は、クラブから届いた招待のQRコードまたはリンクから始めます。
            {inviteInvalid ? 'このリンクは使えませんでした。' : ''}
            クラブの管理者に、もう一度確認してください。
          </p>
        </Notice>
      )}

      {step.name === 'rejected' && (
        <Notice title="申し込みは承認されませんでした">
          <p>くわしくは、クラブの管理者に確認してください。</p>
        </Notice>
      )}

      {step.name === 'consent' && snapshot.latestScope && snapshot.membership && (
        <ConsentStep
          clubName={clubName}
          scope={snapshot.latestScope}
          reconsent={step.reconsent}
          busy={busy}
          error={actionError}
          onSubmit={() =>
            void run(() =>
              recordConsent(snapshot.userId, snapshot.membership!.clubId, snapshot.latestScope!.version),
            )
          }
        />
      )}

      {step.name === 'profile' && (
        <ProfileStep
          initialName={snapshot.displayName}
          initialGrade={snapshot.grade}
          busy={busy}
          error={actionError}
          onSubmit={(name, grade) => void run(() => saveProfile(snapshot.userId, name, grade))}
        />
      )}

      {step.name === 'waiting' && (
        <Notice
          status="承認待ち"
          title="クラブ管理者の確認を待っています"
          action={{
            label: '状態を更新する',
            busy,
            onClick: () => void run(async () => undefined),
          }}
        >
          <p>{clubName ?? 'クラブ'}の管理者が確認すると、NOBIT!を使えるようになります。</p>
          <dl className="facts" style={{ marginTop: 20 }}>
            <dt>表示名</dt>
            <dd>{snapshot.displayName}</dd>
            <dt>学年</dt>
            <dd>{gradeLabel(snapshot.grade)}</dd>
          </dl>
        </Notice>
      )}

    </Shell>
  )
}
