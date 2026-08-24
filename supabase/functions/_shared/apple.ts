// Helpers partilhados para a App Store Server API.
// Usados por verify-apple-purchase e apple-notifications.

export const BUNDLE_ID = 'com.vyllo-app'

export const VALID_PRODUCTS: Record<string, string> = {
  'com.vyllo.premium.monthly': 'monthly',
  'com.vyllo.premium.annual': 'annual',
  'com.vyllo.premium.lifetime': 'lifetime',
}

export const LIFETIME_PRODUCT = 'com.vyllo.premium.lifetime'

const KEY_ID = Deno.env.get('APPLE_KEY_ID')!
const ISSUER_ID = Deno.env.get('APPLE_ISSUER_ID')!
const PRIVATE_KEY_P8 = Deno.env.get('APPLE_PRIVATE_KEY')!

const HOSTS = [
  'https://api.storekit.itunes.apple.com',
  'https://api.storekit-sandbox.itunes.apple.com',
]

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** JWT ES256 para autenticar na App Store Server API */
export async function appleToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(PRIVATE_KEY_P8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' }
  const payload = {
    iss: ISSUER_ID,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
    bid: BUNDLE_ID,
  }
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input),
  )
  return `${input}.${b64url(sig)}`
}

/**
 * Descodifica o payload de um JWS SEM verificar a assinatura.
 * Só é seguro quando (a) a resposta veio da API autenticada da Apple, ou
 * (b) o valor é usado apenas como pista, e o estado real é confirmado a seguir.
 */
export function decodeJwsPayload(jws: string): Record<string, any> {
  const b64 = jws.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Detalhe de uma transação. Produção primeiro, sandbox a seguir (TestFlight). */
export async function fetchTransaction(transactionId: string, token: string) {
  for (const host of HOSTS) {
    const res = await fetch(`${host}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const { signedTransactionInfo } = await res.json()
      return decodeJwsPayload(signedTransactionInfo)
    }
  }
  return null
}

/**
 * Estado atual da subscrição (autoritativo).
 * status: 1=ativa, 2=expirada, 3=retry de pagamento, 4=período de tolerância, 5=revogada
 */
export async function fetchSubscriptionStatus(originalTransactionId: string, token: string) {
  for (const host of HOSTS) {
    const res = await fetch(`${host}/inApps/v1/subscriptions/${originalTransactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const body = await res.json()
      const last = body?.data?.[0]?.lastTransactions?.[0]
      if (!last) return null
      return {
        status: last.status as number,
        transaction: last.signedTransactionInfo
          ? decodeJwsPayload(last.signedTransactionInfo)
          : null,
      }
    }
  }
  return null
}

/** Só estas mantêm o acesso: ativa (1) e período de tolerância (4). */
export function statusGrantsPremium(status: number): boolean {
  return status === 1 || status === 4
}
