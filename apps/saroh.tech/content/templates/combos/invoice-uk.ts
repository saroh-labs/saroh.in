import type { Combo } from "../types";

export const invoiceUk: Combo = {
    document: "invoice",
    country: "uk",
    reviewed: false,
    lede: "An invoice in pounds with a VAT line, a VAT number and the fields GOV.UK lists. Leave the VAT parts out if you aren't registered.",
    example: { heading: "VAT invoice", number: "INV-0301" },
    tips: [
        {
            title: "Only charge VAT once you're registered",
            text: "Adding a VAT line without a registration is the mistake to avoid. Until you register, send a plain invoice with no VAT number and no VAT amount at all.",
        },
        {
            title: "Show pounds and the date the UK way",
            text: "Use the £ sign and write dates as day, month, year. A date like 03/04 reads as March to an American client and April here, so spell out the month.",
        },
        {
            title: "Use A4, not US Letter",
            text: "A template made for the US prints with odd margins on a British office printer. This one is already set to A4, so a printed copy lands on the page cleanly.",
        },
    ],
    faqs: [
        {
            question: "Can I send a UK invoice if I'm a sole trader?",
            answer: "Yes. Put your own name and any business name you use. If you trade under a business name, GOV.UK also asks for an address where legal documents can reach you. A limited company writes its full registered name.",
        },
        {
            question: "When is a VAT invoice required in the UK?",
            answer: "GOV.UK says you must use VAT invoices when you and your customer are both VAT registered. They carry more detail than a basic invoice: your VAT number, the tax point and the VAT shown line by line.",
        },
        {
            question: "How quickly must a VAT invoice go out?",
            answer: "VAT Notice 700 says you should normally issue it within 30 days of the tax point, with some cases where that can be extended. Sending it the day you finish keeps you well inside that and helps you get paid sooner.",
        },
        {
            question:
                "Can a British business charge interest on a late invoice?",
            answer: "GOV.UK sets out statutory interest of 8% plus the Bank of England base rate on business to business debts, unless your contract sets another rate. Check the current base rate before you work out the amount you're claiming.",
        },
    ],
};
