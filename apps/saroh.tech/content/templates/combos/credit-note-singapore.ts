import type { Combo } from "../types";

export const creditNoteSingapore: Combo = {
    document: "credit-note",
    country: "singapore",
    reviewed: false,
    lede: "A Singapore credit note in dollars for returned goods, waived charges or a mistake on a bill. It names the original tax invoice, then shows the GST and the total credited.",
    example: {
        number: "CN-0306",
        facts: [
            { label: "Against tax invoice", value: "INV-0417" },
            { label: "Invoice date", value: "3 Aug 2026" },
            { label: "Reason", value: "Goods returned, order changed" },
        ],
    },
    payment: {
        text: "Tell your client what happens to the money: off the amount owed, back to them, or held for next time. IRAS says you usually account for the note in the period you issue it.",
        points: [
            "Taken off what's still owing",
            "Refunded by PayNow or bank transfer",
            "Kept as credit on the next order",
        ],
    },
    fields: [
        {
            name: "Original invoice number and date",
            why: "IRAS wants both. Without them, you'll need other evidence that GST was accounted for on the first sale.",
        },
        {
            name: "Items and quantity",
            why: "Describe what's being credited and how many, not only the money.",
        },
        {
            name: "GST rate and GST credited",
            why: "The list has these apart from the total credited, so give each a line.",
        },
    ],
    tips: [
        {
            title: "Use the note's cases as your guide",
            text: "IRAS lists returned goods, goods not supplied, waived charges and discounts on past sales, along with plain mistakes. If your reason fits, a credit note is the right tool for the job.",
        },
        {
            title: "Keep the exchange rate from the invoice",
            text: "Billed in another currency? Use the historical rate from the original tax invoice. If the customer is GST registered you may use the prevailing rate instead, as long as you apply it consistently.",
        },
        {
            title: "Know when a fix means a GST F7",
            text: "When a note corrects wrong GST treatment, you may have to file a GST F7 return. IRAS sets two tests: a net error of not more than $3,000, and not more than 5% of Box 4.",
        },
    ],
    faqs: [
        {
            question: "Must the words Credit Note appear in Singapore?",
            answer: "IRAS says that title is required only for credit notes tied to a rate change. It's still the clearest heading for any of them, and this template uses it so a client sees at once what it is.",
        },
        {
            question:
                "Can I credit a Singapore customer without adjusting GST?",
            answer: "Only if both of you agree in writing, the customer is fully taxable, and the note says it's not a credit note for GST purposes. Otherwise it goes on your return as a normal adjustment.",
        },
        {
            question: "What if I can't find the original tax invoice number?",
            answer: "IRAS allows for this, but you then need other evidence showing you accounted for GST on the original sale. Keep whatever links the two together, such as the order and the payment record.",
        },
    ],
};
