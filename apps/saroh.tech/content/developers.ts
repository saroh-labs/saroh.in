import type { DevelopersWords } from "@saroh/marketing/feature-pages/developers-page";

/**
 * saroh.tech's /developers (owner, 16 Nov 2026, #13): saroh.in's page in
 * Global's words. The API and webhooks are the same for both editions: a
 * Global business's key works at the Global API address (`api.saroh.tech`;
 * the API's `assertEditionMatchesAddress`), and webhooks deliver for both.
 * Shown, and linked, only while `NEXT_PUBLIC_DEVELOPERS` is on.
 *
 * The samples use the docs' placeholders (`sk_live_…`, `pk_live_…`) and
 * example.com addresses, with the Global demo businesses.
 */

const API_ORIGIN = "https://api.saroh.tech";

/** The Global docs site, up at the Global launch (`docs-global`). */
export const DOCS_ORIGIN = "https://docs.saroh.tech";

export const docsHref = (path: string) => `${DOCS_ORIGIN}${path}`;

export const DEVELOPERS_PATH = "/developers";

export const DEVELOPERS = {
    name: "Developers",
    headline: "Build on a business's Saroh data.",
    sub: "The Saroh API and webhooks, for a developer or an agency working for a business on Saroh. Read and change its products, services, bookings, orders and customers from your server, show its catalogue on a website you build, and hear the moment an order is paid.",
    // Built for Global, but keys come with paid plans, not on sale yet (#41).
    note: "The business's owner makes the keys. API keys come with paid plans.",
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
      "number": "ORD-044",
      "status": "pending",
      "paymentStatus": "paid",
      "total": { "amountMinor": 4400, "currency": "USD" }
    },
    …
  ],
  "nextCursor": null
}`,
        webhook: {
            business: "Wrenfield Dental (demo clinic)",
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
            ],
        },
        caption:
            "A request for the two newest pending orders and its answer; beside it, a clinic's webhook to its CRM and its last deliveries.",
    },
    howTitle: "From a key to a live integration.",
    steps: [
        {
            title: "The owner makes a key",
            body: "In Settings › API and AI apps, an owner makes a secret key for your server, choosing what it may do, or a publishable key for a website. A key can never do more than the person who made it.",
            who: "Ironvale Fitness (demo gym)",
            visual: "keys",
        },
        {
            title: "Call /v1 from your server",
            body: "Send the secret key as a Bearer token. Read and change records, or book a slot and take an order from your own app. An Idempotency-Key makes a retry safe.",
            who: "Example request",
            visual: "code",
            code: {
                title: "Your server",
                code: `# Book a cut from your own app. Safe to send twice.
curl ${API_ORIGIN}/v1/bookings \\
  -H "Authorization: Bearer sk_live_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: booking-7f3a" \\
  -d '{
    "serviceId": "…",
    "startAt": "2026-12-01T10:00:00-05:00",
    "bookerEmail": "ruby@example.com",
    "bookerName": "Ruby"
  }'`,
            },
        },
        {
            title: "Show the catalogue on your own site",
            body: "A publishable key is safe in a web page. It reads only what the business's Saroh website already shows: products, stock, services, open slots, staff names, posts and plans.",
            who: "Larkspur & Vane (demo salon)",
            visual: "code",
            code: {
                title: "Your website",
                code: `// On your own website: a publishable key only reads
const res = await fetch(
  "${API_ORIGIN}/v1/storefront/pk_live_…/products"
);
const { data } = await res.json();`,
            },
            storefront: {
                title: "Our services",
                rows: [
                    { name: "Cut and blow-dry", line: "60 min" },
                    { name: "Root colour", line: "90 min" },
                    { name: "Blow-dry", line: "30 min" },
                ],
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
    keys: {
        business: "Ironvale Fitness (demo gym)",
        title: "API keys",
        action: "New key",
        rows: [
            {
                name: "Class sync",
                key: "sk_live_4f2a…",
                kind: "Secret",
                line: "Read and change bookings",
                on: true,
            },
            {
                name: "Gym website",
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
            body: "Every answer says how many calls a minute are left.",
        },
        {
            title: "No sensitive customer details",
            body: "The API and webhooks leave them out.",
        },
    ],
    docsTitle: "Read the docs",
    docsLead:
        "Everything is on docs.saroh.tech, written for the person building the integration.",
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
} satisfies DevelopersWords;
