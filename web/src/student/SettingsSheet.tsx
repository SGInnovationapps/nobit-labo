import { useEffect, useState } from "react";
import { rpc } from "../lib/api";
import { addFriendUrl } from "../lib/config";
import { isFriend } from "../lib/liff";
import { Sheet } from "../components/Sheet";

/** LINE への連絡を止める・受け取る（将来の自動送信もこの設定に従う） */
export function SettingsSheet({ optIn, onClose, onChanged }: { optIn: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const [value, setValue] = useState(optIn);
  const [friend, setFriend] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    isFriend().then(setFriend);
  }, []);
  const toggle = async () => {
    setSaving(true);
    try {
      setValue(await rpc<boolean>("set_line_contact", { p_opt_in: !value }));
      await onChanged();
    } finally {
      setSaving(false);
    }
  };
  const friendUrl = addFriendUrl();
  return (
    <Sheet label="LINE への連絡の設定" onClose={onClose}>
      <h2>LINE への連絡</h2>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--ink-2)" }}>
        NOBIT! 公式LINE から、学習に関する連絡を受け取るかどうかを選べます。
      </p>
      <div className="toggle-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <b>{value ? "受け取っています" : "止めています"}</b>
        <button className="s-done-btn" onClick={toggle} disabled={saving}>
          {value ? "止める" : "受け取る"}
        </button>
      </div>
      {friend === false && friendUrl && (
        <p style={{ fontSize: 14 }}>
          まだ公式LINE を友だち追加していません。<a href={friendUrl}>友だち追加する</a>
        </p>
      )}
      <button className="s-primary" style={{ marginTop: 20 }} onClick={onClose}>閉じる</button>
    </Sheet>
  );
}
