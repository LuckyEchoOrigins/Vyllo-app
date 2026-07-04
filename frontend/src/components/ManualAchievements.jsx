import { useState, useEffect, useRef } from 'react'
import { updateItem, steamDefinitions } from '../api'
import PlatformIcon from './PlatformIcon'
import { SearchToggle, SearchBar } from './AchievementSearch'
import Icon from './Icon'
import { isPremium, openPremium } from '../utils'
import { useLang } from '../i18n'

const PLATFORM_INFO = {
  playstation: { name: 'PlayStation', color: '#2E6BFF' },
  xbox:        { name: 'Xbox',        color: '#107C10' },
  nintendo:    { name: 'Nintendo',    color: '#E60012' },
}

const GRID_GLASS = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
  border: '1px solid var(--item-glass-border)', borderRadius: 14, overflow: 'hidden',
  background: 'var(--item-glass-border)',
  backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
}
const CELL_GLASS = {
  background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
  backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
}

function rarityColor(pct) {
  if (pct == null) return '#8E8EA0'
  if (pct < 2)  return '#FF6B35'
  if (pct < 5)  return '#B44FFF'
  if (pct < 15) return '#4F9EFF'
  if (pct < 35) return '#2DB87A'
  return '#ADADB8'
}

export default function ManualAchievements({ item, onUpdate, platform }) {
  const { t } = useLang()
  const info = PLATFORM_INFO[platform] || PLATFORM_INFO.playstation
  const accent = info.color
  const term = platform === 'playstation' ? t('manual_ach.trophies') : t('manual_ach.achievements')

  const parseStored = (it) => {
    try {
      if (Array.isArray(it.manual_achievements)) return it.manual_achievements
      if (it.manual_achievements) return JSON.parse(it.manual_achievements)
    } catch {}
    return null
  }

  const [list, setList]       = useState(() => parseStored(item) || [])
  // Começa em "loading" quando ainda não há conquistas guardadas (vai buscá-las)
  const [loading, setLoading] = useState(() => {
    const s = parseStored(item)
    return !(s && s.length)
  })
  const [error, setError]     = useState('')      // erro de CARREGAMENTO (esconde a grelha)
  const [saveError, setSaveError] = useState('')  // erro de GRAVAÇÃO (banner, não esconde)
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch]   = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const premium = isPremium()

  // Mantém sempre a referência ao item mais recente (evita closures obsoletas)
  const itemRef = useRef(item)
  useEffect(() => { itemRef.current = item }, [item])

  // Sincroniza / carrega quando o item muda (abrir, reabrir)
  useEffect(() => {
    if (!premium) { setLoading(false); return }   // proezas são Premium
    const s = parseStored(item)
    if (s && s.length) {
      setList(s)
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true); setError('')
      try {
        const d = await steamDefinitions(null, item.title)
        if (cancelled) return
        if (d.error) throw new Error(d.error)
        const defs = (d.achievements || []).map(a => ({ ...a, unlocked: false }))
        if (defs.length) {
          setList(defs)
          persist(defs)
        } else {
          setList([])
          setError('')   // deixa o estado vazio mostrar a repesca manual
        }
      } catch (e) {
        if (!cancelled) setError(t('manual_ach.load_error'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [item.id])

  const persist = (newList) => {
    setList(newList)
    saveList(newList)
  }

  const toggle = (id) => {
    const next = list.map(a => a.id === id ? { ...a, unlocked: !a.unlocked } : a)
    setList(next)
    saveList(next)
  }

  // Grava sem voltar a tocar no estado local (já atualizado pelo chamador)
  const saveList = async (newList) => {
    const it = itemRef.current
    setSaveError('')
    try {
      const updated = await updateItem(it.id, {
        status:          it.status,
        current_page:    it.current_page    ?? 0,
        hours_played:    it.hours_played    ?? 0,
        current_season:  it.current_season  ?? 1,
        current_episode: it.current_episode ?? 1,
        rating:          it.rating          ?? null,
        notes:           it.notes           ?? null,
        steam_app_id:    it.steam_app_id    ?? null,
        manual_achievements: newList,
      })
      onUpdate(updated)
    } catch (e) {
      setSaveError(t('manual_ach.save_error'))
    }
  }

  // Ordena: desbloqueadas primeiro, depois por raridade
  const sorted = [...list].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
    return (a.globalPercent ?? 100) - (b.globalPercent ?? 100)
  })
  const unlocked = list.filter(a => a.unlocked).length
  const pct = list.length ? Math.round((unlocked / list.length) * 100) : 0

  // Filtro de pesquisa
  const q = search.trim().toLowerCase()
  const filtered = q
    ? sorted.filter(a => a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q))
    : sorted
  // Com pesquisa ativa mostra todos os resultados; sem pesquisa, base + extras (animados)
  const base = q ? filtered : sorted.slice(0, 6)
  const rest = q ? [] : sorted.slice(6)

  const Cell = (a, i) => {
    const rc = rarityColor(a.globalPercent)
    return (
      <button
        key={a.id}
        onClick={() => toggle(a.id)}
        style={{
          position: 'relative', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          padding: '12px 6px 10px',
          ...(a.unlocked ? { background: accent + '22' } : CELL_GLASS),
          opacity: a.unlocked ? 1 : 0.5,
          transition: 'all 0.15s', animation: `fadeInScale 0.2s ease ${i * 0.03}s both`,
        }}
      >
        {a.icon ? (
          <img src={a.icon} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', filter: a.unlocked ? 'none' : 'grayscale(1)', transition: 'filter 0.2s' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A227', filter: a.unlocked ? 'none' : 'grayscale(1)' }}><Icon name="trophy" size={20} strokeWidth={2.2} /></div>
        )}
        <span style={{
          fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: 1.3,
          color: a.unlocked ? 'var(--text)' : 'var(--text-muted)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {a.name}
        </span>
        {a.globalPercent != null && (
          <span style={{ fontSize: 9, fontWeight: 800, color: rc }}>{a.globalPercent}%</span>
        )}
        {a.unlocked && (
          <div style={{ position: 'absolute', top: 4, right: 4, background: accent, borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        )}
      </button>
    )
  }

  // ── Proezas são Premium ──
  if (!premium) return (
    <button onClick={() => openPremium('achievements')}
      style={{
        width: '100%', textAlign: 'center', cursor: 'pointer', border: '1.5px dashed var(--item-glass-border)',
        background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
        backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
        borderRadius: 14, padding: '20px 18px',
      }}>
      <div style={{ marginBottom: 8 }}><PlatformIcon platform={platform} size={26} color={accent} /></div>
      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="lock" size={14} strokeWidth={2.3} /> {t('manual_ach.title')}</p>
      <p style={{ fontSize: 11, color: 'var(--item-label)', marginTop: 3, lineHeight: 1.5 }}>
        {t('manual_ach.premium_locked')}
      </p>
    </button>
  )

  // ── Loading ──
  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--border)' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{ background: 'white', padding: '14px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: 'linear-gradient(90deg,var(--surface-2) 25%,#E4E4EC 50%,var(--surface-2) 75%)', backgroundSize: '400px 100%', animation: `shimmer 1.4s infinite linear ${i * 0.08}s` }} />
          <div style={{ height: 9, width: '70%', background: 'var(--surface-2)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )

  // ── Erro / sem conquistas ──
  if (error || list.length === 0) return (
    <div style={{
      background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
      backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
      borderRadius: 14, padding: '22px 20px', textAlign: 'center',
      border: '1.5px dashed var(--item-glass-border)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    }}>
      <div style={{ marginBottom: 8 }}><PlatformIcon platform={platform} size={28} color={accent} /></div>
      <p style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, lineHeight: 1.6 }}>
        {t('manual_ach.none_available') || 'This game has no achievements available.'}
      </p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Banner de erro de gravação (não esconde a grelha) */}
      {saveError && (
        <div style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.28)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF4757" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12.5" /><line x1="12" y1="16" x2="12" y2="16" /></svg>
          <p style={{ fontSize: 11, color: '#FF4757', fontWeight: 600 }}>{saveError}</p>
        </div>
      )}

      {/* Progresso */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 5px rgba(0,0,0,0.55)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PlatformIcon platform={platform} size={15} color="#FFFFFF" />
            {unlocked} / {list.length} {term}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 5px rgba(0,0,0,0.55)' }}>{pct}%</p>
            {list.length > 1 && <SearchToggle on={showSearch} onClick={() => { setShowSearch(s => !s); if (showSearch) setSearch('') }} />}
          </div>
        </div>
        <div style={{ height: 5, background: 'rgba(150,150,170,0.25)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,var(--brand-1),var(--brand-2),var(--brand-3))', borderRadius: 3, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 4px rgba(0,0,0,0.5)', textAlign: 'center' }}>
        {t('manual_ach.tap_hint')}
      </p>

      {/* Barra de pesquisa de proezas */}
      {showSearch && (
        <SearchBar value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch('')} />
      )}

      {/* Sem resultados de pesquisa */}
      {q && filtered.length === 0 && (
        <p style={{ fontSize: 12, color: '#8E8EA0', textAlign: 'center', padding: '8px 0' }}>{t('manual_ach.no_achievements')}</p>
      )}

      {/* Grelha base + restantes (mesmo cartão) */}
      <div>
        <div style={{ ...GRID_GLASS,
          ...(!q && rest.length > 0 && showAll ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}) }}>
          {base.map((a, i) => Cell(a, i))}
        </div>

        {/* Restantes — expandem para baixo, coladas à grelha base */}
        {!q && rest.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateRows: showAll ? '1fr' : '0fr',
          opacity: showAll ? 1 : 0,
          transition: 'grid-template-rows 0.45s cubic-bezier(.22,1,.36,1), opacity 0.35s ease',
        }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div style={{ ...GRID_GLASS, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
              {rest.map((a, i) => Cell(a, i))}
            </div>
          </div>
        </div>
        )}
      </div>

      {!q && sorted.length > 6 && (
        <button onClick={() => setShowAll(s => !s)}
          style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 5px rgba(0,0,0,0.5)', background: 'none', fontFamily: 'Nunito', padding: '2px 0', textAlign: 'center', width: '100%' }}>
          {showAll ? t('manual_ach.show_less') : t('manual_ach.show_more', { n: sorted.length - 6 })}
        </button>
      )}
    </div>
  )
}
