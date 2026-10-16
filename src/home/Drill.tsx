import { useCallback, useEffect, useState } from 'react'
import { DrillEntry } from './DrillEntry'
import { DrillPlay } from './DrillPlay'
import { DrillResult } from './DrillResult'
import {
  abandonDrill, answerDrill, drillNext, loadDrillResult, loadDrillUnits, loadDrillWrongCount, startDrill,
} from './drillApi'
import type { DrillQuestion, DrillRecorded, DrillSummary, DrillVerdict } from './drillApi'
import { DRILL_TOTAL, drillErrorMessage, initialGradeMax, isDrillSubject } from './drillModel'
import type { DrillMode, DrillSubject, DrillUnit } from './drillModel'

type Props = {
  /** 生徒の学年（7 = 中1 … 12 = 高3）。出題の範囲の初期値に使う */
  grade?: number | null
  /** ドリルのタスクから始めたとき（解き終えるとそのタスクが完了する） */
  userTask?: { id: string; subject: string } | null
  /** 記録になったときに、ホームを読み直す */
  onRecorded: (r: DrillRecorded) => void
  onClose: () => void
}

type Phase =
  | { at: 'entry' }
  | { at: 'play'; sessionId: string; subject: string; mode: DrillMode; category: string | null
      total: number; answered: number; correctCount: number; question: DrillQuestion; verdict: DrillVerdict | null }
  | { at: 'result'; summary: DrillSummary; recorded: DrillRecorded | null; mode: DrillMode; category: string | null }

/** ドリル（画面A〜E）。1問ずつ出して採点し、解き終えたら結果を出す */
export function Drill({ grade, userTask, onRecorded, onClose }: Props) {
  const startSubject: DrillSubject = userTask && isDrillSubject(userTask.subject) ? userTask.subject : '英語'
  const [subject, setSubject] = useState<DrillSubject>(startSubject)
  const [gradeMax, setGradeMax] = useState(() => initialGradeMax(grade))
  const [units, setUnits] = useState<DrillUnit[]>([])
  const [wrongCount, setWrongCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ at: 'entry' })

  const loadEntry = useCallback(async () => {
    setLoading(true)
    try {
      const [u, w] = await Promise.all([loadDrillUnits(subject, gradeMax), loadDrillWrongCount(subject, gradeMax)])
      setUnits(u)
      setWrongCount(w)
      setError(null)
    } catch (e) {
      console.error(e)
      setUnits([])
      setWrongCount(0)
      setError(drillErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [subject, gradeMax])

  useEffect(() => {
    if (phase.at === 'entry') void loadEntry()
  }, [loadEntry, phase.at])

  const begin = useCallback(async (mode: DrillMode, category: string | null) => {
    setBusy(true)
    setError(null)
    try {
      const s = await startDrill({
        subject, mode, category, gradeMax, total: DRILL_TOTAL, userTaskId: userTask?.id ?? null,
      })
      if (!s.question) {
        setError('出せる問題がありませんでした。ほかの単元を選んでください。')
        setPhase({ at: 'entry' })
        return
      }
      setPhase({
        at: 'play', sessionId: s.sessionId, subject: s.subject, mode: s.mode, category: s.category,
        total: s.total, answered: 0, correctCount: 0, question: s.question, verdict: null,
      })
    } catch (e) {
      console.error(e)
      setError(drillErrorMessage(e))
      setPhase({ at: 'entry' })
    } finally {
      setBusy(false)
    }
  }, [subject, gradeMax, userTask])

  async function onAnswer(choice: string) {
    if (phase.at !== 'play') return
    setBusy(true)
    setError(null)
    try {
      const v = await answerDrill(phase.sessionId, phase.question.id, choice)
      setPhase({ ...phase, answered: v.answered, correctCount: v.correctCount, verdict: v })
      if (v.result?.recorded) onRecorded(v.result)
    } catch (e) {
      console.error(e)
      setError(drillErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function toResult(sessionId: string, mode: DrillMode, category: string | null, recorded: DrillRecorded | null) {
    const summary = await loadDrillResult(sessionId)
    setPhase({ at: 'result', summary, recorded, mode, category })
  }

  async function onNext() {
    if (phase.at !== 'play' || !phase.verdict) return
    setBusy(true)
    setError(null)
    try {
      if (phase.verdict.finished) {
        await toResult(phase.sessionId, phase.mode, phase.category, phase.verdict.result)
        return
      }
      const q = await drillNext(phase.sessionId)
      if (!q) {
        await toResult(phase.sessionId, phase.mode, phase.category, phase.verdict.result)
        return
      }
      setPhase({ ...phase, question: q, verdict: null })
    } catch (e) {
      console.error(e)
      setError(drillErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onQuit() {
    if (phase.at !== 'play') return
    setBusy(true)
    setError(null)
    try {
      await abandonDrill(phase.sessionId)
      if (phase.answered === 0) {
        setPhase({ at: 'entry' })
        return
      }
      await toResult(phase.sessionId, phase.mode, phase.category, null)
    } catch (e) {
      console.error(e)
      setError(drillErrorMessage(e))
      setPhase({ at: 'entry' })
    } finally {
      setBusy(false)
    }
  }

  if (phase.at === 'play') {
    return (
      <DrillPlay
        subject={phase.subject}
        mode={phase.mode}
        category={phase.category}
        total={phase.total}
        answered={phase.answered}
        correctCount={phase.correctCount}
        question={phase.question}
        verdict={phase.verdict}
        busy={busy}
        error={error}
        onAnswer={(c) => void onAnswer(c)}
        onNext={() => void onNext()}
        onQuit={() => void onQuit()}
      />
    )
  }

  if (phase.at === 'result') {
    return (
      <DrillResult
        summary={phase.summary}
        recorded={phase.recorded}
        busy={busy}
        error={error}
        onAgain={() => void begin(phase.mode, phase.category)}
        onClose={onClose}
      />
    )
  }

  return (
    <DrillEntry
      subject={subject}
      gradeMax={gradeMax}
      units={units}
      wrongCount={wrongCount}
      loading={loading}
      busy={busy}
      error={error}
      onSubject={setSubject}
      onGrade={setGradeMax}
      onStart={(mode, category) => void begin(mode, category)}
      onClose={onClose}
    />
  )
}
