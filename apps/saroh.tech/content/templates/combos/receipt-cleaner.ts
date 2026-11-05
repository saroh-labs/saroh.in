import type { Combo } from "../types";

export const receiptCleaner: Combo = {
    document: "receipt",
    trade: "cleaner",
    reviewed: false,
    lede: "Confirm a cash payment left on the side, a transfer for the month or a deposit for a move-out clean, with the address and visit dates named.",
    items: [
        {
            line: "End-of-tenancy clean",
            billedBy: "A fixed price",
            description: "End-of-tenancy clean, 2-bed flat",
            qty: "1",
            rate: "200",
        },
        {
            line: "Fridge",
            billedBy: "A flat fee",
            description: "Fridge and freezer clean",
            qty: "1",
            rate: "30",
        },
        {
            line: "Carpets",
            billedBy: "Per room",
            description: "Carpet cleaning, rooms",
            qty: "2",
            rate: "40",
        },
        {
            line: "Blinds",
            billedBy: "Per blind",
            description: "Blinds wiped down",
            qty: "4",
            rate: "5",
        },
        {
            line: "Balcony",
            billedBy: "A flat fee",
            description: "Balcony sweep and wash",
            qty: "1",
            rate: "20",
        },
        {
            line: "Parking",
            billedBy: "At cost",
            description: "Parking at the property",
            qty: "1",
            rate: "10",
        },
    ],
    payment: {
        text: "Cleaning payments are often small, frequent and sometimes in cash. A numbered receipt keeps those in your books, and gives a tenant or landlord something to show for the work.",
        points: [
            "Each cash payment gets a numbered receipt",
            "A monthly transfer gets one receipt, listing the visits",
            "A tenant's copy can show the work done",
        ],
    },
    fields: [
        {
            name: "Property address",
            why: "A tenant may need to show that this very flat was cleaned, and when.",
        },
        {
            name: "Date of the clean",
            why: "The payment and the clean can fall on different days. A landlord will want the second.",
        },
        {
            name: "What was cleaned",
            why: "Named items, like the oven, are the proof that a checkout report looks for.",
        },
    ],
    example: {
        number: "RCT-0109",
        client: { name: "Client name", address: "11 Birch Court, Flat 2" },
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Cash" },
            { label: "Cleaned on", value: "7 Jun 2026" },
        ],
        note: "Thank you. Keep this as proof of the clean for your landlord or agent.",
    },
    tips: [
        {
            title: "Treat cash left on the side properly",
            text: "An envelope on the kitchen counter can go missing or be misremembered. Send a photo of the receipt that day, so the client knows you found it and the right amount was there.",
        },
        {
            title: "Name each extra for a tenant",
            text: "An inventory clerk reads line by line. A receipt listing oven, fridge and blinds is stronger proof at check-out than a single line saying that a clean took place.",
        },
        {
            title: "Sign for keys in the same note",
            text: "When you hand keys back after a move-out, add a line saying so, with the date. Then a later question about who held them has a dated answer on paper.",
        },
    ],
    faqs: [
        {
            question: "Can a receipt help a tenant get a deposit back?",
            answer: "It can help, as evidence that a professional clean took place, but the outcome depends on the landlord and the check-out report. Name the address, the date and each item cleaned. Never promise your client that they'll get the deposit back.",
        },
        {
            question:
                "An elderly client pays in cash each week. Do I need a receipt every time?",
            answer: "It's kind and sensible to do so. A small carbon book or a text works, and it means a relative can see what's been paid. Use a dated note each visit, which protects you if anyone ever asks questions.",
        },
        {
            question:
                "What if a client underpays because a job wasn't finished?",
            answer: "Write down what you received and the original sum. Then note what was left, and whether you've agreed to return or the difference is dropped. Don't mark it as paid in full until the two of you have settled it.",
        },
        {
            question: "Can I send one receipt for a whole block of flats?",
            answer: "Yes, if one agent pays for them together. List each flat on its own line with the date of the clean. The agent can then pass the right share to each landlord, without asking you to break it down.",
        },
    ],
};
