import { useState, useRef } from 'react'
import { updateItem } from '../api'
import { CAT_COLOR, isPremium } from '../utils'
import { showToast } from '../feedback'
import CategoryIcon from './CategoryIcon'
import { useLang } from '../i18n'

// Capa carregada do dispositivo → comprimida e guardada como data URL no próprio item.
// Funciona offline, mostra-se sempre (mesmo sem Premium) e não depende de URLs externos.

const MAX_W = 720

function readFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Invalid image'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

function draw(img, maxW, quality) {
  const scale = Math.min(1, maxW / img.width)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

// Comprime até caber confortavelmente na base de dados (~baixa a qualidade/tamanho se preciso)
async function fileToCover(file) {
  const img = await readFileAsImage(file)
  let q = 0.82
  let maxW = MAX_W
  let url = draw(img, maxW, q)
  while (url.length > 1_200_000 && (q > 0.45 || maxW > 380)) {
    if (q > 0.45) q = +(q - 0.12).toFixed(2)
    else maxW = Math.round(maxW * 0.85)
    url = draw(img, maxW, q)
  }
  return url
}

const isData = (s) => typeof s === 'string' && s.startsWith('data:')

// Modos de uso:
//  1. item + onUpdate    → guarda a capa no item existente (ecrã de detalhe)
//  2. onSelectUrl        → devolve a data URL sem guardar (fluxo de adição)
export default function ManualCoverPicker({ item, category, initialCover, onSelectUrl, onUpdate, onClose }) {
  const { t } = useLang()
  const isSelectMode = !!onSelectUrl
  const cat = item?.category || category || 'film'
  const color = CAT_COLOR[cat] || 'var(--accent)'
  const fileRef = useRef(null)

  const [selected, setSelected] = useState(item?.cover ?? initialCover ?? '')
  const [busy, setBusy]         = useState(false)   // a comprimir
  const [saving, setSaving]     = useState(false)

  // Pré-visualização: imagem própria (data URL) ou capa existente visível; senão placeholder
  const showPreview = isData(selected) || (selected && isPremium())

  const pickFile = () => fileRef.current?.click()

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // permite reescolher o mesmo ficheiro
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast(t('manual_cover.invalid_image'), 'error'); return }
    setBusy(true)
    try {
      const url = await fileToCover(file)
      setSelected(url)
    } catch {
      showToast(t('manual_cover.process_error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = () => setSelected('')

  const changed = selected !== (item?.cover ?? initialCover ?? '')

  const handleSave = async () => {
    if (!changed) { onClose(); return }

    // Modo seleção (fluxo de adição) → devolve sem guardar
    if (isSelectMode) {
      onSelectUrl(selected || '')
      onClose()
      return
    }

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
        cover:           selected || '',       // '' limpa a capa (volta ao cartão tipográfico)
      })
      onUpdate(updated)
      showToast(selected ? t('manual_cover.cover_updated') : t('manual_cover.cover_removed'), 'success')
      onClose()
    } catch {
      showToast(t('manual_cover.save_error'), 'error')
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 320 }}>
      <div className="bottom-sheet" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
          <h2 style={{ fontSize: 17 }}>{t('manual_cover.title')}</h2>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E8EA0" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 20px 14px', lineHeight: 1.5 }}>
          {t('manual_cover.subtitle')}
        </p>

        {/* Pré-visualização + ação */}
        <div style={{ padding: '0 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Cartão 2:3 */}
          <div style={{ width: 132, flexShrink: 0, aspectRatio: '2/3', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.22)', background: 'var(--surface-2)', position: 'relative' }}>
            {showPreview ? (
              <img src={selected} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(150deg, ${color} 0%, ${color}E6 38%, #15151F 150%)`, color: 'rgba(255,255,255,0.92)' }}>
                <CategoryIcon cat={cat} size={40} strokeWidth={2} />
              </div>
            )}
            {busy && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700 }}>
                {t('manual_cover.processing')}
              </div>
            )}
          </div>

          {/* Ações */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <button onClick={pickFile} disabled={busy}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 14px', borderRadius: 12, background: color, color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              {isData(selected) ? t('manual_cover.change_image') : t('manual_cover.choose_image')}
            </button>

            {selected && (
              <button onClick={remove} disabled={busy}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 14px', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                {t('manual_cover.remove_cover')}
              </button>
            )}

            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
              {t('manual_cover.image_hint')}
            </p>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

        {/* Footer */}
        <div style={{ padding: '16px 20px 24px', marginTop: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito' }}>
            {t('manual_cover.cancel')}
          </button>
          <button onClick={handleSave} disabled={saving || busy || !changed}
            style={{ flex: 2, padding: 12, borderRadius: 12, background: saving || busy || !changed ? 'var(--surface-2)' : 'var(--accent)', color: saving || busy || !changed ? '#8E8EA0' : 'white', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito' }}>
            {saving ? t('manual_cover.saving') : t('manual_cover.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
