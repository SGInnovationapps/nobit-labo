import { useCallback, useEffect, useState } from 'react'
import { gradeLabel } from '../lib/steps'
import { approvalBlockers, formatJst } from './applicants'
import type { Applicant } from './applicants'
import { loadApplicants, reviewErrorMessage, reviewMembership } from './adminApi'

type ViewProps = {
  applicants: Applicant[]
  latestVersion: number | null
  /** 処理中の申し込み */
  busyId: string | null
  error: string | null
  onApprove: (a: Applicant) => void
  onReject: (a: Applicant) => void
}

export function ApprovalsView({ applicants, latestVersion, busyId, error, onApprove, onReject }: ViewProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const pending = applicants.filter((a) => a.status === 'pending')
  const approved = applicants.filter((a) => a.status === 'approved')

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="adm-section" aria-labelledby="adm-pending">
        <h2 id="adm-pending">
          承認待ち <span className="num adm-count">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="muted">承認待ちの申し込みはありません。</p>
        ) : (
          <ul className="adm-list">
            {pending.map((a) => {
              const blockers = approvalBlockers(a, latestVersion)
              const busy = busyId === a.membershipId
              const confirming = confirmingId === a.membershipId
              return (
                <li className="adm-row" key={a.membershipId}>
                  <div className="adm-row-main">
                    <p className="adm-name">{a.displayName ?? '（表示名が未入力）'}</p>
                    <dl className="adm-meta">
                      <div>
                        <dt>学年</dt>
                        <dd>{a.grade !== null ? gradeLabel(a.grade) : '未入力'}</dd>
                      </div>
                      <div>
                        <dt>保護者の同意</dt>
                        <dd>{latestVersion !== null && a.consentedVersions.includes(latestVersion) ? '同意済み' : 'まだ'}</dd>
                      </div>
                      <div>
                        <dt>申し込み</dt>
                        <dd className="num">{formatJst(a.createdAt)}</dd>
                      </div>
                    </dl>
                    {blockers.length > 0 && <p className="adm-blocker">承認できません：{blockers.join('、')}</p>}
                  </div>
                  <div className="adm-row-actions">
                    {confirming ? (
                      <>
                        <p className="adm-confirm">この申し込みを却下しますか？</p>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => {
                            setConfirmingId(null)
                            onReject(a)
                          }}
                        >
                          却下する
                        </button>
                        <button type="button" className="btn btn-quiet" onClick={() => setConfirmingId(null)}>
                          やめる
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || blockers.length > 0}
                          onClick={() => onApprove(a)}
                        >
                          {busy ? '処理中…' : '承認する'}
                        </button>
                        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setConfirmingId(a.membershipId)}>
                          却下
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="adm-section" aria-labelledby="adm-approved">
        <h2 id="adm-approved">
          承認済み <span className="num adm-count">{approved.length}</span>
        </h2>
        {approved.length === 0 ? (
          <p className="muted">承認済みの生徒はまだいません。</p>
        ) : (
          <ul className="adm-list adm-list-compact">
            {approved.map((a) => (
              <li className="adm-row adm-row-compact" key={a.membershipId}>
                <p className="adm-name">{a.displayName ?? '（表示名が未入力）'}</p>
                <p className="adm-sub">{a.grade !== null ? gradeLabel(a.grade) : ''}</p>
                <p className="adm-sub num">{a.reviewedAt ? `承認 ${formatJst(a.reviewedAt)}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export default function ApprovalsPage({ clubId }: { clubId: string }) {
  const [data, setData] = useState<{ applicants: Applicant[]; latestVersion: number | null } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await loadApplicants(clubId))
      setLoadError(null)
    } catch (e) {
      console.error(e)
      setLoadError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [clubId])

  useEffect(() => {
    setData(null)
    setActionError(null)
    void load()
    // 別の画面から戻ったときに読み直す
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function review(a: Applicant, approve: boolean) {
    setBusyId(a.membershipId)
    setActionError(null)
    try {
      await reviewMembership(a.membershipId, approve)
    } catch (e) {
      console.error(e)
      setActionError(reviewErrorMessage(e))
    } finally {
      setBusyId(null)
      await load()
    }
  }

  if (loadError) {
    return (
      <>
        <p className="error" role="alert">
          {loadError}
        </p>
        <button type="button" className="btn btn-secondary adm-inline" onClick={() => void load()}>
          もう一度読み込む
        </button>
      </>
    )
  }
  if (!data) return <p className="muted" role="status">読み込み中…</p>

  return (
    <ApprovalsView
      applicants={data.applicants}
      latestVersion={data.latestVersion}
      busyId={busyId}
      error={actionError}
      onApprove={(a) => void review(a, true)}
      onReject={(a) => void review(a, false)}
    />
  )
}
