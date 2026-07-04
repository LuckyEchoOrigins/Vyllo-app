import { useState } from 'react'
import { createPortal } from 'react-dom'
import { getLists, getListsForItem, toggleItemInList, createList } from '../utils'
import { useLang } from '../i18n'

export default function AddToListSheet({ item, onClose }) {
  const { t } = useLang()
  const [lists, setLists] = useState(getLists())
  const [newName, setNewName] = useState('')
  const inLists = new Set(getListsForItem(item.id))

  const refresh = () => { setLists(getLists()); }

  const toggle = (id) => { toggleItemInList(id, item.id); refresh() }

  const create = () => {
    const name = newName.trim()
    if (!name) return
    const l = createList(name)
    toggleItemInList(l.id, item.id)
    setNewName('')
    refresh()
  }

  return createPortal(
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'absolute', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', animation: 'fadeIn 0.2s ease both' }}>
      <div style={{ width: '100%', maxHeight: '70%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '8px 0 20px', animation: 'slideUp 0.28s ease both' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '6px auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 10px' }}>
          <h2 style={{ fontSize: 17 }}>{t('add_to_list.title')}</h2>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: 20, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Criar nova lista */}
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 12px' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            placeholder={t('add_to_list.placeholder')}
            style={{ flex: 1 }}
          />
          <button onClick={create} disabled={!newName.trim()}
            style={{ background: newName.trim() ? 'var(--accent)' : 'var(--surface-2)', color: newName.trim() ? 'white' : 'var(--text-muted)', borderRadius: 12, padding: '0 16px', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito' }}>
            {t('add_to_list.create')}
          </button>
        </div>

        {/* Lista de listas */}
        <div style={{ overflowY: 'auto', padding: '0 20px' }}>
          {lists.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 10px', lineHeight: 1.5 }}>
              {t('add_to_list.empty')}
            </p>
          ) : lists.map(l => {
            const on = inLists.has(l.id)
            return (
              <button key={l.id} onClick={() => toggle(l.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 4px', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                  border: `2px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  background: on ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{l.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{l.itemIds.length}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.getElementById('root')
  )
}
