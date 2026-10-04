import type { CSSProperties } from "react";
import type { StripDay } from "../lib/types";
import { shortDate } from "../lib/format";

type Props = {
  days: StripDay[];
  today: string;
  height?: number;
  gap?: number;
  axis?: [string, string];
  className?: string;
};

/** 記録の帯：日ごとの完了タスク数を4段階の高さで並べる。休息日は紫、今日は枠。 */
export function RecordStrip({ days, today, height = 56, gap = 3, axis, className }: Props) {
  const done = days.filter((d) => d.n > 0).length;
  const rest = days.filter((d) => d.n === 0 && d.rest).length;
  const label = `直近${days.length}日のうち、記録した日 ${done}日、休息日 ${rest}日`;
  return (
    <div className={className}>
      <div className="strip" style={{ "--h": `${height}px`, "--gap": `${gap}px` } as CSSProperties} role="img" aria-label={label}>
        {days.map((day) => {
          const lv = Math.min(day.n, 3);
          const rested = day.n === 0 && day.rest;
          return (
            <span key={day.d} className={`strip-day${day.d === today ? " is-today" : ""}`} title={`${shortDate(day.d)} ${day.n > 0 ? `${day.n}件` : rested ? "休息日" : "記録なし"}`}>
              <span className={`strip-bar lv${lv}${rested ? " rest" : ""}`} />
            </span>
          );
        })}
      </div>
      {axis && (
        <div className="strip-axis" aria-hidden="true">
          <span>{axis[0]}</span>
          <span>{axis[1]}</span>
        </div>
      )}
    </div>
  );
}
