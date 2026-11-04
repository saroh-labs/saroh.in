/**
 * /pricing's words. Only Free can be used on this edition: plans aren't on sale
 * until stage 9, so nothing here names a price, a limit or what a paid plan
 * would include. Free's limits come from the published catalogue at build
 * (`lib/plans.ts`). Plan names and taglines are saroh.in's public ones.
 */
export const PRICING = {
    eyebrow: "Pricing",
    title: "Start free. Paid plans come later.",
    intro: "Free is the plan you can use today, with no card. Grow and Pro aren't available yet, so there's nothing to buy here.",
    closer: "Start your site for free.",
    /** Free leads: it's the one plan with something to press. */
    plans: [
        { plan: "free", name: "Free", featured: true },
        { plan: "grow", name: "Grow", featured: false },
        { plan: "pro", name: "Pro", featured: false },
    ],
    /** The absent mark, where a price would be. */
    noPrice: "—",
    notYet: "Not available yet",
    words: {
        free: {
            tagline: "For getting your business online.",
            price: "Free",
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
        "Bookings with your staff",
        "One page per customer",
        "Numbered invoices in your currency",
    ],
    /** What Free has with no limit, under its limits. */
    freeAlways: ["One page per customer", "Numbered invoices in your currency"],
    paidLead: "We'll say what it includes when it's on sale.",
    footnote: "Free has limits on how much you can use.",
} as const;
