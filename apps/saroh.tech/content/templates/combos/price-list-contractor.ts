import type { Combo } from "../types";

export const priceListContractor: Combo = {
    document: "price-list",
    trade: "contractor",
    reviewed: false,
    lede: "Set out your day rates and common small jobs on one page, for repeat clients and agents who want a rough idea before they call you.",
    items: [
        {
            line: "Builder's day rate",
            billedBy: "Per person, per day",
            description: "Skilled builder, per day",
            qty: "1",
            rate: "250",
        },
        {
            line: "Labourer's day rate",
            billedBy: "Per person, per day",
            description: "General labourer, per day",
            qty: "1",
            rate: "150",
        },
        {
            line: "Internal wall",
            billedBy: "From, per square metre",
            description: "Stud wall, boarded, per square metre",
            qty: "1",
            rate: "60",
        },
        {
            line: "Plastering",
            billedBy: "From, per square metre",
            description: "Skim coat on walls, per square metre",
            qty: "1",
            rate: "20",
        },
        {
            line: "Door hanging",
            billedBy: "Per door",
            description: "Hang internal door, per door",
            qty: "1",
            rate: "90",
        },
        {
            line: "Site visit",
            billedBy: "Per visit, taken off the job",
            description: "Survey and written price, per visit",
            qty: "1",
            rate: "75",
        },
    ],
    example: {
        number: "2026 rates",
        issued: "2026-01-05",
        due: "2026-12-31",
        terms: "custom",
        client: { name: "" },
        facts: [{ label: "Area covered", value: "Within 30 miles of base" }],
        note: "From prices are a guide only. Every job gets its own written quote after a site visit.",
    },
    tips: [
        {
            title: "Publish small works, not whole builds",
            text: "No one-page sheet can price an extension. Hanging a door or skimming a wall can be listed, and those are what letting agents and repeat landlords phone about most.",
        },
        {
            title: "Add your working area",
            text: "A day rate means something different thirty miles out. State the distance it covers, and mention that sites further away carry a charge for getting the crew there.",
        },
        {
            title: "Write the minimum you will visit for",
            text: "One loose door handle rarely pays for the van. A minimum call-out or half-day line filters out tiny errands without you needing to say no on every phone call.",
        },
    ],
    faqs: [
        {
            question: "Do day rates include materials?",
            answer: "State it either way at the top of the sheet. Most confusion on small works comes from here, so say that fixings are included and that plasterboard, timber and paint come on top at supplier cost.",
        },
        {
            question: "Who actually needs a builder's rate sheet?",
            answer: "Letting agents, property managers and landlords with several homes. They approve small repairs without a fresh quote each time, so a dated sheet can bring repeat calls that a homeowner's one-off extension never will.",
        },
        {
            question: "Should I offer an agent a lower rate?",
            answer: "If they send steady work, perhaps. Keep that as a separate sheet carrying their company's name, rather than a discount on your public list, so another landlord who finds your rates sees the standard ones.",
        },
    ],
};
