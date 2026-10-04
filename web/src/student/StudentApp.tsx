import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/api";
import { readInviteCode, signInWithLine } from "../lib/liff";
import type { StudentStatus } from "../lib/types";
import { Register, Waiting } from "./Register";
import { HomeScreen } from "./Home";
import "../styles/student.css";

export default function StudentApp() {
  const invite = useMemo(readInviteCode, []);
  const [status, setStatus] = useState<StudentStatus | null>(null);
  const [lineName, setLineName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await rpc<StudentStatus>("student_status");
    setStatus(s);
    if (s.state === "approved") rpc("touch_open").catch(() => undefined); // 起動の記録（学習とは別）
  }, []);

  useEffect(() => {
    document.body.className = "student";
    (async () => {
      try {
        const r = await signInWithLine();
        setLineName(r.lineName);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [load]);

  if (error) return <p className="center-note" role="alert">{error}</p>;
  if (!status) return <p className="center-note">読み込んでいます</p>;

  switch (status.state) {
    case "approved":
      return <HomeScreen />;
    case "pending":
      return <Waiting clubName={status.club_name ?? ""} onReload={load} />;
    case "unregistered":
    case "rejected":
    case "left":
      return (
        <Register
          invite={invite}
          lineName={lineName}
          consentVersion={status.consent_version ?? ""}
          previousState={status.state}
          onDone={load}
        />
      );
    default:
      return <p className="center-note">このアカウントは管理者用です。生徒用の LINE アカウントで開いてください。</p>;
  }
}
