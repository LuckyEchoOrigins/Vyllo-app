// Valida uma compra In-App da Apple e ativa o premium.
//
// Estratégia: em vez de verificar a assinatura do JWS localmente (validação da
// cadeia de certificados da Apple, fácil de fazer mal), perguntamos diretamente
// à App Store Server API pelo transactionId. A resposta vem por TLS num pedido
// autenticado com a nossa chave — é autoritativa e é a mesma API que vais
// precisar depois para renovações/cancelamentos.
//
// Secrets necessários (Supabase → Edge Functions → Secrets):
//   APPLE_KEY_ID      — Key ID da chave da App Store Connect API
//   APPLE_ISSUER_ID   — Issuer ID (App Store Connect → Users and Access → Keys)
//   APPLE_PRIVATE_KEY — conteúdo do ficheiro .p8 (incluindo BEGIN/END)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUNDLE_ID = 'com.vyllo-app'

const VALID_PRODUCTS: Record<string, string> = {
  'com.vyllo.premium.monthly':  'monthly',
  'com.vyllo.premium.annual':   'annual',
  'com.vyllo.premium.lifetime': 'lifetime',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const KEY_ID = Deno.env.get('APPLE_KEY_ID')!
const ISSUER_ID = Deno.env.get('APPLE_ISSUER_ID')!
const PRIVATE_KEY_P8 = Deno.env.get('APPLE_PRIVATE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

// ── helpers ──────────────────────────────────────────────────────────────────

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
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** JWT ES256 para autenticar na App Store Server API */
async function appleToken(): Promise<string> {
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
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${b64url(sig)}`
}

/** Descodifica o payload do JWS. Seguro aqui: veio da API autenticada da Apple. */
function decodeJwsPayload(jws: string): Record<string, any> {
  const b64 = jws.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Produção primeiro; sandbox a seguir (TestFlight usa sandbox). */
async function fetchTransaction(transactionId: string, token: string) {
  const hosts = [
    'https://api.storekit.itunes.apple.com',
    'https://api.storekit-sandbox.itunes.apple.com',
  ]
  for (const host of hosts) {
    const res = await fetch(`${host}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const { signedTransactionInfo } = await res.json()
      return decodeJwsPayload(signedTransactionInfo)
    }
    // 404 → tenta o ambiente seguinte; outros erros também caem para sandbox
  }
  return null
}

// ── handler ──────────────────────────────────────────────────────────────────

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
