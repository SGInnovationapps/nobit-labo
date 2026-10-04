import { atLeast } from "../lib/config";
import { durationLabel } from "../lib/format";
import type { DayTask, StudyResult, StudyStatus } from "../lib/types";
import { Sheet } from "../components/Sheet";
import { SubjectText } from "../components/SubjectText";

function reasonText(r: StudyResult, cfg: StudyStatus["config"]) {
  switch (r.end_reason) {
    case "app_closed":
      return "アプリを閉じたので、閉じた時刻で止めました。";
    case "idle":
      return `画面が消えたまま${cfg.idle_minutes}分たったので、最後に画面が開いていた ${r.ended_time} で止めました。`;
    case "time_limit":
      return `始めてから${cfg.max_minutes >= 60 ? `${cfg.max_minutes / 60}時間` : `${cfg.max_minutes}分`}たったので、自動で止めました。`;
    default:
      return null;
  }
}

// 勉強タイマーの記録。勉強したタスクがあれば、ここから完了にできる。
export function StudyResultSheet({ result, config, openTasks, busy, onComplete, onClose }: {
  result: StudyResult;
  config: StudyStatus["config"];
  openTasks: DayTask[];
  busy: string | null;
  onComplete: (t: DayTask) => void;
  onClose: () => void;
}) {
  const reason = reasonText(result, config);
  return (
    <Sheet label="勉強の記録" onClose={onClose}>
      <h2>勉強を記録しました</h2>
      <div className="sr-time num">{durationLabel(result.seconds)}</div>
      <p className="sr-range"><span className="num">{result.started_time}</span> 〜 <span className="num">{result.ended_time}</span></p>
      {reason && <p className="sr-reason">{reason}</p>}
      <div className="c-facts">
        <span>今日<span className="num">{durationLabel(result.day.seconds)}</span></span>
        <span><span className="num">{result.day.blocks}</span>ブロック</span>
        {atLeast(2) && result.coins > 0 && (
          <span className="c-coins">コイン<span className="num">+{result.coins}</span></span>
        )}
      </div>
      {openTasks.length > 0 && (
        <div className="sr-tasks">
          <p className="sr-tasks-head">終わったタスクがあれば、完了にできます</p>
          {openTasks.slice(0, 4).map((t) => (
            <div key={t.id} className="s-task">
              <SubjectText subject={t.subject} />
              <div className="s-task-title">{t.title}</div>
              <button className="s-done-btn" disabled={busy !== null} onClick={() => onComplete(t)} aria-label={`${t.title}を完了にする`}>
                {busy === t.id ? "記録中" : "完了"}
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="s-primary" style={{ marginTop: 20 }} onClick={onClose} autoFocus>閉じる</button>
    </Sheet>
  );
}
