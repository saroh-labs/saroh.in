/**
 * /pricing's words. Only Free can be used on this edition: plans aren't on sale
 * until stage 9, so nothing here names a price, a limit or what a paid plan
 * would include, and there's nothing to add at a limit. Free's limits come from the published catalogue at build
 * (`lib/plans.ts`). Plan names and taglines are saroh.in's public ones.
 */
export const PRICING = {
    eyebrow: "Pricing",
    title: "Start free. Paid plans come later.",
    intro: "Free is the plan you can use today, with no card. Grow and Pro aren't available yet, so there's nothing to buy here.",
    closer: "Put your business on Saroh today.",
    /** Free leads: it's the one plan with something to press. */
    plans: [
        { plan: "free", name: "Free", featured: true },
        { plan: "grow", name: "Grow", featured: false },
        { plan: "pro", name: "Pro", featured: false },
    ],
    /** The absent mark, where a price would be. */
    noPrice: "—",
    notYet: "Not available yet",
    /** "Tell me when" under a paid plan (KTD8): one email when paid plans open. */
    tellMe: {
        ask: "Tell me when",
        asked: "We'll tell you",
        askedLine: "We'll email you when paid plans are available.",
        label: "Your email",
        invalid: "Enter an email like name@shop.com.",
        check: "The check didn't pass. Try again.",
        failed: "We couldn't send that just now. Try again in a minute.",
    },
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
    /** saroh.in's "Usage beyond your plan", for the one plan you can use. */
    usageTitle: "What happens at Free's limits",
    usageLead: "What Free includes, and what happens when you reach it.",
    usageNotes: [
        "Saroh warns you as you near a limit, and it never deletes what you already have.",
        "A limit counted by the month starts again on the 1st, in your business's time zone.",
        "Bookings you add yourself and the sessions of a course don't count towards online bookings.",
        "You can't buy more yet: paid plans aren't on sale.",
    ],
} as const;
