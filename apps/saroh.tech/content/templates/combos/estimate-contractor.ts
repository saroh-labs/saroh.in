import type { Combo } from "../types";

export const estimateContractor: Combo = {
    document: "estimate",
    trade: "contractor",
    reviewed: false,
    lede: "Give an owner a rough cost before the drawings are final: crew days, an allowance for materials and a clear line for anything you can't see yet.",
    items: [
        {
            line: "Crew labour",
            billedBy: "Estimated person days",
            description: "Crew labour, estimated person days",
            qty: "20",
            rate: "200",
        },
        {
            line: "Materials allowance",
            billedBy: "A sum, adjusted to actual cost",
            description: "Allowance for structural materials",
            qty: "1",
            rate: "4000",
        },
        {
            line: "Finishes allowance",
            billedBy: "A sum until the owner chooses",
            description: "Allowance for tiles and flooring",
            qty: "1",
            rate: "1500",
        },
        {
            line: "Groundwork",
            billedBy: "Provisional, once opened up",
            description: "Provisional foundations and drains",
            qty: "1",
            rate: "2500",
        },
        {
            line: "Subcontract trades",
            billedBy: "Estimated per trade",
            description: "Roofing and electrics, estimated",
            qty: "2",
            rate: "1500",
        },
        {
            line: "Site costs",
            billedBy: "Per week on site",
            description: "Skips, scaffold and site costs, weeks",
            qty: "6",
            rate: "250",
        },
    ],
    example: {
        number: "EST-0302",
        issued: "2026-02-02",
        due: "2026-03-02",
        terms: "custom",
        facts: [
            { label: "Site", value: "12 Quarry Lane, rear extension" },
            { label: "Based on", value: "Site walk, no final drawings" },
        ],
        termsText:
            "Rough cost only. Allowances change to match what the owner picks, and provisional work is priced once the ground is opened up. A fixed quote follows the final drawings.",
        note: "",
    },
    tips: [
        {
            title: "Mark what's hidden as provisional",
            text: "Nobody knows what sits under an old floor until it's lifted. A provisional groundwork line warns the owner early, and stops that cost looking like a late surprise from you.",
        },
        {
            title: "Use allowances for their choices",
            text: "Tiles can differ hugely by the box. A named sum lets the owner shop, and if they pick a dearer range, the extra is plainly down to their own decision.",
        },
        {
            title: "Say what the figure rests on",
            text: "A site walk and a rough sketch produce a different number from stamped drawings. Writing down what you saw protects you when the plans change after the architect has finished.",
        },
    ],
    faqs: [
        {
            question: "Can an owner use my estimate to get a bank loan?",
            answer: "They can show it, though a lender may want a firm price later. Date the document, name the plans it was based on, and be ready to replace these rough figures once the drawings settle.",
        },
        {
            question: "Should I charge for a detailed building estimate?",
            answer: "A quick walk-round can be free. Measuring up, calling suppliers and pricing every trade takes days, so some builders bill that work and take the fee off the job if the owner goes ahead.",
        },
        {
            question: "How close to final cost must a rough figure be?",
            answer: "That depends on local consumer rules and what you promised, so ask an adviser if you're unsure. In practice, write a limit into the terms and tell the owner as soon as digging or demolition changes the picture.",
        },
        {
            question: "When does this turn into a contract?",
            answer: "A rough figure doesn't commit either side to the price. Once the drawings are done, send a fixed quote or a building contract and have that signed before any crew turns up or any steel gets ordered.",
        },
    ],
    band: {
        title: "A rough number, honestly labelled.",
        line: "Turn the estimate into a fixed quote when the drawings land, then bill it stage by stage. 0% fees.",
    },
};
