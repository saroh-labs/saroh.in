import { z } from "zod";

import type { ComingGroupKey } from "./coming";
import { COMING, NOT_AVAILABLE_YET } from "./coming";
import { SAROH_CONTACT_EMAIL } from "./contact";
import { RESOURCE_PAGES } from "./resources";

/**
 * The day this module's words last changed, the sitemap's `lastmod` for its
 * pages (`lib/site-pages.ts`). Change it with the words:
 * `pnpm check:content-dates` fails a batch that doesn't.
 */
export const UPDATED = "2026-11-14";

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

/** The provider pages, each with its MDX: the AI apps first, as the index lists them. */
export const INTEGRATION_SLUGS = [
    "claude",
    "chatgpt",
    "razorpay",
    "cashfree",
    "email",
] as const;
export type IntegrationSlug = (typeof INTEGRATION_SLUGS)[number];

/** The cards' groups, and a page's breadcrumb. */
export type IntegrationCategory = "AI apps" | "Payments" | "Email";

/**
 * The release switch a group waits for (plan 2026-11-13-002, U7): the AI
 * apps' cards and pages are never built or linked while `ai-apps` is off.
 */
const CATEGORY_SWITCH: Partial<Record<IntegrationCategory, string>> = {
    "AI apps": "ai-apps",
};

/** The pages under /integrations/ that wait for a switch, and its key (`content/resources.ts`). */
export const SWITCHED_INTEGRATION_PAGES: readonly {
    href: string;
    waitsFor: string;
}[] = (
    RESOURCE_PAGES.find((p) => p.id === "integrations")?.children ?? []
).flatMap((c) => (typeof c === "string" ? [] : [c]));

/** The provider pages this build has: a switched-off one is never built (404). */
export function shownIntegrationSlugs(
    off: readonly string[],
): IntegrationSlug[] {
    return INTEGRATION_SLUGS.filter(
        (slug) =>
            !SWITCHED_INTEGRATION_PAGES.some(
                (p) =>
                    p.href === integrationHref(slug) &&
                    off.includes(p.waitsFor),
            ),
    );
}

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
    /** A provider page's slug, or the help anchor of a card without one. */
    slug: string;
    name: string;
    category: IntegrationCategory;
    /** The line under the name, where it isn't the category: "AI assistant". */
    kind?: string;
    line: string;
    /** The card's one link, without its arrow: "See Razorpay". */
    cta: string;
    /**
     * Where it is connected, as the app names it: "Connect in Settings ›
     * Providers" (`app.saroh.in/app/(shell)/settings/(sections)/providers`),
     * "Connect in Claude".
     */
    connect: string;
    /** The card's link: its provider page, or its part of the help article. */
    href: string;
    /**
     * AI apps only: its sign-in has been walked once on dev (plan U7, ticket
     * 11). Until the owner's walk turns it on, the card isn't shown.
     */
    liveOnDev?: boolean;
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
    /** The intro while the AI apps group is shown. */
    introWithAi:
        "Your payment account, your email and the AI apps you already use, connected in a few minutes.",
    /** The groups' headings, drawn only while the AI apps group is shown. */
    groups: {
        "AI apps": {
            title: "AI apps",
            line: "Connect the app, sign in to Saroh and pick your businesses. It can only do what you can do in Saroh, and website changes wait for you to publish them.",
            link: {
                label: "How AI apps work with Saroh",
                href: "/features/ai-apps",
            },
        },
        payments: {
            title: "Payments and email",
            line: "Your payment account and your email, connected in Settings › Providers in a few minutes.",
        },
    },
    plannedTitle: "Planned · not available yet",
    plannedIntro:
        "These aren't built yet. Times are rough and can move. Each one gets a changelog entry when it ships.",
    /** The pill on every planned row, as the changelog's Coming next says it. */
    notYet: NOT_AVAILABLE_YET,
    askEmail: SAROH_CONTACT_EMAIL,
    seo: {
        title: "Razorpay, Cashfree and email integrations · Saroh",
        socialTitle: "Integrations",
        description:
            "Integrations with Razorpay, Cashfree and your own email provider: what Saroh connects to today, how to connect each, and what's planned.",
    },
} as const;

/**
 * Every card, the AI apps first. The AI apps' words are the approved board's
 * (VSIntegrations), checked against the MCP tools
 * (`apps/api.saroh.in/src/modules/mcp/tools/`): finding customers, adding
 * products, making and moving bookings and drafting pages are all tools.
 * Cards without a page of their own link to their part of the help article
 * for other AI apps (U9).
 */
export const liveIntegrations: readonly LiveIntegration[] = [
    {
        slug: "claude",
        name: "Claude",
        category: "AI apps",
        kind: "AI assistant",
        line: "Ask Claude to add a product, move a booking or draft a page on your site. Website changes wait for you to publish them in Saroh.",
        cta: "See Claude",
        connect: "Connect in Claude",
        href: "/integrations/claude",
        liveOnDev: true,
    },
    {
        slug: "chatgpt",
        name: "ChatGPT",
        category: "AI apps",
        kind: "AI assistant",
        line: "The same from ChatGPT: your products, bookings, orders and customers, and your site as a draft, in your own words.",
        cta: "See ChatGPT",
        connect: "Connect in ChatGPT",
        href: "/integrations/chatgpt",
        liveOnDev: true,
    },
    {
        slug: "perplexity",
        name: "Perplexity",
        category: "AI apps",
        kind: "AI assistant",
        line: "Ask about your bookings, orders and customers, or add a product, from a Perplexity chat.",
        cta: "See Perplexity",
        connect: "Connect in Perplexity",
        href: "/help/connect-other-ai-apps#perplexity",
        liveOnDev: false,
    },
    {
        slug: "le-chat",
        name: "Le Chat",
        category: "AI apps",
        kind: "AI assistant",
        line: "Mistral's assistant, connected the same way. Ask, and it works in Saroh as you.",
        cta: "See Le Chat",
        connect: "Connect in Le Chat",
        href: "/help/connect-other-ai-apps#le-chat",
        liveOnDev: false,
    },
    {
        slug: "zapier",
        name: "Zapier",
        category: "AI apps",
        kind: "Automation",
        line: "Use Saroh as a step in a Zap: look up a customer, add a product or make a booking.",
        cta: "See Zapier",
        connect: "Add it in a Zap",
        href: "/help/connect-other-ai-apps#zapier",
        liveOnDev: false,
    },
    {
        slug: "make",
        name: "Make",
        category: "AI apps",
        kind: "Automation",
        line: "Use Saroh as a step in a Make scenario, with the same actions an AI app has.",
        cta: "See Make",
        connect: "Add it in a scenario",
        href: "/help/connect-other-ai-apps#make",
        liveOnDev: false,
    },
    {
        slug: "n8n",
        name: "n8n",
        category: "AI apps",
        kind: "Automation",
        line: "Use Saroh as a tool in an n8n workflow, on n8n's cloud or your own server.",
        cta: "See n8n",
        connect: "Add it in a workflow",
        href: "/help/connect-other-ai-apps#n8n",
        liveOnDev: false,
    },
    {
        slug: "coding-tools",
        name: "Coding tools",
        category: "AI apps",
        kind: "Cursor, VS Code, Claude Code",
        line: "Work with your business's products, bookings and site while you build, from Cursor, VS Code with Copilot or Claude Code.",
        cta: "See coding tools",
        connect: "Add it in your editor",
        href: "/help/connect-other-ai-apps#coding-tools",
        liveOnDev: false,
    },
    {
        slug: "razorpay",
        name: "Razorpay",
        category: "Payments",
        line: "Deposits on bookings and pay links on invoices, paid into your own Razorpay account.",
        cta: "See Razorpay",
        connect: "Connect in Settings › Providers",
        href: "/integrations/razorpay",
    },
    {
        slug: "cashfree",
        name: "Cashfree",
        category: "Payments",
        line: "The same, if your business already uses Cashfree. Paid into your own Cashfree account.",
        cta: "See Cashfree",
        connect: "Connect in Settings › Providers",
        href: "/integrations/cashfree",
    },
    {
        slug: "email",
        name: "Your own email",
        category: "Email",
        line: "Invoices and reminders sent through your own Resend, SendGrid or SMTP relay, from an address you choose.",
        cta: "See email",
        connect: "Connect in Settings › Providers",
        href: "/integrations/email",
    },
];

/**
 * The cards this build shows: none of a switched-off group (U7), and an AI
 * app only once its sign-in has been walked on dev (`liveOnDev`).
 */
export function shownIntegrations(off: readonly string[]): LiveIntegration[] {
    return liveIntegrations.filter((card) => {
        const waitsFor = CATEGORY_SWITCH[card.category];
        if (waitsFor && off.includes(waitsFor)) return false;
        return card.category !== "AI apps" || card.liveOnDev === true;
    });
}

/**
 * The planned rows that connect Saroh to another service, from the one
 * roadmap list (`./coming`, B3). What is Saroh's own work stays on the
 * changelog only: the Android app, invoice layouts, API keys, bringing your
 * own login and customers signing in with Google.
 */
export const plannedIntegrations: readonly PlannedIntegration[] = COMING.filter(
    (item) => item.integration,
).map(({ group, name, line }) => ({ group, name, line }));

/* ── A provider page's frontmatter ──────────────────────────────────── */

const text = z.string().trim().min(1);

/** One field of the mock settings panel beside a step. */
const panelRow = z
    .object({
        /** The field's label; none for a row of a list, such as a ticked business. */
        label: text.optional(),
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
        /**
         * This step's own breadcrumb, where it happens on another screen
         * than the page's `panelPath` (Claude's sign-in, then Saroh's).
         */
        panelPath: z.array(text).min(2).optional(),
        /** The panel's button at this step, as the app labels it, if any. */
        cta: text.optional(),
        rows: z.array(panelRow).min(1),
    })
    .strict();

export const integrationFrontmatter = z
    .object({
        slug: z.enum(INTEGRATION_SLUGS),
        name: text,
        category: z.enum(["AI apps", "Payments", "Email"]),
        /** The `<title>`, whole. */
        title: text,
        /** The meta and share description. */
        description: text.max(170),
        /** The first paragraph: what this is, in one or two sentences. */
        intro: text,
        /** The day its words last changed: the sitemap's `lastmod` (R3). */
        updated: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "is not a day (YYYY-MM-DD)"),
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
