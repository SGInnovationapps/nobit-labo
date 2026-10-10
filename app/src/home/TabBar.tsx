export const TABS = ['ホーム', 'ふりかえり', 'コレクション', 'ミッション'] as const
export type Tab = (typeof TABS)[number]

/** 使える画面。まだ無い画面は、文字を薄くして押せなくする */
const READY: ReadonlyArray<Tab> = ['ホーム', 'ふりかえり']

type Props = { current?: Tab; onSelect?: (tab: Tab) => void }

/** 下部タブ。文字だけ */
export function TabBar({ current = 'ホーム', onSelect }: Props) {
  return (
    <nav className="tabbar" aria-label="メニュー">
      {TABS.map((label) =>
        label === current ? (
          <span key={label} className="tab is-current" aria-current="page">{label}</span>
        ) : READY.includes(label) && onSelect ? (
          <button key={label} type="button" className="tab" onClick={() => onSelect(label)}>{label}</button>
        ) : (
          <span key={label} className="tab is-off" aria-disabled="true">{label}</span>
        ),
      )}
    </nav>
  )
}
