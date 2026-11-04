/**
 * /integrations: only what works for a business outside India today, then the
 * one list of what's coming, marked as saroh.in marks its own, with no dates.
 */
export const INTEGRATIONS = {
    title: "Integrations",
    intro: "What Saroh works with today, and what isn't built yet.",
    available: "Available",
    live: [
        {
            name: "WhatsApp",
            category: "Sharing",
            line: "Share an invoice from Saroh. It opens WhatsApp with the words typed, and you press send.",
            where: "Find it on an invoice",
        },
        {
            name: "CSV import",
            category: "Import",
            line: "Bring in products and customers from a CSV file. It imports those two only.",
            where: "Find it in Products and Customers",
        },
        {
            name: "Orders CSV",
            category: "Export",
            line: "Download your orders as a CSV file.",
            where: "Find it in Orders",
        },
        {
            name: "Your data",
            category: "Export",
            line: "Export your data, one CSV per table, invoices included. The business's owner can do this.",
            where: "Find it in Settings › Your data",
        },
    ],
    plannedTitle: "Planned · not available yet",
    plannedIntro:
        "These aren't built yet. Each one gets a changelog entry when it ships.",
    notYet: "Not available yet",
    planned: [
        {
            key: "decided",
            label: "Decided",
            rows: [
                {
                    name: "Stripe",
                    line: "Take payments online through Stripe, into your own account: online checkout, deposits, payment at booking and payment links.",
                },
                {
                    name: "Plans in US dollars",
                    line: "Grow and Pro, on sale on saroh.tech.",
                },
            ],
        },
        {
            key: "later",
            label: "Later",
            rows: [
                {
                    name: "Autopay",
                    line: "Customers' renewals paid automatically.",
                },
                {
                    name: "PayPal",
                    line: "Take payments through PayPal, into your own account.",
                },
                {
                    name: "Automatic tax by country",
                    line: "Saroh works out the tax. Today you add your tax line to an invoice you write.",
                },
            ],
        },
    ],
    ask: {
        before: "Need something else?",
        link: "Tell us what you use",
        after: "It's how we decide what comes next.",
    },
} as const;
