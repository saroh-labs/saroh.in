import type { Combo } from "../types";

export const quoteUs: Combo = {
    document: "quote",
    country: "us",
    reviewed: false,
    lede: "A US quote in dollars with a fixed price, a date it holds until and a place to sign. Add your state's sales tax so the total is the number the client will really pay.",
    example: {
        number: "Q-0302",
        termsText:
            "Fixed price for the work listed, plus any sales tax due. Changes are agreed in writing first. Balance is due on delivery.",
    },
    payment: {
        text: "A quote is the place to fix how the money moves. Set the deposit and the balance here, then copy them to the invoice word for word.",
        points: [
            "A deposit to book the work",
            "The balance on delivery, or on a set date",
            "How you accept money: card, ACH or check",
        ],
    },
    fields: [
        {
            name: "Valid until",
            why: "Without it, a client can come back a year later expecting last year's price.",
        },
        {
            name: "Who signs",
            why: "A name and a date beside the total shows who said yes to this price.",
        },
        {
            name: "Tax exemption, if claimed",
            why: "A client who says the sale isn't taxed should tell you why before you price without tax.",
        },
    ],
    tips: [
        {
            title: "Quote the rate where it will be taxed",
            text: "A buyer in Dallas and one in Los Angeles may see two different tax lines for the same work. Check the local rate as well as the state rate for each quote you send.",
        },
        {
            title: "Separate the price from the tax",
            text: "Texas wants the tax stated apart from the price on a bill unless you've told the customer it's included. Lay out your quote the same way, and the invoice follows it naturally.",
        },
        {
            title: "Get a signature, not only a reply",
            text: "An email saying sounds good is easy to dispute. Ask for a name and date on the quote itself, so you both have one page to look back on if the scope is questioned.",
        },
    ],
    faqs: [
        {
            question:
                "What's the difference between a quote and an estimate in the US?",
            answer: "People use the words loosely. Here, a quote is a set price for set work, and an estimate is a guess that can move. Say which one you mean on the page, because the heading alone won't settle it.",
        },
        {
            question: "How long should a US quote stay valid?",
            answer: "Pick a period that matches how quickly your costs change, and print the exact end date. Thirty days is simply an example, not a rule. No IRS or state tax page we read sets one.",
        },
        {
            question: "Do I need to print my EIN on a quote?",
            answer: "Nothing we read asks for it. Clients who pay contractors sometimes want your details on a Form W-9 before the first payment, so have that ready instead of crowding the quote.",
        },
    ],
    band: {
        title: "A US quote they can say yes to.",
        line: "Send it from Saroh with a sign line and a deposit, and keep the answer beside the client's other documents.",
    },
};
