import type { ComingGroupKey } from "./coming";
import { NOT_AVAILABLE_YET } from "./coming";
import type { IsoDay, PublishContext } from "./resources";
import { isLive } from "./resources";

/**
 * The changelog (plan U4, design "Saroh Resources - Changelog" 1a): its
 * entries, dated and published by day (KTD-2), and the Coming next list.
 *
 * Every sentence in an entry describes what is built today (claims ledger,
 * `docs/architecture/MARKETING_CLAIMS.md` §12). No prices, plan limits or
 * offer lengths: the launch offer is read from the API on the page.
 */

export interface ChangelogSection {
    name: string;
    body: string;
    /** "See Orders →". Drawn only while its page is shown (`linkShown`). */
    link?: { label: string; href: string };
}

export interface ChangelogEntry {
    slug: string;
    /** The day it goes live, in India. */
    publishOn: IsoDay;
    /** What kind of entry, under its date: "Early access". */
    kind: string;
    title: string;
    /** The list's paragraph under the title. */
    summary: string;
    /** The entry's opening paragraph. */
    lead: string;
    sections: ChangelogSection[];
    signoff: string;
    /** The search result's line. */
    description: string;
}

export const changelogHref = (slug: string) => `/changelog/${slug}`;

export const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
    /**
     * Released to production on 18 Oct 2026 (release PR #977): the products
     * audit fixes (#972) and Home's open orders (DEC-163). Only what every
     * merchant can use in production today (ledger CL11–CL17). Saroh's own
     * billing (cancel in the app, billing details, double charges) waits for
     * live billing and gets its own entry; the admin console and the demo
     * businesses are not the merchant's.
     */
    {
        slug: "products-tidied-up",
        publishOn: "2026-10-18",
        kind: "Improvements",
        title: "Products, tidied up",
        summary:
            "Products now says how many you can sell, and you restock, publish and fix things where you are. Import reads your own spreadsheet, settings are simpler, and Home lists only the orders due soon.",
        lead: "A day after opening, a round of fixes from a close look at every products screen, and one for Home. There's nothing to switch on: it's all there already.",
        sections: [
            {
                name: "What you can sell",
                // Stock cell "to sell" and the worst shelf; Needs you leaves
                // out drafts and archived products; Restock opens the quick
                // look with the Add box focused (feb2eb0a5). Ledger CL11.
                // Not "on your site": the online shop is off (SITE_SHOP).
                body: "The Products list now says how many of each thing you can sell, after what's promised to orders, and names the size, shade or location that's short. Needs you leaves out drafts and archived products, and Restock opens that product right there, ready for what you're adding.",
                link: { label: "See Products", href: "/features/products" },
            },
            {
                name: "A product's own page",
                // Header by state: Publish, Sell again, Archive in the menu;
                // stock card names what is out with Add stock (4c98c7440);
                // the stock sheet focuses its first count (7413e87fb);
                // quick look opens the page (d77955316); one word, Archive
                // (aa56f92fb). Ledger CL12.
                body: "Publish a draft, add stock or bring an archived product back from its own page. The stock card names what's out, with Add stock beside it, and the stock sheet opens on its first count, ready to type. From the quick look, one tap opens the product's page. Taking a product off sale is called Archive everywhere now, and Sell again brings it back.",
            },
            {
                name: "Adding and editing",
                // 9a5a60376: a taken name gets the next free path, a taken
                // SKU is refused naming its holder, Create draft is never
                // off. Ledger CL13. The path is not named: it is a site
                // address, and the online shop is off.
                body: "Two products can now share a name, and Saroh keeps them apart for you. A SKU another product already uses is caught when you save, and Saroh tells you which product has it. Press Create draft before the name and price are in and it shows you what's missing.",
            },
            {
                name: "Product settings",
                // Defaults card and category rows (36d8d27b4); option values
                // renamed in place, reordered, sorted A to Z (3e8bcc3ce);
                // Uncategorized and an option's count open the list
                // (c4ebfbc75, 3e8bcc3ce). Ledger CL14.
                body: "Defaults are one card: when stock counts as low for every product, then a row for each category saying only what it changes. Rename a size or shade where it stands and every product using it follows. Drag them into order, or sort them A to Z. Uncategorized, and the count beside each option, open the products they cover.",
            },
            {
                name: "Bringing products in",
                // 749df7fd9: status in any case (Live, Active, Published,
                // Hidden), amounts with a rupee sign and commas, GST with a
                // %, one line for a missing column, rows numbered as the
                // spreadsheet does, a sample file from the API's descriptor
                // for products and customers. Ledger CL15.
                body: "Import reads a spreadsheet the way a shop writes it: Live or Hidden in any case, prices with a rupee sign or commas, GST with a % after it. A column that's missing is said once, not on every row, and rows are numbered as your spreadsheet numbers them. Not sure how to lay it out? Download a sample file for products or customers and fill it in.",
            },
            {
                name: "Locations for your whole team",
                // 29dcd8996: New product, Import and Edit read the
                // business's locations for every role; Edit is read-only
                // for a role that can't change products. Ledger CL16.
                body: "Everyone on your team now sees your business's locations when they add or bring in products. Someone who can look at products but not change them opens a product read-only, instead of being told it wasn't found.",
            },
            {
                name: "Home",
                // DEC-163, f4b2052e9: late or due today or tomorrow, by the
                // location's own late times; "and N more in progress" links
                // to Orders' Open tab. Ledger CL17.
                body: "Needs you lists an open order only when it's late, or due today or tomorrow. The rest stay in Orders, and Home tells you how many more are in progress, with a link to them.",
                link: { label: "See Dashboard", href: "/features/dashboard" },
            },
        ],
        signoff: "Team Saroh",
        description:
            "Products in Saroh now say what you can sell, restock and publish where you are, read your own spreadsheet, and Home lists only orders due soon.",
    },
    {
        slug: "saroh-is-open",
        publishOn: "2026-10-17",
        kind: "Early access",
        title: "Early access is open",
        summary:
            "Orders, products and stock, bookings, monthly plans, GST invoices, payments through your own Razorpay or Cashfree account, emails to your customers, and a website with your own domain. All in one place.",
        lead: "From today anyone can start a business on Saroh, in early access: everything works, and some things may still be rough. Here's everything that's in it on day one. The name means rising together: स + आरोह. That's the plan.",
        sections: [
            {
                name: "Orders",
                // Design: "…Late ones are flagged, and every step tells the
                // customer." Not built (ledger OR1, OR11): dropped.
                body: "Orders from your site and the counter land in one list, with pick-up, delivery, shipping or visits. Late ones are flagged.",
                link: { label: "See Orders", href: "/features/orders" },
            },
            {
                name: "Products and stock",
                // Merchants read "location", never "storefront" (DEC-069).
                body: "Add a product once and it's right on your site, in orders and on invoices. Sizes with their own prices, stock for each location, and a warning before something runs out.",
                link: { label: "See Products", href: "/features/products" },
            },
            {
                name: "Bring your lists in",
                // Built 30 Aug 2026 (#175: 663375343, 324ca21e7), so it is
                // here on day one and no longer in Coming next (#816).
                // `imports/entities.ts`: products and customers only, from a
                // CSV file, with a preview before anything is written.
                // Ledger CL10.
                body: "Already keep your products or customers in a spreadsheet? Bring them in from a CSV file: match its columns, see what will be added, updated or skipped, then import.",
            },
            {
                name: "Bookings",
                // Design: "…and get a reminder email." No booking reminder
                // exists (ledger BK2): dropped.
                body: "Appointments, classes and treatments over several visits. Customers book real free times on your site, and pay a deposit if you ask for one.",
                link: { label: "See Bookings", href: "/features/bookings" },
            },
            {
                name: "Subscriptions",
                // Design: "…renew by UPI Autopay or card … a failed payment is
                // retried". Autopay is the merchant's own set-up and nothing
                // retries on its own (ledger SU2, D1): the shipped wording.
                body: "Memberships and regular orders that renew on their day. Each renewal makes its invoice, plans can renew on their own by UPI Autopay where you've set it up on your Razorpay account, and a failed payment is shown to you with a new pay link.",
                link: {
                    label: "See Subscriptions",
                    href: "/features/subscriptions",
                },
            },
            {
                name: "Billing and GST",
                // Design: "Every paid order, booking and renewal gets a
                // numbered GST tax invoice, or a bill of supply if you don't
                // charge GST." Bookings and renewals invoice with Payments
                // on, and a bill of supply is for GST-exempt sales (ledger
                // BI6, F2): the shipped wording.
                body: "Every paid order gets a numbered invoice with the right tax, and with Payments on, so do bookings paid online and every renewal. GST-exempt sales go on a bill of supply. Overdue bills are flagged, with a reminder and a pay link ready to send.",
                link: { label: "See Billing", href: "/features/billing" },
            },
            {
                name: "Payments",
                body: "Connect your own Razorpay or Cashfree account. Customers pay by UPI, card or netbanking, and the money goes straight to you. Saroh never holds it.",
                link: { label: "See Razorpay", href: "/integrations/razorpay" },
            },
            {
                name: "Emails to customers",
                // Design: "Order updates, booking reminders and invoices go
                // out by email, from your own address once you add your
                // domain." No booking reminder exists, and order updates
                // reach only a verified site account (ledger BK2, OR11):
                // what is sent is named.
                body: "Invoices and reminders to pay go to your customers by email, through your own email account, so they come from your address.",
                link: {
                    label: "See email sending",
                    href: "/integrations/email",
                },
            },
            {
                name: "QR codes",
                // Released to production on 11 Oct 2026 (#925, #932), so it is
                // here on day one and no longer in Coming next (DEC-119,
                // ledger CN2). Settings › Share and the QR button on a
                // product, an order's pay link, an invoice and the site's
                // address (`components/qr/`). The logo and colour depend on
                // the plan (`qr-style-lock.ts`) and scan counts are the
                // plan's, so neither is claimed here.
                body: "A QR code for your website, a product, a pay link or an invoice, from Settings › Share or the QR button beside it. Download it, or print it ready for the counter.",
            },
            {
                name: "Your website",
                // Design: "Start from a template made for your kind of
                // business…" with "See templates". /templates ships with
                // this entry (industry templates U13), so the link is back,
                // drawn only while the gallery is shown (`linkShown`). "Made
                // for your kind of business" is still not claimed: not every
                // kind has one yet (no salon). Ledger CL8.
                // Templates are held back for now (DEC-135; owner, 11 Oct),
                // so the sentence no longer opens with "Start from a
                // template". Put it back when the gallery returns.
                body: "Connect your own domain, and set how each page looks when it's shared on WhatsApp or Facebook.",
                link: { label: "See templates", href: "/templates" },
            },
        ],
        signoff: "Team Saroh",
        description:
            "Saroh's early access is open: orders, products and stock, bookings, monthly plans, GST invoices, payments to your own account, emails to your customers and your own website, in one place.",
    },
];

/**
 * Planned work, never linked, each marked "Not available yet" (R15, R16),
 * under the group that says roughly when (`./coming`).
 *
 * Every row was checked against the code on `development` on 10 Oct 2026
 * and has its row in the claims ledger (§12, CN1–CN18) before it is here.
 * A row leaves when it is released, for an entry above (QR codes, 20 Oct).
 * A row promises only what isn't built: nothing a merchant can already do
 * is listed as coming (CSV import; their own Meta Pixel and Google
 * Analytics in Website › Settings › Tracking). No row names a plan or a
 * price.
 */
export interface ComingNext {
    group: ComingGroupKey;
    name: string;
    line: string;
}

export const COMING_NEXT: readonly ComingNext[] = [
    {
        group: "next",
        // A business can already connect WhatsApp in Settings › Providers
        // and write to an enquiry by hand; nothing is sent on its own. No
        // booking reminder exists on any channel yet (ledger BK2, CN1;
        // #1057), so the line doesn't promise one (20 Oct 2026).
        name: "Automatic WhatsApp messages",
        line: "Order updates and pay links sent to your customers on WhatsApp for you.",
    },
    {
        group: "next",
        name: "Google Calendar sync",
        line: "Bookings show up in your Google Calendar, and busy times there block the slot in Saroh.",
    },
    {
        group: "next",
        name: "Google Meet and Zoom links",
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
        // An order that ships already takes a courier's name and a tracking
        // number typed by hand, so tracking alone isn't what's coming
        // (ledger CN7).
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
        group: "early-2027",
        name: "Saroh for Android",
        line: "Run your day from your phone: bookings, walk-ins, orders and payments, in English, Hindi or Hinglish. Works without internet.",
    },
    {
        group: "early-2027",
        // Invoices already carry the business's logo and GSTIN (ledger
        // BI7), so the design's "add your logo, colours, GSTIN…" names only
        // what is new (ledger CN11).
        name: "Invoice layouts",
        line: "Pick an invoice layout, set its colours, terms and a signature, and see it before it goes out.",
    },
    {
        group: "early-2027",
        name: "Sign in with Google",
        line: "Your customers sign in to your booking or shop page with Google. GitHub too.",
    },
    {
        group: "later",
        name: "Bring your own login",
        line: "Already have an app with Firebase, Clerk or Auth0? Your customers keep one account.",
    },
    {
        group: "later",
        name: "API keys and webhooks",
        line: "Connect Saroh to your own tools, n8n and AI assistants, with keys you control.",
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

export const CHANGELOG = {
    title: "Changelog",
    sub: "What's new in Saroh, written for the people who use it.",
    signupLabel: "Get one email when something ships",
    /** The one consent line under the email field (KTD-5). */
    // It joins the waitlist's list (KTD-5), so the early access invite
    // reaches it too, and the line says so.
    signupNote:
        "Only email about Saroh: what ships, and an invite to early access. Write to contact@saroh.in to be taken off the list.",
    signupDone: "Done. We'll email you when something ships.",
    comingTitle: "Coming next",
    comingSub:
        "None of these is available yet. Times are rough and can move. When one ships, it gets its own entry above.",
    notYet: NOT_AVAILABLE_YET,
    readMore: "Read the full note",
    metaTitle: "Changelog and product updates · Saroh",
    metaDescription:
        "Changelog for Saroh, business software for small businesses in India: every release in plain words, and what's coming next.",
} as const;

/** The entries live now, newest first. */
export function liveEntries(ctx: PublishContext): ChangelogEntry[] {
    return CHANGELOG_ENTRIES.filter((e) => isLive(e, ctx)).sort((a, b) =>
        b.publishOn.localeCompare(a.publishOn),
    );
}

/** The first entry's day: the pre-launch state names it (R15). */
export function firstEntryDay(): IsoDay | null {
    const days = CHANGELOG_ENTRIES.map((e) => e.publishOn).sort();
    return days[0] ?? null;
}

/** "17 Oct 2026", as the list's date column writes it. */
export function entryDate(day: IsoDay): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    }).format(new Date(`${day}T12:00:00+05:30`));
}

/** "17 October", as the pre-launch line writes it. */
export function entryDayLong(day: IsoDay): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        timeZone: "Asia/Kolkata",
    }).format(new Date(`${day}T12:00:00+05:30`));
}

export function findEntry(slug: string): ChangelogEntry | undefined {
    return CHANGELOG_ENTRIES.find((e) => e.slug === slug);
}

/** What `/changelog` shows: its entries, or before the first one, the day it comes. */
export type ChangelogView =
    | { state: "entries"; entries: ChangelogEntry[] }
    | { state: "pre-launch"; firstDay: IsoDay | null };

export function changelogView(ctx: PublishContext): ChangelogView {
    const entries = liveEntries(ctx);
    return entries.length > 0
        ? { state: "entries", entries }
        : { state: "pre-launch", firstDay: firstEntryDay() };
}
