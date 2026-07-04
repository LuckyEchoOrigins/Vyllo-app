import { useState, useEffect } from 'react'
import { updateItem, steamSearch, steamAchievements, steamDefinitions } from '../api'
import { SearchToggle, SearchBar } from './AchievementSearch'
import Icon from './Icon'
import { isPremium, openPremium } from '../utils'
import { useLang } from '../i18n'

function rarityInfo(pct, t) {
  if (pct == null) return { label: t ? t('steam.rarity_unknown')   : 'Unknown',   color: '#8E8EA0', gem: '' }
  if (pct < 2)    return { label: t ? t('steam.rarity_legendary') : 'Legendary', color: '#FF6B35', gem: '🔶' }
  if (pct < 5)    return { label: t ? t('steam.rarity_epic')      : 'Epic',      color: '#B44FFF', gem: '💜' }
  if (pct < 15)   return { label: t ? t('steam.rarity_rare')      : 'Rare',      color: '#4F9EFF', gem: '💙' }
  if (pct < 35)   return { label: t ? t('steam.rarity_uncommon')  : 'Uncommon',  color: '#2DB87A', gem: '💚' }
  return           { label: t ? t('steam.rarity_common')          : 'Common',    color: '#ADADB8', gem: '' }
}

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 1,
  border: '1px solid var(--item-glass-border)',
  borderRadius: 14,
  overflow: 'hidden',
  background: 'var(--item-glass-border)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
}

// Fundo de vidro fosco das células
const CELL_GLASS = {
  background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
}

export default function SteamAchievements({ item, steamId, onUpdate }) {
  const { t } = useLang()
  const [phase, setPhase]         = useState(item.steam_app_id ? 'linked' : 'idle')
  const [query, setQuery]         = useState(item.title || '')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [showAll, setShowAll]         = useState(false)
  const [achQuery, setAchQuery]       = useState('')      // pesquisa por nome da proeza
  const [showAchSearch, setShowAchSearch] = useState(false)
  const premium = isPremium()

  // Reage à chegada/alteração do AppID (ex: recuperado pelo ecrã de detalhe)
  useEffect(() => {
    if (item.steam_app_id) {
      setPhase('linked')
      if (steamId && premium) loadAchievements(item.steam_app_id)  // sync automático: requer premium
      else loadDefinitions(item.steam_app_id)                       // manual: disponível para todos
    } else if (item.title) {
      autoSearch(item.title)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.steam_app_id, steamId, premium])

  const autoSearch = async (title) => {
    setSearching(true)
    try {
      const d = await steamSearch(title)
      if (d.error) throw new Error(d.error)
      setResults(d)
      setPhase(d.length > 0 ? 'results' : 'idle')
    } catch { setPhase('idle') }
    finally { setSearching(false) }
  }

  const manualSearch = async () => {
    if (!query.trim()) return
    setSearching(true); setError('')
    try {
      const d = await steamSearch(query)
      if (d.error) throw new Error(d.error)
      setResults(d)
      setPhase(d.length > 0 ? 'results' : 'idle')
    } catch (e) { setError(e.message) }
    finally { setSearching(false) }
  }

  const link = async (result) => {
    try {
      const updated = await updateItem(item.id, { ...item, steam_app_id: result.appid })
      onUpdate(updated); setPhase('linked')
      if (steamId && premium) loadAchievements(result.appid)
      else loadDefinitions(result.appid)
    } catch { setError(t('steam.error_saving')) }
  }

  const unlink = async () => {
    const updated = await updateItem(item.id, { ...item, steam_app_id: null })
    onUpdate(updated); setData(null); setResults([]); setPhase('idle')
  }

  const loadAchievements = async (appid) => {
    setLoading(true); setError(''); setData(null)
    try {
      // Apenas conquistas — as horas são sincronizadas pelo ecrã de detalhe
      const achiev = await steamAchievements(appid, steamId)
      if (achiev.error) throw new Error(achiev.error)
      setData(achiev)
      // Persiste a conclusão (para o troféu nos cartões), só se mudou
      if (achiev.total > 0 && (achiev.unlocked !== item.ach_unlocked || achiev.total !== item.ach_total)) {
        try {
          const upd = await updateItem(item.id, { ...item, ach_unlocked: achiev.unlocked, ach_total: achiev.total })
          onUpdate(upd)
        } catch {}
      }
    } catch (e) {
      setError(
        e.message.toLowerCase().includes('profile') || e.message.toLowerCase().includes('private')
          ? t('steam.private_profile') || 'Your Steam profile must be set to public.'
          : e.message
      )
    } finally { setLoading(false) }
  }

  // Lista completa de proezas SEM conta ligada (desbloqueio manual)
  const loadDefinitions = async (appid) => {
    setLoading(true); setError(''); setData(null)
    try {
      const d = await steamDefinitions(appid, item.title)
      if (d.error) throw new Error(d.error)
      // Lê os IDs desbloqueados manualmente (array de strings guardado pelo toggle)
      let manualIds = []
      try {
        const raw = item.manual_achievements
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : [])
        // Só considera IDs que sejam strings puras (não objetos de ManualAchievements)
        const stringIds = parsed.filter(x => typeof x === 'string' && !x.startsWith('{'))
        // Segurança: se o número de desbloqueados guardados for igual ao total,
        // descarta (provavelmente dados corrompidos de testes anteriores)
        if (stringIds.length > 0 && stringIds.length < (d.achievements || []).length) {
          manualIds = stringIds
        }
      } catch {}
      const achievements = (d.achievements || []).map(a => ({ ...a, achieved: manualIds.includes(a.id), iconGray: a.icon }))
      const unlocked = achievements.filter(a => a.achieved).length
      setData({ total: achievements.length, unlocked, gameName: d.gameName, achievements, manual: true })
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const toggleManualAchievement = async (achId) => {
    if (!data) return
    const newAchs = data.achievements.map(a => a.id === achId ? { ...a, achieved: !a.achieved } : a)
    const unlocked = newAchs.filter(a => a.achieved).length
    const manualIds = newAchs.filter(a => a.achieved).map(a => a.id)
    setData({ ...data, achievements: newAchs, unlocked })
    try {
      const upd = await updateItem(item.id, { ...item, ach_unlocked: unlocked, ach_total: data.total, manual_achievements: manualIds })
      onUpdate(upd)
    } catch {}
  }


  // ── A pesquisar ───────────────────────────────────────────────────────────
  if (searching) return (
    <p style={{ textAlign: 'center', padding: '12px 0', color: '#8E8EA0', fontSize: 13, animation: 'pulse 1s infinite' }}>
      {t('steam.searching')}
    </p>
  )

  // ── Idle / resultados → escolher jogo ────────────────────────────────────
  if (phase === 'idle' || phase === 'results') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && manualSearch()}
          placeholder={t('steam.search_placeholder')}
          style={{ flex: 1, fontSize: 13, padding: '9px 12px' }} />
        <button onClick={manualSearch}
          style={{ background: '#171A21', color: 'white', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito' }}>
          🔍
        </button>
      </div>
      {error && <p style={{ color: '#FF4757', fontSize: 12 }}>{error}</p>}
      {phase === 'results' && results.map((r, i) => (
        <button key={r.appid} onClick={() => link(r)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', borderRadius: 10, padding: 10, border: '1.5px solid var(--border)', textAlign: 'left', animation: `fadeInUp 0.2s ease ${i * 0.04}s both`, width: '100%' }}>
          <img src={r.image} alt="" style={{ width: 64, height: 30, objectFit: 'cover', borderRadius: 6, background: '#171A21', flexShrink: 0 }}
            onError={e => e.target.style.display = 'none'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>AppID {r.appid}</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DADAE8" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      ))}
      {phase === 'results' && results.length === 0 && (
        <p style={{ color: '#8E8EA0', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>{t('steam.no_results')}</p>
      )}
    </div>
  )

  // ── Ligado ────────────────────────────────────────────────────────────────
  if (phase === 'linked') {
    const manual = data?.manual
    const needsOverlay = (!steamId && !data) || (error && !loading)
    const sorted = data
      ? [...data.achievements].sort((a, b) => {
          if (!manual && a.achieved !== b.achieved) return a.achieved ? -1 : 1
          return (a.globalPercent ?? 100) - (b.globalPercent ?? 100)
        })
      : []
    const q = achQuery.trim().toLowerCase()
    const filtered = q ? sorted.filter(a => (a.name || '').toLowerCase().includes(q)) : sorted
    const top6 = q ? filtered : filtered.slice(0, 6)   // com pesquisa mostra todos os resultados
    const rest = q ? [] : filtered.slice(6)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Barra de progresso */}
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 5px rgba(0,0,0,0.55)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="trophy" size={15} strokeWidth={2.3} /> {`${data.unlocked} / ${data.total}`} {t('manual_ach.achievements')}
                {manual && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>{t('steam.manual_label')}</span>}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 5px rgba(0,0,0,0.55)' }}>
                  {data.total > 0 ? Math.round((data.unlocked / data.total) * 100) : 0}%
                </p>
                {data.total > 1 && <SearchToggle on={showAchSearch} onClick={() => { setShowAchSearch(s => !s); if (showAchSearch) setAchQuery('') }} />}
              </div>
            </div>
            <div style={{ height: 5, background: 'rgba(150,150,170,0.25)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${data.total > 0 ? (data.unlocked / data.total) * 100 : 0}%`, background: 'linear-gradient(90deg,var(--brand-1),var(--brand-2),var(--brand-3))', borderRadius: 3, transition: 'width 0.3s ease', animation: 'progressFill 0.8s ease both' }} />
            </div>
            {manual && <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textShadow: '0 1px 4px rgba(0,0,0,0.4)', marginTop: -2 }}>
              {t('steam.manual_hint')}
            </p>}
          </div>
        )}

        {/* Barra de pesquisa de proezas */}
        {showAchSearch && (
          <SearchBar value={achQuery} onChange={e => setAchQuery(e.target.value)} onClear={() => setAchQuery('')} />
        )}

        {/* A carregar */}
        {loading && <SkeletonGrid />}

        {/* Grelha principal — 3×2 + restantes (mesmo cartão) */}
        {!loading && (() => {
          const merge = !needsOverlay && rest.length > 0
          return (
          <div>
          <div style={{ position: 'relative' }}>
            {/* Grid base (real ou placeholder) */}
            <div style={{ ...GRID_STYLE,
              ...(merge && showAll ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
              filter: needsOverlay ? 'blur(5px)' : 'none', pointerEvents: needsOverlay ? 'none' : 'auto', userSelect: needsOverlay ? 'none' : 'auto' }}>
              {needsOverlay
                ? [...Array(6)].map((_, i) => <PlaceholderCell key={i} />)
                : top6.map((a, i) => <AchievementCell key={a.id} achievement={a} index={i} onToggle={manual ? toggleManualAchievement : undefined} t={t} />)
              }
            </div>

            {/* Overlay de bloqueio / erro */}
            {needsOverlay && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
                backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--item-glass-border)',
                borderRadius: 13,
                padding: '16px 20px',
                textAlign: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
                animation: 'fadeInScale 0.25s ease both',
              }}>
                <span style={{ display: 'flex', color: error ? '#FF4757' : 'var(--text-muted)', animation: 'popIn 0.4s cubic-bezier(.34,1.56,.64,1) both' }}>
                  {error
                    ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
                    : <Icon name="lock" size={26} strokeWidth={2} />}
                </span>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3 }}>
                  {error ? t('steam.failed') : t('steam.not_linked')}
                </p>
                <p style={{ fontSize: 11, color: 'var(--item-label)', lineHeight: 1.6 }}>
                  {error
                    ? error
                    : t('steam.not_linked_hint')
                  }
                </p>
                {error && (
                  <button onClick={() => loadAchievements(item.steam_app_id)}
                    style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(var(--accent-rgb),0.85)', borderRadius: 8, padding: '6px 14px', fontFamily: 'Nunito', marginTop: 2 }}>
                    {t('steam.try_again')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Restantes — expandem para baixo, coladas à grelha base (mesmo cartão) */}
          {merge && (
            <div style={{
              display: 'grid',
              gridTemplateRows: showAll ? '1fr' : '0fr',
              opacity: showAll ? 1 : 0,
              transition: 'grid-template-rows 0.45s cubic-bezier(.22,1,.36,1), opacity 0.35s ease',
            }}>
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                <div style={{ ...GRID_STYLE, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                  {rest.map((a, i) => (
                    <AchievementCell key={a.id} achievement={a} index={i} onToggle={manual ? toggleManualAchievement : undefined} t={t} />
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
          )
        })()}

        {/* Sem resultados de pesquisa */}
        {q && filtered.length === 0 && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px rgba(0,0,0,0.5)', textAlign: 'center', padding: '6px 0' }}>
            {t('steam.no_results')}
          </p>
        )}

        {/* Botão ver mais / ver menos */}
        {!needsOverlay && !q && sorted.length > 6 && (
          <button onClick={() => setShowAll(s => !s)}
            style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 5px rgba(0,0,0,0.5)', background: 'none', fontFamily: 'Nunito', padding: '2px 0', textAlign: 'center', width: '100%' }}>
            {showAll ? t('steam.show_less') : t('steam.show_more', { n: rest.length })}
          </button>
        )}

        {/* Desligar */}
        {data && !loading && (
          <button onClick={unlink}
            style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 4px rgba(0,0,0,0.5)', background: 'none', fontFamily: 'Nunito', textAlign: 'center', padding: '2px 0' }}>
            {t('steam.unlink', { id: item.steam_app_id })}
          </button>
        )}
      </div>
    )
  }

  return null
}

// ── Célula da grelha ──────────────────────────────────────────────────────────
function AchievementCell({ achievement: a, index, onToggle, t }) {
  const [imgErr, setImgErr] = useState(false)
  const [anim, setAnim]     = useState(null) // 'unlock' | 'lock' | null
  const rarity  = rarityInfo(a.globalPercent, t)
  const iconUrl = a.achieved ? a.icon : a.iconGray

  const handleClick = () => {
    if (!onToggle) return
    setAnim(a.achieved ? 'lock' : 'unlock')
    setTimeout(() => setAnim(null), 450)
    onToggle(a.id)
  }

  const cellAnim = anim === 'unlock'
    ? 'achieveUnlock 0.45s cubic-bezier(.34,1.56,.64,1) both'
    : anim === 'lock'
      ? 'achieveLock 0.3s ease both'
      : `fadeInUp 0.3s ease ${index * 0.07}s both`

  return (
    <div onClick={handleClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'relative', gap: 5, padding: '12px 6px 10px', ...CELL_GLASS,
      opacity: a.achieved ? 1 : 0.4,
      cursor: onToggle ? 'pointer' : 'default',
      transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
      animation: cellAnim,
      boxShadow: anim === 'unlock' ? '0 0 0 2px var(--accent), 0 0 24px rgba(var(--accent-rgb),0.4)' : 'none',
    }}>
      {/* Ícone */}
      <div style={{ position: 'relative', width: 46, height: 46 }}>
        {!imgErr && iconUrl ? (
          <img src={iconUrl} alt="" onError={() => setImgErr(true)}
            style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover',
              filter: a.achieved ? 'none' : 'grayscale(1) brightness(0.6)',
              transition: 'filter 0.35s ease',
            }} />
        ) : (
          <div style={{ width: 46, height: 46, borderRadius: 8, background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            filter: a.achieved ? 'none' : 'grayscale(1) brightness(0.6)',
            transition: 'filter 0.35s ease',
          }}>
            {a.achieved ? '🏆' : '🔒'}
          </div>
        )}
        {/* Cadeado sobreposto quando bloqueado */}
        {!a.achieved && onToggle && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, background: 'rgba(0,0,0,0.45)',
            fontSize: 16, lineHeight: 1,
          }}>🔒</div>
        )}
      </div>

      <p style={{
        fontSize: 10, fontWeight: 700, color: a.achieved ? 'var(--text)' : 'var(--text-muted)',
        textAlign: 'center', lineHeight: 1.3, width: '100%',
        transition: 'color 0.3s ease',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {a.name}
      </p>
      {a.globalPercent != null && (
        <p style={{ fontSize: 10, fontWeight: 800, color: a.achieved ? rarity.color : '#666', transition: 'color 0.3s ease' }}>
          {a.globalPercent}%
        </p>
      )}
    </div>
  )
}

// ── Célula placeholder (por baixo do overlay) ─────────────────────────────────
function PlaceholderCell() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 5, padding: '12px 6px 10px', ...CELL_GLASS,
    }}>
      <div style={{ width: 46, height: 46, borderRadius: 8, background: '#E8E8F0' }} />
      <div style={{ height: 9, background: 'var(--surface-2)', borderRadius: 4, width: '65%' }} />
      <div style={{ height: 8, background: 'var(--surface)', borderRadius: 4, width: '40%' }} />
    </div>
  )
}

// ── Skeleton de carregamento ───────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div style={{ ...GRID_STYLE }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 5, padding: '12px 6px 10px', ...CELL_GLASS,
        }}>
          <div style={{ width: 46, height: 46, borderRadius: 8, background: 'linear-gradient(90deg,var(--surface-2) 25%,#E4E4EC 50%,var(--surface-2) 75%)', backgroundSize: '400px 100%', animation: `shimmer 1.4s infinite linear ${i * 0.1}s` }} />
          <div style={{ height: 9, background: 'var(--surface-2)', borderRadius: 4, width: '65%' }} />
          <div style={{ height: 8, background: 'var(--surface)', borderRadius: 4, width: '40%' }} />
        </div>
      ))}
    </div>
  )
}
