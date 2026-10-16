/** ドリル（ラボドリの統合）の、画面に出す文言と並び。通信をしない部分だけを置く */

export const DRILL_SUBJECTS = ['英語', '理科', '社会'] as const
export type DrillSubject = (typeof DRILL_SUBJECTS)[number]

/** おまかせ・単元・まちがえた問題 */
export type DrillMode = 'mixed' | 'unit' | 'wrong'

/** 1回で解く問題の数（仕様書 v1.8：10問） */
export const DRILL_TOTAL = 10

export type DrillUnit = {
  category: string
  /** その単元の問題数 */
  questions: number
  /** これまでに解いた問題の数 */
  tried: number
  /** そのうち、最後の回答が正解だった数 */
  correct: number
  /** 正解率（まだ解いていなければ 0） */
  percent: number
}

export function isDrillSubject(s: string): s is DrillSubject {
  return (DRILL_SUBJECTS as readonly string[]).includes(s)
}

/** 何を解いているかの一言。記録の内容にも同じ言い方で入る */
export function modeLabel(mode: DrillMode, category: string | null): string {
  if (mode === 'wrong') return 'まちがえた問題'
  if (mode === 'unit') return category ?? '単元'
  return 'おまかせ'
}

/** 学年の選び方（中1の生徒に中3の問題を出さないための既定を、画面でも変えられるようにする） */
export const GRADE_CHOICES = [
  { value: 1, label: '中1まで' },
  { value: 2, label: '中2まで' },
  { value: 3, label: 'すべて' },
] as const

/** 単元の一覧：解いたことのある単元を先に、正解率の低い順に出す（伸ばしどころが上にくる） */
export function sortUnits(units: ReadonlyArray<DrillUnit>): DrillUnit[] {
  return [...units].sort((a, b) => {
    if ((a.tried > 0) !== (b.tried > 0)) return a.tried > 0 ? -1 : 1
    if (a.tried > 0 && a.percent !== b.percent) return a.percent - b.percent
    return a.category.localeCompare(b.category, 'ja')
  })
}

/** 単元の行の右に出す、文字での状態（色だけで示さない） */
export function unitState(u: DrillUnit): string {
  if (u.tried === 0) return 'まだ'
  if (u.percent >= 80) return 'よくできている'
  if (u.percent >= 50) return 'あと少し'
  return '伸ばしどころ'
}

/** 棒の高さ4段階（記録の帯と同じ考え方。0 はまだ解いていない） */
export function unitLevel(u: DrillUnit): 0 | 1 | 2 | 3 | 4 {
  if (u.tried === 0) return 0
  if (u.percent >= 80) return 4
  if (u.percent >= 60) return 3
  if (u.percent >= 40) return 2
  return 1
}

/** 「3問目 / 10問」 */
export function progressLabel(answered: number, total: number): string {
  return `${Math.min(answered + 1, total)}問目 / ${total}問`
}

/** 結果の見出しの下の一言。できなかったことを責めない */
export function resultCheer(correct: number, total: number): string {
  if (total === 0) return '記録しました。'
  if (correct === total) return '全問正解。よく積み上げた。'
  if (correct * 2 >= total) return '解いた分だけ、確かに進んだ。'
  if (correct > 0) return 'まちがえた問題は、あとでもう一度出てくる。'
  return 'いま解いたことが、次につながる。'
}

/** 解き終えたあとに出す一文（記録になったか、ならなかったか） */
export function recordedNote(recorded: boolean, via: 'tag' | 'task' | null, subject: string, coins: number): string {
  if (!recorded) return '途中でやめたので、記録にはしていません。'
  const head = via === 'task' ? 'タスクを完了しました' : `${subject}を記録しました`
  return coins > 0 ? `${head}　コイン +${coins}` : head
}

/** 問題文の一部分。underline が true のところが下線部（ラボドリの <u> … </u>） */
export type MarkedPart = { text: string; underline: boolean }

/**
 * 問題文に入っている下線の印を、画面で引ける形に分ける。
 * 読めるのは <u> … </u> だけで、ほかのタグらしい文字はそのまま文字として出す
 * （問題文を HTML として解釈しないので、タグが混ざっても画面は壊れない）。
 */
export function markedParts(body: string): MarkedPart[] {
  const parts: MarkedPart[] = []
  const re = /<u>([\s\S]*?)<\/u>/gi
  let at = 0
  let m: RegExpExecArray | null
  const plain = (text: string) => {
    // 閉じ忘れなどで残った <u> や </u> は、文字として出さずに取り除く
    const t = text.replace(/<\/?u>/gi, '')
    if (t !== '') parts.push({ text: t, underline: false })
  }
  while ((m = re.exec(body)) !== null) {
    plain(body.slice(at, m.index))
    if (m[1] !== '') parts.push({ text: m[1], underline: true })
    at = m.index + m[0].length
  }
  plain(body.slice(at))
  return parts
}

/** 学年から、出題の範囲の初期値（中1 は中1 まで、中3 以上はすべて） */
export function initialGradeMax(grade: number | null | undefined): number {
  if (grade == null) return 3
  return Math.max(1, Math.min(3, grade - 6))
}

/** DB から返る値の言い換え。知らないものは、通信の失敗として扱う */
export function drillErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (m.includes('no_questions')) return 'この条件に出せる問題がありません。ほかの単元を選んでください。'
  if (m.includes('category_required')) return '単元を選んでください。'
  if (m.includes('invalid_subject')) return 'この教科のドリルはまだありません。'
  if (m.includes('not_approved_student')) return 'クラブへの登録が済んでいないため、始められません。'
  if (m.includes('already_answered')) return 'この問題はもう答えています。'
  if (m.includes('session_finished')) return 'このドリルは終わっています。'
  if (m.includes('session_not_found')) return 'ドリルが見つかりませんでした。もう一度始めてください。'
  if (m.includes('forbidden')) return 'この操作はできません。'
  return '通信できませんでした。少し待って、もう一度お試しください。'
}
