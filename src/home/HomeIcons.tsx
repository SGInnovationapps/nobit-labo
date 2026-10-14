// ホーム（01）で使う線のアイコン。v1.7［仮］：ホームに限り、文字に添えて使う（飾りのためには使わない）
// 色は文字色（currentColor）を引き継ぐ。読み上げはボタンやタブの文字に任せる

import type { ReactNode } from 'react'

type P = { size?: number }

const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
)

/** 教科を記録する */
export const IconBook = ({ size = 26 }: P) => svg(size, <>
  <path d="M3 6.5c3-1.6 6-1.6 9 0V20c-3-1.6-6-1.6-9 0z" />
  <path d="M21 6.5c-3-1.6-6-1.6-9 0V20c3-1.6 6-1.6 9 0z" />
</>)

/** タスクを見る */
export const IconList = ({ size = 26 }: P) => svg(size, <>
  <rect x="5" y="3.5" width="14" height="17.5" rx="3" />
  <path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h3" />
</>)

/** 連続日数の印（芽） */
export const IconSprout = ({ size = 22 }: P) => svg(size, <>
  <path d="M12 21v-8" />
  <path d="M12 13c0-4-3-6.5-7-6.5 0 4 3 6.5 7 6.5z" />
  <path d="M12 11c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" />
</>)

/** トグル（開くと上向きに回す） */
export const IconChevron = ({ size = 18 }: P) => svg(size, <path d="M6 9l6 6 6-6" />)

/** 次へ（ガチャの行） */
export const IconNext = ({ size = 18 }: P) => svg(size, <path d="M9 6l6 6-6 6" />)

/** タイマー・15分集中 */
export const IconTimer = ({ size = 22 }: P) => svg(size, <>
  <circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 2" /><path d="M9.5 3h5" />
</>)

/** 次の目標：称号 */
export const IconStar = ({ size = 20 }: P) => svg(size, <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />)

/** 下部タブ */
export const IconHome = ({ size = 22 }: P) => svg(size, <path d="M4 11l8-7 8 7v9h-5.5v-5.5h-5V20H4z" />)
export const IconCalendar = ({ size = 22 }: P) => svg(size, <>
  <rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16" /><path d="M9 3v4" /><path d="M15 3v4" />
</>)
export const IconGrid = ({ size = 22 }: P) => svg(size, <>
  <rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" />
  <rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" />
</>)
export const IconFlag = ({ size = 22 }: P) => svg(size, <><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></>)
