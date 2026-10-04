export type Subject = "english" | "math" | "japanese" | "science" | "social";
export type RestKind = "ticket" | "club_event" | null;
export type StripDay = { d: string; n: number; rest: RestKind };

export type DayTask = {
  id: string;
  title: string | null;
  subject: Subject | null;
  is_free: boolean;
  est_minutes: number | null;
  reward_coins: number | null;
  recurrence: "once" | "daily" | "weekly" | null;
  due_date: string | null;
  completed_at: string | null;
  completed_time: string | null;
};

export type StudentStatus = {
  state: "unregistered" | "pending" | "approved" | "rejected" | "left" | "not_student";
  club_name?: string;
  display_name?: string;
  grade?: string;
  friend_status?: string;
  consent_version?: string;
};

export type Home = {
  today: string;
  me: {
    display_name: string; grade: string; club_name: string; coins: number;
    line_contact_opt_in: boolean; friend_status: string;
  };
  streak: { current: number; best: number; last_achieved_date: string | null; broken_on: string | null };
  strip: StripDay[];
  tasks: DayTask[];
  today_rest: RestKind;
  free_entry: { enabled: boolean; remaining: number };
  comment: { id: string; body: string; author: string; created_at: string; read: boolean } | null;
};

export type Completion = {
  already: boolean;
  user_task_id: string;
  title?: string;
  subject?: Subject;
  is_free?: boolean;
  completed_time?: string;
  coins: number;
  coin_balance?: number;
  today_count?: number;
  streak?: number;
  best?: number;
  resumed?: boolean;
  strip?: StripDay[];
};

export type AdminMe = {
  role: "operator" | "club_admin" | null;
  display_name?: string;
  email?: string;
  clubs?: { id: string; name: string }[];
};

export type OverviewStudent = {
  id: string; display_name: string; grade: string;
  state: "all_done" | "partial" | "not_started" | "rest";
  done: number; total: number; tasks: DayTask[];
  streak: number; best: number; last_study: string | null; gap_days: number;
  need: number; open_alerts: number; friend_status: string; line_contact_opt_in: boolean;
  strip: StripDay[];
};
export type Overview = {
  club: { id: string; name: string };
  today: string;
  summary: { all_done: number; partial: number; not_started: number; rest: number; students: number };
  club_strip: { d: string; n: number }[];
  students: OverviewStudent[];
};

export type AlertItem = {
  id: string; kind: string; alert_date: string; status: "open" | "contacted" | "dismissed";
  message: string; student_id: string; student_name: string; grade: string;
  club_id: string; club_name: string; friend_status: string;
  contacted_at: string | null; contacted_by: string | null; completions_after: number | null;
};

export type StudentDetail = {
  viewer_role: "operator" | "club_admin";
  student: {
    id: string; display_name: string; grade: string; club_id: string; club_name: string;
    friend_status: string; line_contact_opt_in: boolean; approved_on: string | null;
  };
  streak: { current: number; best: number };
  month_days: number;
  focus_minutes_month: number;
  strip: StripDay[];
  subjects: { subject: Subject | null; n: number }[];
  free_count_30: number;
  history: { date: string; time: string; is_free: boolean; title: string | null; subject: Subject | null }[];
  comments: { id: string; body: string; created_at: string; read: boolean; author: string }[];
  alerts: { id: string; kind: string; alert_date: string; status: string; message: string;
            contacted_at: string | null; completions_after: number | null }[] | null;
  tickets: { week: string; used_on: string | null }[];
  coins: number;
};

export type TaskGroup = {
  group_id: string; title: string; subject: Subject; recurrence: "once" | "daily" | "weekly";
  due_date: string | null; weekdays: number[] | null; starts_on: string; ends_on: string | null;
  est_minutes: number; reward_coins: number; clubs: { id: string; name: string }[];
  status: "active" | "scheduled" | "ended"; assigned: number; done: number;
};

export type ClubSettings = {
  viewer_role: "operator" | "club_admin";
  club: { id: string; name: string; free_entry_enabled: boolean; invite_code: string | null };
  pending: { member_id: string; display_name: string; grade: string; applied_at: string; consented_at: string | null }[];
  students: number;
  admins: { user_id: string; display_name: string; email: string; signed_in: boolean }[];
  events: { id: string; kind: string; title: string; starts_on: string; ends_on: string }[];
};
