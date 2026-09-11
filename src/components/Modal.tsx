import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { palette } from '../data'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
}

export function CreateListModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, color: string) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(palette[0])
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  useEscape(onClose)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-list-title" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate(name.trim(), color) }}>
        <button type="button" className="modal-close icon-button" onClick={onClose} aria-label="Close create-list dialog"><X size={17} /></button>
        <h2 id="create-list-title">New list</h2>
        <p>Pick a name and a colour. Tasks can move between lists at any time.</p>
        <label className="modal-field"><span>Name</span><input ref={input} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="List name" /></label>
        <div className="color-picker" aria-label="List color">{palette.map((option, index) => <button type="button" key={option} className={color === option ? 'active' : ''} style={{ background: option }} onClick={() => setColor(option)} aria-label={`Color ${index + 1}`} aria-pressed={color === option}>{color === option && <Check size={14} />}</button>)}</div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!name.trim()}>Create list</button></div>
      </form>
    </div>
  )
}

export function RenameListModal({ initialName, onClose, onRename }: { initialName: string; onClose: () => void; onRename: (name: string) => void }) {
  const [name, setName] = useState(initialName)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  useEscape(onClose)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="rename-list-title" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onRename(name.trim()) }}>
        <button type="button" className="modal-close icon-button" onClick={onClose} aria-label="Close rename dialog"><X size={17} /></button>
        <h2 id="rename-list-title">Rename list</h2>
        <label className="modal-field"><span>List name</span><input ref={input} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!name.trim()}>Save</button></div>
      </form>
    </div>
  )
}

export function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }: { title: string; message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  useEscape(onCancel)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="modal-card compact-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="button" className="danger-button" autoFocus onClick={onConfirm}>{confirmLabel}</button></div>
      </div>
    </div>
  )
}
