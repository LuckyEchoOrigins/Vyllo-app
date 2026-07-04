import { useState, useEffect } from 'react'
import { updateItem } from '../api'
import { useLang } from '../i18n'

// Normaliza para comparar títulos (remove acentos, pontuação, minúsculas)
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(DIACRITICS, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

// ?default=false → Open Library devolve 404 em vez de imagem em branco
const olCoverUrl = (id) =>
  `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`

async function fetchCovers(title, author) {
  const seen = new Set()
  const ids  = []
  const addId = (id) => {
    if (id && id > 0 && !seen.has(id)) { seen.add(id); ids.push(id) }
  }

  try {
    // 1. Pesquisa por título + autor
    const params = new URLSearchParams({
      title,
      ...(author ? { author } : {}),
      limit: '10',
      fields: 'key,title,author_name,cover_i',
    })
    const searchRes = await fetch(
      `https://openlibrary.org/search.json?${params}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const searchData = await searchRes.json()
    const docs = searchData.docs || []

    // 2. Melhor match de título + autor
    const wantTitle  = norm(title)
    const wantAuthor = norm(author)

    const match = docs.find(d => {
      const titleOk  = norm(d.title) === wantTitle ||
                       norm(d.title).includes(wantTitle) ||
                       wantTitle.includes(norm(d.title))
      const authorOk = !wantAuthor ||
                       (d.author_name || []).some(a => norm(a).includes(wantAuthor) || wantAuthor.includes(norm(a)))
      return titleOk && authorOk
    }) || docs[0]

    if (!match?.key) return []

    addId(match.cover_i)

    // 3. Todas as edições dessa obra → mais capas
    const edRes = await fetch(
      `https://openlibrary.org${match.key}/editions.json?limit=100&fields=covers`,
      { signal: AbortSignal.timeout(8000) }
    )
    const edData = await edRes.json()
    for (const edition of (edData.entries || [])) {
      for (const coverId of (edition.covers || [])) addId(coverId)
    }
  } catch {}

  return ids.slice(0, 36).map(olCoverUrl)
}

// ── Modos de uso ─────────────────────────────────────────────────────────────
// 1. item + onUpdate  → guarda na DB (item existente)
// 2. onSelectUrl      → devolve URL escolhido sem guardar (modal de adição)
export default function BookCoverPicker({
  item,          // item existente (modo 1)
  onUpdate,      // callback com item atualizado (modo 1)
  onSelectUrl,   // callback com URL escolhido (modo 2)
  initialTitle,  // título para pesquisa (modo 2)
  initialAuthor, // autor para pesquisa (modo 2)
  currentCover,  // capa atual a marcar como selecionada (modo 2)
  onClose,
}) {
  const { t } = useLang()
  const isSelectMode = !!onSelectUrl
  const title  = item?.title  || initialTitle  || ''
  const author = item?.author || initialAuthor || ''

  const [covers, setCovers]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(currentCover || item?.cover || '')
  const [broken, setBroken]     = useState(new Set())
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    fetchCovers(title, author)
      .then(urls => setCovers(urls))
      .catch(() => setError(t('cover_picker.error_load')))
      .finally(() => setLoading(false))
  }, [])

  const validCovers = covers.filter(url => !broken.has(url))

  const handleSave = async () => {
    if (!selected) { onClose(); return }

    if (isSelectMode) {
      onSelectUrl(selected)
      onClose()
      return
    }

    if (selected === item.cover) { onClose(); return }

    setSaving(true)
    try {
      const updated = await updateItem(item.id, {
        status:          item.status,
        current_page:    item.current_page    ?? 0,
        hours_played:    item.hours_played    ?? 0,
        current_season:  item.current_season  ?? 1,
        current_episode: item.current_episode ?? 1,
        rating:          item.rating          ?? null,
        notes:           item.notes           ?? null,
        steam_app_id:    item.steam_app_id    ?? null,
        cover:           selected,
      })
      onUpdate(updated)
      onClose()
    } catch {
      setError(t('cover_picker.error_save') || 'Error saving.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!selected && selected !== (currentCover || item?.cover)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}
      style={{ zIndex: 300 }}>
      <div className="bottom-sheet" style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
          <h2 style={{ fontSize: 17 }}>{t('cover_picker.title')}</h2>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E8EA0" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 20px 12px' }}>
          {title}{author ? ` · ${author}` : ''}
        </p>

        {/* Grelha */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingBottom: 16 }}>
              {[...Array(9)].map((_, i) => (
                <div key={i} style={{
                  aspectRatio: '2/3', borderRadius: 10,
                  background: 'linear-gradient(90deg,#F0F0F5 25%,#E4E4EC 50%,#F0F0F5 75%)',
                  backgroundSize: '400px 100%',
                  animation: `shimmer 1.4s infinite linear ${i * 0.08}s`,
                }} />
              ))}
            </div>
          )}

          {!loading && error && (
            <p style={{ color: '#FF4757', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>{error}</p>
          )}

          {!loading && !error && validCovers.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              {t('cover_picker.no_covers')}
            </p>
          )}

          {!loading && validCovers.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingBottom: 16 }}>
              {validCovers.map((url, i) => {
                const isSelected = selected === url
                return (
                  <button
                    key={url}
                    onClick={() => setSelected(url)}
                    style={{
                      position: 'relative',
                      aspectRatio: '2/3',
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: `3px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                      padding: 0,
                      transition: 'border-color 0.15s, transform 0.15s',
                      transform: isSelected ? 'scale(0.96)' : 'scale(1)',
                      animation: `fadeInScale 0.2s ease ${i * 0.04}s both`,
                      boxShadow: isSelected ? '0 0 0 2px rgba(var(--accent-rgb),0.25)' : '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      onError={() => setBroken(prev => new Set([...prev, url]))}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        background: 'var(--accent)', borderRadius: '50%',
                        width: 22, height: 22,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid #F0F0F5', display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito' }}>
            {t('cover_picker.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            style={{
              flex: 2, padding: 12, borderRadius: 12,
              background: saving || !canSave ? 'var(--surface-2)' : 'var(--accent)',
              color: saving || !canSave ? '#8E8EA0' : 'white',
              fontSize: 14, fontWeight: 700, fontFamily: 'Nunito',
            }}
          >
            {saving ? t('cover_picker.saving') : t('cover_picker.use_cover')}
          </button>
        </div>
      </div>
    </div>
  )
}
