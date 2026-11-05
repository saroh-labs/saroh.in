import type { Combo } from "../types";

export const invoiceSingapore: Combo = {
    document: "invoice",
    country: "singapore",
    reviewed: false,
    lede: "A Singapore tax invoice in dollars with the words Tax Invoice, your GST registration number and a 9% GST line. If you aren't registered, take those parts out.",
    example: { heading: "Tax Invoice", number: "INV-0306" },
    tips: [
        {
            title: "Send it to registered customers only when needed",
            text: "IRAS says you issue a tax invoice to GST-registered customers for standard-rated supplies. Customers who aren't registered can have a receipt instead, which is shorter and quicker to produce.",
        },
        {
            title: "Pick one way of working out GST",
            text: "You may work out GST item by item or on the subtotal. The two can differ by a cent or so through rounding, so choose one method and apply it to every invoice.",
        },
        {
            title: "Convert foreign amounts to Singapore dollars",
            text: "Billing in US dollars? IRAS asks you to convert into Singapore dollars using its approved GST exchange rates, so show both figures on the tax invoice.",
        },
    ],
    faqs: [
        {
            question: "How soon must a Singapore tax invoice go out?",
            answer: "IRAS says within 30 days from the time of supply. Sending it the day you finish keeps you well inside that limit, and your client has what they need for their own GST return.",
        },
        {
            question:
                "When can a Singapore business use a simplified tax invoice?",
            answer: "When the total payable with GST doesn't exceed $1,000. It still shows your name, address and GST number, the date, an invoice number, a description and the total, with a statement that the price includes GST.",
        },
        {
            question: "What if I leave out a detail on my tax invoice?",
            answer: "IRAS's rules list each item it expects. A missing one can leave your customer unable to use the invoice for a claim, so check the list and reissue the invoice the correct way rather than leave a gap.",
        },
        {
            question: "How do I bill a zero-rated supply in Singapore?",
            answer: "IRAS says a tax invoice isn't needed for one. If you do show GST on the bill, state that it's charged at 0%, and keep the proper records of the sale.",
        },
    ],
};
