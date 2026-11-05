import type { Combo } from "../types";

export const quoteCanada: Combo = {
    document: "quote",
    country: "canada",
    reviewed: false,
    lede: "A Canadian quote in dollars with a fixed price, the tax for the client's province and a date it holds until. The example shows Ontario's HST.",
    example: {
        number: "Q-0303",
        termsText:
            "Fixed price for the work listed. GST or HST is added at the rate that applies when the invoice is issued. Balance is due on launch.",
    },
    payment: {
        text: "Fix the deposit and the balance here, so the invoices that follow simply repeat them. Payment terms belong on the later invoice once it reaches $500, so settle the wording now.",
        points: [
            "A deposit to reserve the work",
            "The balance on a date or a milestone",
            "E-transfer, card link or cheque",
        ],
    },
    fields: [
        {
            name: "Client's province",
            why: "Write it on the quote, because two clients of yours can land on two different rates.",
        },
        {
            name: "Valid until",
            why: "A date stops an old quote coming back after your costs have moved.",
        },
    ],
    tips: [
        {
            title: "Show the tax so totals compare fairly",
            text: "A competitor in the same city might show a price before tax, and you the one after. Put the price, the tax and the total on separate lines, and nobody has to guess.",
        },
        {
            title: "Note that a rate change could apply",
            text: "A long job can outlast a rate. Nova Scotia's change in April 2025 shows they do move. Say that tax is charged at the rate in force when you invoice, as the example terms do.",
        },
        {
            title: "Give each province its own saved version",
            text: "If you often sell into Ontario, Alberta and BC, keep three starting copies. You'll avoid sending a BC client a quote with 13% HST on it, which the CRA's table doesn't show there.",
        },
    ],
    faqs: [
        {
            question: "Which tax do I put on a quote for a BC client?",
            answer: "The CRA's table shows 5% GST and a 7% provincial rate in British Columbia, not HST. Check the place of supply first, since it decides whether this table's BC row is the right one for your sale.",
        },
        {
            question: "Can I quote in Canadian dollars for a client abroad?",
            answer: "You can price in the currency you both agree on. Whether Canadian tax applies to a sale outside the country is a separate rule we haven't read, so check RC4022 before you drop the tax line.",
        },
        {
            question: "Is a Canadian quote a promise I must keep?",
            answer: "It works as an offer you stand behind until its end date, in the usual sense of the word. Provincial contract law decides the fine detail, and the CRA pages don't cover it, so ask a lawyer about a large job.",
        },
    ],
};
