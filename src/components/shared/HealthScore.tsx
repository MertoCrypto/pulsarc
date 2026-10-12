import { healthLabel, type Health } from '@/lib/health'

export { computeHealth, type Health, type HealthParts } from '@/lib/health'

export function HealthScore({ health, size = 'md' }: { health: Health; size?: 'sm' | 'md' }) {
  const r = 22
  const circumference = 2 * Math.PI * r
  const dim = size === 'sm' ? 44 : 64

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: dim, height: dim }}>
        <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90">
          <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(170,196,234,0.14)" strokeWidth="2" />
          <circle
            cx="26" cy="26" r={r} fill="none" stroke="var(--periwinkle)" strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${(health.score / 100) * circumference} ${circumference}`}
            style={{ transition: 'stroke-dasharray .8s cubic-bezier(.22,1,.36,1)' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[15px] tabular-nums text-white">{health.score}</span>
      </div>
      <div>
        <p className="text-[15px] text-white">{healthLabel(health.score)}</p>
        <p className="arc-eyebrow !text-[10px]">Health score</p>
      </div>
      {size === 'md' && (
        <dl className="ml-2 hidden gap-5 sm:flex">
          {([
            ['Activity', health.parts.activity, 40],
            ['Breadth', health.parts.breadth, 30],
            ['Consistency', health.parts.consistency, 30],
          ] as const).map(([name, value, max]) => (
            <div key={name}>
              <dt className="arc-eyebrow !text-[9px] !tracking-[0.16em]">{name}</dt>
              <dd className="mt-1 text-sm tabular-nums text-[var(--muted)]">{Math.round(value)}<span className="text-[var(--faint)]"> / {max}</span></dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
