import type { Combo } from "../types";

export const invoiceEventPlanner: Combo = {
    document: "invoice",
    trade: "event-planner",
    reviewed: false,
    lede: "Bill your fee, your staff and the costs you carried for suppliers on separate lines, and show the stage payments already made. Fill it online, or download the file.",
    example: {
        number: "INV-0003",
        issued: "2026-03-16",
        due: "2026-03-30",
        depositPaid: "2500",
        depositLabel: "Stage payments received",
    },
    tips: [
        {
            title: "Number your stage bills as a set",
            text: "Stage two of three tells a client where they are in the whole event. Add the running total paid so far, so no one needs to dig out the last bill.",
        },
        {
            title: "Attach the supplier's own bill",
            text: "When you pass on a florist's cost, include a copy of their invoice. It settles any question about your margin, and clients trust a planner who shows the paperwork.",
        },
        {
            title: "Add changes as dated lines",
            text: "Thirty more guests decided on in the final week can change catering, chairs and staff. A dated line for each change reminds them of the conversation you had.",
        },
    ],
    faqs: [
        {
            question: "Do I show a markup on supplier costs?",
            answer: "If your agreement says you add a fee, show it, either as a percent on each line or as one handling line. Clients who discover a hidden markup after the event seldom book you again.",
        },
        {
            question: "When should I send the last bill after the event?",
            answer: "Within a few days, while the day is fresh and everyone's pleased. Wait for late supplier bills if you must, but say so. Add a short note on what has been left off, and when it will follow.",
        },
        {
            question:
                "The venue was damaged and the client's guests did it. How is that billed?",
            answer: "Put the charge on its own line, naming the venue's claim and the date. Attach their letter, and if there's a damage deposit, show what it covers. Agree beforehand who carries this, in your contract.",
        },
        {
            question: "Who owes the tax when a cost passes through me?",
            answer: "It depends on where you work, and whether you bought the service yourself or only paid as the client's agent. The two can be treated differently. Ask an accountant once, then bill all your events the same way.",
        },
    ],
    band: {
        title: "The event is over. The bills are clear.",
        line: "Send each stage through your own payment link, and keep the full picture of one event in one place. 0% fees.",
    },
};
