// Supabase Edge Function: lemonsqueezy-webhook
// Receives LemonSqueezy webhook events and updates public.subscriptions.
//
// Deploy:
//   supabase functions deploy lemonsqueezy-webhook --no-verify-jwt
//
// Required env vars (set via `supabase secrets set`):
//   LS_WEBHOOK_SECRET — Webhook Signing Secret from LS Dashboard
//   SUPABASE_URL                — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY   — auto-provided by Supabase
//
// Configure webhook in LemonSqueezy Dashboard:
//   URL: https://<project-ref>.functions.supabase.co/lemonsqueezy-webhook
//   Events: all subscription_* events + order_created
//   Custom data passed at checkout — we expect {"user_id": "<supabase uuid>"}
//
// LS signs payloads with HMAC-SHA256(body, secret), sent in `x-signature` header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac, timingSafeEqual } from 'node:crypto';

const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const WEBHOOK_SECRET = Deno.env.get('LS_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const signature = req.headers.get('x-signature');
  if (!signature) return new Response('no signature', { status: 400 });

  const bodyText = await req.text();

  // ── Verify HMAC SHA-256 signature ────────────────────────────────────────
  const hmac = createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(bodyText);
  const computed = hmac.digest('hex');
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const compBuf = Buffer.from(computed, 'hex');
    if (sigBuf.length !== compBuf.length || !timingSafeEqual(sigBuf, compBuf)) {
      return new Response('bad signature', { status: 401 });
    }
  } catch {
    return new Response('bad signature', { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(bodyText); }
  catch { return new Response('bad json', { status: 400 }); }

  const eventName = payload.meta?.event_name || '';
  const customData = payload.meta?.custom_data || {};
  const data = payload.data || {};
  const attrs = data.attributes || {};

  // user_id is passed via checkout?checkout[custom][user_id]=<uuid>
  let userId: string | null = customData.user_id || null;

  // Fallback: look up by lemonsqueezy_customer_id if we already linked them
  if (!userId && attrs.customer_id) {
    const { data: row } = await supa
      .from('subscriptions')
      .select('user_id')
      .eq('lemonsqueezy_customer_id', String(attrs.customer_id))
      .maybeSingle();
    if (row?.user_id) userId = row.user_id;
  }

  if (!userId) {
    console.error('webhook: no user_id resolved', { eventName, customData });
    return new Response('ok', { status: 200 }); // ack to LS but skip
  }

  try {
    switch (eventName) {
      // Order created — activate Pro immediately on first paid order.
      // In LemonSqueezy Test mode, subscription_created sometimes arrives late
      // or not at all, so we don't wait for it. When subscription_created does
      // arrive later, the subscription_* handler below will UPDATE the row
      // with the real subscription_id and renews_at.
      case 'order_created': {
        const orderStatus = String(attrs.status || '');
        if (orderStatus !== 'paid') {
          console.log('webhook: order_created not paid, ignoring', { orderStatus });
          break;
        }
        const firstItem = attrs.first_order_item || {};
        // Estimate renews_at as +30 days (LS doesn't include this on order events).
        // subscription_created will overwrite with the real value when it arrives.
        const estimatedRenewsAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        await supa.from('subscriptions').upsert({
          user_id: userId,
          plan: 'pro',
          status: 'active',
          lemonsqueezy_customer_id:     String(attrs.customer_id || ''),
          lemonsqueezy_order_id:        String(data.id || ''),
          lemonsqueezy_product_id:      String(firstItem.product_id || ''),
          lemonsqueezy_variant_id:      String(firstItem.variant_id || ''),
          lemonsqueezy_status:          'active',
          renews_at:                    estimatedRenewsAt,
          cancel_at_period_end:         false,
          updated_at:                   new Date().toISOString(),
        });
        console.log('webhook: Pro activated via order_created', { userId, customerId: attrs.customer_id });
        break;
      }

      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_resumed':
      case 'subscription_unpaused': {
        const status = String(attrs.status || 'active');
        const isActive = ['active', 'on_trial', 'past_due'].includes(status);
        await supa.from('subscriptions').upsert({
          user_id: userId,
          plan: isActive ? 'pro' : 'free',
          status,
          lemonsqueezy_customer_id:     String(attrs.customer_id || ''),
          lemonsqueezy_subscription_id: String(data.id || ''),
          lemonsqueezy_order_id:        String(attrs.order_id || ''),
          lemonsqueezy_product_id:      String(attrs.product_id || ''),
          lemonsqueezy_variant_id:      String(attrs.variant_id || ''),
          lemonsqueezy_status:          status,
          renews_at:                    attrs.renews_at  || null,
          ends_at:                      attrs.ends_at    || null,
          cancel_at_period_end:         !!attrs.cancelled,
          updated_at:                   new Date().toISOString(),
        });
        break;
      }

      case 'subscription_cancelled':
      case 'subscription_paused': {
        // Subscription is still active until renews_at — mark cancel_at_period_end
        await supa.from('subscriptions').update({
          status:               String(attrs.status || 'cancelled'),
          lemonsqueezy_status:  String(attrs.status || 'cancelled'),
          cancel_at_period_end: true,
          ends_at:              attrs.ends_at || attrs.renews_at || null,
          updated_at:           new Date().toISOString(),
        }).eq('user_id', userId);
        break;
      }

      case 'subscription_expired': {
        // Period actually ended — downgrade to free
        await supa.from('subscriptions').update({
          plan:                 'free',
          status:               'expired',
          lemonsqueezy_status:  'expired',
          ends_at:              attrs.ends_at || new Date().toISOString(),
          updated_at:           new Date().toISOString(),
        }).eq('user_id', userId);
        break;
      }

      case 'subscription_payment_failed': {
        await supa.from('subscriptions').update({
          status:              'past_due',
          lemonsqueezy_status: 'past_due',
          updated_at:          new Date().toISOString(),
        }).eq('user_id', userId);
        break;
      }

      case 'subscription_payment_success':
      case 'subscription_payment_recovered': {
        await supa.from('subscriptions').update({
          plan:                'pro',
          status:              'active',
          lemonsqueezy_status: 'active',
          updated_at:          new Date().toISOString(),
        }).eq('user_id', userId);
        break;
      }

      default:
        // order_created / order_refunded / other events — ignore for now
        console.log('webhook: ignored event', eventName);
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('webhook handler error:', err);
    return new Response('handler error', { status: 500 });
  }
});
