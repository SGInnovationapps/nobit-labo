type Props = {
  busy: boolean
  /** 「追加したので次へ」を押したのに、まだ友だちになっていなかった */
  notYet: boolean
  onAdd: () => void
  onNext: () => void
}

/**
 * 導入：NOBIT! 公式LINE の友だち追加。登録のときだけ求める。
 * 2回目からは公式LINE のトークのメニューから開くため。連絡を受け取るかは、あとから選べる
 */
export function FriendStep({ busy, notYet, onAdd, onNext }: Props) {
  return (
    <>
      <h1>NOBIT! 公式LINE を友だち追加してください</h1>
      <p className="lead">
        2回目からは、公式LINE のトークのメニューから NOBIT! を開きます。そのために、友だち追加が必要です。
      </p>
      <p className="muted">
        公式LINE からの連絡を受け取るかは、あとからコレクションの画面で選べます。受け取らない設定にしても、NOBIT! はそのまま使えます。
      </p>

      <button type="button" className="btn btn-primary" disabled={busy} onClick={onAdd}>
        友だち追加の画面を開く
      </button>

      {notYet && (
        <p className="error" role="alert">
          まだ友だち追加を確認できません。追加したあと、もう一度「追加したので次へ」を押してください。
        </p>
      )}
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={onNext}>
        {busy ? '確認中…' : '追加したので次へ'}
      </button>
    </>
  )
}
