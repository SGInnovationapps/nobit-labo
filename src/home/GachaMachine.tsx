type Props = {
  /** 演出中：機械が揺れて、ハンドルが回る */
  shaking?: boolean
}

const CAPSULES: ReadonlyArray<{ x: number; y: number; c: string; s?: number }> = [
  { x: 22, y: 96, c: 'var(--coral)' }, { x: 62, y: 116, c: 'var(--mint)' }, { x: 104, y: 104, c: 'var(--yellow)' },
  { x: 140, y: 120, c: 'var(--purple)' }, { x: 40, y: 136, c: 'var(--purple)' }, { x: 84, y: 146, c: 'var(--coral)' },
  { x: 126, y: 150, c: 'var(--mint)' }, { x: 70, y: 70, c: 'var(--mint)', s: 36 }, { x: 112, y: 66, c: 'var(--coral)', s: 36 },
]

/** ガチャの機械（画像ではなく図形で描く）。飾りなので読み上げない */
export function GachaMachine({ shaking = false }: Props) {
  return (
    <div className={shaking ? 'gm is-shaking' : 'gm'} aria-hidden="true">
      <div className="gm-dome">
        {CAPSULES.map((k, i) => (
          <span key={i} className="gm-cap" style={{ left: k.x, top: k.y, width: k.s ?? 40, height: k.s ?? 40, background: `linear-gradient(${k.c} 0 50%, #ffffff 50% 100%)` }} />
        ))}
        <span className="gm-shine" />
      </div>
      <div className="gm-body">
        <div className="gm-handle"><span /></div>
        <div className="gm-outlet" />
      </div>
    </div>
  )
}
