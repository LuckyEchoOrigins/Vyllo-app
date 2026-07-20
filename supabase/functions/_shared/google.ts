// Acesso à Google Play Developer API para validar compras do Play Billing.
//
// Tal como fazemos com a Apple, não confiamos no que o cliente diz: pegamos no
// purchaseToken e perguntamos ao Google qual é o estado real da compra.
//
// Secret (Supabase → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT — o JSON da conta de serviço, tal e qual

export const PACKAGE_NAME = 'com.vyllo_app.twa'

// SKU → plano interno. Subscrições e vitalício usam endpoints diferentes.
export const VALID_SKUS: Record<string, { plan: string; subscription: boolean }> = {
  premium_monthly:  { plan: 'monthly',  subscription: true },
  premium_annual:   { plan: 'annual',   subscription: true },
  premium_lifetime: { plan: 'lifetime', subscription: false },
}

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

type ServiceAccount = { client_email: string; private_key: string }

const serviceAccount = (): ServiceAccount => {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT')
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT not set')
  return JSON.parse(raw)
}

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Converte a chave PEM PKCS8 da conta de serviço numa CryptoKey RS256. */
async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

// Os tokens duram 1h. Guardamos em memória para não pedir um por cada compra.
let cached: { token: string; expiresAt: number } | null = null

/** Access token OAuth2 para a Play Developer API. */
export async function googleToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const sa = serviceAccount()
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))

  const key = await importKey(sa.private_key)
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  )
  const assertion = `${header}.${claims}.${b64url(new Uint8Array(sig))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const out = await res.json()
  if (!res.ok || !out.access_token) {
    throw new Error(`google auth failed: ${out.error_description ?? res.status}`)
  }

  cached = { token: out.access_token, expiresAt: Date.now() + out.expires_in * 1000 }
  return out.access_token
}

const call = async (path: string, token: string, method = 'GET') => {
  const res = await fetch(`${API}/applications/${PACKAGE_NAME}/purchases/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return null
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out?.error?.message ?? `play api ${res.status}`)
  return out
}

/** Estado de uma subscrição (mensal/anual). */
export const fetchSubscription = (purchaseToken: string, token: string) =>
  call(`subscriptionsv2/tokens/${purchaseToken}`, token)

/** Estado de um produto único (vitalício). */
export const fetchProduct = (sku: string, purchaseToken: string, token: string) =>
  call(`products/${sku}/tokens/${purchaseToken}`, token)

/**
 * Confirma a compra ao Google.
 * Obrigatório: uma compra não confirmada em 3 dias é reembolsada
 * automaticamente e o utilizador perde o acesso.
 */
export async function acknowledge(
  sku: string,
  purchaseToken: string,
  token: string,
  subscription: boolean,
) {
  const path = subscription
    ? `subscriptions/${sku}/tokens/${purchaseToken}:acknowledge`
    : `products/${sku}/tokens/${purchaseToken}:acknowledge`
  await call(path, token, 'POST')
}
