import type { JSX } from 'react'
import { IconCalendar, IconFlag, IconGrid, IconHome } from './HomeIcons'

export const TABS = ['ホーム', 'ふりかえり', 'コレクション', 'ミッション'] as const
export type Tab = (typeof TABS)[number]

/** 使える画面。まだ無い画面は、文字を薄くして押せなくする */
const READY: ReadonlyArray<Tab> = ['ホーム', 'ふりかえり', 'コレクション', 'ミッション']

/** v1.7［仮］：タブは文字が主役。線のアイコンを文字の上に添える */
const ICON: Record<Tab, () => JSX.Element> = {
  ホーム: () => <IconHome />,
  ふりかえり: () => <IconCalendar />,
  コレクション: () => <IconGrid />,
  ミッション: () => <IconFlag />,
}

type Props = { current?: Tab; onSelect?: (tab: Tab) => void }

/** 下部タブ */
export function TabBar({ current = 'ホーム', onSelect }: Props) {
  return (
    <nav className="tabbar" aria-label="メニュー">
      {TABS.map((label) => {
        const Icon = ICON[label]
        const inner = <><Icon /><span className="tab-label">{label}</span></>
        return label === current ? (
          <span key={label} className="tab is-current" aria-current="page">{inner}</span>
        ) : READY.includes(label) && onSelect ? (
          <button key={label} type="button" className="tab" onClick={() => onSelect(label)}>{inner}</button>
        ) : (
          <span key={label} className="tab is-off" aria-disabled="true">{inner}</span>
        )
      })}
    </nav>
  )
}
