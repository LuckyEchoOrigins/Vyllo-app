// App Store Server Notifications V2 — mantém o premium sincronizado quando o
// utilizador cancela, a subscrição expira, é reembolsada ou renova.
//
// SEGURANÇA: este endpoint é público (é a Apple que nos chama), por isso não se
// pode confiar no corpo do pedido. A notificação é usada apenas como GATILHO:
// extraímos o originalTransactionId e vamos confirmar o estado real à App Store
// Server API (pedido autenticado com a nossa chave). Assim, uma notificação
// forjada no máximo provoca uma re-sincronização da verdade — nunca concede
// nem retira acesso indevidamente.
//
// Configurar em App Store Connect → App Information → App Store Server
// Notifications → URL desta função (Production e Sandbox).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  LIFETIME_PRODUCT,
  appleToken,
  decodeJwsPayload,
  fetchSubscriptionStatus,
  statusGrantsPremium,
} from '../_shared/apple.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Notificações que retiram o acesso de imediato, incluindo no vitalício. */
const REVOKING = new Set(['REFUND', 'REVOKE'])

async function revoke(originalTx: string) {
  await supabase
    .from('profiles')
    .update({ is_premium: false })
    .eq('apple_original_transaction_id', originalTx)
}

Deno.serve(async (req) => {
  // A Apple repete o envio se não receber 2xx. Respondemos sempre 200, exceto
  // em erro nosso — assim uma notificação malformada não fica em ciclo.
  try {
    const { signedPayload } = await req.json().catch(() => ({}))
    if (!signedPayload) return new Response('ok')

    // Não confiável — serve só para saber DE QUE transação falar.
    const payload = decodeJwsPayload(signedPayload)
    const notificationType = String(payload?.notificationType ?? '')
    const txInfo = payload?.data?.signedTransactionInfo
      ? decodeJwsPayload(payload.data.signedTransactionInfo)
      : null

    const originalTx = txInfo?.originalTransactionId
      ? String(txInfo.originalTransactionId)
      : null
    if (!originalTx) return new Response('ok')

    // Só nos interessa se esta compra estiver associada a alguém.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, apple_product_id')
      .eq('apple_original_transaction_id', originalTx)
      .maybeSingle()
    if (!profile) return new Response('ok')

    // Reembolso/revogação → retira já, seja subscrição ou vitalício.
    if (REVOKING.has(notificationType)) {
      await revoke(originalTx)
      return new Response('ok')
    }

    // Vitalício não tem estado de subscrição: se não foi reembolso, mantém-se.
    if (profile.apple_product_id === LIFETIME_PRODUCT) {
      return new Response('ok')
    }

    // Subscrições → confirmar o estado real na Apple (autoritativo).
    const status = await fetchSubscriptionStatus(originalTx, await appleToken())
    if (!status) return new Response('ok')

    const active = statusGrantsPremium(status.status)
    const expiresDate = status.transaction?.expiresDate
    await supabase
      .from('profiles')
      .update({
        is_premium: active,
        apple_expires_at: expiresDate
          ? new Date(Number(expiresDate)).toISOString()
          : null,
      })
      .eq('apple_original_transaction_id', originalTx)

    return new Response('ok')
  } catch (e) {
    // 500 → a Apple volta a tentar mais tarde, o que é o que queremos.
    return new Response((e as Error).message, { status: 500 })
  }
})
