/**
 * What's coming, the one list: the changelog and Integrations both draw it, marked
 * as saroh.in marks its own, with no dates. Only decided work, each row checked
 * against the private claims ledger.
 */
export const NOT_AVAILABLE_YET = "Not available yet";

export const COMING_TITLE = "Planned · not available yet";

export const COMING_INTRO =
    "These aren't built yet. Each one gets a changelog entry when it ships.";

export const COMING = [
    {
        key: "next",
        label: "Coming next",
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
                name: "Subscriptions",
                line: "Plans that renew on their day, each with its invoice.",
            },
            {
                name: "Autopay",
                line: "Customers' renewals paid automatically, once Subscriptions is here.",
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
] as const;
