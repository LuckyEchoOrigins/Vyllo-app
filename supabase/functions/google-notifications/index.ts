// Real-time Developer Notifications (RTDN) do Google Play — mantém o premium
// sincronizado quando a subscrição renova, é cancelada, expira ou é reembolsada.
//
// SEGURANÇA: o Google entrega isto por Pub/Sub num endpoint público, por isso o
// corpo NÃO é de confiança. A notificação é apenas um GATILHO: dela tiramos o
// purchaseToken e vamos confirmar o estado real à Play Developer API (pedido
// autenticado com a nossa conta de serviço). Uma notificação forjada no máximo
// provoca uma re-sincronização da verdade — nunca concede nem retira acesso
// indevidamente.
//
// Configurar: Google Cloud → Pub/Sub (tópico) → subscrição push para o URL desta
// função; Play Console → Monetização → Notificações de programador em tempo real
// → nome do tópico.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  googleToken,
  fetchSubscription,
  readSubscription,
} from '../_shared/google.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Retira o premium de quem tiver este token — subscrição ou vitalício. */
async function revoke(purchaseToken: string) {
  await supabase
    .from('profiles')
    .update({ is_premium: false })
    .eq('google_purchase_token', purchaseToken)
}

Deno.serve(async (req) => {
  // O Pub/Sub repete o envio enquanto não receber 2xx. Respondemos 200 exceto em
  // erro nosso, para uma mensagem malformada não ficar em ciclo.
  try {
    const body = await req.json().catch(() => ({}))

    // Envelope do Pub/Sub: a notificação vem em message.data, base64.
    const dataB64 = body?.message?.data
    if (!dataB64) return new Response('ok')

    let decoded: Record<string, any>
    try {
      decoded = JSON.parse(atob(dataB64))
    } catch {
      return new Response('ok')
    }

    // Reembolso / estorno → retira já, seja subscrição ou vitalício.
    const voided = decoded.voidedPurchaseNotification
    if (voided?.purchaseToken) {
      await revoke(String(voided.purchaseToken))
      return new Response('ok')
    }

    const sub = decoded.subscriptionNotification
    const oneTime = decoded.oneTimeProductNotification
    const purchaseToken = sub?.purchaseToken ?? oneTime?.purchaseToken
    if (!purchaseToken) return new Response('ok')

    // Só nos interessa se esta compra estiver associada a alguém.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('google_purchase_token', String(purchaseToken))
      .maybeSingle()
    if (!profile) return new Response('ok')

    // Vitalício não tem estado de subscrição: fora reembolso (tratado acima), o
    // acesso mantém-se, portanto nada a fazer.
    if (oneTime) return new Response('ok')

    // Subscrição → confirmar o estado real no Google (autoritativo). Isto trata
    // renovação (estende a expiração), cancelamento, período de tolerância,
    // suspensão e expiração, tudo com a mesma lógica.
    const info = await fetchSubscription(String(purchaseToken), await googleToken())
    if (!info) return new Response('ok')

    const { active, expiresAt } = readSubscription(info)
    await supabase
      .from('profiles')
      .update({
        is_premium: active,
        google_expires_at: expiresAt ? expiresAt.toISOString() : null,
      })
      .eq('google_purchase_token', String(purchaseToken))

    return new Response('ok')
  } catch (e) {
    // 500 → o Pub/Sub volta a tentar mais tarde, que é o que queremos.
    return new Response((e as Error).message, { status: 500 })
  }
})
