import type { Combo } from "../types";

export const invoiceSalon: Combo = {
    document: "invoice",
    trade: "salon",
    reviewed: false,
    lede: "For the bills a salon does send: a bridal party, a hotel or film account, a staff perk or a stylist renting a chair. Fill it online, or download the file.",
    items: [
        {
            line: "Bridal party hair",
            billedBy: "Per person",
            description: "Bridal party hair, people",
            qty: "6",
            rate: "60",
        },
        {
            line: "Hotel guest account",
            billedBy: "Per service",
            description: "Guest blow-dries, hotel account",
            qty: "10",
            rate: "30",
        },
        {
            line: "Chair rent",
            billedBy: "Per week",
            description: "Chair rent, weeks",
            qty: "4",
            rate: "150",
        },
        {
            line: "Back-bar use",
            billedBy: "Per week",
            description: "Back-bar colour and products, weeks",
            qty: "4",
            rate: "25",
        },
        {
            line: "Staff grooming account",
            billedBy: "Per person",
            description: "Client's staff cuts, people",
            qty: "8",
            rate: "35",
        },
        {
            line: "Retail sold on account",
            billedBy: "Per item",
            description: "Styling products, on account",
            qty: "6",
            rate: "15",
        },
    ],
    example: { number: "INV-0001", issued: "2026-03-31", due: "2026-04-14" },
    tips: [
        {
            title: "Bill account work monthly",
            text: "A hotel sending guests over wants one bill. List each visit by date and room or guest name, so its front desk can match your total to its own records.",
        },
        {
            title: "Keep chair rent away from client work",
            text: "A stylist renting a chair is your customer, not your employee. A separate invoice, weekly or monthly, keeps your takings clear from theirs, and helps both sets of books.",
        },
        {
            title: "Say what the chair rent covers",
            text: "Heating, towels, back-bar colour and bookings at the desk can all be argued about later. List them under the rent, and bill anything extra on a line of its own.",
        },
    ],
    faqs: [
        {
            question: "When does a salon need an invoice at all?",
            answer: "When someone will pay later or needs it for their records. A walk-in paying at the desk only needs a receipt. A business account, a large bridal booking or a chair rental is when a proper bill helps.",
        },
        {
            question: "How do I bill a stylist who rents a chair from me?",
            answer: "Invoice them for the rent, and the products you supply, per week or month. Don't include their clients' takings. Whether they count as self-employed depends on local rules, so ask an accountant if you're unsure.",
        },
        {
            question:
                "A bride wants one bill for the party's hair. How do I lay it out?",
            answer: "One line per service type with the number of people works well. Add each name in the description, if they're paying separately later. Show any deposit from the booking as paid, with the balance below it.",
        },
        {
            question:
                "A client disputes a colour correction on their bill. What now?",
            answer: "Your bill should already show what was agreed, and when. Ask what went wrong, and offer a fix if it was promised. Issue a credit note for any amount you take off, rather than changing the old invoice.",
        },
    ],
    band: {
        title: "The accounts that happen after the chair.",
        line: "Send a monthly bill to your account clients with a payment link of your own. 0% fees.",
    },
};
