import Stripe from 'npm:stripe@14'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!)
  } catch (e) {
    return new Response(`Webhook error: ${(e as Error).message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const uid = session.metadata?.supabase_uid
    const plan = session.metadata?.plan
    if (!uid) return new Response('ok')

    await supabase.from('profiles').upsert({
      id: uid,
      is_premium: true,
      stripe_plan: plan,
      ...(session.subscription ? { stripe_subscription_id: session.subscription as string } : {}),
    })
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', sub.customer as string)
      .single()
    if (profile) {
      const active = sub.status === 'active' || sub.status === 'trialing'
      await supabase.from('profiles').update({ is_premium: active }).eq('id', profile.id)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', sub.customer as string)
      .single()
    if (profile) {
      await supabase.from('profiles').update({
        is_premium: false,
        stripe_subscription_id: null,
        stripe_plan: null,
      }).eq('id', profile.id)
    }
  }

  return new Response('ok')
})
