import { useEffect, useRef, useState } from 'react'

// A single thread in the app icon's colors frames the sidebar on all four sides. The path
// is built in real pixels so the corners stay true at any sidebar size. It sits just inside
// the window's own rim, and its glow is clipped to the inside so the rim stays crisp. See DESIGN.md →
// "Sidebar thread".
const INSET = 2.5
const RADIUS = 8.5
const STROKE = 1.5

function frame(width: number, height: number, inset = INSET, radius = RADIUS) {
  const i = inset
  const r = radius
  const right = width - i
  const bottom = height - i
  // Clockwise from the top edge: down the right side, along the bottom, up the left side,
  // across the top, with all four corners rounded.
  return `M${right - r} ${i} A${r} ${r} 0 0 1 ${right} ${i + r} V${bottom - r} A${r} ${r} 0 0 1 ${right - r} ${bottom} H${i + r} A${r} ${r} 0 0 1 ${i} ${bottom - r} V${i + r} A${r} ${r} 0 0 1 ${i + r} ${i} Z`
}

export function SidebarThread() {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    const observer = new ResizeObserver(() => setSize({ width: host.clientWidth, height: host.clientHeight }))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const { width, height } = size
  if (!width || !height) return <svg ref={ref} className="sidebar-thread" width={0} height={0} aria-hidden="true" />
  const d = frame(width, height)
  // Everything outside the thread is painted in the content ground so the sidebar tint never
  // shows in the sliver between the rounded frame and the window or content edge.
  const outside = `M0 0 H${width} V${height} H0 Z ${frame(width, height, INSET - STROKE / 2, RADIUS + STROKE / 2)}`

  return (
    <svg ref={ref} className="sidebar-thread" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id="knot-thread" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={height}>
          <stop offset="0" stopColor="var(--knot-1)" />
          <stop offset="0.16" stopColor="var(--knot-2)" />
          <stop offset="0.34" stopColor="var(--knot-3)" />
          <stop offset="0.56" stopColor="var(--knot-4)" />
          <stop offset="0.78" stopColor="var(--knot-5)" />
          <stop offset="1" stopColor="var(--knot-6)" />
        </linearGradient>
        <filter id="knot-soft" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <filter id="knot-glow" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <clipPath id="knot-inside"><path d={d} /></clipPath>
      </defs>
      <path className="sidebar-thread-outside" d={outside} fillRule="evenodd" />
      <g clipPath="url(#knot-inside)">
        <path className="sidebar-thread-glow" d={d} stroke="url(#knot-thread)" filter="url(#knot-glow)" />
      </g>
      <path className="sidebar-thread-line" d={d} stroke="url(#knot-thread)" />
      <path className="sidebar-thread-pulse sidebar-thread-pulse-trail" d={d} pathLength={1} filter="url(#knot-glow)" />
      <path className="sidebar-thread-pulse sidebar-thread-pulse-head" d={d} pathLength={1} filter="url(#knot-soft)" />
    </svg>
  )
}
