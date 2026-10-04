import type { Subject } from "./types";

export const SUBJECTS: { code: Subject; label: string }[] = [
  { code: "english", label: "英語" },
  { code: "math", label: "数学" },
  { code: "japanese", label: "国語" },
  { code: "science", label: "理科" },
  { code: "social", label: "社会" },
];
export const subjectLabel = (s: Subject | null | undefined) =>
  SUBJECTS.find((x) => x.code === s)?.label ?? "";

export const GRADES = ["中1", "中2", "中3", "高1", "高2", "高3"] as const;
export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"]; // ISO 1=月

const WD = ["日", "月", "火", "水", "木", "金", "土"];
/** "2026-10-02" → 10月2日(金) */
export function dateLabel(iso: string, withWeekday = true) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日${withWeekday ? `(${WD[wd]})` : ""}`;
}
export const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}/${d}`;
};
/** タイムスタンプを JST の HH:MM に */
export function jstTime(ts: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ts));
}
export function jstDateTime(ts: string) {
  const d = new Date(ts);
  const date = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(d);
  return `${date} ${jstTime(ts)}`;
}
export function todayJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export const STATE_LABEL: Record<string, string> = {
  all_done: "すべて完了",
  partial: "一部完了",
  not_started: "未着手",
  rest: "休息日",
};
export const ALERT_LABEL: Record<string, string> = {
  not_started: "未着手",
  gap: "記録が空いた",
  streak_milestone: "連続記録の節目",
  badge: "バッジ獲得",
  club_mission: "クラブミッション",
};
export const FRIEND_LABEL: Record<string, string> = {
  friend: "友だち",
  not_friend: "未追加",
  blocked: "ブロック中",
  unknown: "不明",
};

/** 秒を「1時間05分」「47分」にする */
export function durationLabel(seconds: number) {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, "0")}分`;
}
/** タイマーの表示（23:45、1:02:07） */
export function clockLabel(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export const END_REASON_LABEL: Record<string, string> = {
  manual: "スライドで終了",
  app_closed: "アプリを閉じた",
  idle: "画面が消えたまま",
  time_limit: "上限で自動停止",
};

const ERRORS: Record<string, string> = {
  invite_not_found: "招待コードが見つかりません。クラブの招待QRから開き直してください。",
  consent_required: "保護者の同意が必要です。",
  already_registered: "このLINEアカウントはすでに登録されています。",
  student_not_approved: "クラブの承認を待っています。",
  line_login_required: "LINEでログインしてから開いてください。",
  task_not_found: "このタスクは見つかりませんでした。画面を更新してください。",
  task_not_today: "このタスクは今日の分ではありません。",
  task_archived: "このタスクは配信が終わりました。",
  free_entry_disabled: "このクラブでは自分で記録する機能を使っていません。",
  free_entry_limit: "今日の記録は上限に達しました。また明日記録しよう。",
  title_invalid: "内容を40文字以内で入力してください。",
  display_name_invalid: "表示名を20文字以内で入力してください。",
  grade_invalid: "学年を選んでください。",
  club_forbidden: "このクラブを見る権限がありません。",
  operator_only: "運営だけが使える操作です。",
  club_admin_only: "クラブ管理者だけが使える操作です。",
  alert_not_open: "このアラートはすでに対応済みです。",
  member_not_pending: "この申し込みはすでに処理済みです。",
  email_invalid: "メールアドレスの形式を確かめてください。",
  email_in_use: "このメールアドレスは別の役割で使われています。",
  body_invalid: "応援コメントは200文字以内で入力してください。",
  login_failed: "ログインできませんでした。時間をおいて開き直してください。",
  study_not_found: "このタイマーは見つかりませんでした。画面を更新してください。",
  reason_invalid: "タイマーを止められませんでした。",
};
export const errorMessage = (code: string) => ERRORS[code] ?? `エラーが起きました（${code}）`;
