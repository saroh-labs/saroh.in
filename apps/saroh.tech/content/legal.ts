import { REGISTERED_OFFICE, SUPPORT_EMAIL } from "./contact";

/**
 * Drafts for a lawyer to read, not in force. The company's facts and its limits
 * are saroh.in's words (`apps/saroh.in/content/{terms,privacy,refunds}.ts`), left
 * out or changed only where they're India's alone. What the cookies and privacy
 * pages say about this site comes from worker/index.ts, lib/analytics.ts and
 * lib/tools/draft-store.ts. Who handles data is the code's: Razorpay isn't here,
 * because a Global business has no billing profile (DEC-203).
 */
export const LEGAL_UPDATED = "2026-11-04";

const COMPANY = `Virashi Softwares LLP, ${REGISTERED_OFFICE.join(", ")}`;

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
            `Saroh is a product of ${COMPANY}. "We" means Virashi Softwares LLP. "You" means the person or business using Saroh. Write to us at ${SUPPORT_EMAIL}.`,
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
            "You can close your account at any time. We may close it if you seriously or repeatedly break these terms.",
            "You can download your data yourself before you close your account. After that, access ends at once. We keep the data for 180 days, as the Privacy Policy says, and you can ask us for a copy in that time, unless the law or safety requires otherwise.",
        ],
    },
    {
        title: "Changes, limits and law",
        paragraphs: [
            "We will change Saroh over time. If we change these terms in a way that matters to you, we will tell you first.",
            "Saroh is provided as it is. To the extent the law allows, we're not liable for lost profits or indirect losses. Our total liability for any claim is limited to what you paid us in the 3 months before it arose. Nothing here limits liability that the law doesn't allow us to limit.",
            "We're not responsible for the goods, services, conduct or content of any business that uses Saroh, or for disputes between a business and its customers.",
            `These terms are governed by the laws of India. Courts in Gurugram, Haryana, have jurisdiction. Write to ${SUPPORT_EMAIL} first. Most things are sorted out that way.`,
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
            `${COMPANY}, runs Saroh and is responsible for the data on this page. Write to us at ${SUPPORT_EMAIL}.`,
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
            "We keep that business's referral code in a cookie for 90 days, so that if you start a business on Saroh we can record which business referred you. It holds nothing about you and is not shared with anyone.",
        ],
        links: [{ name: "Cookies", href: "/legal/cookies" }],
    },
    {
        title: "If you sign up for Saroh",
        paragraphs: [
            "We keep your sign-in details, your business details, and what you put in the app: your customers, invoices, payments you record and notes. We use them to run Saroh and to send you emails about your account.",
            "We also keep security logs: IP address, browser, sign-in times and errors. They keep accounts safe and help us fix problems.",
            "In the app, errors, the setup steps your business has completed, and how signed-in people use the screens go to PostHog, kept against an internal id, not your name or email. Your customers' details, your figures and anything you type are hidden. You can turn this off in Settings › Your profile.",
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
        paragraphs: [
            "Our servers and database are in India. Some of the services below may process data outside India.",
        ],
    },
    {
        title: "Who else handles it",
        paragraphs: [
            "We don't sell personal data. We share it with authorities only when the law requires it. What you connect yourself, such as your own email account, is handled by that provider under its own terms.",
            "Otherwise, only the companies that help us run Saroh, each for its own job, and only what that job needs:",
        ],
        items: [
            "Hostinger: running our servers and database.",
            "Cloudflare: serving our websites and apps, network security and speed, and keeping the photos and videos you upload.",
            "Amazon Web Services (SES): sending the emails Saroh sends, from India.",
            "Google (Workspace): our mailboxes, when you write to us.",
            "PostHog: counting visits to this site, finding and fixing errors in Saroh, seeing which setup steps businesses complete, and keeping the recordings of use. Stored in the EU.",
            "Google or GitHub: only if you choose to sign in with them.",
        ],
    },
    {
        title: "How long we keep it",
        items: [
            "Your account and your business's data: while your account is open.",
            "After you close your account: access ends at once. We keep the account's data for 180 days, as Indian law requires, then remove it from live systems. Backups roll off within 30 days more.",
            "A message you send us through this site: 12 months.",
            "Security logs: 1 year.",
            "Recordings of use: 30 days.",
            "A suspended account under investigation: as long as the law requires, or while it's needed to prevent, detect or investigate an offence, even if deletion was requested.",
        ],
    },
    {
        title: "Your choices",
        paragraphs: [
            `You can ask us for a copy of your data, ask us to correct it, or ask us to delete it. Write to ${SUPPORT_EMAIL}. We reply within 30 days.`,
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
