import type { Combo } from "../types";

export const estimateAustralia: Combo = {
    document: "estimate",
    country: "australia",
    reviewed: false,
    lede: "An Australian estimate in dollars that shows a likely cost with GST, and your ABN so the client can see who they're dealing with. It isn't a tax invoice, so it doesn't say so.",
    example: {
        number: "EST-0304",
        facts: [{ label: "Site", value: "4 Quay Street, Sydney, kitchen" }],
    },
    payment: {
        text: "Nothing is owed on an estimate. Use it to agree how the job will be billed if it goes ahead, including any deposit and the date you'd like the balance by.",
        points: [
            "Any deposit you'll ask for",
            "The date this estimate ends",
            "Whether you bill in stages or at the end",
        ],
    },
    fields: [
        {
            name: "Price with GST",
            why: "If you're registered, say whether your figure includes GST, so two estimates can be compared fairly.",
        },
        {
            name: "Site address",
            why: "An estimate is only as good as the job it describes, so name the place.",
        },
    ],
    tips: [
        {
            title: "Don't head it tax invoice",
            text: "A client's bookkeeper files what a page calls itself. Keep the word estimate at the top, and send the tax invoice once there's a real sale for it to record.",
        },
        {
            title: "Round up on the unknowns, and say so",
            text: "If you can't see behind a wall or under a floor, name that as an allowance. A clear note about what's unknown beats a low number you later have to walk back.",
        },
        {
            title: "Show the GST as part of the likely total",
            text: "Business.gov.au tells registered businesses to include GST in the prices of most things they sell. A figure with GST left out can look cheaper now and start an argument later.",
        },
    ],
    faqs: [
        {
            question: "Is an Australian estimate the same as a quote?",
            answer: "On this site an estimate is a guess that can change, and a quote is a set price. Put your meaning in writing, because a heading alone may not settle it. Ask a lawyer about a big job.",
        },
        {
            question: "Should a sole trader's estimate show an ABN?",
            answer: "We didn't read a rule that requires it on an estimate. It's still worth showing: business.gov.au lists it for invoices and receipts, so a client sees the same details the whole way through.",
        },
        {
            question: "How long can an estimate stay open in Australia?",
            answer: "None of the government pages we read sets a period, so you choose. Base it on how quickly your costs change, and print the exact end date so an old figure can't return.",
        },
    ],
};
