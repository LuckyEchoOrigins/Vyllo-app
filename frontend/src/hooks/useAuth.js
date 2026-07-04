import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const USER_KEYS = [
  'userName', 'premium', 'enabledCategories', 'customLists',
  'yearGoals', 'monthGoals', 'vacations', 'streakShields',
  'shieldProtectedDays', 'shieldAwardedMonths', 'onboarded',
  'featuresShown', 'notifPrefs', 'showPercent', 'weekStart', 'demoItems',
]

function clearUserData() {
  try {
    USER_KEYS.forEach(k => localStorage.removeItem(k))
    Object.keys(localStorage)
      .filter(k => k.startsWith('steamId_') || k.startsWith('searchCount_') || k.startsWith('bestWinners_'))
      .forEach(k => localStorage.removeItem(k))
  } catch {}
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const prevUserIdRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      prevUserIdRef.current = u?.id ?? null
      setUser(u)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null
      const newId = newUser?.id ?? null
      if (prevUserIdRef.current && newId !== prevUserIdRef.current) {
        clearUserData()
        prevUserIdRef.current = newId
        setUser(newUser)
        window.location.reload()
        return
      }
      prevUserIdRef.current = newId
      setUser(newUser)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signUp = (email, password) => supabase.auth.signUp({ email, password })
  const signOut = async () => {
    clearUserData()
    try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => localStorage.removeItem(k))
    } catch {}
    setUser(null)
    window.location.reload()
  }
  const signInWithOAuth = (provider) => supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  })

  return { user, authLoading, signIn, signUp, signOut, signInWithOAuth }
}
