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
