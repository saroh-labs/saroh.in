export interface ChangelogSection {
    name: string;
    body: string;
}

export interface ChangelogEntry {
    slug: string;
    /** yyyy-mm-dd */
    date: string;
    title: string;
    summary: string;
    /** Global: saroh.tech only. Both: saroh.tech and saroh.in. */
    tag: "Global" | "Both";
    /** The entry's own page, under the summary. */
    sections?: readonly ChangelogSection[];
    try?: { label: string; href: string };
}

/**
 * Newest first. Each sentence is true of one person on Free outside India (the
 * private claims ledger, DEC-203), with no price, plan limit or development
 * address. An entry's title leaves its page title 60 characters or fewer.
 */
export const CHANGELOG: ChangelogEntry[] = [
    {
        slug: "fewer-false-alarms",
        date: "2026-11-04",
        title: "Fewer false alarms on Free",
        summary:
            "Hours and Time off no longer tell you that you've reached a limit when nothing is wrong. A note on a customer now reads true when you run the business alone.",
        tag: "Both",
        try: { label: "See Bookings", href: "/features/bookings" },
    },
    {
        slug: "your-currency-on-home",
        date: "2026-11-04",
        title: "Your currency on Home",
        summary:
            "A zero on Home and on the booking screens now reads in your business's currency, and Home's money icon follows it.",
        tag: "Global",
        try: { label: "See the dashboard", href: "/features/dashboard" },
    },
    {
        slug: "features-solutions-help",
        date: "2026-11-04",
        title: "Features, solutions, help",
        summary:
            "Nine feature pages, four solution pages and step-by-step help, each saying what Saroh does today outside India. What isn't built yet is on one list, marked Not available yet.",
        tag: "Global",
        try: { label: "Read Help", href: "/help" },
    },
    {
        slug: "your-own-tax-line",
        date: "2026-11-03",
        title: "Your own tax line",
        summary:
            "Add your tax line to an invoice you write, with your own name for it, your rate and your tax number. Saroh doesn't work out the tax for you.",
        tag: "Global",
        sections: [
            {
                name: "On the invoice",
                body: "Name the line, say VAT 20%, and it's added on top of the invoice's lines. It stays as you wrote it on that invoice, with your tax number beside it. It works on an invoice you write by hand.",
            },
            {
                name: "Your numbers",
                body: "Invoices are numbered in order. Choose a numbering year that starts in January or in April. Record the payment, and the invoice becomes a receipt.",
            },
        ],
        try: { label: "See Billing", href: "/features/billing" },
    },
    {
        slug: "set-up-in-your-country",
        date: "2026-11-03",
        title: "Set up in your country",
        summary:
            "Set up your business in your own country, in one of nine currencies. Your phone number can be from anywhere.",
        tag: "Global",
        sections: [
            {
                name: "Your country",
                body: "Setup asks where your business is. If you're in India, saroh.in is the one for you. To change the country later, write to us.",
            },
            {
                name: "Your currency",
                body: "US dollars, euros, pounds, Canadian, Australian, New Zealand and Singapore dollars, UAE dirhams or South African rand, suggested from your country. New prices start in it, and money groups in thousands.",
            },
            {
                name: "Your phone number",
                body: "Your business phone takes any country's number. Start it with a +, and the app's phone fields start on your country.",
            },
        ],
        try: { label: "See what's on Free", href: "/pricing" },
    },
    {
        slug: "templates",
        date: "2026-11-02",
        title: "Free templates",
        summary:
            "Templates for your documents, by country and by trade, ready to fill in with the free tools.",
        tag: "Global",
        try: { label: "See the templates", href: "/templates" },
    },
    {
        slug: "six-free-tools",
        date: "2026-11-02",
        title: "Six free tools are live",
        summary:
            "Invoice generator, quote maker, receipt maker, payment reminder writer, late fee calculator and a VAT, sales tax and GST calculator. No sign-up, no watermark.",
        tag: "Global",
        try: { label: "Try the tools", href: "/tools" },
    },
];

export const changelogPath = (e: Pick<ChangelogEntry, "date" | "slug">) =>
    `/changelog/${e.date}-${e.slug}`;
