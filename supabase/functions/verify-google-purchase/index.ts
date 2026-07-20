// Valida uma compra do Google Play Billing e ativa o premium.
//
// O cliente envia apenas o purchaseToken; o estado real vem do Google. Isto
// impede que alguém ative premium a inventar um token.
//
// Secret: GOOGLE_SERVICE_ACCOUNT (ver _shared/google.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  VALID_SKUS,
  googleToken,
  fetchSubscription,
  fetchProduct,
  acknowledge,
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

// Estados que dão direito a premium. O período de tolerância conta: o
// pagamento falhou mas o Google ainda está a tentar cobrar.
const ACTIVE_STATES = [
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // 1. Quem está a pedir
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)

    // 2. Compra a validar
    const { purchaseToken, sku } = await req.json().catch(() => ({}))
    if (!purchaseToken || !sku) return json({ error: 'missing purchaseToken or sku' }, 400)

    const product = VALID_SKUS[String(sku)]
    if (!product) return json({ error: 'unknown product' }, 400)

    // 3. Perguntar ao Google (autoritativo)
    const token = await googleToken()
    let expiresAt: Date | null = null
    let needsAck = false

    if (product.subscription) {
      const sub = await fetchSubscription(String(purchaseToken), token)
      if (!sub) return json({ error: 'purchase not found' }, 400)

      if (!ACTIVE_STATES.includes(sub.subscriptionState)) {
        return json({ error: 'subscription not active' }, 400)
      }
      const expiry = sub.lineItems?.[0]?.expiryTime
      expiresAt = expiry ? new Date(expiry) : null
      needsAck = sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'
    } else {
      const purchase = await fetchProduct(String(sku), String(purchaseToken), token)
      if (!purchase) return json({ error: 'purchase not found' }, 400)

      // 0 = comprado, 1 = cancelado, 2 = pendente
      if (purchase.purchaseState !== 0) return json({ error: 'purchase not completed' }, 400)
      needsAck = purchase.acknowledgementState === 0
    }

    // 4. A mesma compra não pode ativar contas diferentes
    const { data: owner } = await supabase
      .from('profiles')
      .select('id')
      .eq('google_purchase_token', purchaseToken)
      .maybeSingle()
    if (owner && owner.id !== user.id) {
      return json({ error: 'purchase already linked to another account' }, 409)
    }

    // 5. Confirmar ao Google antes de ativar. Sem isto o Google reembolsa a
    //    compra ao fim de 3 dias e o utilizador perde o que pagou.
    if (needsAck) {
      await acknowledge(String(sku), String(purchaseToken), token, product.subscription)
    }

    // 6. Ativar premium
    const { error: upErr } = await supabase.from('profiles').upsert({
      id: user.id,
      is_premium: true,
      google_purchase_token: purchaseToken,
      google_product_id: sku,
      google_expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    if (upErr) return json({ error: upErr.message }, 500)

    return json({
      ok: true,
      plan: product.plan,
      expiresAt: expiresAt?.toISOString() ?? null,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
