import { CircleArrowDown } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { UpdateApi } from '../useUpdate'

interface UpdateNoticeProps {
  updates: UpdateApi
  open: boolean
  onOpen: (open: boolean) => void
  stopwatchRunning: boolean
}

// "New update", at the top right of the window whenever GitHub has a newer release, on every page.
// It opens a card with the version and the release notes; updating from there downloads the new
// copy, swaps it in and restarts. While that runs the button shows how far along it is.
export function UpdateNotice({ updates, open, onOpen, stopwatchRunning }: UpdateNoticeProps) {
  const { update, progress, version } = updates
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, onOpen])

  if (!update) return null
  const percent = Math.round((progress?.fraction ?? 0) * 100)
  const status = !progress ? null
    : progress.phase === 'downloading' ? `Downloading ${percent}%`
    : progress.phase === 'installing' ? 'Installing…'
    : 'Restarting…'
  const notes = cleanNotes(update.notes ?? '')

  return (
    <div className="update-notice" ref={root}>
      <button
        className={`update-pill ${progress ? 'is-busy' : ''}`}
        style={{ '--progress': `${percent}%` } as React.CSSProperties}
        onClick={() => onOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={status ?? `Knot ${update.version} is available`}
      >
        <CircleArrowDown size={15} strokeWidth={2.2} />
        <span>{status ?? 'New update'}</span>
      </button>
      {open && (
        <div className="update-card" role="dialog" aria-label={`Knot ${update.version} is available`}>
          <div className="update-card-head">
            <h2>Knot {update.version} is available</h2>
            {version && <span>You have {version}</span>}
          </div>
          {notes && <ReleaseNotes text={notes} />}
          <p className="update-card-note">
            Knot restarts to finish updating.{stopwatchRunning ? ' Your running stopwatch keeps counting.' : ''}
          </p>
          {progress ? (
            <div className="update-card-progress" role="status">
              <span>{status}</span>
              <i style={{ '--progress': `${progress.phase === 'downloading' ? percent : 100}%` } as React.CSSProperties} />
            </div>
          ) : (
            <div className="update-card-actions">
              <button className="secondary-button" onClick={() => onOpen(false)}>Later</button>
              <button className="primary-button" onClick={updates.install}>Update and restart</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// The notes GitHub writes on its own ("Full Changelog: <link>") say nothing to someone updating.
function cleanNotes(text: string) {
  return text.split(/\r?\n/).filter((line) => !/^\s*\*\*Full Changelog\*\*/i.test(line)).join('\n').trim()
}

// Release notes are short Markdown: paragraphs, headings and "- " bullets, with **bold** and `code`.
// Drawn as plain text and lists; links keep only their words.
function ReleaseNotes({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let paragraph: string[] = []
  let items: string[] = []
  const endParagraph = () => {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '))}</p>)
    paragraph = []
  }
  const endList = () => {
    if (items.length) blocks.push(<ul key={blocks.length}>{items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>)
    items = []
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (bullet) {
      endParagraph()
      items.push(bullet[1])
    } else if (heading) {
      endParagraph()
      endList()
      blocks.push(<p key={blocks.length} className="is-heading">{inline(heading[1])}</p>)
    } else if (!line) {
      endParagraph()
      endList()
    } else if (items.length && /^\s{2,}/.test(raw)) {
      items[items.length - 1] += ` ${line}` // a bullet wrapped onto the next line
    } else {
      endList()
      paragraph.push(line)
    }
  }
  endParagraph()
  endList()
  return <div className="update-notes">{blocks}</div>
}

function inline(text: string) {
  const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]+)`/g, '$1')
  return plain.split(/\*\*(.+?)\*\*/g).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)
}
