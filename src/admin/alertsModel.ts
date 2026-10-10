// 画面13：アラートの設定の表示ロジック（画面にも通信にも依存しない）

export type AlertKind =
  | 'not_started' | 'gap' | 'streak_broken' | 'task_overdue' | 'streak_milestone' | 'badge_earned' | 'club_mission'

export type SendMethod = 'manual' | 'auto'

export type AlertRule = {
  kind: AlertKind
  enabled: boolean
  thresholdDays: number | null
  sendMethod: SendMethod
  template: string
}

export const TEMPLATE_MAX = 200
export const THRESHOLD_MIN = 1
export const THRESHOLD_MAX = 30

type Def = { kind: AlertKind; label: string; condition: string; defaultTemplate: string; provisional: boolean }

/** 仕様書 6章の表の順。provisional は［仮］の条件 */
export const ALERT_DEFS: ReadonlyArray<Def> = [
  { kind: 'not_started', label: '未着手', condition: 'その日のタスクがまだ1件も完了していない', defaultTemplate: '今日のクエスト、あと1つだよ！', provisional: false },
  { kind: 'gap', label: '記録が空いた', condition: '記録のない日が続いた（休息日は数えない）', defaultTemplate: '今日も、ひとつ育てよう。短いタスクからで大丈夫。', provisional: false },
  { kind: 'streak_broken', label: '連続記録が途切れた', condition: '連続記録が途切れた（休息日を除く）', defaultTemplate: '今日から、また始めよう。短いタスクからで大丈夫。', provisional: true },
  { kind: 'task_overdue', label: '配信タスクが未完了', condition: '配信タスクの期限を過ぎても未完了', defaultTemplate: '期限が過ぎたタスクがあるよ。まずは1つから。', provisional: true },
  { kind: 'streak_milestone', label: '連続記録の節目', condition: '7・30・100日目に達した', defaultTemplate: '7日連続記録達成！おめでとう！', provisional: false },
  { kind: 'badge_earned', label: 'バッジ獲得', condition: '新しいバッジを獲得した', defaultTemplate: '新しいバッジをゲットしたよ！', provisional: false },
  { kind: 'club_mission', label: 'クラブミッション', condition: '開始日と終了前日', defaultTemplate: '新しいクラブミッションが始まったよ！', provisional: false },
]

export const defOf = (k: AlertKind): Def => ALERT_DEFS.find((d) => d.kind === k) as Def

/** 表の順に並べ直す（DB の並びに依存しない） */
export function sortRules(rules: ReadonlyArray<AlertRule>): AlertRule[] {
  const order = new Map(ALERT_DEFS.map((d, i) => [d.kind, i]))
  return [...rules].sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99))
}

/** 入力の問題。なければ null */
export function ruleProblem(r: Pick<AlertRule, 'kind' | 'thresholdDays' | 'template'>): string | null {
  if (r.kind === 'gap') {
    const d = r.thresholdDays
    if (d === null || !Number.isInteger(d) || d < THRESHOLD_MIN || d > THRESHOLD_MAX) return `日数は${THRESHOLD_MIN}〜${THRESHOLD_MAX}の整数で入力してください`
  }
  const n = [...r.template.trim()].length
  if (n === 0) return '文面を入力してください'
  if (n > TEMPLATE_MAX) return `文面は${TEMPLATE_MAX}文字までです`
  return null
}

/** 保存済みの内容と違うか（保存ボタンの有効化に使う） */
export function isDirty(a: AlertRule, b: AlertRule): boolean {
  return a.enabled !== b.enabled || a.thresholdDays !== b.thresholdDays || a.template.trim() !== b.template.trim() || a.sendMethod !== b.sendMethod
}

export function conditionText(r: Pick<AlertRule, 'kind' | 'thresholdDays'>): string {
  if (r.kind === 'gap') return `記録のない日が${r.thresholdDays ?? '—'}日続いた（休息日は数えない）`
  return defOf(r.kind).condition
}

export function saveErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  const table: Record<string, string> = {
    forbidden: '設定を変えられるのは運営だけです。',
    invalid_threshold: `日数は${THRESHOLD_MIN}〜${THRESHOLD_MAX}の整数で入力してください。`,
    invalid_template: `文面は1〜${TEMPLATE_MAX}文字で入力してください。`,
    auto_not_available: '自動送信は、まだ使えません。',
  }
  for (const [k, v] of Object.entries(table)) if (text.includes(k)) return v
  return '保存できませんでした。通信を確認して、もう一度お試しください。'
}
