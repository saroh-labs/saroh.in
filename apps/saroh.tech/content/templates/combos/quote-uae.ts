import type { Combo } from "../types";

export const quoteUae: Combo = {
    document: "quote",
    country: "uae",
    reviewed: false,
    lede: "A UAE quote in dirhams with a fixed price, 5% VAT shown and a date it holds until. The client can accept on the page, then you bill with a tax invoice.",
    example: {
        number: "Q-0305",
        termsText:
            "Fixed price for the work listed, with VAT at 5%. Changes are agreed in writing first. Balance is due on launch.",
    },
    payment: {
        text: "Set the deposit and balance in the quote. Any payment received can matter for VAT, so plan to send a tax invoice with it instead of waiting until the end of the job.",
        points: [
            "A deposit to confirm the booking",
            "The balance on delivery or a set date",
            "Bank transfer to your IBAN, or a card link",
        ],
    },
    fields: [
        {
            name: "Client's TRN",
            why: "Collect it now if they're registered. You'll need it for the full tax invoice later.",
        },
        {
            name: "Valid until",
            why: "Costs and exchange rates move, so name the date this price stops holding.",
        },
        {
            name: "Currency",
            why: "If you quote in dollars, say so, and say you'll show dirhams on the tax invoice.",
        },
    ],
    tips: [
        {
            title: "Collect the TRN before you start",
            text: "Article 59 asks for your customer's TRN on a full tax invoice when they're a registrant. A quote is the easy moment to ask, rather than chasing it once the work is done.",
        },
        {
            title: "Show the VAT apart from the price",
            text: "A tax invoice lays out the unit price, quantity, tax rate and amount for each item. If your quote uses the same layout, the client can see that the later bill matches it line by line.",
        },
        {
            title: "Take care with exchange rates",
            text: "If you price in another currency, the dirham figure on the tax invoice follows the Central Bank's approved rate on the date of supply. A long job may see a different number, so warn the client.",
        },
    ],
    faqs: [
        {
            question: "Is a quote a tax document in the UAE?",
            answer: "The VAT articles we read cover tax invoices and tax credit notes, and don't mention quotes. So keep yours clearly labelled as a quote, and treat the tax invoice as the document that records the sale.",
        },
        {
            question: "Can I quote in US dollars from Dubai?",
            answer: "Nothing we read stops you pricing in dollars. Article 69 only says that for a tax invoice the amounts convert to dirhams at the Central Bank's approved rate on the date of supply, so state both.",
        },
        {
            question: "Who signs a quote for a company client in Abu Dhabi?",
            answer: "Ask for someone who can commit the business, and have them add their name and role. Tax rules don't cover this, so if the amount is large, check with your legal adviser.",
        },
    ],
};
