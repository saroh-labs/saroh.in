import { REGISTERED_OFFICE, SUPPORT_EMAIL } from "./contact";
import { planWords } from "./plan-words";

/**
 * Drafts for a lawyer to read, not in force. The company's facts and its limits
 * are saroh.in's words (`apps/saroh.in/content/{terms,privacy,refunds}.ts`), left
 * out or changed only where they're India's alone. What the cookies and privacy
 * pages say about this site comes from worker/index.ts, lib/analytics.ts and
 * lib/tools/draft-store.ts. Who handles data is the code's: the billing provider
 * isn't here, because a Global business has no billing profile (DEC-203).
 */
export const LEGAL_UPDATED = "2026-11-20";

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

/*
 * Paid plans (shown once SAROH_BILLING_GLOBAL is on and the API says plans are
 * on sale). DRAFT for the owner and a lawyer, 16 Nov 2026, not reviewed. Built
 * from saroh.in's agreed Terms and Refund policy and the owner's billing
 * decisions: monthly only, cancel to the end of the paid period, no refund of a
 * part-used period, double charges refunded automatically (DEC-164), billing
 * details before any charge, 7 days to pay a failed renewal then Free (DEC-210).
 * To confirm before launch: how a renewal is collected (pay link each month or
 * card autopay, DEC-211), and the tax wording for sales outside India (CA).
 */
const FREE_ONLY_TERMS: readonly LegalSection[] = [
    {
        title: "Paying for Saroh",
        paragraphs: [planWords(false).legal],
        links: [{ name: "Billing", href: "/legal/billing" }],
    },
];

const PAID_TERMS: readonly LegalSection[] = [
    {
        title: "Plans and billing",
        items: [
            "Free costs nothing and needs no card. Each paid plan's price, limits and extras are shown on saroh.tech/pricing and in the app before you choose.",
            "Paid plans are billed monthly, in US dollars, by Virashi Softwares LLP. Taxes, where the law requires them, are shown on the invoice.",
            "Before we charge you, we ask for the name and address to bill. Every charge comes with an invoice by email.",
            "We give you at least 30 days' notice by email before a price you pay goes up. Until then, you keep paying the price you have.",
            "When you reach a plan's limit, Saroh warns you first, then offers a bigger plan. It never deletes what you already have.",
        ],
        links: [{ name: "Billing", href: "/legal/billing" }],
    },
    {
        title: "Moving to a lower plan",
        paragraphs: [
            "If your plan moves to a lower one (you cancel, or a payment isn't made in time), what's over the new plan's limits becomes read-only. People beyond the limit are paused, products and posts beyond the limit are hidden from your site, and extra places stop taking orders and bookings. We email you before it happens. Nothing is deleted, and moving back up restores everything at once.",
        ],
    },
    {
        title: "Cancelling and refunds",
        paragraphs: [
            "You can cancel a paid plan at any time, in the app or by writing to us. You keep it until the end of the month you've paid for, then it moves to Free. A month that's partly used isn't refunded.",
            "If we charge you twice for the same month, or the wrong amount, because of an error on our side, we refund the difference to the way you paid. A double charge is refunded without you asking. For anything else, write to us within 30 days.",
        ],
    },
    {
        title: "Fair use",
        paragraphs: [
            "Plans with no limit, or with large allowances, are for the normal running of one business. Don't resell Saroh or use it as file hosting. If an account uses far more than a typical business on its plan, or puts Saroh at risk for others, we'll contact you to agree a way forward before limiting anything, unless we need to act at once to keep Saroh running.",
        ],
    },
    {
        title: "Your website and domain",
        paragraphs: [
            "You're responsible for what your website says. A domain you connect stays registered to you. We can take down a page that breaks the law or these terms.",
        ],
    },
];

const PAID_BILLING: readonly LegalSection[] = [
    {
        title: "Plans and prices",
        items: [
            "Free costs nothing, has no time limit and needs no card.",
            "Paid plans are priced per month in US dollars. The price is shown on saroh.tech/pricing and in the app before you choose, and on every invoice.",
            "Taxes, where the law requires them, are shown on the invoice.",
        ],
    },
    {
        title: "Before the first charge",
        paragraphs: [
            "We ask for the name and address to bill, and an email for invoices. They appear on every invoice, and you can change them in the app.",
        ],
    },
    {
        title: "Paying each month",
        items: [
            "You pay by card. Your plan starts when the first payment goes through.",
            "Each month we charge, or send you a link to pay, on the day your plan renews, and email the invoice.",
            "If a renewal isn't paid, your plan stays for 7 days and the app shows how to pay. After that it moves to Free, and nothing you've made is deleted.",
        ],
    },
    {
        title: "Changing plans",
        paragraphs: [
            "Moving up starts the bigger plan at once. Moving down, or cancelling, takes effect at the end of the month you've paid for.",
            "We give you at least 30 days' notice by email before a price you pay goes up.",
        ],
    },
    {
        title: "Cancelling and refunds",
        items: [
            "Cancel at any time, in the app or by writing to us. You keep your plan until the end of the paid month, then it moves to Free.",
            "A month that's partly used isn't refunded.",
            "Charged twice for the same month by an error on our side? We refund it automatically to the way you paid, and email you when it's done.",
            "Charged the wrong amount? Write to us within 30 days and we refund the difference within 7 working days of confirming it.",
        ],
    },
    {
        title: "Nothing is shipped",
        paragraphs: [
            "Saroh is an online service. There are no physical goods and no delivery.",
        ],
    },
    {
        title: "Questions",
        paragraphs: [
            `Write to ${SUPPORT_EMAIL}. We reply within 30 days, and most things are sorted out much sooner.`,
        ],
    },
];

/** Terms, "Paying for Saroh" in the paid-plans switch's wording (`plan-words.ts`). */
export const termsFor = (on: boolean): readonly LegalSection[] => [
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
    ...(on ? PAID_TERMS : FREE_ONLY_TERMS),
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
        title: "Who else handles it: our sub-processors",
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
            "Google or GitHub: your name, email and account ID, only if you choose to sign in with them.",
            "Cloudflare Turnstile: your IP address and browser details, to check a form is filled in by a person and not a bot.",
            "Anthropic: the question you type in Ask AI and the business records needed to answer it, when your business turns Ask AI on. Processed outside India.",
            "Google (Calendar and Meet): the bookings Saroh adds to your calendar, your calendars' busy times and Meet link settings, when you connect Google Calendar.",
            "Meta (Facebook, Instagram) and Threads: the posts you schedule, and your Page's or profile's name and access, when you turn on Saroh Social and connect those accounts.",
        ],
    },
    {
        title: "Services you connect with your own account",
        paragraphs: [
            "Some services you connect yourself, with your own account: Stripe for your customers' payments, your own email provider (Resend) and your own WhatsApp Business number on Meta. What they receive is your customers' data, sent for your business, under that company's terms with you.",
        ],
    },
    {
        title: "Google user data",
        paragraphs: [
            "When you connect Google Calendar, Saroh reads and writes only the calendar events it makes for your bookings, your calendars' list and busy times, and Meet settings for the links it adds.",
            "Saroh's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy (developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. We don't use it for advertising, don't sell it, don't let people read it unless you ask us to for support or the law requires it, and don't use it to train AI models. Disconnect Google Calendar at any time, or remove Saroh in your Google account's settings, and we stop using it.",
        ],
    },
    {
        title: "Deleting data a Meta app connected",
        paragraphs: [
            "If you connected Facebook, Instagram or Threads to Saroh, you can have us delete what we hold from them in any of these ways.",
        ],
        items: [
            "In Saroh, open Social and disconnect the account.",
            "In Facebook, Instagram or Threads, open Settings › Apps and websites, remove Saroh and ask for your data to be deleted. Meta tells us, we delete it, and you get a confirmation code. The page Meta links you to shows what was deleted and when.",
            `Write to ${SUPPORT_EMAIL}.`,
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

/** Billing, "How paying for Saroh works" in the paid-plans switch's wording. */
export const billingFor = (on: boolean): readonly LegalSection[] => [
    {
        title: "Your customers' money is never ours",
        paragraphs: [CUSTOMER_MONEY],
    },
    ...(on
        ? PAID_BILLING
        : [
              {
                  title: "How paying for Saroh works",
                  paragraphs: [planWords(on).legal],
              },
          ]),
];
