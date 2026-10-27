/**
 * When planned work is expected, as the changelog's Coming next and the
 * Integrations page's Planned list both say it (owner, 10 Oct 2026): the
 * nearest group keeps its months, the one after is "Early 2027", and
 * everything further out is "Later", with no date to miss.
 *
 * A group's label is drawn once, over its rows, never on every row.
 */
export const COMING_GROUPS = [
    { key: "next", label: "Nov–Dec 2026" },
    { key: "early-2027", label: "Early 2027" },
    { key: "later", label: "Later" },
] as const;

export type ComingGroupKey = (typeof COMING_GROUPS)[number]["key"];

/** The pill on every planned row, on both pages. */
export const NOT_AVAILABLE_YET = "Not available yet";

export interface ComingGroup<T> {
    key: ComingGroupKey;
    label: string;
    rows: T[];
}

/** The rows under their groups, nearest first. A group with no rows is left out. */
export function byComingGroup<T extends { group: ComingGroupKey }>(
    rows: readonly T[],
): ComingGroup<T>[] {
    return COMING_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        rows: rows.filter((row) => row.group === group.key),
    })).filter((group) => group.rows.length > 0);
}

/**
 * Planned work, never linked, each marked "Not available yet" (R15, R16),
 * under the group that says roughly when. The changelog's Coming next
 * shows every row; the Integrations page's Planned shows the rows marked
 * `integration` (one list, so the two pages can't drift apart, B3).
 *
 * Every row was checked against the code on `development` on 10 Oct 2026
 * and has its row in the claims ledger (§12, CN1–CN18) before it is here.
 * A row leaves when it is released, for an entry above (QR codes, 20 Oct).
 * A row promises only what isn't built: nothing a merchant can already do
 * is listed as coming (CSV import; their own Meta Pixel and Google
 * Analytics in Website › Settings › Tracking). No row names a plan or a
 * price.
 */
export interface ComingItem {
    group: ComingGroupKey;
    name: string;
    line: string;
    /** It connects Saroh to another service: the Integrations page lists it too. */
    integration?: true;
}

export const COMING: readonly ComingItem[] = [
    {
        group: "next",
        // A business can already connect WhatsApp in Settings › Providers
        // and write to an enquiry by hand; nothing is sent on its own. No
        // booking reminder exists on any channel yet (ledger BK2, CN1;
        // #1057), so the line doesn't promise one (20 Oct 2026).
        name: "Automatic WhatsApp messages",
        integration: true,
        line: "Order updates and pay links sent to your customers on WhatsApp for you.",
    },
    {
        group: "next",
        name: "Google Calendar sync",
        integration: true,
        line: "Bookings show up in your Google Calendar, and busy times there block the slot in Saroh.",
    },
    {
        group: "next",
        name: "Google Meet and Zoom links",
        integration: true,
        line: "Online appointments get a meeting link made for them automatically.",
    },
    {
        group: "early-2027",
        name: "Shopify import",
        integration: true,
        line: "Move products, customers and past orders over from Shopify in one go.",
    },
    {
        group: "early-2027",
        name: "PhonePe",
        integration: true,
        line: "Take payments through PhonePe, alongside Razorpay and Cashfree.",
    },
    {
        group: "early-2027",
        // An order that ships already takes a courier's name and a tracking
        // number typed by hand, so tracking alone isn't what's coming
        // (ledger CN7).
        name: "Shiprocket",
        integration: true,
        line: "Shipping labels and courier pick-up for orders that ship, with tracking filled in for you.",
    },
    {
        group: "early-2027",
        name: "Google Business Profile",
        integration: true,
        line: "Your booking or shop link on your Google listing.",
    },
    {
        group: "early-2027",
        name: "Tally and Zoho Books export",
        integration: true,
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
        integration: true,
        line: "Make posts from your products and offers in your brand, and post them to Instagram, Facebook, LinkedIn and X.",
    },
    {
        group: "later",
        name: "Canva",
        integration: true,
        line: "Open any post in Canva to edit it, or bring in designs you've made there, then schedule them from Saroh.",
    },
];
