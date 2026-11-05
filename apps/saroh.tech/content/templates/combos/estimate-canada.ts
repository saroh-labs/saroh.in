import type { Combo } from "../types";

export const estimateCanada: Combo = {
    document: "estimate",
    country: "canada",
    reviewed: false,
    lede: "A Canadian estimate in dollars that shows the likely cost of a job with GST or HST on top. Use the rate for the province where the job happens.",
    example: {
        number: "EST-0303",
        facts: [{ label: "Site", value: "4 Quay Street, Ottawa, kitchen" }],
    },
    payment: {
        text: "No tax is owed because of an estimate alone. It's your chance to set out how you'll bill if the job goes ahead, and which province's tax will apply.",
        points: [
            "A deposit, if you ask for one",
            "The date this estimate ends",
            "How changes get agreed before they're billed",
        ],
    },
    fields: [
        {
            name: "Province of the job",
            why: "It decides the rate. An Alberta job shows 5% GST, a Nova Scotia one 14% HST.",
        },
        {
            name: "A clear description",
            why: "From $500 the invoice needs one. Write it well now and copy it across later.",
        },
    ],
    tips: [
        {
            title: "Recheck the rate on older estimates",
            text: "Nova Scotia's HST fell to 14% on 1 April 2025. Rates do move, so a template saved a while ago can carry the wrong one. Check the CRA's table before you reuse it.",
        },
        {
            title: "Split the taxes where a province has two",
            text: "British Columbia, Manitoba and Saskatchewan show GST and a provincial rate in the CRA's table. A single combined line hides what's going where, so give each one its own line.",
        },
        {
            title: "Keep the number it became",
            text: "When a job goes ahead, write the estimate's number on the invoice. Together they show why a figure moved, and the CRA usually expects invoices kept for six years.",
        },
    ],
    faqs: [
        {
            question: "Should a Canadian estimate include GST or HST?",
            answer: "If you're registered and the job is taxable, yes, or your client's total will come as a shock. Show the rate and the amount apart from the price, the same way the invoice will show them.",
        },
        {
            question:
                "Which province's rate goes on an estimate for a job elsewhere?",
            answer: "The CRA bases it on the place of supply, and has separate place-of-supply rules. If your business is in Ontario and the job is in Alberta, check them before you assume 13%.",
        },
        {
            question: "Do I need my registration number on an estimate?",
            answer: "The chart we read covers receipts and invoices, not estimates. Showing it does no harm once you're registered, and it tells a business client that the tax on the final bill can be claimed.",
        },
    ],
};
