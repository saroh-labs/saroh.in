import type { Combo } from "../types";

export const estimateUae: Combo = {
    document: "estimate",
    country: "uae",
    reviewed: false,
    lede: "A UAE estimate in dirhams that shows the likely cost of a job, with 5% VAT worked out. It stays an estimate, so it never carries the words Tax Invoice.",
    example: {
        number: "EST-0305",
        facts: [{ label: "Site", value: "Shop 4, Quay Walk, fit-out" }],
    },
    payment: {
        text: "Nothing is due from an estimate. If the job goes ahead, agree the deposit in writing, because the money arriving can set off your VAT duties.",
        points: [
            "Any deposit that will start the job",
            "When the estimate ends",
            "Stages of the work, if billed in parts",
        ],
    },
    fields: [
        {
            name: "Scope of the work",
            why: "Spell out what's in and what's out, so a later change has a plain starting point.",
        },
        {
            name: "Your TRN",
            why: "Show it if you're registered, so a client knows the VAT line is real.",
        },
    ],
    tips: [
        {
            title: "Keep the heading far from Tax Invoice",
            text: "Those exact words are what makes a document look like a tax invoice to a client's accounts team. An estimate should say Estimate clearly at the top, and nothing that suggests VAT is due yet.",
        },
        {
            title: "Be careful on the wording of a deposit",
            text: "Article 25 counts the date of receipt of payment among the dates that can fix the date of supply. Once a deposit lands, check whether your 14 days to issue a tax invoice have started.",
        },
        {
            title: "Give a dirham figure beside a foreign one",
            text: "If a client wants dollars, add the AED total too. Your final tax invoice has to show dirhams anyway, so it's better that they see that number from the first page.",
        },
    ],
    faqs: [
        {
            question: "Should VAT appear on an estimate in the UAE?",
            answer: "If you're registered and the work is taxable, showing 5% gives a true total. Nothing in the articles we read requires a VAT line on an estimate. Just don't show one if you aren't registered.",
        },
        {
            question: "When does the deposit on a UAE job need a tax invoice?",
            answer: "The Decree-Law's date of supply is the earliest of several events, and receipt of payment is one. So a deposit can bring a duty to issue a tax invoice within 14 days. Ask your tax adviser about your own contract.",
        },
        {
            question: "What if a Dubai job grows beyond the estimate?",
            answer: "Tell the client before you spend the extra, and get their agreement in writing. Then send a revised estimate, with a new number, so the final tax invoice matches what they accepted.",
        },
    ],
};
