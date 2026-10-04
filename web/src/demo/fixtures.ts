// 見本データ（?demo=1 または VITE_DEMO=1）。LINE と Supabase なしで画面を確かめるためのもの。
// 名前はすべて架空。?role=club_admin でクラブ管理者の見え方、?state=unregistered|pending で登録画面になる。
import type {
  AdminMe, AlertItem, ClubSettings, Completion, DayTask, Home, Overview, OverviewStudent,
  StripDay, StudentDetail, StudentStatus, Subject, TaskGroup,
} from "../lib/types";
import { jstTime, todayJst } from "../lib/format";

const params = new URLSearchParams(window.location.search);
const role: "operator" | "club_admin" = params.get("role") === "club_admin" ? "club_admin" : "operator";
let studentState = (params.get("state") ?? "approved") as StudentStatus["state"];

const today = todayJst();
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const eventDay = addDays(today, -6);

function strip(days: number, rate: number, gapTail = 0, todayN = 0): StripDay[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - days + 1);
    if (d === eventDay) return { d, n: 0, rest: "club_event" as const };
    if (d === today) return { d, n: todayN, rest: null };
    if (i >= days - 1 - gapTail) return { d, n: 0, rest: null };
    const r = rand();
    return { d, n: r < rate ? Math.ceil(rand() * 3.4) : 0, rest: null };
  });
}

const CLUB = { id: "club-a", name: "［クラブ名］", invite_code: "K7QM2XRA", free_entry_enabled: true };
const CLUB_B = { id: "club-b", name: "［クラブ名］B", invite_code: "P3WN8HTD", free_entry_enabled: false };

// ---- 生徒（自分） ----
const myTasks: DayTask[] = [
  { id: "t1", title: "英単語 20個", subject: "english", is_free: false, est_minutes: 15, reward_coins: 10, recurrence: "daily", due_date: null, completed_at: `${today}T07:42:00+09:00`, completed_time: "07:42" },
  { id: "t2", title: "数学プリント 第3回", subject: "math", is_free: false, est_minutes: 30, reward_coins: 10, recurrence: "once", due_date: addDays(today, 2), completed_at: null, completed_time: null },
  { id: "t3", title: "理科 ノートまとめ", subject: "science", is_free: false, est_minutes: 20, reward_coins: 10, recurrence: "weekly", due_date: null, completed_at: null, completed_time: null },
];
const myStrip = (() => {
  const s = strip(30, 0.86, 0, 1);
  for (let i = 17; i < 29; i++) if (s[i].n === 0 && !s[i].rest) s[i].n = 1; // 直近12日は続いている
  return s;
})();
let myCoins = 120;
let freeLeft = 3;
let optIn = true;

function home(): Home {
  return {
    today,
    me: { display_name: "見本 太郎", grade: "中2", club_name: CLUB.name, coins: myCoins, line_contact_opt_in: optIn, friend_status: "friend" },
    streak: { current: 12, best: 18, last_achieved_date: today, broken_on: null },
    strip: myStrip,
    tasks: [...myTasks].sort((a, b) => Number(!!a.completed_at) - Number(!!b.completed_at) || String(a.completed_at).localeCompare(String(b.completed_at))),
    today_rest: null,
    free_entry: { enabled: true, remaining: freeLeft },
    comment: { id: "c1", body: "大会前でも毎日続けられていてすごいね。", author: "［管理者名］", created_at: nowIso(), read: false },
  };
}

function finish(t: DayTask, coins: number): Completion {
  const time = jstTime(nowIso());
  t.completed_at = nowIso();
  t.completed_time = time;
  myStrip[myStrip.length - 1].n += 1;
  myCoins += coins;
  return {
    already: false, user_task_id: t.id, title: t.title ?? "", subject: t.subject ?? undefined, is_free: t.is_free,
    completed_time: time, coins, coin_balance: myCoins, today_count: myStrip[myStrip.length - 1].n,
    streak: 12, best: 18, resumed: false, strip: myStrip.map((d) => ({ ...d })),
  };
}

// ---- 管理画面 ----
const NAMES: [string, string][] = [
  ["生徒A", "中1"], ["生徒B", "中2"], ["生徒C", "中2"], ["生徒D", "中3"],
  ["生徒E", "高1"], ["生徒F", "高1"], ["生徒G", "高2"], ["生徒H", "中3"],
];
const students: OverviewStudent[] = NAMES.map(([name, grade], i) => {
  const gap = name === "生徒D" ? 4 : 0;
  const todayN = [3, 2, 1, 0, 2, 0, 1, 3][i];
  const st = strip(14, [0.9, 0.95, 0.7, 0.6, 0.8, 0.5, 0.75, 0.9][i], gap, todayN);
  const total = 3;
  const tasks: DayTask[] = myTasks.map((t, k) => ({
    ...t, id: `${name}-${k}`,
    completed_at: k < todayN ? `${today}T1${7 + k}:0${i}:00+09:00` : null,
    completed_time: k < todayN ? `1${7 + k}:0${i}` : null,
  }));
  const state = todayN === 0 ? "not_started" : todayN >= total ? "all_done" : "partial";
  return {
    id: `s${i}`, display_name: name, grade, state, done: todayN, total, tasks,
    streak: gap ? 0 : [21, 34, 5, 0, 9, 0, 3, 14][i], best: [21, 34, 12, 15, 9, 6, 8, 14][i],
    last_study: gap ? addDays(today, -5) : todayN ? today : addDays(today, -1),
    gap_days: gap, need: 0, open_alerts: 0, friend_status: i === 5 ? "not_friend" : "friend",
    line_contact_opt_in: true, strip: st,
  };
});
students.forEach((s) => {
  s.need = s.gap_days >= 3 ? 300 + s.gap_days : s.state === "not_started" ? 100 : s.state === "partial" ? 50 : 0;
});
students.sort((a, b) => b.need - a.need || a.display_name.localeCompare(b.display_name));

const alerts: AlertItem[] = [
  { id: "a1", kind: "gap", alert_date: today, status: "open", message: "今日も、ひとつ育てよう。短いタスクからで大丈夫。", student_id: "s3", student_name: "生徒D", grade: "中3", club_id: CLUB.id, club_name: CLUB.name, friend_status: "friend", contacted_at: null, contacted_by: null, completions_after: null },
  { id: "a2", kind: "not_started", alert_date: today, status: "open", message: "今日のクエスト、あと3つだよ！", student_id: "s5", student_name: "生徒F", grade: "高1", club_id: CLUB.id, club_name: CLUB.name, friend_status: "not_friend", contacted_at: null, contacted_by: null, completions_after: null },
  { id: "a3", kind: "streak_milestone", alert_date: today, status: "open", message: "30日連続記録達成！おめでとう！", student_id: "s1", student_name: "生徒B", grade: "中2", club_id: CLUB.id, club_name: CLUB.name, friend_status: "friend", contacted_at: null, contacted_by: null, completions_after: null },
  { id: "a4", kind: "not_started", alert_date: addDays(today, -1), status: "contacted", message: "今日のクエスト、あと2つだよ！", student_id: "s2", student_name: "生徒C", grade: "中2", club_id: CLUB.id, club_name: CLUB.name, friend_status: "friend", contacted_at: new Date(Date.now() - 20 * 3600e3).toISOString(), contacted_by: "運営", completions_after: 2 },
];

const groups: TaskGroup[] = [
  { group_id: "g1", title: "英単語 20個", subject: "english", recurrence: "daily", due_date: null, weekdays: null, starts_on: addDays(today, -40), ends_on: null, est_minutes: 15, reward_coins: 10, clubs: [CLUB, CLUB_B], status: "active", assigned: 14, done: 9 },
  { group_id: "g2", title: "数学プリント 第3回", subject: "math", recurrence: "once", due_date: addDays(today, 2), weekdays: null, starts_on: addDays(today, -1), ends_on: null, est_minutes: 30, reward_coins: 10, clubs: [CLUB], status: "active", assigned: 8, done: 3 },
  { group_id: "g3", title: "理科 ノートまとめ", subject: "science", recurrence: "weekly", due_date: null, weekdays: [1, 3, 5], starts_on: addDays(today, -14), ends_on: addDays(today, 30), est_minutes: 20, reward_coins: 10, clubs: [CLUB], status: "active", assigned: 8, done: 4 },
  { group_id: "g4", title: "社会 年表の確認", subject: "social", recurrence: "daily", due_date: null, weekdays: null, starts_on: addDays(today, 3), ends_on: addDays(today, 17), est_minutes: 10, reward_coins: 10, clubs: [CLUB, CLUB_B], status: "scheduled", assigned: 0, done: 0 },
  { group_id: "g5", title: "国語 漢字テスト対策", subject: "japanese", recurrence: "once", due_date: addDays(today, -3), weekdays: null, starts_on: addDays(today, -10), ends_on: null, est_minutes: 20, reward_coins: 10, clubs: [CLUB], status: "ended", assigned: 8, done: 7 },
];

const settings: ClubSettings = {
  viewer_role: role,
  club: { id: CLUB.id, name: CLUB.name, free_entry_enabled: true, invite_code: role === "operator" ? CLUB.invite_code : null },
  pending: [
    { member_id: "m1", display_name: "生徒I", grade: "中1", applied_at: new Date(Date.now() - 3600e3).toISOString(), consented_at: new Date(Date.now() - 3600e3).toISOString() },
    { member_id: "m2", display_name: "生徒J", grade: "高1", applied_at: new Date(Date.now() - 7200e3).toISOString(), consented_at: new Date(Date.now() - 7200e3).toISOString() },
  ],
  students: students.length,
  admins: [{ user_id: "u1", display_name: "［管理者名］", email: "coach@example.com", signed_in: true }],
  events: [{ id: "e1", kind: "大会", title: "［大会名］", starts_on: eventDay, ends_on: eventDay }],
};

function detail(id: string): StudentDetail {
  const s = students.find((x) => x.id === id) ?? students[0];
  seed = 100 + Number(id.replace(/\D/g, "") || 0);
  const long = strip(84, 0.75, s.gap_days, s.done);
  const subjects: { subject: Subject; n: number }[] = [
    { subject: "english", n: 14 }, { subject: "math", n: 9 }, { subject: "science", n: 6 }, { subject: "social", n: 3 }, { subject: "japanese", n: 2 },
  ];
  const op = role === "operator";
  return {
    viewer_role: role,
    student: { id: s.id, display_name: s.display_name, grade: s.grade, club_id: CLUB.id, club_name: CLUB.name, friend_status: s.friend_status, line_contact_opt_in: true, approved_on: addDays(today, -80) },
    streak: { current: s.streak, best: s.best },
    month_days: 18, focus_minutes_month: 135, strip: long,
    subjects, free_count_30: 4,
    history: long.slice(-6).reverse().flatMap((d, i) =>
      d.n > 0
        ? [
            { date: d.d, time: `1${8 - (i % 3)}:2${i}`, is_free: false, title: "英単語 20個", subject: "english" as Subject },
            { date: d.d, time: `0${7 + (i % 2)}:1${i}`, is_free: true, title: op ? "問題集 p.12" : null, subject: op ? ("math" as Subject) : null },
          ]
        : [],
    ),
    comments: [{ id: "c1", body: "大会前でも毎日続けられていてすごいね。", created_at: nowIso(), read: true, author: "［管理者名］" }],
    alerts: op ? alerts.filter((a) => a.student_id === s.id).map((a) => ({ ...a })) : null,
    tickets: [{ week: addDays(today, -7), used_on: addDays(today, -4) }, { week: addDays(today, -14), used_on: null }],
    coins: 240,
  };
}

export function demoRpc(fn: string, a: Record<string, unknown>): unknown {
  switch (fn) {
    case "student_status":
      return { state: studentState, club_name: CLUB.name, display_name: "見本 太郎", grade: "中2", friend_status: "not_friend", consent_version: "2026-10-v1" };
    case "club_by_invite":
      return { name: CLUB.name };
    case "register_student":
      studentState = "pending";
      return { state: "pending" };
    case "touch_open":
    case "mark_comment_read":
      return null;
    case "set_line_contact":
      optIn = Boolean(a.p_opt_in);
      return optIn;
    case "my_home":
      return home();
    case "complete_task": {
      const t = myTasks.find((x) => x.id === a.p_user_task_id)!;
      if (t.completed_at) return { already: true, user_task_id: t.id, coins: 0 };
      return finish(t, 10);
    }
    case "add_free_task": {
      const t: DayTask = { id: uid(), title: String(a.p_title), subject: a.p_subject as Subject, is_free: true, est_minutes: null, reward_coins: 5, recurrence: null, due_date: null, completed_at: null, completed_time: null };
      myTasks.push(t);
      freeLeft -= 1;
      return finish(t, 5);
    }
    case "admin_claim":
      return { role, display_name: role === "operator" ? "運営" : "［管理者名］", email: "demo@example.com", clubs: role === "operator" ? [CLUB, CLUB_B] : [CLUB] } satisfies AdminMe;
    case "admin_overview": {
      const sum = (k: string) => students.filter((s) => s.state === k).length;
      seed = 5;
      return {
        club: CLUB, today,
        summary: { all_done: sum("all_done"), partial: sum("partial"), not_started: sum("not_started"), rest: sum("rest"), students: students.length },
        club_strip: strip(14, 1, 0, 0).map((d) => ({ d: d.d, n: d.rest ? 2 : Math.round(8 + rand() * 12) })).map((d, i, arr) => (i === arr.length - 1 ? { ...d, n: 12 } : d)),
        students: students.map((s) => ({ ...s, tasks: role === "operator" ? s.tasks : s.tasks })),
      } satisfies Overview;
    }
    case "admin_alerts":
      return alerts.filter((x) => x.status !== "dismissed");
    case "admin_mark_contacted": {
      const x = alerts.find((y) => y.id === a.p_alert_id)!;
      Object.assign(x, { status: "contacted", contacted_at: nowIso(), contacted_by: "運営", completions_after: 0 });
      return x;
    }
    case "admin_dismiss_alert":
      alerts.find((y) => y.id === a.p_alert_id)!.status = "dismissed";
      return null;
    case "admin_student_detail":
      return detail(String(a.p_student_id));
    case "admin_post_comment":
      return { id: uid() };
    case "admin_tasks":
      return groups;
    case "admin_create_task":
      groups.unshift({
        group_id: uid(), title: String(a.p_title), subject: a.p_subject as Subject, recurrence: a.p_recurrence as TaskGroup["recurrence"],
        due_date: (a.p_due_date as string) ?? null, weekdays: (a.p_weekdays as number[]) ?? null, starts_on: String(a.p_starts_on),
        ends_on: (a.p_ends_on as string) ?? null, est_minutes: Number(a.p_est_minutes), reward_coins: Number(a.p_reward_coins ?? 10),
        clubs: [CLUB, CLUB_B].filter((c) => (a.p_club_ids as string[]).includes(c.id)),
        status: String(a.p_starts_on) > today ? "scheduled" : "active", assigned: 0, done: 0,
      });
      return "ok";
    case "admin_archive_task":
      groups.find((g) => g.group_id === a.p_group_id)!.status = "ended";
      return null;
    case "admin_clubs_free_entry":
      return [CLUB, CLUB_B].map(({ id, name, free_entry_enabled }) => ({ id, name, free_entry_enabled }));
    case "admin_set_free_entry": {
      const c = [CLUB, CLUB_B].find((x) => x.id === a.p_club_id)!;
      c.free_entry_enabled = Boolean(a.p_enabled);
      return null;
    }
    case "admin_club_settings":
      return settings;
    case "admin_decide_member":
      settings.pending = settings.pending.filter((p) => p.member_id !== a.p_member_id);
      if (a.p_approve) settings.students += 1;
      return null;
    case "admin_add_club_admin":
      settings.admins.push({ user_id: uid(), display_name: String(a.p_display_name), email: String(a.p_email), signed_in: false });
      return uid();
    case "admin_remove_club_admin":
      settings.admins = settings.admins.filter((x) => x.user_id !== a.p_user_id);
      return null;
    case "admin_add_event":
      settings.events.push({ id: uid(), kind: String(a.p_kind), title: String(a.p_title), starts_on: String(a.p_starts_on), ends_on: String(a.p_ends_on) });
      return uid();
    case "admin_delete_event":
      settings.events = settings.events.filter((e) => e.id !== a.p_event_id);
      return null;
    case "admin_regenerate_invite":
      return CLUB.invite_code;
    case "admin_create_club":
      return { id: CLUB_B.id, name: String(a.p_name), invite_code: "NEWC0DE2" };
    default:
      throw new Error(`demo: ${fn} は見本データがありません`);
  }
}
