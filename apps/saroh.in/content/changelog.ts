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
                name: "Your website",
                // Design: "Start from a template made for your kind of
                // business…" with "See templates". /templates ships with
                // this entry (industry templates U13), so the link is back,
                // drawn only while the gallery is shown (`linkShown`). "Made
                // for your kind of business" is still not claimed: not every
                // kind has one yet (no salon). Ledger CL8.
                body: "Start from a template, connect your own domain, and set how each page looks when it's shared on WhatsApp or Facebook.",
                link: { label: "See templates", href: "/templates" },
            },
        ],
        signoff: "Team Saroh",
        description:
            "Saroh's early access is open: orders, products and stock, bookings, monthly plans, GST invoices, payments to your own account, emails to your customers and your own website, in one place.",
    },
];

/** Planned work, never linked, each marked "Not available yet" (R15, R16). */
export interface ComingNext {
    when: string;
    name: string;
    line: string;
}

export const COMING_NEXT: readonly ComingNext[] = [
    {
        when: "Nov–Dec 2026",
        name: "Google Calendar sync",
        line: "Bookings show up in your Google Calendar.",
    },
    {
        when: "Nov–Dec 2026",
        name: "Google Meet and Zoom links",
        line: "Online appointments get a meeting link made for them automatically.",
    },
    {
        when: "Jan–Mar 2027",
        name: "Shopify import",
        line: "Move products, customers and past orders over from Shopify in one go.",
    },
    {
        when: "Apr–Jun 2027",
        name: "Social publishing",
        line: "Make posts from your products and offers in your brand, and post them to Instagram, Facebook, LinkedIn and X.",
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
    notYet: "Not available yet",
    readMore: "Read the full note",
    metaDescription:
        "What's new in Saroh, the one place a small business in India sells, takes bookings, invoices and runs its website. Every release, and what's coming next.",
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
