// Elimina permanentemente a conta do utilizador e todos os seus dados.
//
// Exigido pela Apple (Guideline 5.1.1(v)) e pelo Google Play: apps que permitem
// criar conta têm de permitir eliminá-la de dentro da própria app.
//
// O cliente não pode apagar utilizadores do auth — é preciso a service role,
// por isso corre aqui. O utilizador é identificado pelo token dele, portanto
// só consegue apagar a própria conta.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    // Só o próprio pode apagar a sua conta: identificamo-lo pelo token.
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)

    // 1. Conteúdo do utilizador
    const { error: itemsErr } = await supabase
      .from('items')
      .delete()
      .eq('user_id', user.id)
    if (itemsErr) return json({ error: itemsErr.message }, 500)

    // 2. Perfil (premium, ids de subscrição, etc.)
    await supabase.from('profiles').delete().eq('id', user.id)

    // 3. A conta em si — irreversível
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id)
    if (delErr) return json({ error: delErr.message }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
