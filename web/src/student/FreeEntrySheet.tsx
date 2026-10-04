import { useState } from "react";
import { newRequestId, rpc } from "../lib/api";
import { SUBJECTS } from "../lib/format";
import type { Completion, Subject } from "../lib/types";
import { Sheet } from "../components/Sheet";

/** やった勉強を記録する（自由登録）。記録した時点で完了になる */
export function FreeEntrySheet({ remaining, onClose, onDone }: {
  remaining: number;
  onClose: () => void;
  onDone: (c: Completion) => Promise<void>;
}) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [title, setTitle] = useState("");
  const [requestId] = useState(newRequestId); // 送り直しても1件だけ記録する
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!subject) return;
    setSending(true);
    setError(null);
    try {
      const c = await rpc<Completion>("add_free_task", { p_subject: subject, p_title: title.trim(), p_request_id: requestId });
      await onDone({ ...c, title: c.title ?? title.trim(), subject: c.subject ?? subject });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  };

  return (
    <Sheet label="やった勉強を記録する" onClose={onClose}>
      <h2>やった勉強を記録する</h2>
      <fieldset className="field">
        <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>教科</legend>
        <div className="chips">
          {SUBJECTS.map((s) => (
            <button key={s.code} type="button" className="chip" aria-pressed={subject === s.code} onClick={() => setSubject(s.code)}>
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>やったこと</span>
        <input type="text" value={title} maxLength={40} placeholder="例：英単語 20個" onChange={(e) => setTitle(e.target.value)} />
        <small>今日はあと{remaining}件記録できます。内容はクラブの管理者には表示されません。</small>
      </label>
      {error && <p className="s-error" role="alert">{error}</p>}
      <button className="s-primary" disabled={!subject || !title.trim() || sending} onClick={submit}>
        {sending ? "記録しています" : "記録する"}
      </button>
    </Sheet>
  );
}
