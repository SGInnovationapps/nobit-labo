import { supabase } from '../lib/supabase'
import type { DrillMode, DrillSubject, DrillUnit } from './drillModel'
import type { NewBadge } from './homeModel'

/** 出題される1問。正解は入っていない（採点は Supabase の関数で行う） */
export type DrillQuestion = {
  id: string
  subject: string
  grade: number
  category: string
  body: string
  imageUrl: string | null
  /** 並べ替えられた4つの選択肢 */
  choices: string[]
}

export type DrillStart = {
  sessionId: string
  subject: string
  mode: DrillMode
  category: string | null
  total: number
  question: DrillQuestion | null
}

/** 解き終えたときに返る、学習の記録の結果（教科の記録か、タスクの完了か） */
export type DrillRecorded = {
  recorded: boolean
  via: 'tag' | 'task' | null
  coinsGranted: number
  currentDays: number
  completedToday: number
  firstOfDay: boolean
  milestone: boolean
  newBadges: NewBadge[]
  recordedAt: string | null
}

export type DrillVerdict = {
  correct: boolean
  /** 答え合わせのために、答えたあとだけ返る */
  answer: string
  explanation: string | null
  answered: number
  total: number
  correctCount: number
  finished: boolean
  result: DrillRecorded | null
}

export type DrillSummary = {
  sessionId: string
  subject: string
  mode: DrillMode
  category: string | null
  total: number
  answered: number
  correct: number
  finished: boolean
  missed: { question: string; answer: string; explanation: string | null }[]
}

type Row = Record<string, unknown>

function toQuestion(v: unknown): DrillQuestion | null {
  if (v === null || typeof v !== 'object') return null
  const d = v as Row
  const choices = Array.isArray(d.choices) ? d.choices.map((c) => String(c)) : []
  return {
    id: String(d.id),
    subject: String(d.subject),
    grade: Number(d.grade),
    category: String(d.category),
    body: String(d.body),
    imageUrl: (d.image_url as string | null) ?? null,
    choices,
  }
}

function toNewBadges(v: unknown): NewBadge[] {
  if (!Array.isArray(v)) return []
  return v.map((b) => {
    const d = b as Row
    return { code: String(d.code), name: String(d.name), rarity: d.rarity as NewBadge['rarity'] }
  })
}

function toRecorded(v: unknown): DrillRecorded | null {
  if (v === null || typeof v !== 'object') return null
  const d = v as Row
  const via = d.via === 'task' ? 'task' : d.via === 'tag' ? 'tag' : null
  return {
    recorded: d.recorded === true,
    via,
    coinsGranted: (d.coins_granted as number | undefined) ?? 0,
    currentDays: (d.current_days as number | undefined) ?? 0,
    completedToday: (d.completed_today as number | undefined) ?? 0,
    firstOfDay: (d.first_of_day as boolean | undefined) ?? false,
    milestone: (d.milestone as boolean | undefined) ?? false,
    newBadges: toNewBadges(d.new_badges),
    recordedAt: (d.recorded_at as string | undefined) ?? (d.completed_at as string | undefined) ?? null,
  }
}

/** 単元ごとの正解率（入口の画面） */
export async function loadDrillUnits(subject: DrillSubject, gradeMax: number): Promise<DrillUnit[]> {
  const { data, error } = await supabase.rpc('my_drill_units', { p_subject: subject, p_grade_max: gradeMax })
  if (error) throw error
  const rows = (data as Row[] | null) ?? []
  return rows.map((r) => ({
    category: String(r.category),
    questions: Number(r.questions),
    tried: Number(r.tried),
    correct: Number(r.correct),
    percent: Number(r.percent),
  }))
}

/** 「まちがえた問題」の件数 */
export async function loadDrillWrongCount(subject: DrillSubject, gradeMax: number): Promise<number> {
  const { data, error } = await supabase.rpc('my_drill_wrong_count', { p_subject: subject, p_grade_max: gradeMax })
  if (error) throw error
  return Number(data ?? 0)
}

export async function startDrill(args: {
  subject: DrillSubject
  mode: DrillMode
  category?: string | null
  gradeMax?: number | null
  total?: number
  userTaskId?: string | null
}): Promise<DrillStart> {
  const { data, error } = await supabase.rpc('start_drill', {
    p_subject: args.subject,
    p_mode: args.mode,
    p_category: args.category ?? null,
    p_grade_max: args.gradeMax ?? null,
    p_total: args.total ?? null,
    p_user_task_id: args.userTaskId ?? null,
  })
  if (error) throw error
  const d = data as Row
  return {
    sessionId: String(d.session_id),
    subject: String(d.subject),
    mode: d.mode as DrillMode,
    category: (d.category as string | null) ?? null,
    total: Number(d.total),
    question: toQuestion(d.question),
  }
}

/** 次の1問。解き終えていれば null */
export async function drillNext(sessionId: string): Promise<DrillQuestion | null> {
  const { data, error } = await supabase.rpc('drill_next', { p_session_id: sessionId })
  if (error) throw error
  return toQuestion((data as Row).question)
}

export async function answerDrill(sessionId: string, questionId: string, choice: string): Promise<DrillVerdict> {
  const { data, error } = await supabase.rpc('answer_drill', {
    p_session_id: sessionId,
    p_question_id: questionId,
    p_choice: choice,
  })
  if (error) throw error
  const d = data as Row
  return {
    correct: d.correct === true,
    answer: String(d.answer),
    explanation: (d.explanation as string | null) ?? null,
    answered: Number(d.answered),
    total: Number(d.total),
    correctCount: Number(d.correct_count),
    finished: d.finished === true,
    result: toRecorded(d.result),
  }
}

/** 途中でやめる（解いた分は正解率に残るが、記録にはしない） */
export async function abandonDrill(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('abandon_drill', { p_session_id: sessionId })
  if (error) throw error
}

export async function loadDrillResult(sessionId: string): Promise<DrillSummary> {
  const { data, error } = await supabase.rpc('drill_result', { p_session_id: sessionId })
  if (error) throw error
  const d = data as Row
  const missed = Array.isArray(d.missed) ? d.missed : []
  return {
    sessionId: String(d.session_id),
    subject: String(d.subject),
    mode: d.mode as DrillMode,
    category: (d.category as string | null) ?? null,
    total: Number(d.total),
    answered: Number(d.answered),
    correct: Number(d.correct),
    finished: d.finished === true,
    missed: missed.map((m) => {
      const r = m as Row
      return { question: String(r.question), answer: String(r.answer), explanation: (r.explanation as string | null) ?? null }
    }),
  }
}
