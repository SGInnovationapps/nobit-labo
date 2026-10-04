import { useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "../lib/api";
import { atLeast } from "../lib/config";
import { clockLabel, durationLabel } from "../lib/format";
import { endStudyOnClose, keepScreenOn } from "../lib/study";
import type { StudyResult, StudyStatus } from "../lib/types";
import { SlideToConfirm } from "../components/SlideToConfirm";

const HEARTBEAT_MS = 60_000;

type Props = {
  status: StudyStatus;
  /** タイマーが止まった（スライド・自動停止のどちらでも） */
  onEnded: (result: StudyResult | null) => void;
};

// 03 勉強タイマー：机に置いて使う。経過時間はサーバーの開始時刻から数える。
export function StudyTimer({ status, onEnded }: Props) {
  const active = status.active!;
  const cfg = status.config;
  const offset = useRef(new Date(status.server_now).getTime() - Date.now()); // サーバーとの時計のずれ
  const startedAt = new Date(active.started_at).getTime();
  const elapsedNow = () => (Date.now() + offset.current - startedAt) / 1000;
  const [elapsed, setElapsed] = useState(elapsedNow);
  const [error, setError] = useState<string | null>(null);
  const ended = useRef(false);

  // サーバーで止まっていないか確かめ、止まっていれば記録を出す
  const resync = useCallback(async () => {
    if (ended.current) return;
    try {
      const s = await rpc<StudyStatus>("study_status");
      if (!s.active || s.active.id !== active.id) {
        ended.current = true;
        onEnded(s.pending_result);
      } else {
        offset.current = new Date(s.server_now).getTime() - Date.now();
      }
    } catch {
      // 通信できないときは表示を続け、次の確認で合わせる
    }
  }, [active.id, onEnded]);

  // 1秒ごとの表示、上限に達したら確認
  useEffect(() => {
    const id = window.setInterval(() => {
      const e = elapsedNow();
      setElapsed(e);
      if (e >= cfg.max_minutes * 60 + 2) resync();
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.max_minutes, resync]);

  // 画面が開いている間は1分ごとに知らせる（アプリを閉じたかどうかの判定に使う）
  useEffect(() => {
    const beat = async () => {
      if (document.visibilityState !== "visible" || ended.current) return;
      try {
        const r = await rpc<{ active: boolean }>("study_heartbeat", { p_session_id: active.id });
        if (!r.active) resync();
      } catch {
        // 次の回で送る
      }
    };
    beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [active.id, resync]);

  // 画面を消さない・戻ってきたら確かめる・アプリを閉じたら止める
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    keepScreenOn().then((l) => (lock = l));
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        keepScreenOn().then((l) => (lock = l));
        resync();
      }
    };
    const onHide = () => {
      if (!ended.current) endStudyOnClose(active.id);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      lock?.release().catch(() => undefined);
    };
  }, [active.id, resync]);

  const end = async () => {
    try {
      const r = await rpc<StudyResult>("end_study", { p_session_id: active.id, p_reason: "manual" });
      ended.current = true;
      onEnded(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const blockSec = cfg.block_minutes * 60;
  const shown = Math.min(elapsed, cfg.max_minutes * 60);
  const dayTotal = active.day.seconds + shown;
  const blocks = Math.min(Math.floor(dayTotal / blockSec), cfg.daily_block_limit);
  const inBlock = dayTotal % blockSec;
  const ticks = Math.floor(inBlock / 60);
  const toNext = Math.ceil((blockSec - inBlock) / 60);
  const capped = blocks >= cfg.daily_block_limit;

  return (
    <div className="timer" role="dialog" aria-modal="true" aria-label="勉強タイマー">
      <div className="timer-top">
        <b>勉強中</b>
        <span><span className="num">{active.started_time}</span> から</span>
      </div>

      <div className="timer-clock num" aria-live="off">{clockLabel(shown)}</div>

      <div className="timer-ticks" role="img" aria-label={`次のブロックまで ${ticks} / ${cfg.block_minutes} 分`}>
        {Array.from({ length: cfg.block_minutes }, (_, i) => (
          <span key={i} className={i < ticks ? "on" : ""} />
        ))}
      </div>
      <div className="timer-block">
        <span>{capped ? "今日の報酬はすべてたまりました" : <>あと<span className="num">{toNext}</span>分で次のブロック</>}</span>
        <span>
          今日<span className="num">{blocks}</span>ブロック
          {atLeast(2) && <span className="timer-coin num">+{blocks * cfg.block_reward}</span>}
        </span>
      </div>

      <dl className="timer-facts">
        <div><dt>今日の勉強時間</dt><dd className="num">{durationLabel(dayTotal)}</dd></div>
      </dl>

      <p className="timer-note">
        画面はつけたままにしてください。アプリを閉じると、その時刻で止めます。画面が消えたまま{cfg.idle_minutes}分たったときと、
        {cfg.max_minutes >= 60 ? `${cfg.max_minutes / 60}時間` : `${cfg.max_minutes}分`}たったとき（消し忘れ防止）も止まります。
      </p>
      {error && <p className="s-error" role="alert">{error}</p>}

      <div className="timer-end">
        <SlideToConfirm label="スライドして終える" tone="end" onConfirm={end} />
      </div>
    </div>
  );
}
