import { API_ORIGIN } from "./integrations";

/**
 * The day this module's words last changed, the sitemap's `lastmod` for
 * /developers (`lib/site-pages.ts`). Change it with the words:
 * `pnpm check:content-dates` fails a batch that doesn't.
 */
export const UPDATED = "2026-11-14";

/**
 * /developers (plan 2026-11-13-002, U6; board VFDevelopers): the Saroh API
 * and webhooks, for the developer or agency a business brings in. Listed
 * under Resources while `NEXT_PUBLIC_DEVELOPERS` is on (`content/resources.ts`).
 *
 * Every line is the docs' own (`apps/docs.saroh.in/content/api/`): keys.mdx
 * (owners make keys, two kinds, roll keeps the old one 24 hours, revoke
 * stops it at once, never more than its maker), storefront.mdx (the key in
 * the path, what a publishable key reads), bookings-and-orders.mdx and
 * idempotency.mdx (POST /v1/bookings with an Idempotency-Key),
 * webhooks.mdx (events, X-Saroh-Signature, HMAC-SHA256, the delivery id,
 * retries, no sensitive details), limits.mdx (calls a minute,
 * RateLimit-Remaining) and index.mdx (OpenAPI 3.1). The board's "API keys
 * and webhooks come with paid plans" and its live plan line are left out:
 * no page names what a plan holds (MARKETING_CLAIMS D3).
 *
 * The samples use the docs' placeholders (`sk_live_…`, `pk_live_…`), never
 * a key's real shape, and example.com addresses.
 */

/** The docs site. Its links are drawn only while `NEXT_PUBLIC_DOCS` is on. */
export const DOCS_ORIGIN = "https://docs.saroh.in";

/** A page on the docs site, by its path there ("/api/keys"). */
export const docsHref = (path: string) => `${DOCS_ORIGIN}${path}`;

export const DEVELOPERS_PATH = "/developers";

export const DEVELOPERS = {
    name: "Developers",
    headline: "Build on a business's Saroh data.",
    sub: "The Saroh API and webhooks, for a developer or an agency working for a business on Saroh. Read and change its products, services, bookings, orders and customers from your server, show its catalogue on a website you build, and hear the moment an order is paid.",
    note: "The business's owner makes the keys.",
    readDocs: { label: "Read the API docs", path: "/api" },
    hero: {
        title: "Terminal",
        code: `# The two newest pending orders
curl "${API_ORIGIN}/v1/orders?status=pending&limit=2" \\
  -H "Authorization: Bearer sk_live_…"

# 200 OK
{
  "data": [
    {
      "number": "ORD-042",
      "status": "pending",
      "paymentStatus": "paid",
      "total": { "amountMinor": 72000, "currency": "INR" }
    },
    …
  ],
  "nextCursor": null
}`,
        /** The drawing beside it: a webhook in Settings and its deliveries. */
        webhook: {
            business: "Kavi Dental (demo clinic)",
            path: "Settings › API and AI apps › Notifications to your systems",
            name: "Clinic CRM sync",
            url: "https://crm.example.com/saroh-webhook",
            deliveriesTitle: "Last deliveries",
            deliveries: [
                {
                    event: "order.paid",
                    line: "An order is paid",
                    result: "200 · 0.4 s",
                },
                {
                    event: "booking.created",
                    line: "A booking is made",
                    result: "200 · 0.3 s",
                },
                {
                    event: "enquiry.received",
                    line: "An enquiry comes in",
                    result: "200 · 0.5 s",
                },
            ],
        },
        caption:
            "A request for the two newest pending orders and its answer; beside it, a clinic's webhook to its CRM and its last three deliveries.",
    },
    howTitle: "From a key to a live integration.",
    steps: [
        {
            title: "The owner makes a key",
            body: "In Settings › API and AI apps, an owner makes a secret key for your server, choosing what it may do, or a publishable key for a website. A key can never do more than the person who made it.",
            who: "Pulse Fitness (demo gym)",
            visual: "keys",
        },
        {
            title: "Call /v1 from your server",
            body: "Send the secret key as a Bearer token. Read and change records, or book a slot and take an order from your own app. An Idempotency-Key makes a retry safe.",
            who: "Example request",
            visual: "code",
            code: {
                title: "Your server",
                code: `# Book a haircut from your own app. Safe to send twice.
curl ${API_ORIGIN}/v1/bookings \\
  -H "Authorization: Bearer sk_live_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: booking-7f3a" \\
  -d '{"serviceId":"…","startAt":"2026-12-01T10:00:00+05:30","bookerEmail":"asha@example.com","bookerName":"Asha"}'`,
            },
        },
        {
            title: "Show the catalogue on your own site",
            body: "A publishable key is safe in a web page. It reads only what the business's Saroh website already shows: products, stock, services, open slots, staff names, posts and plans.",
            who: "Example request",
            visual: "code",
            code: {
                title: "Your website",
                code: `// On your own website: a publishable key only reads
const res = await fetch(
  "${API_ORIGIN}/v1/storefront/pk_live_…/products"
);
const { data } = await res.json();`,
            },
        },
        {
            title: "Hear about changes with webhooks",
            body: "Pick events like order.paid or booking.created. Every delivery is signed, so your server can check it came from Saroh, and it's tried again if your server doesn't answer.",
            who: "Example delivery",
            visual: "code",
            code: {
                title: "Your server",
                code: `// POST /saroh-webhook, with X-Saroh-Signature and X-Saroh-Delivery-Id
// verifySarohSignature is in the webhooks guide.
const ok = verifySarohSignature(
  rawBody,
  req.get("X-Saroh-Signature") ?? "",
  process.env.SAROH_WEBHOOK_SECRET,
);
if (!ok) return res.sendStatus(400);`,
            },
        },
    ],
    /** The first step's drawing: the API keys list, as Settings shows it. */
    keys: {
        business: "Pulse Fitness (demo gym)",
        title: "API keys",
        action: "New key",
        rows: [
            {
                name: "Stock sync",
                key: "sk_live_4f2a…",
                kind: "Secret",
                line: "Read and change products",
                on: true,
            },
            {
                name: "Shop website",
                key: "pk_live_9c1e…",
                kind: "Publishable",
                line: "Reads what your site shows",
                on: false,
            },
            {
                name: "Old app",
                key: "sk_live_7b03…",
                kind: "Revoked",
                line: "Secret · stopped working",
                on: false,
            },
        ],
        note: "A secret key is shown once, when it's made. Copy it then.",
    },
    points: [
        {
            title: "Two kinds of key",
            body: "Secret keys for your server, with only the rights the owner picked. Publishable keys for the browser, which only read.",
        },
        {
            title: "Roll without downtime",
            body: "Roll a key and the old one keeps working for 24 hours. Revoke one to stop it at once.",
        },
        {
            title: "Signed webhooks",
            body: "Each delivery is signed with HMAC-SHA256 and a time, and carries an id so you do the work once.",
        },
        {
            title: "OpenAPI files",
            body: "Download the OpenAPI 3.1 files and make a client in the tool you already use.",
        },
        {
            title: "Clear limits",
            body: "Calls a minute depend on the plan, and every answer says how many are left.",
        },
        {
            title: "No sensitive customer details",
            body: "The API and webhooks leave them out.",
        },
    ],
    docsTitle: "Read the docs",
    docsLead:
        "Everything is on docs.saroh.in, written for the person building the integration.",
    docs: [
        {
            title: "Getting a key",
            body: "Secret and publishable keys, what each can do, rolling and revoking.",
            cta: "Read the guide",
            path: "/api/keys",
        },
        {
            title: "Storefront keys",
            body: "Show products, services, open slots and posts on a site you build.",
            cta: "Read the guide",
            path: "/api/storefront",
        },
        {
            title: "Webhooks",
            body: "Events, signatures, retries and duplicates.",
            cta: "Read the guide",
            path: "/api/webhooks",
        },
        {
            title: "Reference",
            body: "Every /v1 route, with an OpenAPI 3.1 file to make a client.",
            cta: "Open the reference",
            path: "/api/reference",
        },
    ],
    closer: "Build what the business needs.",
    bandBody:
        "Read the docs, then ask the business's owner for a key. Building with an AI app instead? See AI apps.",
    seeAiApps: { label: "See AI apps", href: "/features/ai-apps" },
    seo: {
        title: "Saroh API and webhooks for developers · Saroh",
        socialTitle: "Developers: the Saroh API and webhooks",
        description:
            "The Saroh API and webhooks: read and change a business's products, bookings, orders and customers, show its catalogue on your site, and hear when an order is paid.",
    },
} as const;
