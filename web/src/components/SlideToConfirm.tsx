import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Props = {
  label: string;
  onConfirm: () => void | Promise<void>;
  tone?: "start" | "end";
  disabled?: boolean;
};

/**
 * スライドして操作するボタン（勉強タイマーの開始と終了）。
 * 机に置いたまま誤って触れても動かないよう、右端まで滑らせたときだけ確定する。
 * キーボードでは Enter / Space で確定できる。
 */
export function SlideToConfirm({ label, onConfirm, tone = "start", disabled }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLButtonElement>(null);
  const origin = useRef(0);
  const max = useRef(0);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setX(0);
    }
  };

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (busy || disabled || !track.current || !knob.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    max.current = track.current.clientWidth - knob.current.offsetWidth - 8;
    origin.current = e.clientX - x;
    setDragging(true);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setX(Math.min(Math.max(e.clientX - origin.current, 0), max.current));
  };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    if (x >= max.current * 0.88) {
      setX(max.current);
      confirm();
    } else {
      setX(0);
    }
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      confirm();
    }
  };

  return (
    <div className={`slide ${tone}${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`} ref={track}>
      <span className="slide-fill" style={{ width: `calc(${x}px + 52px)` }} aria-hidden="true" />
      <span className="slide-label" aria-hidden="true" style={{ opacity: max.current ? 1 - x / max.current : 1 }}>
        {busy ? "記録しています" : label}
      </span>
      <button
        ref={knob}
        type="button"
        className="slide-knob"
        style={{ transform: `translateX(${x}px)` }}
        aria-label={`${label}（Enter キーでも操作できます）`}
        disabled={disabled || busy}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          setDragging(false);
          setX(0);
        }}
        onKeyDown={key}
      >
        <span className="slide-chevron" aria-hidden="true" />
      </button>
    </div>
  );
}
