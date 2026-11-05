import type { Combo } from "../types";

export const proformaInvoiceMakeupArtist: Combo = {
    document: "proforma-invoice",
    trade: "makeup-artist",
    reviewed: false,
    lede: "For the agency, brand or production team that must have your day rate on paper before they can release money for a shoot, a show or a campaign.",
    items: [
        {
            line: "Shoot day rate",
            billedBy: "Per day",
            description: "Lead artist, campaign shoot",
            qty: "2",
            rate: "600",
        },
        {
            line: "Assistant",
            billedBy: "Per day",
            description: "Assistant artist",
            qty: "2",
            rate: "250",
        },
        {
            line: "Models",
            billedBy: "Per model above the day's limit",
            description: "Added models, above 6 a day",
            qty: "4",
            rate: "50",
        },
        {
            line: "Prep and test look",
            billedBy: "Per hour",
            description: "Look test before the shoot, hours",
            qty: "3",
            rate: "60",
        },
        {
            line: "Kit fee",
            billedBy: "Flat fee per day",
            description: "Kit and hygiene supplies",
            qty: "2",
            rate: "40",
        },
        {
            line: "Travel and parking",
            billedBy: "Per trip",
            description: "Travel and parking, trips",
            qty: "2",
            rate: "30",
        },
    ],
    fields: [
        {
            name: "Production or job number",
            why: "Agencies run many jobs, and finance can't place your cost without it.",
        },
        {
            name: "Call time and overtime point",
            why: "It marks when your day starts, and when a longer day starts to cost more.",
        },
        {
            name: "The word Proforma",
            why: "It keeps the production accountant from recording this as money already owed to you.",
        },
    ],
    example: {
        number: "PRO-0001",
        issued: "2026-02-02",
        due: "2026-02-16",
        client: { name: "Agency name", email: "production@example.com" },
        facts: [
            { label: "Shoot dates", value: "9 and 10 Mar" },
            { label: "Call time", value: "7:00 am" },
            { label: "Job no.", value: "JOB-0309" },
        ],
        note: "This proforma is for approval. A final invoice follows the shoot, with any overtime shown.",
    },
    tips: [
        {
            title: "Set the length of your day",
            text: "A day rate means nothing without its hours. State how long a day runs, and your overtime rate after that, so a late wrap doesn't turn into a negotiation at dusk.",
        },
        {
            title: "Set a limit on faces",
            text: "Six models and twenty models are different days. Name how many your day rate covers, then show what each added model costs, so the brief can't quietly grow.",
        },
        {
            title: "Show kit as its own line",
            text: "Production teams know kit costs money, and they expect to see it. Listing it apart also makes clear what your own skill costs, which helps when your rate gets questioned.",
        },
    ],
    faqs: [
        {
            question: "When would a client ask a makeup artist for a proforma?",
            answer: "Mostly on commercial work. A production company might need it to open a purchase order, or a brand may have to pay a new supplier in advance. Weddings rarely need one, since a quote covers that.",
        },
        {
            question:
                "How do I handle a shoot that gets cancelled after approval?",
            answer: "A proforma alone doesn't create a charge. If you want a cancellation fee, agree the rule in the booking email or your terms, then bill that on a real invoice. Your notes can quote the cut-off dates.",
        },
        {
            question:
                "A foreign brand wants to pay me before the shoot. What do I add?",
            answer: "Add the currency you're charging in, your bank details and who bears transfer costs. They might ask for a tax form as well. Ask their accounts team what they need, and check tax treatment locally.",
        },
    ],
};
