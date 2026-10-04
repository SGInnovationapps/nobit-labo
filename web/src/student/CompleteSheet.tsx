import { useEffect, useMemo, useState } from "react";
import { atLeast } from "../lib/config";
import type { Completion } from "../lib/types";
import { RecordStrip } from "../components/RecordStrip";
import { SubjectText } from "../components/SubjectText";
import { Sheet } from "../components/Sheet";

// 02 タスク完了の瞬間：ノビット、完了時刻、今日の棒が伸びる記録の帯
export function CompleteSheet({ completion, today, onClose }: { completion: Completion; today: string; onClose: () => void }) {
  const strip = useMemo(() => completion.strip ?? [], [completion.strip]);
  const before = useMemo(
    () => strip.map((d) => (d.d === today ? { ...d, n: Math.max(0, d.n - 1) } : d)),
    [strip, today],
  );
  const [shown, setShown] = useState(before);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(strip), 120);
    return () => window.clearTimeout(id);
  }, [strip]);

  return (
    <Sheet label="タスク完了" onClose={onClose}>
      <div className="c-head">
        <img src="/nobit/complete.png" alt="ノビット" width={90} height={96} />
        <div>
          <div className="c-time">{completion.completed_time}</div>
          <div className="c-time-label">に記録しました</div>
        </div>
      </div>
      <p className="c-task">
        {completion.subject && <SubjectText subject={completion.subject} />}
        <br />
        {completion.title}
      </p>
      <div className="c-facts">
        <span>今日<span className="num">{completion.today_count}</span>件目</span>
        <span>連続<span className="num">{completion.streak}</span>日</span>
        {atLeast(2) && completion.coins > 0 && (
          <span className="c-coins">コイン<span className="num">+{completion.coins}</span></span>
        )}
      </div>
      <RecordStrip className="c-strip" days={shown} today={today} height={48} axis={["30日前", "今日"]} />
      <button className="s-primary" onClick={onClose} autoFocus>
        閉じる
      </button>
    </Sheet>
  );
}
