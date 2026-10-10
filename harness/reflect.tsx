import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { ReflectView } from '../src/home/Reflect'
import { periodOf } from '../src/home/reflectModel'
import type { ReflectData } from '../src/home/reflectApi'

const today = '2026-10-10'
const days = [1, 2, 3, 5, 6, 7, 8, 9]
const data: ReflectData = {
  today,
  streak: { current: 12, longest: 21 },
  activity: days.map((d, i) => ({ date: `2026-10-${String(d).padStart(2, '0')}`, count: (i % 3) + 1 })),
  tasks: [{ subject: '英語' }, { subject: '英語' }, { subject: '数学' }, { subject: '国語' }, { subject: '数学' }],
  records: [
    { subject: '数学', kind: 'timer', durationSeconds: 900 },
    { subject: '英語', kind: 'timer', durationSeconds: 2400 },
    { subject: '理科', kind: 'tag', durationSeconds: null },
  ],
}
const base = { error: null, onMode() {}, onShift() {}, onThis() {}, onTab() {} }
const screens: Record<string, JSX.Element> = {
  month: <ReflectView {...base} period={periodOf('month', today)} data={data} />,
  week: <ReflectView {...base} period={periodOf('week', today)} data={data} />,
  empty: <ReflectView {...base} period={periodOf('month', '2026-08-10')} data={{ ...data, activity: [], tasks: [], records: [] }} />,
  loading: <ReflectView {...base} period={periodOf('month', today)} data={null} />,
}
createRoot(document.getElementById('root')!).render(<div className="shell">{screens[location.hash.slice(1)]}</div>)
