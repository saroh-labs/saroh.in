# Saroh's own sender: MSG91

Saroh's platform sender (DEC-191): WhatsApp from +91 70279 61983 (display name
"Saroh", Saroh's verified Meta portfolio, connected through MSG91), and SMS
codes through MSG91's OTP widget until Saroh has its own DLT registration.
It is never a business's own provider (DEC-011).

Code: `apps/api.saroh.in/src/modules/messaging/`. Other modules call
`MessagingService` (`sendOtp`, `verifyOtp`, `sendWhatsAppTemplate`,
`sendWhatsAppText`, `sendSms`), which wraps the `MessagingProvider` port
(`providers/messaging-provider.port.ts`). Only that folder names MSG91:
`provider-name-contained.spec.ts` fails any other file in `apps/` or
`packages/` that does.

## Environment names

All optional; set on the API. Values never go in the repo.

| Name                               | What it is for                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MESSAGING_PROVIDER`               | `msg91` or `fake`. The fake is used only in development and test, even when named. Unset: MSG91 when the three below are set, else the fake in development and test.          |
| `MSG91_AUTH_KEY`                   | Saroh's MSG91 auth key, for every call. MSG91 turns IP security on for a new key: allow the API's outbound address.                                                           |
| `MSG91_WHATSAPP_NUMBER`            | The integrated WhatsApp number, country code and digits (`91…`).                                                                                                              |
| `MSG91_WHATSAPP_TEMPLATE`          | The approved authentication template's name (verification codes).                                                                                                             |
| `MSG91_WHATSAPP_UTILITY_TEMPLATES` | Approved utility templates, `key=template_name` pairs, comma separated. Callers send the key; an unknown key is refused without a call.                                       |
| `MSG91_WIDGET_ID`                  | The OTP widget's id. Public: the browser loads the widget with it (`MessagingService.otpWidgetConfig()`).                                                                     |
| `MSG91_WIDGET_TOKEN`               | The OTP widget's token. Public client config, but still read from the environment.                                                                                            |
| `MSG91_WEBHOOK_SECRET`             | At least 32 random characters; the same value goes in the webhook's header (below). Unset, every webhook is refused.                                                          |
| `MESSAGING_ENC_KEY`                | A 32-byte key (64 hex or base64) sealing a queued send's number and words until MSG91 accepts it (a retry). Development and test fall back to a public key; elsewhere set it. |
| `MSG91_BASE_URL`                   | Tests only: where calls go instead of MSG91.                                                                                                                                  |

## Where things live in the MSG91 dashboard

- **WhatsApp > Templates**: the authentication template (`MSG91_WHATSAPP_TEMPLATE`)
  and each utility template (`MSG91_WHATSAPP_UTILITY_TEMPLATES`). Template
  language is sent as `en`. Variables fill the body's `{{1}}`, `{{2}}`… in order.
- **OTP > Widget**: the widget (`MSG91_WIDGET_ID`, `MSG91_WIDGET_TOKEN`) and
  its SMS and WhatsApp channels. The widget sends and checks the code in the
  browser; the API only checks the access token it returns
  (`POST https://control.msg91.com/api/v5/widget/verifyAccessToken`).

## Phone sign-in for Saroh accounts (DEC-196)

Owners and staff can add a verified phone on accounts.saroh.in (Account ›
Phone) and then sign in with it as well as their email. Code:
`apps/api.saroh.in/src/modules/account-phone/` (no provider named there; it
calls `MessagingService`) and the session half in
`packages/auth/src/phone-sign-in.ts`.

1. `POST /account-phone/start` checks Turnstile (when its keys are set) and
   the start limits, then answers the widget's config (`otpWidgetConfig()`,
   with the script URL) for the browser to open. Under the fake provider it
   answers a stand-in token instead, and the screen shows a stand-in code
   step (any six digits).
2. The browser runs the widget with `exposeMethods: true`: our own code
   step calls `sendOtp`, `retryOtp` and `verifyOtp`, and MSG91's captcha
   renders in the step (`captchaRenderId`).
3. `POST /account-phone/sign-in` (or `POST /account/phone` to add one,
   signed in) sends the widget's access token. The API checks it with
   MSG91 (`verifyOtp`, with the number expected) before it finds the
   person by their verified phone or saves anything; only then does Better
   Auth make the session, the same way as for an emailed code.

**The server limits are a soft gate.** The widget sends codes from the
browser straight to MSG91, so the API can only refuse to hand out the
widget's config and refuse to check tokens: a 30-second cooldown and 10
starts a day per number, 20 starts an hour per address, and 10 failed
verifies a day per number and 20 per address (`phone-limits.ts`, counted
from `AccountPhoneEvent`). Every refusal is logged with its reason and
hashes only.

**The hard stop on sends is in MSG91's dashboard (OTP > Widget). Turn on:**

- the widget's **captcha** (on by default; keep it on for web);
- the widget's **per-number and per-IP send limits** and its resend wait;
- an **OTP length of 6**, which is what the code step takes;
- only the channels Saroh pays for (SMS, WhatsApp).

## Webhook

- URL: `https://api.saroh.in/public/webhooks/msg91` (development:
  `https://api.saroh.io/public/webhooks/msg91`).
- Header: `x-saroh-webhook-secret: <MSG91_WEBHOOK_SECRET>`.
- Events: WhatsApp delivery reports (sent, delivered, read, failed) **and**
  inbound messages. An inbound message opens that number's 24-hour window,
  which `sendWhatsAppText` needs.
- MSG91 signs nothing, so the header secret is the only check. The endpoint
  answers 200 to anything it can't read or match (MSG91 pauses a webhook on a
  4xx), and 401 only to a wrong secret.

## Moving WhatsApp to Meta's Cloud API

1. Write `providers/meta-cloud.provider.ts` implementing `MessagingProvider`
   (and a webhook controller for Meta's signed events, which carry an
   `X-Hub-Signature-256`; record events in `MessagingWebhookEvent` as the
   MSG91 one does).
2. Add `meta` to `MESSAGING_PROVIDER` in `src/env.ts` and a branch in
   `providers/messaging-provider.factory.ts`.
3. Set the new adapter's environment names, then `MESSAGING_PROVIDER=meta`.
   Callers change nothing. Keep the template keys the same.

## Moving SMS to Saroh's own DLT templates

1. Register Saroh as a DLT principal entity, a sender header and each SMS
   template (DEC-191: not before Q1 2027).
2. Add the entity id, the header and the template ids as environment names.
3. Implement `sendSms` in `providers/msg91.provider.ts` (MSG91's Flow API with
   the DLT template id), replacing its `unavailable` answer. `MessagingService`
   already counts an accepted SMS.
4. Server-made SMS codes can then replace the widget's SMS channel.

## What is stored

`MessagingMessage` (each non-verification send: channel, template key,
status times, the number's HMAC), `MessagingWebhookEvent` (each applied event
once), `MessagingContactWindow` (last inbound time per number HMAC) and
`MessagingUsage` (accepted messages per month and channel; a verified widget
token counts as OTP). No message words or numbers in clear. Usage is at
`GET /admin/messaging/usage` (`platform:read`), the last 12 months.
