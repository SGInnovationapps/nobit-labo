// 画面09の「対応アラート」一覧の表示ロジック（画面にも通信にも依存しない）
import type { AlertKind } from './alertsModel.ts'
import { defOf } from './alertsModel.ts'

export type AlertStatus = 'open' | 'contacted' | 'resolved'

export type AlertItem = {
  id: string
  studentId: string
  displayName: string | null
  grade: number | null
  kind: AlertKind
  detail: Record<string, unknown>
  occurredOn: string
  status: AlertStatus
  contactedAt: string | null
  resolvedAt: string | null
  resumedAfterContact: boolean | null
  /** 送る文面のひな型（設定画面の内容） */
  template: string | null
  /** 連絡後7日間の完了タスク数 */
  completedAfterContact: number | null
  /** 生徒の LINE の表示名（取れているときだけ） */
  lineName?: string | null
}

/** 終了前日用の既定文面 [仮] */
export const CLUB_MISSION_END_TEXT = 'クラブミッション、あと少しで終わるよ！'

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

/** 何が起きたか（運営が読む一文） */
export function reasonText(kind: AlertKind, detail: Record<string, unknown>): string {
  switch (kind) {
    case 'not_started': return `今日は配信タスク${num(detail.assigned)}件が未着手です`
    case 'gap': return `記録が${num(detail.missing_days)}日空いています（休息日は数えません）`
    case 'streak_broken': return `${num(detail.streak_days)}日続いた連続記録が途切れました`
    case 'task_overdue': return `期限を過ぎた未完了の配信タスクが${num(detail.overdue)}件あります`
    case 'streak_milestone': return `連続記録が${num(detail.days)}日に達しました`
    case 'badge_earned': return `バッジ「${typeof detail.item === 'string' ? detail.item : ''}」を獲得しました`
    case 'club_mission': {
      const t = typeof detail.title === 'string' ? detail.title : ''
      return detail.phase === 'end' ? `クラブミッション「${t}」は明日が最終日です（個人目標に未達）` : `クラブミッション「${t}」が始まりました`
    }
  }
}

/** 公式LINE に貼る文面。節目のひな型の「7日」は、実際の日数に置き換える */
export function copyText(kind: AlertKind, template: string | null, detail: Record<string, unknown>): string {
  const base = (template ?? defOf(kind).defaultTemplate).trim()
  if (kind === 'club_mission' && detail.phase === 'end' && base === defOf(kind).defaultTemplate.trim()) return CLUB_MISSION_END_TEXT
  if (kind === 'streak_milestone' && num(detail.days) > 0) return base.replace(/7日/g, `${num(detail.days)}日`)
  return base
}

export type AlertGroups = { open: AlertItem[]; contacted: AlertItem[]; resolved: AlertItem[] }

/** 対応待ち（古い順）、連絡済み（連絡の新しい順）、最近解消した（新しい順）に分ける */
export function groupAlerts(items: ReadonlyArray<AlertItem>): AlertGroups {
  const byDateAsc = (a: AlertItem, b: AlertItem) => a.occurredOn.localeCompare(b.occurredOn) || (a.displayName ?? '').localeCompare(b.displayName ?? '', 'ja')
  return {
    open: items.filter((i) => i.status === 'open').sort(byDateAsc),
    contacted: items.filter((i) => i.status === 'contacted').sort((a, b) => (b.contactedAt ?? '').localeCompare(a.contactedAt ?? '')),
    resolved: items.filter((i) => i.status === 'resolved').sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')),
  }
}

/** 連絡後の結果を一文で。連絡していないものは null */
export function outcomeText(i: AlertItem): string | null {
  if (i.status === 'resolved') {
    if (i.resumedAfterContact) return `連絡のあと、学習を再開しました（連絡後の完了 ${i.completedAfterContact ?? 0} 件）`
    return null
  }
  if (i.status === 'contacted') return `連絡後の完了タスク ${i.completedAfterContact ?? 0} 件`
  return null
}

export function alertErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  if (text.includes('clipboard')) return '文面をコピーできませんでした。表示している文面を選んで、コピーしてください。連絡済みにはしていません。'
  if (text.includes('not_open')) return 'このアラートは、すでに対応済みです。一覧を更新しました。'
  if (text.includes('forbidden')) return 'アラートを扱えるのは運営だけです。'
  return '処理できませんでした。通信を確認して、もう一度お試しください。'
}

export type KindSummary = {
  kind: AlertKind
  /** 連絡した件数 */
  contacted: number
  /** 連絡のあとに学習を再開して解消した件数 */
  resumed: number
  /** 連絡後7日間に、タスクを1件以上完了した件数 */
  completedAny: number
  /** 連絡後7日間の完了タスクの合計 */
  completedTotal: number
}

/** 連絡の履歴を、アラートの種類ごとにまとめる。連絡していないものは数えない。表の順に並べる */
export function summarizeHistory(items: ReadonlyArray<AlertItem>, order: ReadonlyArray<AlertKind>): KindSummary[] {
  const map = new Map<AlertKind, KindSummary>()
  for (const i of items) {
    if (!i.contactedAt) continue
    const s = map.get(i.kind) ?? { kind: i.kind, contacted: 0, resumed: 0, completedAny: 0, completedTotal: 0 }
    s.contacted += 1
    if (i.resumedAfterContact) s.resumed += 1
    const c = i.completedAfterContact ?? 0
    if (c > 0) s.completedAny += 1
    s.completedTotal += c
    map.set(i.kind, s)
  }
  return order.flatMap((k) => (map.has(k) ? [map.get(k) as KindSummary] : []))
}

/** 連絡後7日が経っていないものは、結果がまだ増える */
export function isSettled(contactedAt: string, now: number): boolean {
  return now - new Date(contactedAt).getTime() >= 7 * 86_400_000
}

/** 履歴1件の結果の文 */
export function historyOutcome(i: AlertItem): string {
  const c = i.completedAfterContact ?? 0
  const head = i.resumedAfterContact ? '学習を再開' : i.status === 'resolved' ? '解消' : '再開待ち'
  return `${head}・連絡後の完了 ${c} 件`
}

export type LastRun = { ranAt: string; ok: boolean } | null

/** 自動生成が動いているかを一文で。3時間以上空く、または失敗したときは注意として返す */
export function lastRunNote(last: LastRun, nowMs: number): { text: string; warn: boolean } {
  if (!last) return { text: '自動生成の記録がありません。この画面を開いたときに生成します。', warn: true }
  const t = new Date(last.ranAt).getTime()
  const hhmm = new Date(t + 9 * 3600_000).toISOString().slice(11, 16)
  if (!last.ok) return { text: `自動生成が失敗しました（最後の実行 ${hhmm}）。この画面を開いたときは生成します。`, warn: true }
  if (nowMs - t > 3 * 3600_000) return { text: `自動生成が止まっているようです（最後の実行 ${hhmm}）。この画面を開いたときは生成します。`, warn: true }
  return { text: `自動生成：1時間おき（最後の実行 ${hhmm}）`, warn: false }
}


// ---- v1.7 ③：生徒ごとの1行 ----

/** お祝い系。アプリ内でも伝えるので、管理画面では「余裕があれば」に分ける */
export const CELEBRATION_KINDS: ReadonlyArray<AlertKind> = ['streak_milestone', 'badge_earned', 'club_mission']
export const isCelebration = (k: AlertKind): boolean => CELEBRATION_KINDS.includes(k)

/** 文面に使うアラートの優先順（先にあるほど優先）［仮］ */
const PRIORITY: ReadonlyArray<AlertKind> = ['streak_broken', 'gap', 'task_overdue', 'not_started', 'club_mission', 'badge_earned', 'streak_milestone']

/** 手で送る件数の目安（1日）。超える日が続くなら push への切り替えを判断する［仮］ */
export const DAILY_GUIDELINE = 20

/** 連絡済みの取り消しができる時間（DB と同じ30分） */
export const UNDO_MINUTES = 30

export type StudentAlertRow = {
  studentId: string
  displayName: string | null
  lineName: string | null
  grade: number | null
  items: AlertItem[]
  /** 公式LINE に貼る文面（優先度の最も高いアラートのもの） */
  text: string
  /** まとめて操作するアラートの id */
  ids: string[]
  /** 古い順に並べる基準日 */
  since: string
  /** 連絡済みのとき、いちばん新しい連絡の時刻 */
  contactedAt: string | null
}

/** 同じ状態のアラートを、生徒ごと1行にまとめる。古い順（連絡済みは連絡の新しい順）に並べる */
export function rowsByStudent(items: ReadonlyArray<AlertItem>): StudentAlertRow[] {
  const map = new Map<string, AlertItem[]>()
  for (const i of items) map.set(i.studentId, [...(map.get(i.studentId) ?? []), i])
  const rows = [...map.values()].map((list): StudentAlertRow => {
    const sorted = [...list].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
    const top = sorted[0]
    return {
      studentId: top.studentId,
      displayName: top.displayName,
      lineName: top.lineName ?? null,
      grade: top.grade,
      items: sorted,
      text: copyText(top.kind, top.template, top.detail),
      ids: sorted.map((x) => x.id),
      since: sorted.reduce((m, x) => (x.occurredOn < m ? x.occurredOn : m), sorted[0].occurredOn),
      contactedAt: sorted.reduce<string | null>((m, x) => (x.contactedAt && (!m || x.contactedAt > m) ? x.contactedAt : m), null),
    }
  })
  return rows.sort((a, b) => a.since.localeCompare(b.since) || (a.displayName ?? '').localeCompare(b.displayName ?? '', 'ja'))
}

export type AlertSections = {
  /** 対応待ち（お祝い系を除く） */
  open: StudentAlertRow[]
  /** 余裕があれば（お祝い系の対応待ち） */
  extra: StudentAlertRow[]
  contacted: StudentAlertRow[]
  resolved: StudentAlertRow[]
}

export function sectionsOf(items: ReadonlyArray<AlertItem>): AlertSections {
  const open = items.filter((i) => i.status === 'open')
  return {
    open: rowsByStudent(open.filter((i) => !isCelebration(i.kind))),
    extra: rowsByStudent(open.filter((i) => isCelebration(i.kind))),
    contacted: rowsByStudent(items.filter((i) => i.status === 'contacted')).sort((a, b) => (b.contactedAt ?? '').localeCompare(a.contactedAt ?? '')),
    resolved: rowsByStudent(items.filter((i) => i.status === 'resolved')),
  }
}

/** 押し間違いの取り消しができるか */
export function canUndo(contactedAt: string | null, nowMs: number): boolean {
  return contactedAt !== null && nowMs - new Date(contactedAt).getTime() < UNDO_MINUTES * 60_000
}

/** 今日（JST）連絡した人数 */
export function contactedToday(items: ReadonlyArray<AlertItem>, today: string): number {
  const ids = new Set<string>()
  for (const i of items) {
    if (i.contactedAt && new Date(new Date(i.contactedAt).getTime() + 9 * 3600_000).toISOString().slice(0, 10) === today) ids.add(i.studentId)
  }
  return ids.size
}

export function guidelineNote(n: number): { text: string; warn: boolean } {
  if (n >= DAILY_GUIDELINE) {
    return { text: `今日の連絡 ${n}人（手で送る目安は1日${DAILY_GUIDELINE}人）。この日が続くようなら、自動送信（push）への切り替えを考えるときです。`, warn: true }
  }
  return { text: `今日の連絡 ${n}人（手で送る目安は1日${DAILY_GUIDELINE}人）`, warn: false }
}
