import type { Combo } from "../types";

export const invoiceCanada: Combo = {
    document: "invoice",
    country: "canada",
    reviewed: false,
    lede: "A Canadian invoice in dollars with your GST/HST number and a tax line set for the province. The example uses Ontario's 13% HST.",
    example: { number: "INV-0303" },
    tips: [
        {
            title: "Charge the province's rate, not your own",
            text: "The CRA bases the rate on the place of supply. Its own example has an Ontario store charging 13% HST, and a Manitoba sale taking 5% GST plus 7% PST. A move across a border changes your line.",
        },
        {
            title: "Show HST as one rate",
            text: "The CRA asks for the total HST rate, not the federal and provincial parts broken out. Write HST 13%, and your client's bookkeeper has what they need.",
        },
        {
            title: "Print every field on small bills too",
            text: "The chart adds fields at $100 and $500, but nobody wants to think about that for each bill. Use the full set each time. A client can then claim from any invoice you send.",
        },
    ],
    faqs: [
        {
            question:
                "What does the CRA need on a Canadian invoice under $100?",
            answer: "Its chart lists your business or trading name, the date and the total. Your registration number and the tax appear from $100, and the buyer's name, a description and payment terms appear from $500.",
        },
        {
            question: "Do I charge GST/HST if I'm a small supplier?",
            answer: "The CRA calls you a small supplier at $30,000 or less of worldwide taxable supplies, tested for a single quarter and for the last four. Read RC4022 before you decide whether to register or leave the line off.",
        },
        {
            question: "How do I invoice a client in Quebec?",
            answer: "The CRA's table shows 5% GST and 9.975% provincial tax in Quebec, so two lines rather than one. RC4022 adds that Revenu Québec generally runs GST/HST for businesses physically located in Quebec.",
        },
        {
            question: "When do I owe the tax on a Canadian invoice?",
            answer: "RC4022 says on the earlier of the day you're paid or the day payment is due, and the CRA usually treats it as due on the invoice date or a date set in an agreement. So it can fall due before your client pays.",
        },
    ],
    band: {
        title: "The right rate for each province.",
        line: "Save your GST/HST number once in Saroh, then send invoices in Canadian dollars that clients can pay through your own link.",
    },
};
