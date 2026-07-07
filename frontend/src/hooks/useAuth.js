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

  // Recebe o idToken do Google Sign-In nativo (iOS) e completa a sessão no Supabase.
  // O código Swift envia: window.postMessage({ type: 'GOOGLE_SIGN_IN', idToken }, '*')
  useEffect(() => {
    const onMessage = (e) => {
      const data = e.data
      if (data && data.type === 'GOOGLE_SIGN_IN' && data.idToken) {
        supabase.auth.signInWithIdToken({ provider: 'google', token: data.idToken })
          .catch(() => {})
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
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
  const signInWithOAuth = (provider) => {
    // No app iOS nativo, o Google OAuth web é bloqueado (WebView). Dispara antes
    // o Google Sign-In nativo (GIDSignIn) que devolve o idToken via postMessage.
    const nativeGoogle = provider === 'google' && window.webkit?.messageHandlers?.['google-signin']
    if (nativeGoogle) {
      nativeGoogle.postMessage({})
      return Promise.resolve({ error: null })
    }
    return supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  return { user, authLoading, signIn, signUp, signOut, signInWithOAuth }
}
