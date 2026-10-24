// Recebe o authorization code do Sign in with Apple nativo, troca-o pelo
// refresh_token e guarda-o no perfil. Esse token é depois usado por
// delete-account para revogar o acesso (Apple Guideline 5.1.1(v)).
//
// Best-effort: qualquer falha devolve ok e nunca bloqueia o login. O utilizador
// já está autenticado (o signInWithIdToken corre no cliente antes disto).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeAppleCode } from '../_shared/apple-signin.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(jwt)
    if (error || !user) return json({ error: 'unauthorized' }, 401)

    const { code } = await req.json().catch(() => ({ code: null }))
    if (!code) return json({ ok: true })

    const refreshToken = await exchangeAppleCode(code)
    if (refreshToken) {
      await supabase
        .from('profiles')
        .update({ apple_refresh_token: refreshToken })
        .eq('id', user.id)
    }
    return json({ ok: true })
  } catch (_e) {
    // Best-effort: nunca bloqueia o fluxo de login.
    return json({ ok: true })
  }
})
