import { useEffect, useState } from "react";
import { rpc } from "../lib/api";
import { GRADES } from "../lib/format";
import { addFriendUrl } from "../lib/config";
import { isFriend } from "../lib/liff";

type Props = {
  invite: string | null;
  lineName: string;
  consentVersion: string;
  previousState: "unregistered" | "rejected" | "left";
  onDone: () => Promise<void>;
};

/** 保護者同意 → 学年・表示名 → クラブ管理者の承認待ち */
export function Register({ invite, lineName, consentVersion, previousState, onDone }: Props) {
  const [club, setClub] = useState<string | null | undefined>(undefined);
  const [step, setStep] = useState<1 | 2>(1);
  const [agreed, setAgreed] = useState(false);
  const [grade, setGrade] = useState("");
  const [name, setName] = useState(lineName.slice(0, 20));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!invite) return;
    rpc<{ name: string } | null>("club_by_invite", { p_code: invite })
      .then((c) => setClub(c?.name ?? null))
      .catch(() => setClub(null));
  }, [invite]);

  if (!invite || club === null) {
    return (
      <main className="s-app">
        <p className="center-note">
          {previousState === "rejected"
            ? "クラブの承認を得られませんでした。クラブの管理者に確かめてから、招待QRを読み取り直してください。"
            : "クラブの招待QRから開いてください。QRはクラブの管理者が配っています。"}
        </p>
      </main>
    );
  }
  if (club === undefined) return <p className="center-note">読み込んでいます</p>;

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await rpc("register_student", {
        p_invite_code: invite,
        p_display_name: name.trim(),
        p_grade: grade,
        p_consent_version: consentVersion,
      });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="s-app">
      <div className="r-steps" aria-label={`2つのうち${step}つ目`}>
        <span className="on" />
        <span className={step === 2 ? "on" : ""} />
      </div>

      {step === 1 ? (
        <>
          <h1 className="r-title">保護者の方へ</h1>
          <p className="r-lead">{club} で NOBIT! を使う前に、保護者の方が内容を確認してください。</p>
          <div className="r-terms">
            <section>
              <h3>NOBIT! について</h3>
              <p>毎日の勉強を記録して、続けた日数を見えるようにする学習記録アプリです。運営は NOBIT! LABO です。</p>
            </section>
            <section>
              <h3>クラブの管理者が見られるもの</h3>
              <ul>
                <li>完了したタスクと、完了した時刻</li>
                <li>日ごとの記録（記録の帯）と連続記録</li>
              </ul>
            </section>
            <section>
              <h3>クラブの管理者が見られないもの</h3>
              <p>生徒が自分で記録した勉強の内容。ほかの生徒に、名前や記録が表示されることもありません。</p>
            </section>
            <section>
              <h3>公式LINE からの連絡</h3>
              <p>
                学習の様子に合わせて、NOBIT! 公式LINE から学習に関する連絡が届くことがあります（運営が手作業で送るもの、今後は自動で送るもの）。連絡はアプリの設定でいつでも止められます。
              </p>
            </section>
            <section>
              <h3>記録の扱い</h3>
              <p>記録は学習の支援のためだけに使います。削除のご依頼は［問い合わせ先］までご連絡ください。提供：［会社名］</p>
            </section>
          </div>
          <label className="r-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            保護者が内容を確認し、同意しました
          </label>
          <button className="s-primary" disabled={!agreed} onClick={() => setStep(2)}>
            同意して次へ
          </button>
        </>
      ) : (
        <>
          <h1 className="r-title">あなたのこと</h1>
          <p className="r-lead">{club} の管理者が、所属を確かめるときに使います。</p>
          <fieldset className="field">
            <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>学年</legend>
            <div className="chips">
              {GRADES.map((g) => (
                <button key={g} type="button" className="chip" aria-pressed={grade === g} onClick={() => setGrade(g)}>
                  {g}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>表示名</span>
            <input type="text" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
            <small>クラブの管理者と運営に表示されます。ほかの生徒には表示されません。</small>
          </label>
          {error && <p className="s-error" role="alert">{error}</p>}
          <button className="s-primary" disabled={!grade || !name.trim() || sending} onClick={submit}>
            {sending ? "送っています" : "登録する"}
          </button>
          <button className="s-link" onClick={() => setStep(1)}>同意の内容に戻る</button>
        </>
      )}
    </main>
  );
}

export function Waiting({ clubName, onReload }: { clubName: string; onReload: () => Promise<void> }) {
  const [friend, setFriend] = useState<boolean | null>(null);
  useEffect(() => {
    isFriend().then(setFriend);
  }, []);
  const friendUrl = addFriendUrl();
  return (
    <main className="s-app">
      <div className="r-wait">
        <h1 className="r-title">承認を待っています</h1>
        <p className="r-lead">{clubName} の管理者が承認すると、ここから記録を始められます。</p>
        <button className="s-primary" onClick={() => onReload()}>もう一度確かめる</button>
        {friend === false && friendUrl && (
          <p style={{ marginTop: 20, fontSize: 14 }}>
            NOBIT! 公式LINE を友だち追加すると、学習の連絡を受け取れます。
            <br />
            <a href={friendUrl}>公式LINE を友だち追加する</a>
          </p>
        )}
      </div>
    </main>
  );
}
