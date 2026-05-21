// Supabase Edge Function: stripe-webhook
// Receives Stripe webhook events and updates public.subscriptions accordingly.
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// (--no-verify-jwt because Stripe calls this directly, not via our JWT)
//
// In Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL:     https://<project-ref>.functions.supabase.co/stripe-webhook
//   Events:  checkout.session.completed
//            customer.subscription.created
//            customer.subscription.updated
//            customer.subscription.deleted
//            invoice.payment_failed

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('no signature', { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('signature verify failed:', err);
    return new Response('bad signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(userId, session.customer as string, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.supabase_user_id) ||
          await findUserByCustomer(sub.customer as string);
        if (userId) await upsertSubscription(userId, sub.customer as string, sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const userId = await findUserByCustomer(invoice.customer as string);
        if (userId) {
          await supa.from('subscriptions').update({ status: 'past_due' }).eq('user_id', userId);
        }
        break;
      }
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('webhook handler error:', err);
    return new Response('handler error', { status: 500 });
  }
});

async function upsertSubscription(userId: string, customerId: string, sub: Stripe.Subscription) {
  const isActive = ['active', 'trialing'].includes(sub.status);
  await supa.from('subscriptions').upsert({
    user_id: userId,
    plan: isActive ? 'pro' : 'free',
    status: sub.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
  });
}

async function findUserByCustomer(customerId: string): Promise<string | null> {
  const { data } = await supa
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}
