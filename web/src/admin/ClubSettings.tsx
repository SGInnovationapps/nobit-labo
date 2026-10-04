import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { rpc } from "../lib/api";
import { atLeast, inviteUrl } from "../lib/config";
import { dateLabel, jstDateTime } from "../lib/format";
import type { ClubSettings } from "../lib/types";
import { ClubPicker, useAdmin } from "./AdminApp";

// 14 クラブ設定（招待QR・所属承認・クラブ管理者・大会日程）
export function ClubSettingsPage() {
  const { me, clubId, refreshMe, setClubId } = useAdmin();
  const op = me.role === "operator";
  const [s, setS] = useState<ClubSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return setS(null);
    try {
      setS(await rpc<ClubSettings>("admin_club_settings", { p_club_id: clubId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clubId]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: string, args: Record<string, unknown>) => {
    setError(null);
    try {
      await rpc(fn, args);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="a-head">
        <h1>クラブ設定</h1>
        <ClubPicker />
      </header>
      {error && <p className="error-line" role="alert">{error}</p>}
      {op && (
        <NewClub
          onCreated={async (id) => {
            await refreshMe();
            setClubId(id);
          }}
        />
      )}
      {s && (
        <div className="s-grid" style={{ marginTop: 16 }}>
          <div>
            {op && s.club.invite_code && (
              <InviteQr
                clubName={s.club.name}
                code={s.club.invite_code}
                onRegenerate={() => {
                  if (window.confirm("招待コードを作り直すと、配ったQRは使えなくなります。作り直しますか？"))
                    run("admin_regenerate_invite", { p_club_id: s.club.id });
                }}
              />
            )}
            <section className="panel">
              <h2>所属している生徒</h2>
              <span className="num" style={{ fontSize: 36, fontWeight: 800 }}>{s.students}</span> 人
            </section>
          </div>
          <div>
            <section className="panel">
              <h2>所属の承認 <small>招待QRから申し込んだ生徒</small></h2>
              {s.pending.length === 0 && <p className="muted">承認を待っている生徒はいません。</p>}
              {s.pending.map((p) => (
                <div key={p.member_id} className="p-row">
                  <div>
                    <b>{p.display_name}</b> <span className="muted">{p.grade}</span>
                    <br />
                    <small className="muted">
                      申し込み {jstDateTime(p.applied_at)}　保護者の同意 {p.consented_at ? jstDateTime(p.consented_at) : "なし"}
                    </small>
                  </div>
                  <div className="btn-row">
                    <button className="btn primary" onClick={() => run("admin_decide_member", { p_member_id: p.member_id, p_approve: true })}>承認する</button>
                    <button className="btn quiet" onClick={() => run("admin_decide_member", { p_member_id: p.member_id, p_approve: false })}>承認しない</button>
                  </div>
                </div>
              ))}
            </section>

            <section className="panel">
              <h2>クラブ管理者</h2>
              {s.admins.length === 0 && <p className="muted">まだクラブ管理者がいません。</p>}
              {s.admins.map((a) => (
                <div key={a.user_id} className="p-row">
                  <div>
                    <b>{a.display_name}</b>　<span className="muted">{a.email}</span>
                    <br />
                    <small className="muted">{a.signed_in ? "ログイン済み" : "まだログインしていません"}</small>
                  </div>
                  {op && (
                    <button
                      className="btn quiet"
                      onClick={() => {
                        if (window.confirm(`${a.display_name}さんをこのクラブの管理者から外しますか？`))
                          run("admin_remove_club_admin", { p_club_id: s.club.id, p_user_id: a.user_id });
                      }}
                    >
                      外す
                    </button>
                  )}
                </div>
              ))}
              {op && <AddAdmin onAdd={(email, name) => run("admin_add_club_admin", { p_club_id: s.club.id, p_email: email, p_display_name: name })} />}
            </section>

            {atLeast(2) && (
              <Events
                events={s.events}
                onAdd={(kind, title, start, end) =>
                  run("admin_add_event", { p_club_id: s.club.id, p_kind: kind, p_title: title, p_starts_on: start, p_ends_on: end })
                }
                onDelete={(id) => run("admin_delete_event", { p_event_id: id })}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function InviteQr({ clubName, code, onRegenerate }: { clubName: string; code: string; onRegenerate: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const url = inviteUrl(code);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    QRCode.toCanvas(el, url, { width: 440, margin: 2, color: { dark: "#1F2B45", light: "#FFFFFF" } }).then(() => {
      el.style.width = "220px";
      el.style.height = "220px";
    });
  }, [url]);
  const save = () => {
    const a = document.createElement("a");
    a.href = canvas.current?.toDataURL("image/png") ?? "";
    a.download = `NOBIT_招待QR_${clubName}.png`;
    a.click();
  };
  return (
    <section className="panel qr">
      <h2>招待QR</h2>
      <canvas ref={canvas} aria-label={`${clubName}の招待QR`} />
      <code>{url}</code>
      <p className="note">読み取るとミニアプリが開き、LINE ログインのあと、このクラブへの申し込みになります。公式LINE の友だち追加もその場で案内されます。</p>
      <div className="btn-row">
        <button className="btn primary" onClick={save}>QRを保存</button>
        <button className="btn quiet" onClick={onRegenerate}>コードを作り直す</button>
      </div>
    </section>
  );
}

function NewClub({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const create = async () => {
    const c = await rpc<{ id: string }>("admin_create_club", { p_name: name.trim() });
    setName("");
    await onCreated(c.id);
  };
  return (
    <section className="panel">
      <div className="inline-form stack" style={{ display: "flex" }}>
        <label style={{ flex: 1, minWidth: 220 }}>
          クラブを追加する
          <input value={name} maxLength={60} placeholder="クラブ名" onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary" style={{ minHeight: 40 }} disabled={!name.trim()} onClick={create}>追加する</button>
      </div>
    </section>
  );
}

function AddAdmin({ onAdd }: { onAdd: (email: string, name: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="stack" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <div className="inline-form">
        <label style={{ flex: 1, minWidth: 200 }}>
          メールアドレス
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 140 }}>
          表示名
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="［管理者名］" />
        </label>
        <button
          className="btn primary"
          style={{ minHeight: 40 }}
          disabled={!email.includes("@") || !name.trim()}
          onClick={async () => {
            await onAdd(email.trim(), name.trim());
            setEmail("");
            setName("");
          }}
        >
          追加する
        </button>
      </div>
      <p className="note">追加した人は、このメールアドレスで管理画面にログインすると、このクラブだけを見られます。</p>
    </div>
  );
}

function Events({ events, onAdd, onDelete }: {
  events: ClubSettings["events"];
  onAdd: (kind: string, title: string, start: string, end: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState("大会");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <section className="panel">
      <h2>大会・遠征・合宿日 <small>［仮］生徒全員の休息日になり、休息チケットは使いません</small></h2>
      {events.map((e) => (
        <div key={e.id} className="p-row">
          <div>
            <b>{e.kind}</b>　{e.title}
            <br />
            <small className="muted">{dateLabel(e.starts_on)}{e.ends_on !== e.starts_on && `〜${dateLabel(e.ends_on)}`}</small>
          </div>
          <button className="btn quiet" onClick={() => onDelete(e.id)}>削除</button>
        </div>
      ))}
      <div className="inline-form stack" style={{ display: "flex", marginTop: 12 }}>
        <label>
          種類
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option>大会</option><option>遠征</option><option>合宿</option>
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 140 }}>
          名前
          <input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="［大会名］" />
        </label>
        <label>
          開始日
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          終了日
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button
          className="btn primary"
          style={{ minHeight: 40 }}
          disabled={!start}
          onClick={async () => {
            await onAdd(kind, title, start, end || start);
            setTitle("");
            setStart("");
            setEnd("");
          }}
        >
          登録する
        </button>
      </div>
    </section>
  );
}
