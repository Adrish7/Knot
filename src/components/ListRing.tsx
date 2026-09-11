// A list's colour mark: a ring in the list colour that fills like a pie as tasks get completed.
export function ListRing({ color, progress = 0, className = '' }: { color: string; progress?: number; className?: string }) {
  const clamped = Math.max(0, Math.min(1, progress))
  const pieRadius = 2.6
  const pieCircumference = 2 * Math.PI * pieRadius
  return (
    <svg className={`list-ring ${className}`} viewBox="0 0 16 16" style={{ color }} aria-hidden="true">
      <circle className="ring-track" cx="8" cy="8" r="6.5" />
      {clamped > 0 && (
        <circle
          className="ring-fill"
          cx="8"
          cy="8"
          r={pieRadius}
          strokeDasharray={`${pieCircumference * clamped} ${pieCircumference}`}
          transform="rotate(-90 8 8)"
        />
      )}
    </svg>
  )
}

export function listProgress(open: number, done: number) {
  const total = open + done
  return total === 0 ? 0 : done / total
}
