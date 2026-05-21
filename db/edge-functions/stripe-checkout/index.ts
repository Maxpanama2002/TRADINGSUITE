// Supabase Edge Function: stripe-checkout
// Creates a Stripe Checkout session and returns the redirect URL.
// Deploy: supabase functions deploy stripe-checkout
// Env vars needed in Supabase (Settings → Functions → secrets):
//   STRIPE_SECRET_KEY  = sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET = whsec_... (used by stripe-webhook fn, not here)

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1. Authenticate the caller via their JWT (Supabase passes it through)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    // 2. Parse request body
    const { price_id, success_url, cancel_url } = await req.json();
    if (!price_id) return json({ error: 'price_id required' }, 400);

    // 3. Look up or create Stripe Customer for this user
    const adminSupa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: sub } = await adminSupa
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await adminSupa.from('subscriptions').upsert({
        user_id: user.id,
        plan: 'free',
        status: 'inactive',
        stripe_customer_id: customerId,
      });
    }

    // 4. Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: success_url || `${Deno.env.get('SITE_URL')}/app/?payment=success`,
      cancel_url:  cancel_url  || `${Deno.env.get('SITE_URL')}/app/?payment=cancel`,
      metadata: { supabase_user_id: user.id },
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
