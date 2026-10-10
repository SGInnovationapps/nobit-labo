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
}

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
    case 'club_mission': return '新しいクラブミッションがあります'
  }
}

/** 公式LINE に貼る文面。節目のひな型の「7日」は、実際の日数に置き換える */
export function copyText(kind: AlertKind, template: string | null, detail: Record<string, unknown>): string {
  const base = (template ?? defOf(kind).defaultTemplate).trim()
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
  if (text.includes('not_open')) return 'このアラートは、すでに対応済みです。一覧を更新しました。'
  if (text.includes('forbidden')) return 'アラートを扱えるのは運営だけです。'
  return '処理できませんでした。通信を確認して、もう一度お試しください。'
}
