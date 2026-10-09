const TABS = ['ホーム', 'ふりかえり', 'コレクション', 'ミッション'] as const

/** 下部タブ。文字だけ。まだ使えない画面は、文字を薄くして押せなくする */
export function TabBar() {
  return (
    <nav className="tabbar" aria-label="メニュー">
      {TABS.map((label, i) =>
        i === 0 ? (
          <span key={label} className="tab is-current" aria-current="page">{label}</span>
        ) : (
          <span key={label} className="tab is-off" aria-disabled="true">{label}</span>
        ),
      )}
    </nav>
  )
}
