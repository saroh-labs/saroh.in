import type { Combo } from "../types";

export const estimateUk: Combo = {
    document: "estimate",
    country: "uk",
    reviewed: false,
    lede: "A UK estimate in pounds with VAT worked out, so a client sees a likely total before saying yes. If you aren't VAT registered, take out the number and the VAT line.",
    example: {
        number: "EST-0301",
        facts: [{ label: "Site", value: "4 Quay Street, Leeds, kitchen" }],
    },
    payment: {
        text: "Nothing is owed on an estimate. If you'll take a deposit when the job goes ahead, say so here, because for VAT the money arriving usually matters more than the paperwork.",
        points: [
            "Any deposit you'll ask for",
            "The date this estimate runs out",
            "How changes are agreed before they're billed",
        ],
    },
    fields: [
        {
            name: "Price with and without VAT",
            why: "A business client looks at the first, a homeowner at the second. Show both.",
        },
        {
            name: "Site or job address",
            why: "An estimate only holds for the place you actually looked at.",
        },
    ],
    tips: [
        {
            title: "Know what a deposit does for VAT",
            text: "VAT Notice 700 says most deposits work as advance payments and create a tax point when you receive them. If a client pays one on this estimate, you may owe VAT from that date.",
        },
        {
            title: "Don't let it look like a VAT invoice",
            text: "Keep the word estimate at the top. HMRC says a pro forma should be marked this is not a VAT invoice, and the same caution applies to any paper that shows VAT before the sale.",
        },
        {
            title: "Tell a homeowner the VAT is in the total",
            text: "A client who isn't VAT registered can't claim it back, so the figure with VAT is the real one for them. Don't leave them to add 20% in their head.",
        },
    ],
    faqs: [
        {
            question:
                "Can a builder's estimate in the UK change after it's sent?",
            answer: "An estimate is your best guess, so say on the page that it can move and how far. Consumer law on this isn't covered by the tax pages we read, so check before you rely on an estimate for a big job.",
        },
        {
            question: "When does a job I estimated become a VAT sale?",
            answer: "For services, the basic tax point is the date the service is performed, unless you invoice or get paid first. For most jobs, that makes the deposit or the finish the moment to watch, not the estimate.",
        },
        {
            question:
                "Should a British sole trader show a VAT number on estimates?",
            answer: "Only if you're registered. HMRC's rules we read are about invoices, not estimates, but showing your number tells a client the VAT line is real. If you aren't registered, leave both the number and the line off.",
        },
    ],
    band: {
        title: "From estimate to VAT invoice.",
        line: "Send a UK estimate from Saroh, then turn it into a VAT invoice with the same lines when the client agrees.",
    },
};
