import { useState, useEffect, useCallback } from 'react'
import Home from './screens/Home'
import Library from './screens/Library'
import Stats from './screens/Stats'
import Profile from './screens/Profile'
import BottomNav from './components/BottomNav'
import AddModal from './components/AddModal'
import ItemDetail from './components/ItemDetail'
import PremiumModal from './components/PremiumModal'
import Feedback from './components/Feedback'
import Onboarding from './components/Onboarding'
import FeaturePop from './components/FeaturePop'
import LimitPop from './components/LimitPop'
import GoalSetup from './components/GoalSetup'
import GoalCelebration from './components/GoalCelebration'
import AuthModal from './components/AuthModal'
import { useAuth } from './hooks/useAuth'
import { fetchItems, updateItem } from './api'
import { reconcileShields, isPremium, setPremium, openPremium, getEnabledCategories, getYearGoals, goalStatus, requirePremium } from './utils'
import { showToast } from './feedback'
import { supabase } from './supabase'

const FREE_ITEM_LIMIT = 40

export default function App() {
  const [tab, setTab] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState(() => localStorage.getItem('userName') || 'Collector')
  const [libFilter, setLibFilter] = useState({ cat: 'all', status: 'all' })
  const [enabledCats, setEnabledCats] = useState(() => getEnabledCategories())
  const [showOnboarding, setShowOnboarding] = useState(() => { try { return !localStorage.getItem('onboarded') } catch { return false } })
  const [showFeaturePop, setShowFeaturePop] = useState(false)
  const [showLimitPop, setShowLimitPop] = useState(false)
  const [showGoalSetup, setShowGoalSetup] = useState(false)
  const [goals, setGoals] = useState(() => getYearGoals())
  const [celebration, setCelebration] = useState(null)
  const [accentKey, setAccentKey] = useState(0)
  const [showAuth, setShowAuth] = useState(false)
  const { user, authLoading, signIn, signUp, signOut, signInWithOAuth } = useAuth()

  useEffect(() => {
    const onAccent = () => setAccentKey(k => k + 1)
    window.addEventListener('vyllo-accent', onAccent)
    return () => window.removeEventListener('vyllo-accent', onAccent)
  }, [])

  useEffect(() => {
    if (!user) return
    const googleName = user.user_metadata?.full_name || user.user_metadata?.name
    if (googleName && !localStorage.getItem('userName')) {
      setUserName(googleName)
    }
  }, [user])

  useEffect(() => {
    if (!user) { setPremium(false); return }
    supabase.from('profiles').select('is_premium').eq('id', user.id).single()
      .then(({ data }) => { setPremium(data?.is_premium === true) })
      .catch(() => {})
  }, [user])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    if (!payment) return
    window.history.replaceState({}, '', '/')
    if (payment === 'success') {
      setTimeout(() => {
        supabase.from('profiles').select('is_premium').eq('id', user?.id).single()
          .then(({ data }) => {
            if (data?.is_premium) {
              setPremium(true)
              showToast('Premium ativado! Obrigado.', 'success')
            }
          })
          .catch(() => {})
      }, 2000)
    }
  }, [user?.id])

  useEffect(() => {
    if (localStorage.getItem('featuresShown')) return
    if (!localStorage.getItem('onboarded')) return
    const t = setTimeout(() => setShowFeaturePop(true), 900)
    return () => clearTimeout(t)
  }, [])

  const visibleItems = items.filter(i => enabledCats.includes(i.category))

  const goToLibrary = (cat, status = 'all') => {
    setLibFilter({ cat, status })
    setTab(1)
  }

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchItems()
      setItems(data)
      reconcileShields(data)
    } catch {
      // User may be signed out.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (user) {
      loadItems()
    } else {
      setLoading(false)
      if (import.meta.env.DEV) {
        try {
          const demo = JSON.parse(localStorage.getItem('demoItems') || '[]')
          setItems(demo)
        } catch {
          setItems([])
        }
      } else {
        setItems([])
      }
    }
  }, [user, authLoading, loadItems])

  const openGoals = () => {
    if (!requirePremium('goals')) return
    setShowGoalSetup(true)
  }

  const handleTabChange = (t) => {
    if (t === 2) {
      setShowAdd(true)
      return
    }
    if (t === 1) setLibFilter({ cat: 'all', status: 'all' })
    setTab(t)
  }

  const handleItemAdded = (item) => {
    setItems(prev => [item, ...prev])
    setShowAdd(false)
  }

  const handleItemUpdated = (item) => {
    const prev = items.find(i => i.id === item.id)
    if (item.status === 'completed' && prev?.status !== 'completed') {
      const g = goals[item.category]
      if (g > 0) {
        const year = new Date().getFullYear()
        const prevDone = items.filter(i =>
          i.id !== item.id &&
          i.category === item.category &&
          i.status === 'completed' &&
          new Date(i.end_date || i.updated_at || i.created_at).getFullYear() === year
        ).length
        const newDone = prevDone + 1
        const s = goalStatus(newDone, g)
        const label = { book: 'books', game: 'games', film: 'films' }[item.category] || ''
        if (s.achieved) {
          setCelebration({ cat: item.category, done: newDone, goal: g })
        } else {
          const statusText = s.onTrack ? "you're on track!" : `${s.behind} behind`
          showToast(`Goal: ${newDone}/${g} ${label} · ${statusText}`, 'success')
        }
      }
    }
    setItems(prev => [item, ...prev.filter(i => i.id !== item.id)])
    setSelectedItem(item)
  }

  const reactivateSeries = useCallback(async (id) => {
    setItems(prev => {
      const it = prev.find(i => i.id === id)
      if (!it || it.status !== 'completed') return prev
      updateItem(id, { ...it, status: 'in_progress', end_date: null })
        .then(updated => setItems(cur => cur.map(i => i.id === id ? updated : i)))
        .catch(() => {})
      return prev
    })
  }, [])

  const handleItemDeleted = (id) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setSelectedItem(null)
  }

  if (authLoading || loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg)' }}>
        <svg width="46" height="46" viewBox="0 0 50 50" style={{ marginBottom: 18, animation: 'spin 0.9s linear infinite' }}>
          <circle cx="25" cy="25" r="20" fill="none" stroke="var(--border)" strokeWidth="5" />
          <circle cx="25" cy="25" r="20" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray="80 130" />
        </svg>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'Nunito', fontWeight: 600 }}>Loading your collection...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg)', padding: '0 32px', textAlign: 'center' }}>
        <img src="/web-app-manifest-192x192.png" alt="Vyllo" style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }} />
        <h2 style={{ fontFamily: 'Nunito', color: 'var(--text)', fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Vyllo</h2>
        <p style={{ fontFamily: 'Nunito', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 28, maxWidth: 260 }}>
          Sign in to access your collection on any device.
        </p>
        <button
          onClick={() => setShowAuth(true)}
          style={{ background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))', backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite', color: 'white', borderRadius: 14, padding: '14px 40px', fontSize: 15, fontWeight: 900, fontFamily: 'Nunito', border: 'none', cursor: 'pointer', width: '100%', maxWidth: 300 }}
        >
          Sign in / Register
        </button>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSignIn={signIn} onSignUp={signUp} onSignInOAuth={signInWithOAuth} />}
      </div>
    )
  }

  const screens = [
    <Home key={`home-${tab}-${accentKey}`} items={visibleItems} onItemClick={setSelectedItem} userName={userName} onCategoryClick={goToLibrary} enabledCats={enabledCats} onReactivate={reactivateSeries} onNavigateProfile={() => setTab(4)} goals={goals} onEditGoals={openGoals} />,
    <Library key={`lib-${tab}-${libFilter.cat}-${libFilter.status}-${accentKey}`} items={visibleItems} onItemClick={setSelectedItem} initialCat={libFilter.cat} initialStatus={libFilter.status} enabledCats={enabledCats} />,
    null,
    <Stats key={`stats-${tab}-${accentKey}`} items={visibleItems} onItemClick={setSelectedItem} onNavigate={goToLibrary} enabledCats={enabledCats} onEditGoals={openGoals} />,
    <Profile key={`profile-${tab}`} userName={userName} setUserName={setUserName} items={items} onNavigate={goToLibrary} enabledCats={enabledCats} onCategoriesChange={setEnabledCats} onEditGoals={openGoals} user={user} onShowAuth={() => setShowAuth(true)} onSignOut={signOut} />,
  ]

  return (
    <>
      {screens[tab]}
      <BottomNav activeTab={tab} onTabChange={handleTabChange} />

      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onAdd={handleItemAdded}
          enabledCats={enabledCats}
          itemCount={items.length}
        />
      )}

      {selectedItem && (
        <ItemDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleItemUpdated}
          onDelete={handleItemDeleted}
          user={user}
        />
      )}

      <PremiumModal />
      <Feedback />
      {showOnboarding && <Onboarding onDone={() => {
        setShowOnboarding(false)
        if (!localStorage.getItem('featuresShown')) {
          setTimeout(() => setShowFeaturePop(true), 600)
        }
      }} />}
      {showLimitPop && <LimitPop limit={FREE_ITEM_LIMIT} onClose={() => setShowLimitPop(false)} />}
      {showGoalSetup && <GoalSetup enabledCats={enabledCats} onClose={() => setShowGoalSetup(false)} onSave={g => setGoals(g)} />}
      {celebration && <GoalCelebration cat={celebration.cat} done={celebration.done} goal={celebration.goal} onClose={() => setCelebration(null)} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSignIn={signIn} onSignUp={signUp} onSignInOAuth={signInWithOAuth} />}
      {showFeaturePop && <FeaturePop onClose={() => {
        setShowFeaturePop(false)
        try { localStorage.setItem('featuresShown', '1') } catch {}
      }} />}
    </>
  )
}
