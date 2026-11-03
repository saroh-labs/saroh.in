import type { Combo } from "../types";

export const estimateUs: Combo = {
    document: "estimate",
    country: "us",
    reviewed: false,
    lede: "A US estimate in dollars on Letter paper. It shows your best guess at the job, with sales tax worked out so the client sees a likely total before saying yes.",
    example: {
        number: "EST-0302",
        facts: [{ label: "Site", value: "4 Quay Street, kitchen" }],
    },
    payment: {
        text: "Nothing is owed on an estimate yet. Use it to agree how you'll bill once the job goes ahead, so the first invoice brings no surprises.",
        points: [
            "Say if you'll want a deposit to start",
            "Name the date this estimate runs out",
            "Say when the final invoice will go out",
        ],
    },
    fields: [
        {
            name: "State of the job",
            why: "Sales tax can follow the place, so name it now rather than guess later.",
        },
        {
            name: "Parts and labor apart",
            why: "Texas says some services are taxable. Keeping these separate makes the tax easier to work out.",
        },
        {
            name: "How far it can move",
            why: "A plain limit, such as asking before going 10% over, avoids an argument at the end.",
        },
    ],
    tips: [
        {
            title: "Ask your state what's taxable on a job",
            text: "A rate tells you little until you know what it applies to. The Texas Comptroller says some services are taxable, and it publishes a list. Check before you add a tax line to labor.",
        },
        {
            title: "Show the local rate in the likely total",
            text: "California adds district taxes of 0.10% to 2.00% to its statewide 7.25%. A client comparing two estimates looks at the bottom line, so a state-only figure can make yours look wrong later.",
        },
        {
            title: "Date it for a world where prices move",
            text: "Lumber or a subcontractor's rate can shift in a few weeks. Give every estimate an end date, then send a fresh one rather than arguing over an old number.",
        },
    ],
    faqs: [
        {
            question: "Is a US estimate a binding price?",
            answer: "Treat it as your best guess, and say so at the top and in the terms. Whether a promise binds you is a contract question under your state's law, which the tax pages we read don't cover. Ask a lawyer about a large job.",
        },
        {
            question: "Should sales tax appear on an American job estimate?",
            answer: "If the finished job will be taxed, showing it gives your client an honest total. Use the rate for the place where the sale is taxed, then adjust the final invoice if the local rate turns out different.",
        },
        {
            question: "What if a Texas job costs more than the estimate said?",
            answer: "Tell the client before the extra cost lands, and write down what they agreed. Then send a fresh estimate or a change note, so the final invoice lines up with what they saw and approved.",
        },
    ],
    band: {
        title: "Estimates that turn into invoices.",
        line: "Send a US estimate from Saroh, and when the client agrees, carry the lines across without typing them again.",
    },
};
