import type { Combo } from "../types";

export const invoiceContractor: Combo = {
    document: "invoice",
    trade: "contractor",
    reviewed: false,
    lede: "Bill one stage of a building job: crew days, materials, subcontractors, skips and signed-off changes, with what's been paid so far taken off the total.",
    example: {
        number: "INV-0302",
        issued: "2026-04-10",
        due: "2026-04-24",
        terms: "custom",
        depositPaid: "2000",
        depositLabel: "Stage 1 payment received",
    },
    tips: [
        {
            title: "Name the stage in the first line",
            text: "Walls and roof finished says more than a percentage does. An owner who can walk out and look at the finished roof has far less reason to hold back your money.",
        },
        {
            title: "Bill changes under their own number",
            text: "Mixing an extra window into the main labour line makes the whole bill look inflated. Variation 1, with its own price, reminds the owner they asked for that opening.",
        },
        {
            title: "Show subcontractors as one price",
            text: "Your roofer's own hours are not the owner's concern. Give that trade one clear line, keep their bill on file, and answer any questions without reopening your margins.",
        },
    ],
    faqs: [
        {
            question: "How do I invoice a job that runs for months?",
            answer: "Send one invoice for each finished stage, not one giant bill at the end. Number them in order and show the running total paid, so the owner always knows how much of the agreed contract remains.",
        },
        {
            question: "What if the owner holds back money over snags?",
            answer: "Write a short snag list with them, then agree a sum to hold until each item is fixed. Bill the rest now. A named retention line is far easier to collect than an open argument about quality.",
        },
        {
            question: "Should a homeowner see my materials receipts?",
            answer: "Only if your contract promised materials at cost. If you agreed a fixed price, the supplier's paperwork is yours to keep. Either way, hold on to every receipt in case the taxman or a dispute needs them.",
        },
        {
            question: "Can I add a change the client only agreed by text?",
            answer: "A text is better than nothing. Quote the date of the message on the variation line, and from then on send a one-line written price for each change before any of that extra work starts.",
        },
    ],
    band: {
        title: "Stage done, stage paid.",
        line: "Send each stage's bill the day the work is finished, and take payment through your own link. 0% fees.",
    },
};
