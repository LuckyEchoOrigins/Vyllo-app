// Sign in with Apple — geração do client secret (JWT ES256) e chamadas às APIs
// de token/revoke da Apple. Usado por apple-token (guardar refresh_token) e por
// delete-account (revogar na eliminação da conta, Guideline 5.1.1(v)).
//
// Secrets necessários (Supabase → Edge Functions → Secrets):
//   APPLE_TEAM_ID             — Team ID de 10 caracteres (Apple Developer)
//   APPLE_SIGNIN_KEY_ID       — Key ID de uma chave com "Sign in with Apple"
//   APPLE_SIGNIN_PRIVATE_KEY  — conteúdo do .p8 (com ou sem cabeçalhos PEM)
//   APPLE_BUNDLE_ID           — opcional; default com.vyllo-app

const TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? ''
const KEY_ID = Deno.env.get('APPLE_SIGNIN_KEY_ID') ?? ''
const CLIENT_ID = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.vyllo-app'
const PRIVATE_KEY = Deno.env.get('APPLE_SIGNIN_PRIVATE_KEY') ?? ''

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// .p8 → bytes PKCS#8. Tolera cabeçalhos PEM e quebras de linha (reais ou "\n").
function pkcs8Bytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function clientSecret(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: KEY_ID }
  const payload = {
    iss: TEAM_ID,
    iat: now,
    exp: now + 3600,          // 1h chega para um pedido pontual
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
  }
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes(PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input),
  ))
  // Web Crypto devolve r||s (64 bytes) — exatamente o formato do ES256 do JWT.
  return `${input}.${b64url(sig)}`
}

// Troca o authorization code (do login nativo) pelo refresh_token.
export async function exchangeAppleCode(code: string): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: await clientSecret(),
    code,
    grant_type: 'authorization_code',
  })
  const r = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) return null
  const d = await r.json().catch(() => ({}))
  return d.refresh_token ?? null
}

// Revoga o refresh_token (na eliminação da conta).
export async function revokeAppleToken(refreshToken: string): Promise<boolean> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: await clientSecret(),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  })
  const r = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return r.ok
}
