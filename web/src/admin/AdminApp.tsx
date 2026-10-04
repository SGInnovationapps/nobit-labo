import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { rpc } from "../lib/api";
import { DEMO } from "../lib/config";
import { supabase } from "../lib/supabase";
import type { AdminMe } from "../lib/types";
import { Login } from "./Login";
import { StudentList } from "./StudentList";
import { StudentDetail } from "./StudentDetail";
import { TaskManager } from "./TaskManager";
import { ClubSettingsPage } from "./ClubSettings";
import "../styles/admin.css";

type Ctx = {
  me: AdminMe & { role: "operator" | "club_admin" };
  clubId: string;
  setClubId: (id: string) => void;
  refreshMe: () => Promise<void>;
};
const AdminCtx = createContext<Ctx | null>(null);
export function useAdmin(): Ctx {
  const v = useContext(AdminCtx);
  if (!v) throw new Error("AdminCtx missing");
  return v;
}

const CLUB_KEY = "nobit.admin.club";

export default function AdminApp() {
  const [session, setSession] = useState<"loading" | "none" | "in">(DEMO ? "in" : "loading");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clubId, setClubIdState] = useState<string>(() => localStorage.getItem(CLUB_KEY) ?? "");

  useEffect(() => {
    document.body.className = "admin";
    if (DEMO) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ? "in" : "none"));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ? "in" : "none"));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const m = await rpc<AdminMe>("admin_claim");
      setMe(m);
      const ids = (m.clubs ?? []).map((c) => c.id);
      setClubIdState((cur) => (ids.includes(cur) ? cur : ids[0] ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    if (session === "in") refreshMe();
  }, [session, refreshMe]);

  const setClubId = useCallback((id: string) => {
    localStorage.setItem(CLUB_KEY, id);
    setClubIdState(id);
  }, []);

  const ctx = useMemo(
    () => (me?.role ? { me: me as Ctx["me"], clubId, setClubId, refreshMe } : null),
    [me, clubId, setClubId, refreshMe],
  );

  if (session === "loading") return null;
  if (session === "none") return <Login />;
  if (error) return <p className="login error-line" role="alert">{error}</p>;
  if (!me) return null;
  if (!ctx) {
    return (
      <div className="login">
        <span className="num">NOBIT!</span>
        <p>このメールアドレスには管理画面の権限がありません。運営に、クラブ管理者として追加されているか確かめてください。</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>ログアウト</button>
      </div>
    );
  }

  const op = ctx.me.role === "operator";
  return (
    <AdminCtx.Provider value={ctx}>
      <div className="a-shell">
        <nav className="a-nav" aria-label="管理メニュー">
          <div className="a-brand">
            <span className="num">NOBIT!</span>
            <small>{op ? "運営" : "クラブ管理"}</small>
          </div>
          <NavLink to="/admin" end>生徒一覧</NavLink>
          {op && <NavLink to="/admin/tasks">タスク管理</NavLink>}
          <NavLink to="/admin/club">クラブ設定</NavLink>
          <div className="a-nav-foot">
            {ctx.me.display_name}
            <br />
            {!DEMO && <button onClick={() => supabase.auth.signOut()}>ログアウト</button>}
          </div>
        </nav>
        <main className="a-main">
          <Routes>
            <Route index element={<StudentList />} />
            <Route path="students/:id" element={<StudentDetail />} />
            {op && <Route path="tasks" element={<TaskManager />} />}
            <Route path="club" element={<ClubSettingsPage />} />
          </Routes>
        </main>
      </div>
    </AdminCtx.Provider>
  );
}

/** クラブの切り替え（運営は全クラブ、クラブ管理者は担当が複数あるときだけ） */
export function ClubPicker() {
  const { me, clubId, setClubId } = useAdmin();
  const clubs = me.clubs ?? [];
  if (clubs.length === 0) return <span className="muted">クラブがまだありません</span>;
  if (clubs.length === 1) return <strong>{clubs[0].name}</strong>;
  return (
    <select className="a-select" value={clubId} onChange={(e) => setClubId(e.target.value)} aria-label="クラブ">
      {clubs.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
