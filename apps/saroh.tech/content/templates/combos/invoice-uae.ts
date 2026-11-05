import type { Combo } from "../types";

export const invoiceUae: Combo = {
    document: "invoice",
    country: "uae",
    reviewed: false,
    lede: "A UAE tax invoice in dirhams with the words Tax Invoice at the top, your TRN and a 5% VAT line, following Article 59 of the Executive Regulation.",
    example: {
        heading: "Tax Invoice",
        number: "INV-0305",
        facts: [{ label: "Customer TRN", value: "000000000000000" }],
    },
    tips: [
        {
            title: "Watch the 14-day clock from the supply",
            text: "The Decree-Law says to issue a tax invoice within 14 days of the date of supply. That date can be the day you were paid, so an early payment can start the clock early.",
        },
        {
            title: "Don't show VAT unless you've registered",
            text: "Article 65 says anyone who receives an amount as tax under a document they issued must pay it to the Authority, even if it wasn't due. A VAT line is not a harmless placeholder.",
        },
        {
            title: "Print dirhams even on a dollar bill",
            text: "Selling in another currency? The tax invoice still shows the tax in AED, with the exchange rate you applied. Article 69 points you to the Central Bank's approved rate on the date of supply.",
        },
    ],
    faqs: [
        {
            question: "When can I use a simplified tax invoice in the UAE?",
            answer: "Article 59 allows it when your customer isn't a registrant, or is one and the supply is AED 10,000 or less. It still needs the words Tax Invoice, your details and TRN, the date, a description, the total and the tax.",
        },
        {
            question: "Do I need to register before I can invoice in the UAE?",
            answer: "Don't add a VAT line until you are, since any amount collected as tax is owed to the Authority. The Executive Regulation sets the mandatory threshold at AED 375,000 and the voluntary one at AED 187,500.",
        },
        {
            question: "Does my customer's TRN have to be on it?",
            answer: "On a full tax invoice, yes, when your customer is a registrant. Ask for it before you bill. This example shows it beside the dates.",
        },
        {
            question: "How do I fix a mistake on a tax invoice?",
            answer: "The FTA's guide on tax invoices says errors should be corrected through tax credit notes or additional tax invoices. Don't edit one you've already sent. Issue the right document, so the numbering stays in order.",
        },
    ],
};
