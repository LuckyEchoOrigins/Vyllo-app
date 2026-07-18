// Valida uma compra In-App da Apple e ativa o premium.
//
// Estratégia: em vez de verificar a assinatura do JWS localmente (validação da
// cadeia de certificados da Apple, fácil de fazer mal), perguntamos diretamente
// à App Store Server API pelo transactionId. A resposta vem por TLS num pedido
// autenticado com a nossa chave — é autoritativa.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   APPLE_KEY_ID · APPLE_ISSUER_ID · APPLE_PRIVATE_KEY (conteúdo do .p8)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  BUNDLE_ID,
  VALID_PRODUCTS,
  appleToken,
  fetchTransaction,
} from '../_shared/apple.ts'

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
    // 1. Quem está a pedir
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)

    // 2. Transação a validar
    const { transactionId } = await req.json().catch(() => ({}))
    if (!transactionId) return json({ error: 'missing transactionId' }, 400)

    // 3. Perguntar à Apple (autoritativo)
    const info = await fetchTransaction(String(transactionId), await appleToken())
    if (!info) return json({ error: 'transaction not found' }, 400)

    // 4. Validar
    if (info.bundleId !== BUNDLE_ID) return json({ error: 'bundle mismatch' }, 400)

    const plan = VALID_PRODUCTS[info.productId]
    if (!plan) return json({ error: 'unknown product' }, 400)

    // Subscrições têm expiresDate (ms). Vitalício não tem.
    const expiresAt = info.expiresDate ? new Date(Number(info.expiresDate)) : null
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return json({ error: 'subscription expired' }, 400)
    }

    // 5. A mesma compra não pode ativar contas diferentes
    const originalTx = String(info.originalTransactionId ?? info.transactionId)
    const { data: owner } = await supabase
      .from('profiles')
      .select('id')
      .eq('apple_original_transaction_id', originalTx)
      .maybeSingle()
    if (owner && owner.id !== user.id) {
      return json({ error: 'purchase already linked to another account' }, 409)
    }

    // 6. Ativar premium
    const { error: upErr } = await supabase.from('profiles').upsert({
      id: user.id,
      is_premium: true,
      apple_original_transaction_id: originalTx,
      apple_product_id: info.productId,
      apple_expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    if (upErr) return json({ error: upErr.message }, 500)

    return json({ ok: true, plan, expiresAt: expiresAt?.toISOString() ?? null })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
