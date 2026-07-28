// Re-confirma o estado do premium quando a app abre.
//
// Substitui as notificações em tempo real (que exigiam Pub/Sub + conta de
// faturação do Google Cloud). Aqui, sempre que o utilizador abre a app, vamos
// perguntar ao Google o estado REAL da subscrição dele e atualizamos o premium.
// Assim uma subscrição cancelada perde o acesso na expiração, e um reembolso é
// apanhado — não instantaneamente, mas na próxima abertura da app.
//
// Reutiliza a conta de serviço da GOOGLE_SERVICE_ACCOUNT; não precisa de mais
// nada configurado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  VALID_SKUS,
  googleToken,
  fetchSubscription,
  fetchProduct,
  readSubscription,
} from '../_shared/google.ts'

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
    // Quem está a pedir — só re-confirmamos o próprio.
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium, google_purchase_token, google_product_id')
      .eq('id', user.id)
      .maybeSingle()

    // Sem compra Google (utilizador Stripe, Apple, ou sem premium): nada a
    // re-confirmar aqui. Devolvemos o estado atual tal como está.
    if (!profile?.google_purchase_token) {
      return json({ is_premium: profile?.is_premium === true })
    }

    const product = VALID_SKUS[String(profile.google_product_id)]
    const token = await googleToken()

    let active: boolean
    let expiresAt: Date | null = null

    if (product?.subscription) {
      const info = await fetchSubscription(profile.google_purchase_token, token)
      // Sem resposta pode ser erro transitório — NÃO revogar por dúvida.
      if (!info) return json({ is_premium: profile.is_premium === true })
      const r = readSubscription(info)
      active = r.active
      expiresAt = r.expiresAt
    } else {
      // Vitalício: só deixa de valer se for cancelado/reembolsado.
      const purchase = await fetchProduct(
        String(profile.google_product_id),
        profile.google_purchase_token,
        token,
      )
      if (!purchase) return json({ is_premium: profile.is_premium === true })
      active = purchase.purchaseState === 0 // 0 = comprado
    }

    // Só escreve se algo mudou, para não bater na base de dados sem motivo.
    if (active !== profile.is_premium) {
      await supabase
        .from('profiles')
        .update({
          is_premium: active,
          google_expires_at: expiresAt ? expiresAt.toISOString() : null,
        })
        .eq('id', user.id)
    }

    return json({ is_premium: active })
  } catch (e) {
    // Em erro, não mexemos no estado — melhor manter do que revogar por engano.
    return json({ error: (e as Error).message }, 500)
  }
})
