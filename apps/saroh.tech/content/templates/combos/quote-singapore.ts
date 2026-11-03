import type { Combo } from "../types";

export const quoteSingapore: Combo = {
    document: "quote",
    country: "singapore",
    reviewed: false,
    lede: "A Singapore quote in dollars with the price shown including 9% GST, a date it holds until and a place to accept. That's the format IRAS expects from a registered business.",
    example: {
        number: "Q-0306",
        termsText:
            "Total includes GST at 9%. Price covers the work listed, and changes are agreed first. Balance is due on launch.",
    },
    payment: {
        text: "Write the deposit and the balance in the quote, then repeat them on the tax invoice. Your payment terms and the 30-day limit for the invoice are separate things, so plan for both.",
        points: [
            "A deposit to confirm the work",
            "The balance on delivery or by a date",
            "PayNow or bank transfer",
        ],
    },
    fields: [
        {
            name: "Price with GST",
            why: "It has to be at least as prominent as any price without GST on the same page.",
        },
        {
            name: "Valid until",
            why: "Give the last day it holds, and a rate change or cost rise can't catch you out.",
        },
        {
            name: "Service charge",
            why: "A hotel or F&B business that charges one has its own exception, so check the wording.",
        },
    ],
    tips: [
        {
            title: "Lead with the total a client pays",
            text: "IRAS accepts $109 (inclusive of GST) or $109 w/GST. A line-by-line layout is fine for a business client, as long as the total with GST stands out and nobody is misled.",
        },
        {
            title: "Be careful with a no GST offer",
            text: "If you give a discount equal to the GST, you can't advertise it as no GST. Call it a discount. You still account for GST on the final price you agree with the client.",
        },
        {
            title: "Treat a phone quote like a written one",
            text: "The rule covers verbal quotes too. If you tell someone a price over the phone, say the with-GST figure, then send this page so the number they heard is the same one they see.",
        },
    ],
    faqs: [
        {
            question: "Can I quote a business client in Singapore before GST?",
            answer: "IRAS's rule says prices to the public, and written or verbal quotes, must include GST. You can show the before-GST figure beside it. Ask IRAS about your own case before you leave the with-GST figure out.",
        },
        {
            question: "Which businesses get the exception for service charge?",
            answer: "Hotels and food and beverage places that impose a service charge may show prices before GST with a statement such as prices are subject to GST and service charge. A nominal charge with no business reason doesn't count.",
        },
        {
            question: "What should I do if the GST rate changes during a job?",
            answer: "The rate has been 9% since 1 January 2024, and it has changed before. For a long job, check the IRAS rules on which rate applies to each payment and invoice when a change is announced.",
        },
    ],
    band: {
        title: "A quote with GST where IRAS wants it.",
        line: "Send it from Saroh, see when your client accepts, and turn it into a tax invoice without typing anything twice.",
    },
};
