# Stripe webhook fixtures

Constructed from Stripe's documented object and event shapes for the pinned
version (`2026-10-28.endive`, docs.stripe.com/api), not captured from a live
account: no Stripe CLI was used. Every id, email, address and secret is made
up (`example.com`). The `checkout.session.*` files follow the Checkout Session
object on docs.stripe.com/api/checkout/sessions/object; when a real capture is
possible, compare it field by field with these. Sources per fact:
`apps/api.saroh.in/src/modules/payments/providers/STRIPE.md`.
