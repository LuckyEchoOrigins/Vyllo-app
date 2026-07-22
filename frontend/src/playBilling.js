// Google Play Billing dentro do TWA, via Digital Goods API.
//
// A API só existe quando a app Android é empacotada com Play Billing ativo.
// Em qualquer outro contexto (browser, iOS) devolve null e o chamador segue
// pelo caminho normal (Stripe no browser, StoreKit no iOS).

const PLAY_BILLING = 'https://play.google.com/billing'

// IDs criados na Play Console
const PLAY_SKUS = {
  monthly: 'premium_monthly',
  annual: 'premium_annual',
  lifetime: 'premium_lifetime',
}

/** Devolve o serviço de Play Billing, ou null se não estivermos num TWA com ele ativo. */
export async function getPlayBilling() {
  if (typeof window === 'undefined') return null
  if (!('getDigitalGoodsService' in window)) return null
  try {
    return await window.getDigitalGoodsService(PLAY_BILLING)
  } catch {
    return null
  }
}

/** Formata um valor da loja na moeda dela, no idioma do dispositivo. */
export function formatStorePrice(value, currency, locale) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  try {
    return new Intl.NumberFormat(locale || navigator.language, {
      style: 'currency',
      currency,
    }).format(n)
  } catch {
    return `${n} ${currency}`
  }
}

/**
 * Preços reais do Play, por plano: { monthly: {label, value, currency}, ... }
 * Devolve {} fora do TWA — aí o chamador usa os valores por omissão.
 */
export async function getPlayPrices() {
  const service = await getPlayBilling()
  if (!service) return {}

  const skus = Object.values(PLAY_SKUS)
  let details
  try {
    details = await service.getDetails(skus)
  } catch {
    return {}
  }
  if (!details) return {}

  const bySku = new Map(details.map((d) => [d.itemId, d]))
  const out = {}
  for (const [plan, sku] of Object.entries(PLAY_SKUS)) {
    const item = bySku.get(sku)
    if (!item?.price) continue
    const { currency, value } = item.price
    const label = formatStorePrice(value, currency)
    if (label) out[plan] = { label, value: Number(value), currency }
  }
  return out
}

/**
 * Compra um plano pelo Play Billing.
 * `verify` recebe (purchaseToken, sku) e deve validar no backend — só depois
 * a compra é dada como concluída. Se a validação falhar, marcamos como falhada.
 */
export async function buyWithPlay(plan, verify) {
  const sku = PLAY_SKUS[plan]
  if (!sku) throw new Error('invalid_plan')

  const service = await getPlayBilling()
  if (!service) throw new Error('play_unavailable')

  const details = await service.getDetails([sku])
  if (!details || details.length === 0) throw new Error('product_unavailable')
  const item = details[0]

  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING, data: { sku } }],
    {
      total: {
        label: 'Total',
        amount: { currency: item.price.currency, value: item.price.value },
      },
    },
  )

  const response = await request.show()
  const token = response.details?.purchaseToken ?? response.details?.token

  try {
    await verify(token, sku)
    await response.complete('success')
  } catch (e) {
    await response.complete('fail')
    throw e
  }
}

/**
 * Restaura compras já feitas nesta conta Google.
 * Basta uma validar para o premium ficar ativo.
 */
export async function restoreFromPlay(verify) {
  const service = await getPlayBilling()
  if (!service) throw new Error('play_unavailable')

  const purchases = await service.listPurchases()
  if (!purchases || purchases.length === 0) throw new Error('nothing_to_restore')

  let lastError = null
  for (const p of purchases) {
    try {
      await verify(p.purchaseToken, p.itemId)
      return
    } catch (e) {
      lastError = e
    }
  }
  throw lastError ?? new Error('nothing_to_restore')
}
