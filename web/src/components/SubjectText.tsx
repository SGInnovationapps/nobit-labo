import type { Subject } from "../lib/types";
import { subjectLabel } from "../lib/format";

/** 教科は文字を教科色で示す。内容を伏せる場合は「自由登録」と出す */
export function SubjectText({ subject, hiddenLabel = "自由登録" }: { subject: Subject | null; hiddenLabel?: string }) {
  if (!subject) return <span className="subject hidden">{hiddenLabel}</span>;
  return <span className={`subject ${subject}`}>{subjectLabel(subject)}</span>;
}
