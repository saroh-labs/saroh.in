import type { Combo } from "../types";

export const invoiceAustralia: Combo = {
    document: "invoice",
    country: "australia",
    reviewed: false,
    lede: "An Australian tax invoice in dollars with your ABN and a GST line. If you aren't registered for GST, change the heading to Invoice and take the GST line out.",
    example: { heading: "Tax invoice", number: "INV-0304" },
    tips: [
        {
            title: "Match the heading to your GST status",
            text: "Business.gov.au says a GST-registered business uses the words tax invoice, and everyone else uses invoice. Calling yours a tax invoice with no registration suggests there is GST to claim when there is none.",
        },
        {
            title: "Add the buyer on bigger jobs",
            text: "A large sale also needs the buyer's identity or ABN. Fill in the client box on every invoice anyway, so nobody has to check whether a job crossed the line.",
        },
        {
            title: "Show GST on each line or state it once",
            text: "Business.gov.au gives you two choices: the GST amount for each item, or a statement that the total price includes GST. Pick one layout and stay with it, so clients know where to look.",
        },
    ],
    faqs: [
        {
            question: "When must I give an Australian customer a tax invoice?",
            answer: "Business.gov.au says it's required for taxable sales above $82.50 including GST, or when a customer asks, and you then have 28 days. Check the ATO's own page too, because we couldn't load it to confirm.",
        },
        {
            question:
                "Do I put an ABN on an invoice if I'm not registered for GST?",
            answer: "Business.gov.au lists your ABN among the common items on a regular invoice, and says no law sets out a required list for those. Use the word invoice, and don't show a GST amount.",
        },
        {
            question: "How do I work out the GST inside a total?",
            answer: "GST is a tax of 10% on most goods and services, so one-eleventh of a GST-inclusive price is the tax. On a total of $110, that's $10 of GST and $100 of price.",
        },
        {
            question: "Do I have to register for GST to invoice in Australia?",
            answer: "No, you can invoice without it. You must register once your GST turnover reaches $75,000, with a higher figure for non-profits, and you have 21 days from knowing you'll pass it. Below that, registering is your choice.",
        },
    ],
};
