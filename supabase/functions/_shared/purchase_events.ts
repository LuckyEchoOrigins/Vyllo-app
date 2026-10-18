// Vendas confirmadas pela loja, para medir conversão (tabela purchase_events em
// migrations/20261020000000_conversion_events.sql). Uma linha por transação: a
// unique (store, transaction_ref) faz com que uma verificação repetida, um
// restauro ou uma notificação repetida da loja não contem duas vezes.
//
// Nunca pode partir uma compra: os erros ficam no log e a função segue.

// deno-lint-ignore no-explicit-any
type Client = any

export type PurchaseKind = 'purchase' | 'trial' | 'trial_converted'

export async function logPurchase(
  supabase: Client,
  row: {
    user_id: string
    store: 'apple' | 'google' | 'stripe'
    kind: PurchaseKind
    plan?: string | null
    product_id?: string | null
    transaction_ref: string
  },
) {
  try {
    const { error } = await supabase
      .from('purchase_events')
      .upsert(row, { onConflict: 'store,transaction_ref', ignoreDuplicates: true })
    if (error) console.error('purchase_events', error.message)
  } catch (e) {
    console.error('purchase_events', (e as Error).message)
  }
}

/**
 * Os dias grátis desta transação passaram a pagamento: só se houve um 'trial'
 * com esta referência. Fica uma vez ('<ref>:paid').
 */
export async function logTrialConversion(
  supabase: Client,
  store: 'apple' | 'google',
  ref: string,
  productId?: string | null,
  plan?: string | null,
) {
  try {
    const { data: trial } = await supabase
      .from('purchase_events')
      .select('user_id')
      .eq('store', store)
      .eq('transaction_ref', ref)
      .eq('kind', 'trial')
      .maybeSingle()
    if (!trial) return
    await logPurchase(supabase, {
      user_id: trial.user_id,
      store,
      kind: 'trial_converted',
      plan: plan ?? null,
      product_id: productId ?? null,
      transaction_ref: `${ref}:paid`,
    })
  } catch (e) {
    console.error('purchase_events trial', (e as Error).message)
  }
}

/** Transação da Apple nos dias grátis (oferta introdutória sem custo). */
// deno-lint-ignore no-explicit-any
export function appleIsTrial(info: any): boolean {
  if (info?.offerDiscountType === 'FREE_TRIAL') return true
  return Number(info?.offerType) === 1 && Number(info?.price ?? 1) === 0
}

/** Subscrição do Google nos dias grátis (fase de oferta freeTrial). */
// deno-lint-ignore no-explicit-any
export function googleIsTrial(sub: any): boolean {
  // deno-lint-ignore no-explicit-any
  return (sub?.lineItems ?? []).some((li: any) =>
    li?.offerPhase?.freeTrial !== undefined ||
    /trial/i.test(String(li?.offerDetails?.offerId ?? '')),
  )
}
