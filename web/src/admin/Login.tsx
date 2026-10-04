import { useState } from "react";
import { supabase } from "../lib/supabase";

/** 管理画面はメールリンクでログインする（パスワードは持たない） */
export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    if (error) setError("メールを送れませんでした。アドレスを確かめて、少し時間をおいて試してください。");
    else setSent(true);
  };
  return (
    <main className="login">
      <span className="num">NOBIT!</span>
      <p className="muted">管理画面</p>
      {sent ? (
        <p>{email} にログイン用のリンクを送りました。メールを開いてリンクを押してください。</p>
      ) : (
        <>
          <label htmlFor="email" style={{ fontWeight: 700, fontSize: 13 }}>メールアドレス</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="error-line" role="alert">{error}</p>}
          <button className="btn primary" disabled={!email.includes("@")} onClick={send}>ログイン用のリンクを送る</button>
        </>
      )}
    </main>
  );
}
