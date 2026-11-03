import type { Combo } from "../types";

export const invoicePlumber: Combo = {
    document: "invoice",
    trade: "plumber",
    reviewed: false,
    lede: "Set up for plumbing jobs: call-out, hours on site, each part you fitted and the job address. Fill it online on your phone at the job, or download the file.",
    example: { number: "INV-0203", due: "2026-03-21", terms: "custom" },
    tips: [
        {
            title: "List parts one by one",
            text: "'Materials' on its own looks like padding. A named tap and a pack of fittings look like what they are, and they answer the first question a landlord's agent asks.",
        },
        {
            title: "Keep call-out and labour apart",
            text: "A single large number at the end of a short visit feels steep. Separate lines show that the fee covers getting there, and the hours cover the work itself.",
        },
        {
            title: "Say who's paying before you start",
            text: "Tenants call you, but landlords often pay. Get the billing name and address on the first visit, or your invoice sits with the wrong person for weeks.",
        },
    ],
    faqs: [
        {
            question: "Can I charge more for out-of-hours work?",
            answer: "Yes, if you told the customer before you started. Most jobs fall into two rates, so show the normal labour line and then the extra as a line of its own. Give the rate on the phone when someone rings with an emergency.",
        },
        {
            question: "How do I bill parts I bought for the job?",
            answer: "List each part with its price, and keep your supplier receipts. You can add a handling margin if you wish, as long as the total matches what you quoted. For anything expensive, get the customer's okay before you buy it.",
        },
        {
            question: "What if I have to come back to finish?",
            answer: "If the return was your choice, don't bill a second call-out. If it's waiting on a part the customer picked or a problem you couldn't see, say so. Then one invoice with both visit dates usually covers the whole job.",
        },
        {
            question: "Who do I invoice when a tenant called me out?",
            answer: "Ask before you arrive. If the landlord or agent is paying, get their approval and billing details, then show the rental as the job address. Billing the tenant by mistake can delay you for weeks while they pass it along.",
        },
    ],
    band: {
        title: "Paid before you're back in the van.",
        line: "Send the invoice from your phone at the job, and let the customer pay through your own link. 0% fees.",
    },
};
