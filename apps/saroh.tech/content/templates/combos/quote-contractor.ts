import type { Combo } from "../types";

export const quoteContractor: Combo = {
    document: "quote",
    trade: "contractor",
    reviewed: false,
    lede: "Commit to a fixed price for a building job, with the drawings it rests on, the stage payments and what happens when the plans change.",
    example: {
        number: "Q-0302",
        issued: "2026-03-02",
        due: "2026-03-30",
        terms: "custom",
        depositPlan: "30",
        facts: [
            { label: "Site", value: "12 Quarry Lane, rear extension" },
            { label: "Drawings", value: "Revision C, 20 Feb" },
        ],
        termsText:
            "Fixed price for the work on drawings revision C. Changes are priced in writing as numbered variations before work starts. Materials prices held until this quote's expiry date.",
        note: "",
    },
    tips: [
        {
            title: "Name the drawing revision",
            text: "Plans shift often during design. Quoting against revision C means that when revision D adds a door, you have a clean reason to price it, and no awkward conversation.",
        },
        {
            title: "List what the owner must clear",
            text: "Planning consent, removing old kitchen units, access for deliveries. If those sit with the owner, write them down, or your crew could stand idle at your own expense.",
        },
        {
            title: "Keep the expiry date short",
            text: "Steel and timber prices can move within weeks. A quote good for 28 days means that a client coming back next spring gets a fresh number, and not an old promise.",
        },
    ],
    faqs: [
        {
            question: "What should a fixed-price building quote leave out?",
            answer: "Anything you haven't seen or priced: hidden asbestos, bad ground, planning fees, furniture removal. Name each one as excluded. An owner reading those words can't later claim they thought digging through old drains was covered.",
        },
        {
            question: "How do stage payments belong in the quote?",
            answer: "List each stage with its sum and the event that triggers it, such as slab poured or roof on. Avoid calendar dates, since weather shifts work, and an owner shouldn't pay ahead of a stage that hasn't happened.",
        },
        {
            question: "Can I change the price if steel costs jump?",
            answer: "Only if your terms allow it. Either hold the price for a set time, or add a clause that named materials move with the supplier's price, and show the owner that invoice when they do.",
        },
        {
            question: "Do I need a separate contract as well?",
            answer: "For a small job, a signed quote with clear terms may be enough. A big extension deserves a proper building contract, and a local solicitor or trade body can point you to a suitable form.",
        },
    ],
    band: {
        title: "Priced, signed, on site.",
        line: "Send the quote from your phone, take the first stage payment through your own link. 0% fees.",
    },
};
