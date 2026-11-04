import { placeholders as p } from "./placeholders";

/**
 * Drafts for a lawyer to read, not in force. What only the owner can supply is a
 * [confirm] placeholder. What the cookies and privacy pages say about this
 * site comes from worker/index.ts, lib/analytics.ts and lib/tools/draft-store.ts.
 */
export interface LegalSection {
    title: string;
    paragraphs?: readonly string[];
    items?: readonly string[];
    table?: {
        caption: string;
        head: readonly [string, string, string];
        rows: readonly (readonly [string, string, string])[];
    };
    links?: readonly { name: string; href: string }[];
}

const CUSTOMER_MONEY =
    "Your customers pay you directly. We don't hold or move your customers' money. You record in Saroh that a payment happened.";

const PAID_PLANS =
    "There's a free plan, and it needs no card. Paid plans aren't on sale on saroh.tech. This page will say how they work before they are.";

export const TERMS: readonly LegalSection[] = [
    {
        title: "Who we are",
        paragraphs: [
            `Saroh is a product of Virashi Softwares LLP (${p.companyDetails}). "We" means Virashi Softwares LLP. "You" means the person or business using Saroh.`,
            "These terms cover saroh.tech, its free tools and the Saroh app.",
        ],
    },
    {
        title: "The free tools",
        paragraphs: [
            "The free tools need no account. They run in your browser. You are responsible for checking what you make with them before you send it.",
            "Tax rates in the tools are examples you can change. Nothing in the tools or on this site is tax or legal advice.",
        ],
    },
    {
        title: "Your account",
        items: [
            "Give us true details, and keep them up to date.",
            "Keep your sign-in safe. You are responsible for what happens in your account.",
            "Only send invoices and messages you have the right to send.",
        ],
    },
    {
        title: "Your content",
        paragraphs: [
            "What you put in Saroh stays yours. That means your customers, invoices and notes. We use it only to run Saroh for you.",
            "The owner of a business can export its data.",
        ],
    },
    {
        title: "Your customers' money",
        paragraphs: [
            CUSTOMER_MONEY,
            "Refunds and disputes with your customers are between you and them.",
        ],
    },
    {
        title: "Paying for Saroh",
        paragraphs: [PAID_PLANS],
        links: [{ name: "Billing", href: "/legal/billing" }],
    },
    {
        title: "What you can't do",
        items: [
            "Use Saroh for anything illegal, or to mislead or defraud anyone.",
            "Send spam, or send someone an invoice they don't owe.",
            "Try to break into Saroh, overload it, or reach another person's data.",
        ],
    },
    {
        title: "If things end",
        paragraphs: [
            "You can leave at any time. We may suspend an account that breaks these terms.",
            `${p.dataAfterCancel}`,
        ],
    },
    {
        title: "Changes, limits and law",
        paragraphs: [
            "We will change Saroh over time. If we change these terms in a way that matters to you, we will tell you first.",
            `Limits on our liability: ${p.liability}`,
            `The law that applies: ${p.governingLaw}`,
        ],
    },
];

/** Exported for the test that holds this page to the code. */
export const SITE_COOKIES = [
    [
        "saroh_region_bar",
        'Set when you close the "In India?" bar, so it stays closed.',
        "90 days",
    ],
    [
        "saroh_ref",
        "Set when you open a friend's referral link. It holds their referral code.",
        "90 days",
    ],
] as const;

export const SITE_STORAGE = [
    ["saroh.tech.invoice", "Your invoice draft.", "Until you clear it"],
    ["saroh.tech.quote", "Your quote draft.", "Until you clear it"],
    ["saroh.tech.receipt", "Your receipt draft.", "Until you clear it"],
    ["saroh.tech.reminder", "Your reminder draft.", "Until you clear it"],
    ["saroh.tech.late-fee", "Your late fee numbers.", "Until you clear it"],
    [
        "saroh.tech.tax.*",
        "Your numbers in the VAT, sales tax and GST calculators.",
        "Until you clear it",
    ],
    [
        "saroh.tech.from",
        "Your business details and logo, so you only type them once.",
        "Until you clear it",
    ],
    [
        "saroh.tech.signup-moment",
        "Remembers we've shown you the sign-up note, so it shows once.",
        "Until you clear it",
    ],
] as const;

export const COOKIES: readonly LegalSection[] = [
    {
        title: "The short version",
        paragraphs: [
            "saroh.tech sets two small cookies, and only after you do something that needs them. We use no analytics cookies and no ad cookies. Your free tool drafts are kept in your browser's own storage.",
        ],
    },
    {
        title: "Cookies on saroh.tech",
        table: {
            caption: "The cookies saroh.tech can set",
            head: ["Name", "What it does", "How long"],
            rows: SITE_COOKIES,
        },
    },
    {
        title: "Storage in your browser",
        paragraphs: [
            "The free tools use your browser's local storage. It isn't a cookie, and it isn't sent to us. It stays on your device until you press Clear in the tool or clear your browser's data. In a private window it may not be kept at all.",
        ],
        table: {
            caption: "What the free tools keep in your browser",
            head: ["Name", "What it holds", "How long"],
            rows: SITE_STORAGE,
        },
    },
    {
        title: "Analytics",
        paragraphs: [
            "We count page views and clicks on a page's main button with PostHog. It sets no cookies and stores nothing in your browser. Each visit gets a new random ID, which is forgotten when you close the tab, so we can't tell that two visits came from the same person.",
        ],
        links: [{ name: "Privacy", href: "/legal/privacy" }],
    },
    {
        title: "Cookies from others",
        paragraphs: [
            "There are no ad tags on saroh.tech. Cloudflare serves this site and may set its own security cookie if it needs to check a visitor.",
            "The Saroh app uses cookies to keep you signed in.",
        ],
    },
    {
        title: "How to remove them",
        paragraphs: [
            "You can delete cookies and local storage in your browser's settings. The site still works. The bar may come back, and your drafts will be gone.",
        ],
    },
];

export const PRIVACY: readonly LegalSection[] = [
    {
        title: "Who is responsible for your data",
        paragraphs: [
            `Virashi Softwares LLP (${p.companyDetails}) runs Saroh and is responsible for the data on this page.`,
        ],
    },
    {
        title: "The free tools: your drafts stay in your browser",
        paragraphs: [
            "What you type into a free tool stays in your browser. It is saved on your device and isn't sent to us. The PDF is made on your device too.",
            "Signing up for Saroh from a tool doesn't bring your draft with it. The draft stays in your browser.",
        ],
    },
    {
        title: "What we count on this site",
        paragraphs: [
            "With PostHog, in the EU, we count page views, clicks on a page's main button, and the first time you use a tool. Each comes with the page's address (without anything after a ? or #), the kind of page, and a random ID that lasts one visit. We don't build a profile of you, and nothing you type into a tool is sent.",
            "Like any web request, this can show PostHog your IP address.",
        ],
    },
    {
        title: "Serving the site",
        paragraphs: [
            `Cloudflare serves saroh.tech. It tells our code which country a request comes from, and we use that only to show visitors in India a link to saroh.in. Cloudflare may keep request logs.`,
        ],
    },
    {
        title: "If you open a referral link",
        paragraphs: [
            "We set a cookie holding the referral code, so your friend can be credited if you sign up.",
        ],
        links: [{ name: "Cookies", href: "/legal/cookies" }],
    },
    {
        title: "If you sign up for Saroh",
        paragraphs: [
            "We keep your sign-in details, your business details, and what you put in the app: your customers, invoices, payments you record and notes. We use them to run Saroh and to send you emails about your account.",
        ],
    },
    {
        title: "Your customers' details",
        paragraphs: [
            "You decide what you put in Saroh about your customers, and you're responsible for having the right to. We use those details only to run Saroh for you.",
            CUSTOMER_MONEY,
        ],
    },
    {
        title: "Where your data is stored",
        paragraphs: [`Account data is stored in: ${p.dataLocation}`],
    },
    {
        title: "Who else handles it",
        paragraphs: [
            `Services that help us run Saroh handle some of this data for us: ${p.processors}`,
        ],
    },
    {
        title: "How long we keep it, and your choices",
        paragraphs: [
            `${p.dataAfterCancel}`,
            "You can ask us for a copy of your data, ask us to correct it, or ask us to delete it. Email us.",
        ],
    },
];

export const BILLING: readonly LegalSection[] = [
    {
        title: "Your customers' money is never ours",
        paragraphs: [CUSTOMER_MONEY],
    },
    {
        title: "How paying for Saroh works",
        paragraphs: [PAID_PLANS],
    },
];
