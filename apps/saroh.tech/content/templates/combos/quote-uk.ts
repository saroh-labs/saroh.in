import type { Combo } from "../types";

export const quoteUk: Combo = {
    document: "quote",
    country: "uk",
    reviewed: false,
    lede: "A UK quote in pounds with a fixed price, VAT shown, a date it holds until and a place to accept. Set out the payment date now, so nothing is left to the default rules.",
    example: {
        number: "Q-0301",
        termsText:
            "Fixed price for the work listed, plus VAT at 20%. Changes are agreed first. Balance is due within 30 days of the invoice.",
    },
    payment: {
        text: "Agree the date here. GOV.UK says that if no date is agreed, a payment between businesses is late 30 days after the customer gets the invoice or you deliver, whichever is later.",
        points: [
            "A deposit to book the work",
            "The balance by a named date",
            "Bank transfer: sort code and account number",
        ],
    },
    fields: [
        {
            name: "Agreed payment period",
            why: "GOV.UK says an agreed period between businesses must usually be within 60 days, or 30 for public authorities.",
        },
        {
            name: "Valid until",
            why: "A date stops an old price coming back when your costs have moved.",
        },
        {
            name: "Your VAT number",
            why: "Show it if you're registered, so the VAT line can be trusted from the first page.",
        },
    ],
    tips: [
        {
            title: "Agree payment terms before it's a late-payment issue",
            text: "A signed quote is the easiest place to fix a payment date. The late payment law gives a default if you don't, but it's far simpler if both sides have seen the date from day one.",
        },
        {
            title: "Be plain about public sector work",
            text: "If you quote a public authority, GOV.UK says payment must usually come within 30 days. Longer than that for a business client needs to be fair to both businesses, so don't agree a long one lightly.",
        },
        {
            title: "Show the VAT apart from the price",
            text: "A VAT invoice has to show the amount before VAT and the VAT rate for each line, so lay out your quote the same way. A client can then see the invoice matches the price they agreed.",
        },
    ],
    faqs: [
        {
            question: "Is a quote the same as a VAT invoice in the UK?",
            answer: "No. A quote offers a price and records no sale. The Notice 700 rules we read cover invoices, pro forma invoices and credit notes, not quotes, so keep the word quote at the top of yours.",
        },
        {
            question:
                "What if a UK business client says yes and then pays late?",
            answer: "You can usually claim interest and debt recovery costs from another business that pays late. Your quote's agreed payment date helps here, since it sets the day from which the money is overdue.",
        },
        {
            question: "Does taking a deposit on a quote change VAT in Britain?",
            answer: "It can. Notice 700 says most deposits serve as advance payments and create a tax point on receipt. A deposit held only as security for hired goods is one of the kinds that doesn't.",
        },
    ],
};
