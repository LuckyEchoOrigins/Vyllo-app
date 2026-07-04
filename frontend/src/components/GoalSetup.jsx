import { useState } from 'react'
import { createPortal } from 'react-dom'
import CategoryIcon from './CategoryIcon'
import { CAT_COLOR, saveYearGoals, getYearGoals } from '../utils'
import { useLang } from '../i18n'

export default function GoalSetup({ enabledCats, onClose, onSave }) {
  const { t } = useLang()
  const year = new Date().getFullYear()
  const [goals, setGoals] = useState(() => getYearGoals())

  const catLabel = (cat) => cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film')
  const catPlural = (cat) => cat === 'book' ? t('goal_setup.books_per_year') : cat === 'game' ? t('goal_setup.games_per_year') : t('goal_setup.films_per_year')

  const adjust = (cat, delta) => {
    setGoals(prev => {
      const next = { ...prev }
      const val = Math.max(0, (prev[cat] || 0) + delta)
      if (val > 0) next[cat] = val
      else delete next[cat]
      return next
    })
  }

  const set = (cat, raw) => {
    const n = Math.max(0, parseInt(raw) || 0)
    setGoals(prev => {
      const next = { ...prev }
      if (n > 0) next[cat] = n
      else delete next[cat]
      return next
    })
  }

  const save = () => {
    saveYearGoals(goals)
    onSave(goals)
    window.dispatchEvent(new CustomEvent('vyllo-goals'))
    onClose()
  }

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, zIndex: 350, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', animation: 'fadeIn 0.22s ease both' }} />

      <div style={{
        position: 'relative', background: 'var(--bg)', borderRadius: '22px 22px 0 0',
        animation: 'slideUp 0.35s cubic-bezier(.22,1,.36,1) both',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--surface-2)', margin: '12px auto 0' }} />

        <div style={{ padding: '16px 20px 8px' }}>
          <h2 style={{ fontSize: 19 }}>{t('goal_setup.title', { year })}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {t('goal_setup.subtitle')}
          </p>
        </div>

        <div style={{ padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {enabledCats.map(cat => (
            <div key={cat} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--surface)', borderRadius: 16, padding: '14px 16px',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: `color-mix(in srgb, var(--cat-${cat}, var(--accent)) 13%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: `var(--cat-${cat}, var(--accent))`,
              }}>
                <CategoryIcon cat={cat} size={22} strokeWidth={2.1} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{catLabel(cat)}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{catPlural(cat)}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => adjust(cat, -1)}
                  style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', border: 'none', cursor: 'pointer', fontSize: 20, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  −
                </button>
                <input
                  type="number" min="0" max="9999"
                  value={goals[cat] || ''}
                  placeholder="0"
                  onChange={e => set(cat, e.target.value)}
                  style={{ width: 52, textAlign: 'center', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', fontSize: 17, fontWeight: 900, fontFamily: 'Nunito', padding: '6px 4px', outline: 'none' }}
                />
                <button
                  onClick={() => adjust(cat, 1)}
                  style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', border: 'none', cursor: 'pointer', fontSize: 20, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 20px 36px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={save} style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
            color: 'white', fontSize: 15, fontWeight: 900, fontFamily: 'Nunito',
            background: 'var(--accent)',
          }}>
            {t('goal_setup.save')}
          </button>
          <button onClick={onClose} style={{
            width: '100%', padding: '10px 0', background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
          }}>
            {t('goal_setup.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('root')
  )
}
