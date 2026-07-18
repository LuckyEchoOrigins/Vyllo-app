import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { isPremium, setPremium } from '../utils'
import Icon from './Icon'
import { useLang } from '../i18n'
import { supabase } from '../supabase'
import { showToast } from '../feedback'

export default function PremiumModal() {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [feature, setFeature] = useState('')
  const [plan, setPlan] = useState('annual')
  const [loading, setLoading] = useState(false)
  const root = (typeof document !== 'undefined' && document.getElementById('root')) || null

  const PERKS = [
    { icon: 'infinity',   title: t('premium_modal.perk_library') },
    { icon: 'sparkles',   title: t('premium_modal.perk_search') },
    { icon: 'film',       title: t('premium_modal.perk_covers') },
    { icon: 'chart',      title: t('premium_modal.perk_stats') },
    { icon: 'dice',       title: t('premium_modal.perk_steam') },
    { icon: 'palette',    title: t('premium_modal.perk_themes') },
  ]

  const PLANS = [
    { id: 'monthly',  name: t('premium_modal.monthly'),  price: '2,99 €',  period: t('premium_modal.month_suffix') },
    { id: 'annual',   name: t('premium_modal.annual'),   price: '14,99 €', period: t('premium_modal.year_suffix'), sub: '≈ 1,25 €/mês', badge: t('premium_modal.save_badge'), popular: true },
    { id: 'lifetime', name: t('premium_modal.lifetime'), price: '34,99 €', period: t('premium_modal.one_time') },
  ]

  const FEATURE_LABEL = {
    year:         t('premium_modal.advanced_stats'),
    share:        t('premium_modal.sharing'),
    randomizer:   t('premium_modal.randomizer'),
    steamSync:    'automatic Steam sync',
    achievements: t('premium_modal.achievements'),
    covers:       'real high-quality covers',
    themes:       t('premium_modal.themes'),
    icons:        t('premium_modal.themes'),
    limit:        t('premium_modal.unlimited_library'),
    goals:        t('premium_modal.annual_goals'),
  }

  useEffect(() => {
    const onOpen = (e) => { setFeature(e.detail?.feature || ''); setPlan('annual'); setOpen(true) }
    window.addEventListener('open-premium', onOpen)
    return () => window.removeEventListener('open-premium', onOpen)
  }, [])

  // Resultado da compra nativa (iOS). O nativo envia o transactionId, que o
  // backend confirma na App Store Server API antes de ativar o premium.
  useEffect(() => {
    const onMsg = async (e) => {
      const d = e.data
      if (!d || d.type !== 'IAP_RESULT') return
      setLoading(false)
      if (!d.ok) {
        if (d.code === 'cancelled' || d.code === 'pending') return
        if (d.code === 'nothing_to_restore') {
          showToast(t('premium_modal.nothing_to_restore'), 'error')
          return
        }
        showToast(d.message || t('premium_modal.purchase_failed'), 'error')
        return
      }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-apple-purchase`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ transactionId: d.transactionId }),
          }
        )
        const out = await res.json()
        if (out?.error) throw new Error(out.error)
        setPremium(true)
        showToast(t('premium_modal.purchase_ok'), 'success')
        setOpen(false)
      } catch (err) {
        showToast(err.message || t('premium_modal.purchase_failed'), 'error')
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!open) return null

  const activate = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setOpen(false)
        window.dispatchEvent(new Event('open-auth'))
        return
      }
      // No app iOS a Apple exige In-App Purchase — dispara a compra nativa.
      // O resultado chega por postMessage (IAP_RESULT).
      const nativeIAP = window.webkit?.messageHandlers?.['iap-purchase']
      if (nativeIAP) {
        setLoading(true)
        nativeIAP.postMessage({ plan })
        return
      }
      setLoading(true)
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan }),
        }
      )
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (e) {
      showToast(e.message || 'Erro ao processar pagamento', 'error')
      setLoading(false)
    }
  }

  // Restaurar compras — exigido pela Apple. No browser não há nada a restaurar.
  const restore = () => {
    const nativeRestore = window.webkit?.messageHandlers?.['iap-restore']
    if (nativeRestore) {
      setLoading(true)
      nativeRestore.postMessage({})
      return
    }
    setOpen(false)
  }

  const featureLine = feature && FEATURE_LABEL[feature]
    ? t('premium_modal.unlock_line', { feature: FEATURE_LABEL[feature] })
    : t('premium_modal.next_level')

  const overlay = (
    <div onClick={e => e.target === e.currentTarget && setOpen(false)}
      style={{
        position: 'absolute', inset: 0, zIndex: 600, borderRadius: 'inherit', overflow: 'hidden',
        background: 'rgba(8,6,14,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadeIn 0.25s ease both',
      }}>
      <div style={{
        width: '100%', maxWidth: 390, background: 'var(--surface)', borderRadius: '24px 24px 0 0',
        maxHeight: '94%', overflowY: 'auto', animation: 'slideUp 0.3s cubic-bezier(.34,1.4,.64,1) both',
      }}>
        {/* Topo com luz nas 3 cores */}
        <div style={{
          position: 'relative', overflow: 'hidden', padding: '26px 22px 22px', textAlign: 'center',
          background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))',
          backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite',
        }}>
          <span style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
            animation: 'premiumShine 3.2s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <div style={{ fontSize: 42, marginBottom: 6 }}>👑</div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 900, textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>{t('premium_modal.title')}</h2>
          <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 4, fontWeight: 600 }}>{featureLine}</p>
        </div>

        {/* Vantagens */}
        <div style={{ padding: '14px 20px 2px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {PERKS.map(p => (
            <div key={p.title} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 12, padding: '10px 12px' }}>
              <span style={{ color: 'var(--accent)', display: 'flex', flexShrink: 0 }}><Icon name={p.icon} size={16} strokeWidth={2.2} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{p.title}</span>
            </div>
          ))}
        </div>

        {/* Planos */}
        <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PLANS.map(pl => {
            const on = plan === pl.id
            return (
              <button key={pl.id} onClick={() => setPlan(pl.id)}
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                  background: 'var(--surface-2)',
                  border: `1.5px solid ${on ? 'var(--accent)' : 'transparent'}`,
                  boxShadow: on ? '0 0 8px rgba(var(--accent-rgb),0.55)' : 'none', transition: 'all 0.15s',
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    background: on ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                  <span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{pl.name}</span>
                      {pl.badge && <span style={{ fontSize: 9, fontWeight: 800, color: 'white', background: 'linear-gradient(90deg,var(--brand-2),var(--brand-3))', padding: '2px 7px', borderRadius: 10 }}>{pl.badge}</span>}
                    </span>
                    {pl.sub && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{pl.sub}</span>}
                  </span>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 900, color: on ? 'var(--accent)' : 'var(--text)' }}>{pl.price}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)' }}>{pl.period}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Ações */}
        <div style={{ padding: '14px 20px 22px' }}>
          <button onClick={activate} disabled={loading}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: loading ? 'default' : 'pointer',
              color: 'white', fontSize: 15, fontWeight: 900, fontFamily: 'Nunito',
              background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))',
              backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite, premiumGlow 3s ease-in-out infinite',
              opacity: loading ? 0.75 : 1,
            }}>
            {loading ? '...' : t('premium_modal.get_premium')}
          </button>
          <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8 }}>
            {plan === 'lifetime' ? t('premium_modal.no_renewal') : t('premium_modal.cancel_anytime')}
          </p>
          <button onClick={() => setOpen(false)}
            style={{ width: '100%', marginTop: 6, padding: 8, background: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer' }}>
            {t('premium_modal.not_now')}
          </button>
          <button onClick={restore} disabled={loading}
            style={{ width: '100%', padding: '4px 0 2px', background: 'none', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'Nunito', cursor: 'pointer', opacity: 0.55 }}>
            {t('premium_modal.restore')}
          </button>
        </div>
      </div>
    </div>
  )

  return root ? createPortal(overlay, root) : overlay
}
