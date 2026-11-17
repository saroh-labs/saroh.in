/**
 * /pricing's words. Nothing here names a price, a limit or what a paid plan
 * would include: Free's limits, and once paid plans are on sale the whole
 * catalogue, come from the published catalogue at build (`lib/plans.ts`).
 * The title, lead, paid cards' buttons and last usage note follow the
 * paid-plans switch (`plan-words.ts`). Plan names and taglines are saroh.in's
 * public ones.
 */
export const PRICING = {
    eyebrow: "Pricing",
    closer: "Put your business on Saroh today.",
    /** Free leads: it's the one plan with something to press. */
    plans: [
        { plan: "free", name: "Free", featured: true },
        { plan: "grow", name: "Grow", featured: false },
        { plan: "pro", name: "Pro", featured: false },
    ],
    /** The absent mark, where a price would be. */
    noPrice: "—",
    words: {
        free: {
            tagline: "For getting your business online.",
            price: "No charge",
            sub: "No card needed",
        },
        grow: { tagline: "For one place that sells, books and bills." },
        pro: { tagline: "For a business with more than one place." },
    } as Record<string, { tagline: string; price?: string; sub?: string }>,
    /** Free's card with no catalogue at build. */
    freeLines: [
        "Your website on a saroh.app address",
        "Products, variants and stock",
        "Orders at the counter",
        "Bookings on your own calendar",
        "One page per customer",
        "Numbered invoices in your currency",
    ],
    /** What Free has with no limit, under its limits. */
    freeAlways: ["One page per customer", "Numbered invoices in your currency"],
    paidLead: "We'll say what it includes when it's on sale.",
    footnote: "Free has limits on how much you can use.",
    /** Each plan's usage, as saroh.in's "Usage beyond your plan" table. */
    usageTitle: "What each plan includes",
    usageLead:
        "How much each plan includes, and what happens when you reach it.",
    /** What a screen reader hears in a table cell with no catalogue. */
    priceNote: "Prices aren't available right now",
    usageNotes: [
        "Saroh warns you as you near a limit, and it never deletes what you already have.",
        "A limit counted by the month starts again on the 1st, in your business's time zone.",
        "Bookings you add yourself and the sessions of a course don't count towards online bookings.",
    ],
} as const;
