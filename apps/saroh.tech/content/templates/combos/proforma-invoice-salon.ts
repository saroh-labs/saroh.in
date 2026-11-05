import type { Combo } from "../types";

export const proformaInvoiceSalon: Combo = {
    document: "proforma-invoice",
    trade: "salon",
    reviewed: false,
    lede: "For a film crew, a hotel or an employer who needs your cost in writing before they can pay for gift vouchers, a staff day or an account with you.",
    items: [
        {
            line: "Staff vouchers",
            billedBy: "Per voucher",
            description: "Staff gift vouchers, bulk order",
            qty: "20",
            rate: "50",
        },
        {
            line: "Staff grooming day",
            billedBy: "Per day",
            description: "Grooming day at your office",
            qty: "1",
            rate: "700",
        },
        {
            line: "Film hair stylist",
            billedBy: "Per day",
            description: "Hair stylist on set, days",
            qty: "3",
            rate: "350",
        },
        {
            line: "Wigs and pieces styled",
            billedBy: "Per piece",
            description: "Hair pieces styled for filming",
            qty: "4",
            rate: "60",
        },
        {
            line: "Hotel guest account",
            billedBy: "Per month, minimum",
            description: "Monthly hotel guest account",
            qty: "3",
            rate: "200",
        },
        {
            line: "Prize hamper",
            billedBy: "Per hamper",
            description: "Product hampers, staff awards",
            qty: "5",
            rate: "40",
        },
    ],
    fields: [
        {
            name: "Voucher expiry",
            why: "A buyer ordering in bulk needs to know how long staff have to use them.",
        },
        {
            name: "Purchase order",
            why: "Most larger employers can't release money for a new supplier without one.",
        },
        {
            name: "The word Proforma",
            why: "It keeps this out of your sales records until the order is real.",
        },
    ],
    example: {
        number: "PRO-0001",
        issued: "2026-02-23",
        due: "2026-03-16",
        client: { name: "Company name", email: "hr@example.com" },
        facts: [
            { label: "For", value: "Staff awards, 28 Mar" },
            { label: "Vouchers valid", value: "12 months" },
        ],
        note: "This proforma is for approval. A final invoice follows, and vouchers are issued once paid.",
    },
    tips: [
        {
            title: "Don't release vouchers on a proforma",
            text: "Hand them over only after the money lands. A proforma commits nobody to pay, and a printed voucher is as good as cash the moment someone walks in with it.",
        },
        {
            title: "Say which services a voucher covers",
            text: "Does it cover anything in the salon, or only a set treatment? Write the limit, so a staff member doesn't arrive expecting a full colour for a small voucher.",
        },
        {
            title: "Give a day rate for set work",
            text: "Film and photo crews think in days, not cuts. A day line, with its hours and how many people you'd look after, reads like a document their production team knows.",
        },
    ],
    faqs: [
        {
            question: "When would a salon ever send a proforma?",
            answer: "Rarely for the chair. It comes up when an organisation buys in bulk, such as staff vouchers or a grooming day, or when a production team must get a cost approved before filming begins.",
        },
        {
            question: "Should a bulk voucher order have a discount line?",
            answer: "If you offer one, show the full price and the reduction separately. The buyer sees the saving they won, and your records stay honest about what each voucher is really worth when it's redeemed later.",
        },
        {
            question:
                "A hotel wants a standing arrangement. Is one proforma enough?",
            answer: "It's fine for the first approval. Use it to set the monthly minimum and the rates. After that, send real monthly bills from your account records, each one listing guests and dates.",
        },
    ],
};
