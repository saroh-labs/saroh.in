import type { Combo } from "../types";

export const estimateSingapore: Combo = {
    document: "estimate",
    country: "singapore",
    reviewed: false,
    lede: "A Singapore estimate in dollars with the likely total including 9% GST, since a registered business has to quote with GST. The with-GST figure is the one to make clear.",
    example: {
        number: "EST-0306",
        facts: [{ label: "Site", value: "4 Quay Street, kitchen" }],
        termsText:
            "This is an estimate, not a fixed price. The total includes GST at 9%. We will ask you first if the cost looks set to go more than 10% above it.",
    },
    payment: {
        text: "Nothing is owed on an estimate. Use it to say how you'll bill if the job proceeds, and whether you'll want a deposit before you start.",
        points: [
            "Any deposit you'll ask for",
            "The date this estimate ends",
            "Stages of billing, if the job is long",
        ],
    },
    fields: [
        {
            name: "Total with GST",
            why: "Quoted prices must include GST for a registered business, so make this figure the one a client sees.",
        },
        {
            name: "Site address",
            why: "An estimate for a renovation only makes sense for one specific place.",
        },
    ],
    tips: [
        {
            title: "Never write $100 + GST",
            text: "IRAS names that format as not acceptable. If you want to show the before-tax figure too, write $109 w/GST and then $100 w/o GST, with the first at least as prominent.",
        },
        {
            title: "Drop the subject to GST wording",
            text: "A phrase like prices stated are subject to GST isn't allowed unless the GST-inclusive price is there too. Replace boilerplate from older templates before you send this one out.",
        },
        {
            title: "Remember bargaining changes the tax",
            text: "If a client talks you down, you account for GST on the final agreed price. IRAS's example: a $109 item sold for $90 has $7.43 of GST in it, not $9.",
        },
    ],
    faqs: [
        {
            question: "Does the GST price rule cover an estimate in Singapore?",
            answer: "IRAS says written or verbal quotes to the public must include GST. It doesn't name estimates separately, but an estimate is a written price, so write it the same way to be safe.",
        },
        {
            question:
                "My Singapore business isn't GST registered. What do I change?",
            answer: "Take out the GST line and the registration number. The price and display rules we read are aimed at GST-registered businesses, so leave the tax off rather than add a line you can't charge.",
        },
        {
            question: "Is there a fine for quoting without GST?",
            answer: "IRAS says not following the rule may result in a fine of up to $5,000. That's a good reason to check saved templates and email footers, because old wording is the easiest place for it to hide.",
        },
    ],
    band: {
        title: "An estimate with GST already in.",
        line: "Send a Singapore estimate from Saroh, then turn it into a tax invoice with the same lines when the client agrees.",
    },
};
