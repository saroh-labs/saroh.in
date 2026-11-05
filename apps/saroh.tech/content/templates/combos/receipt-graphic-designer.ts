import type { Combo } from "../types";

export const receiptGraphicDesigner: Combo = {
    document: "receipt",
    trade: "graphic-designer",
    reviewed: false,
    lede: "Confirm what a client paid for a design project, and let the receipt record the point at which the final files and rights changed hands.",
    items: [
        {
            line: "Brand project",
            billedBy: "A fixed fee",
            description: "Rebrand, final payment",
            qty: "1",
            rate: "1000",
        },
        {
            line: "Packaging",
            billedBy: "Per design",
            description: "Label designs",
            qty: "3",
            rate: "150",
        },
        {
            line: "Poster",
            billedBy: "Per piece",
            description: "Event poster, A2",
            qty: "1",
            rate: "200",
        },
        {
            line: "Extra round",
            billedBy: "Per round",
            description: "Extra round of changes",
            qty: "1",
            rate: "100",
        },
        {
            line: "Licences",
            billedBy: "At cost",
            description: "Font licence",
            qty: "1",
            rate: "60",
        },
        {
            line: "Source files",
            billedBy: "A one-time fee",
            description: "Editable source files",
            qty: "1",
            rate: "150",
        },
    ],
    payment: {
        text: "A design receipt marks the end of a stage, so it does double duty. It proves the payment, and it can record that the files were released because of it.",
        points: [
            "One receipt for the start fee, one for the balance",
            "Name the invoice each payment settles",
            "Note the files released with this payment",
        ],
    },
    fields: [
        {
            name: "Stage paid",
            why: "Start fee or balance: the words stop a client mistaking a part payment for the whole project.",
        },
        {
            name: "Files released",
            why: "A dated note of what was sent settles any later question about what they received.",
        },
        {
            name: "Rights now passed",
            why: "If rights move on full payment, this is the paper that shows the moment they moved.",
        },
    ],
    example: {
        number: "RCT-0313",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Bank transfer" },
            { label: "Files released", value: "8 Jun 2026" },
        ],
        note: "Paid in full. Rights to the final artwork have now passed to the client.",
    },
    tips: [
        {
            title: "Record the handover on it",
            text: "A sentence saying which formats were sent, and when, turns the receipt into a small delivery note. Clients who lose a logo file years later will thank you for that.",
        },
        {
            title: "Confirm the rights in writing",
            text: "If your terms said ownership passes on payment, say that it now has. The client's next printer or agency may ask for proof that they're free to use the artwork.",
        },
        {
            title: "Separate the licence costs",
            text: "A client may record a font licence differently from your fee. Showing it apart spares their bookkeeper an email, and it shows clearly whose name that licence should be held under.",
        },
    ],
    faqs: [
        {
            question:
                "Does a client need a receipt if they already have my invoice?",
            answer: "A business client's records are tidier with both, since the bill asks for money and this confirms it came. For a small poster job, a marked-paid invoice may do. If the client asks for one, just send it.",
        },
        {
            question:
                "What should a receipt say when the project was cancelled halfway?",
            answer: "Describe only what the payment covered, such as the concepts stage. Add a line saying the project stopped there and no further work is due. That way nobody assumes the final artwork or its rights came with the money.",
        },
        {
            question: "Can the receipt list files instead of attaching them?",
            answer: "Yes, and it's better. Send artwork by a download link, and keep the receipt small enough to email and file. Name the formats on it, with the date, so there's a record even after the link has expired.",
        },
        {
            question: "How do I handle a tip or a bonus from a happy client?",
            answer: "Treat it as money you received. Add it as a clear line with its own name, or write a separate receipt. Then ask your accountant how to record it, because it may still count as income where you work.",
        },
    ],
};
