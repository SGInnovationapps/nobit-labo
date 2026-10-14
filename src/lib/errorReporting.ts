// 画面のエラーを Supabase の log_client_error に送る。
// 送るのは、拾えなかった例外・Promise の失敗、描画の失敗（ErrorBoundary）、画面側で拾って console.error に出したエラー。
// 送るのに失敗しても、画面の動きには影響させない（黙って捨てる）。
import { supabase } from './supabase'
import { makeReport, ReportGate } from './errorReport'
import type { ErrorApp, ErrorKind } from './errorReport'

const gate = new ReportGate()
/** 同じエラーの物を2回送らない（React は描画の失敗を console.error にも出すため） */
const reported = new WeakSet<object>()
let currentApp: ErrorApp = 'student'
let installed = false
let building = false

function env() {
  return { href: location.href, userAgent: navigator.userAgent, appVersion: __APP_VERSION__ }
}

/** extraStack：描画の失敗のときの、どの部品で起きたか（componentStack） */
export function reportError(kind: ErrorKind, value: unknown, extraStack?: string): void {
  // 送る準備の途中で起きたエラーで、また送ろうとして回り続けないようにする
  if (building) return
  if (value !== null && typeof value === 'object') {
    if (reported.has(value)) return
    reported.add(value)
  }
  building = true
  try {
    const report = makeReport(currentApp, kind, value, env())
    if (!report || !gate.allow(report)) return
    const stack = extraStack ? `${report.stack ?? ''}\n${extraStack}`.trim().slice(0, 2000) : report.stack
    void Promise.resolve(
      supabase.rpc('log_client_error', {
        p_app: report.app,
        p_kind: report.kind,
        p_message: report.message,
        p_stack: stack,
        p_path: report.path,
        p_device: report.device,
        p_app_version: report.appVersion,
      }),
    ).catch(() => undefined)
  } catch {
    // 送る準備に失敗しても、画面には影響させない
  } finally {
    building = false
  }
}

/** 起動時に1回だけ呼ぶ */
export function installErrorReporting(app: ErrorApp): void {
  currentApp = app
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (e) => reportError('error', e.error ?? (e.message ? new Error(e.message) : null)))
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason))

  // 画面の各所は、拾ったエラーを console.error に出してから案内の文を出している。それもまとめて送る。
  // 描画の失敗は ErrorBoundary が先に「描画」として送れるよう、少し遅らせる
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    original(...args)
    const found = args.find((a) => a instanceof Error || (a !== null && typeof a === 'object' && typeof (a as { message?: unknown }).message === 'string'))
    if (found !== undefined) setTimeout(() => reportError('handled', found), 0)
  }
}
