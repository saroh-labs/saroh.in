import type { Combo } from "../types";

export const invoicePhotographer: Combo = {
    document: "invoice",
    trade: "photographer",
    reviewed: false,
    lede: "Built for shoots: hours of coverage, edited images, extras, travel and the booking deposit you already took. Fill it online, or download the file.",
    example: {
        due: "2026-03-28",
        issued: "2026-03-14",
        number: "INV-0001",
        depositPaid: "600",
        depositLabel: "Booking deposit paid",
    },
    tips: [
        {
            title: "Show the deposit as paid",
            text: "Not as a discount. It keeps your totals and your records honest, and the client can see at once that the money they sent months ago really was counted.",
        },
        {
            title: "Say how many images are included",
            text: "Then extra images are a simple line, not an argument. Write the number that came with the package right on the invoice, even when that line is priced at nothing.",
        },
        {
            title: "State the image rights",
            text: "One line on what the client may do with the photos saves questions later. Personal prints and sharing are one thing. A business using your pictures in adverts is another.",
        },
    ],
    faqs: [
        {
            question: "Should I charge for travel?",
            answer: "If your quote said so, yes. Show it as its own line with the distance or a flat fee, so the client can see what it's for. For a far-off wedding, add hotel costs on a separate line and agree them before the booking.",
        },
        {
            question: "How do I bill extra edits?",
            answer: "Agree the number of edited images in the booking, then bill anything above that per image. For a client who wants heavy retouching on a few shots, a per-hour line reads better. Send the extras bill when the gallery is delivered.",
        },
        {
            question: "What if the client cancels after paying a deposit?",
            answer: "That depends on what your booking terms said. Many photographers keep the deposit because the date was held and other work was turned down. Make the rule clear before they pay, then issue a credit note for anything you do refund.",
        },
        {
            question: "Do I need to add tax to a wedding shoot?",
            answer: "Only if you're registered for tax where you work. Add it as one line after the subtotal, with its name and rate. A couple usually can't claim it back, so show it clearly in the first quote to avoid a surprise later.",
        },
    ],
};
