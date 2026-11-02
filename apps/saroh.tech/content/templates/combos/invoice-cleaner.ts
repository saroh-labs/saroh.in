import type { Combo } from "../types";

export const invoiceCleaner: Combo = {
    document: "invoice",
    trade: "cleaner",
    reviewed: false,
    lede: "Set up for cleaning work: weekly visits, one-off deep cleans, ovens and windows, supplies, all with the property address at the top. Fill it online, or download the file.",
    example: { number: "INV-0102" },
    tips: [
        {
            title: "List the visit dates",
            text: "'4 visits' raises a question if a client was away for one of them. Writing each date on the bill settles it before they ask, and it stops the same query every month.",
        },
        {
            title: "Bill a deep clean separately",
            text: "Don't fold a one-off job into the regular monthly amount. On its own line, the client sees why this bill is higher, and they don't think your weekly price has quietly changed.",
        },
        {
            title: "Charge for a locked door",
            text: "If you arrive and can't get in, you've still lost the slot. Put a short late-cancel rule on every invoice, so a fee for it never comes as a surprise to anyone.",
        },
    ],
    faqs: [
        {
            question: "Do I bill per hour or per house?",
            answer: "Both work, and you can use both on one bill. A set price per visit is simpler for regular homes once you know how long they take. Per hour suits first cleans or messy jobs, where the time is really hard to judge in advance.",
        },
        {
            question: "Should I charge separately for supplies?",
            answer: "It's up to you, but say so at the start. Some cleaners build products into the visit price, and others add a small monthly amount. If a client asks for a special product, list what it cost as its own line.",
        },
        {
            question: "How do I invoice a landlord between tenants?",
            answer: "Treat each end-of-tenancy clean as its own job, and write the property address and date on the bill. Letting agents file by address, so that detail gets you paid sooner. Add before-and-after photos if the landlord may need proof of the work.",
        },
        {
            question: "What if a regular client skips a week?",
            answer: "Decide your rule first and keep to it. With enough notice, most cleaners simply leave that visit off the monthly bill. A skip with no warning might carry a fee, as long as your client already knows about it.",
        },
    ],
    band: {
        title: "Spend your time cleaning, not chasing.",
        line: "Bill regular clients in one tap each month, and let them pay through your own link. 0% fees.",
    },
};
