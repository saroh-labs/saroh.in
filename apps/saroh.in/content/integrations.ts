import { z } from "zod";

import type { ComingGroupKey } from "./coming";
import { NOT_AVAILABLE_YET } from "./coming";
import { SAROH_CONTACT_EMAIL } from "./contact";
/**
 * The Integrations pages (Resources plan U3): what connects today, what is
 * planned, and the typed frontmatter every provider page's MDX
 * (`content/integrations/<slug>.mdx`) must carry. The words of each
 * provider page live in its MDX; this file holds the index and the shape.
 *
 * Every live card names the screen it is connected on as text, and has one
 * "See {name} →" link (audit R9). Planned rows never link: they are not
 * built (R2). Provider names are set in type until official partner marks
 * are in hand (R21), so no card draws a logo or a letter tile.
 */

export const INTEGRATION_SLUGS = ["razorpay", "cashfree", "email"] as const;
export type IntegrationSlug = (typeof INTEGRATION_SLUGS)[number];

export function isIntegrationSlug(slug: string): slug is IntegrationSlug {
    return (INTEGRATION_SLUGS as readonly string[]).includes(slug);
}

export function integrationHref(slug: IntegrationSlug): string {
    return `/integrations/${slug}`;
}

export const INTEGRATIONS_PATH = "/integrations";

/** Every Integrations page, for the shared frame's sitemap and nav (U1). */
export const INTEGRATION_PATHS: readonly string[] = [
    INTEGRATIONS_PATH,
    ...INTEGRATION_SLUGS.map(integrationHref),
];

export interface LiveIntegration {
    slug: IntegrationSlug;
    name: string;
    category: "Payments" | "Email";
    line: string;
    /** The card's one link, without its arrow: "See Razorpay". */
    cta: string;
    /**
     * Where it is connected in the app, as the app names it: Settings ›
     * Providers (`app.saroh.in/app/(shell)/settings/(sections)/providers`).
     */
    where: string;
}

/**
 * A planned integration: words only, and never a link. `group` says roughly
 * when, as the changelog's Coming next does (`./coming`).
 */
export interface PlannedIntegration {
    name: string;
    line: string;
    group: ComingGroupKey;
}

export const integrationsIndex = {
    title: "Integrations",
    intro: "Your payment account and your email, connected in Settings in a few minutes.",
    plannedTitle: "Planned · not available yet",
    plannedIntro:
        "These aren't built yet. Times are rough and can move. Each one gets a changelog entry when it ships.",
    /** The pill on every planned row, as the changelog's Coming next says it. */
    notYet: NOT_AVAILABLE_YET,
    askEmail: SAROH_CONTACT_EMAIL,
    seo: {
        title: "Integrations: Razorpay, Cashfree and your own email · Saroh",
        socialTitle: "Integrations",
        description:
            "What Saroh connects to today: your own Razorpay or Cashfree account for payments, and your own email provider for invoices. Plus what's planned and not built yet.",
    },
} as const;

export const liveIntegrations: readonly LiveIntegration[] = [
    {
        slug: "razorpay",
        name: "Razorpay",
        category: "Payments",
        line: "Deposits on bookings and pay links on invoices, paid into your own Razorpay account.",
        cta: "See Razorpay",
        where: "Settings › Providers",
    },
    {
        slug: "cashfree",
        name: "Cashfree",
        category: "Payments",
        line: "The same, if your business already uses Cashfree. Paid into your own Cashfree account.",
        cta: "See Cashfree",
        where: "Settings › Providers",
    },
    {
        slug: "email",
        name: "Your own email",
        category: "Email",
        line: "Invoices and reminders sent through your own Resend, SendGrid or SMTP relay, from an address you choose.",
        cta: "See email",
        where: "Settings › Providers",
    },
];

/**
 * The changelog's Coming next rows that connect Saroh to another service,
 * in the same groups and the same words (`content/changelog.ts`, ledger §12
 * CN1–CN18; `integrations.test.ts` holds the two lists together). What is
 * Saroh's own work stays on the changelog: the Android app, invoice
 * layouts, QR codes, API keys, bringing your own login and customers
 * signing in with Google.
 */
export const plannedIntegrations: readonly PlannedIntegration[] = [
    {
        group: "next",
        name: "Automatic WhatsApp messages",
        line: "Booking reminders, order updates and pay links sent to your customers on WhatsApp for you.",
    },
    {
        group: "next",
        name: "Google Calendar",
        line: "Bookings show up in your Google Calendar, and busy times there block the slot in Saroh.",
    },
    {
        group: "next",
        name: "Google Meet and Zoom",
        line: "Online appointments get a meeting link made for them automatically.",
    },
    {
        group: "early-2027",
        name: "Shopify import",
        line: "Move products, customers and past orders over from Shopify in one go.",
    },
    {
        group: "early-2027",
        name: "PhonePe",
        line: "Take payments through PhonePe, alongside Razorpay and Cashfree.",
    },
    {
        group: "early-2027",
        name: "Shiprocket",
        line: "Shipping labels and courier pick-up for orders that ship, with tracking filled in for you.",
    },
    {
        group: "early-2027",
        name: "Google Business Profile",
        line: "Your booking or shop link on your Google listing.",
    },
    {
        group: "early-2027",
        name: "Tally and Zoho Books export",
        line: "Send orders and invoices to your accountant in their format.",
    },
    {
        group: "later",
        name: "Social publishing",
        line: "Make posts from your products and offers in your brand, and post them to Instagram, Facebook, LinkedIn and X.",
    },
    {
        group: "later",
        name: "Canva",
        line: "Open any post in Canva to edit it, or bring in designs you've made there, then schedule them from Saroh.",
    },
];

/* ── A provider page's frontmatter ──────────────────────────────────── */

const text = z.string().trim().min(1);

/** One field of the mock settings panel beside a step. */
const panelRow = z
    .object({
        label: text,
        value: text,
        /** A note at the field's right: "Copy", "Sealed", "Required". */
        note: z.string().optional(),
        /** The note's colour: green for done, Saffron for still needed. */
        tone: z.enum(["muted", "ok", "required"]).default("muted"),
        /** Set in JetBrains Mono: keys, addresses, event names. */
        mono: z.boolean().default(false),
        /** A green border: the field is done. */
        done: z.boolean().default(false),
    })
    .strict();

const step = z
    .object({
        title: text,
        body: text,
        /** The panel's button at this step, as the app labels it, if any. */
        cta: text.optional(),
        rows: z.array(panelRow).min(1),
    })
    .strict();

export const integrationFrontmatter = z
    .object({
        slug: z.enum(INTEGRATION_SLUGS),
        name: text,
        category: z.enum(["Payments", "Email"]),
        /** The `<title>`, whole. */
        title: text,
        /** The meta and share description. */
        description: text.max(170),
        /** The first paragraph: what this is, in one or two sentences. */
        intro: text,
        /** The H2 over the MDX body. */
        doesTitle: text,
        /** The panel's breadcrumb, as the app names the screens. */
        panelPath: z.array(text).min(2),
        /** Payments only: the webhook path, with a placeholder business. */
        webhookPath: z.string().startsWith("/").optional(),
        /** Payments only: the events to tick, as Settings lists them. */
        events: z.array(text).optional(),
        /** The step shown first (0-based). */
        initialStep: z.number().int().min(0).default(0),
        steps: z.array(step).min(3),
        faq: z.array(z.object({ q: text, a: text }).strict()).min(1),
        links: z
            .array(z.object({ label: text, href: z.string().startsWith("/") }))
            .default([]),
    })
    .strict()
    .superRefine((fm, ctx) => {
        if (fm.initialStep >= fm.steps.length) {
            ctx.addIssue({
                code: "custom",
                path: ["initialStep"],
                message: "is past the last step",
            });
        }
        if (fm.category === "Payments" && (!fm.webhookPath || !fm.events)) {
            ctx.addIssue({
                code: "custom",
                path: ["webhookPath"],
                message: "a payments page names its webhook path and events",
            });
        }
    });

export type IntegrationFrontmatter = z.infer<typeof integrationFrontmatter>;
export type IntegrationStep = IntegrationFrontmatter["steps"][number];

/** The placeholder business id every page's webhook address shows. */
export const PLACEHOLDER_BUSINESS_ID = "your-business-id";

/** The API's public origin in production (`ENVIRONMENT.md`, `API_PUBLIC_URL`). */
export const API_ORIGIN = "https://api.saroh.in";
