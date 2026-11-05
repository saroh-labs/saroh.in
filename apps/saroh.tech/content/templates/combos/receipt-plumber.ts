import type { Combo } from "../types";

export const receiptPlumber: Combo = {
    document: "receipt",
    trade: "plumber",
    reviewed: false,
    lede: "Confirm a doorstep payment before you drive off, with the job address, parts fitted and warranty dates, so it can do its job when something fails next winter.",
    items: [
        {
            line: "Blocked drain",
            billedBy: "A flat fee",
            description: "Unblock kitchen drain",
            qty: "1",
            rate: "90",
        },
        {
            line: "Tap repair",
            billedBy: "Per tap",
            description: "Repair dripping tap",
            qty: "2",
            rate: "40",
        },
        {
            line: "Toilet part",
            billedBy: "Per part",
            description: "New toilet fill valve",
            qty: "1",
            rate: "20",
        },
        {
            line: "Radiator valve",
            billedBy: "Per valve",
            description: "New radiator valve",
            qty: "2",
            rate: "25",
        },
        {
            line: "Boiler service",
            billedBy: "A flat fee per year",
            description: "Yearly boiler service",
            qty: "1",
            rate: "80",
        },
        {
            line: "Evening visit",
            billedBy: "Extra per visit",
            description: "Evening visit extra",
            qty: "1",
            rate: "30",
        },
    ],
    payment: {
        text: "Many small jobs are paid at the door by card, cash or transfer. The receipt should go out before you leave, and bear the work done and the place it was done.",
        points: [
            "A receipt at the door, before you drive off",
            "Show if a landlord or the tenant paid",
            "Stage payments each get their own receipt",
        ],
    },
    fields: [
        {
            name: "Job address",
            why: "A landlord with several homes may need to show which one the money went on.",
        },
        {
            name: "Parts and warranty",
            why: "A maker may want a dated proof of purchase, so name the part and how long it's covered.",
        },
        {
            name: "Next service due",
            why: "A date on the paper brings the customer back to you next year.",
        },
    ],
    example: {
        number: "RCT-0212",
        client: { name: "Client name", address: "Billing address" },
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Card" },
            { label: "Job address", value: "27 Larch Road" },
        ],
        note: "Keep this as proof of purchase for parts fitted. Next boiler service due Jun 2027.",
    },
    tips: [
        {
            title: "Send it while you're on the drive",
            text: "Customers forget what the card reader showed. Sending it from your van, with the work in plain words, ends the job neatly and gives them your number for next time.",
        },
        {
            title: "Add the next service date",
            text: "A boiler service comes round yearly, and no one remembers who did the last one. A date on the paper is free marketing, sitting in the inbox of someone who already trusts you.",
        },
        {
            title: "Keep your parts warranty clear",
            text: "Split the maker's cover from your cover for the fitting. When a valve fails after ten months, the customer and you can both see at once who's expected to put it right.",
        },
    ],
    faqs: [
        {
            question:
                "A landlord's tenant paid me. Who does the receipt go to?",
            answer: "To whoever handed over the money, and mention the landlord if they've agreed to repay the tenant. Add the rental address and the fault. The tenant can then claim it back with something clear to show.",
        },
        {
            question:
                "Can a homeowner use my receipt for a home insurance claim?",
            answer: "It may help, but it's up to the insurer. Describe the fault, the repair and the date in plain words, and keep to what you found. Don't word it to suit a claim, because you could be asked about it later.",
        },
        {
            question: "How do I handle a card machine failure at the door?",
            answer: "Send a payment link to their phone, or take a transfer while you wait, then write the receipt after it lands. If they promise to pay later, send an invoice rather than a receipt, because no money has arrived yet.",
        },
        {
            question: "What goes on the receipt for a job I did not finish?",
            answer: "List only the work and parts covered by this payment, then add a line naming what's left and when you're returning. If you're waiting on a part, say so. That prevents them thinking the fault should already be cured.",
        },
    ],
};
