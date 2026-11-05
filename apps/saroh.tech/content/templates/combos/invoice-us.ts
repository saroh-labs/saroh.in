import type { Combo } from "../types";

export const invoiceUs: Combo = {
    document: "invoice",
    country: "us",
    reviewed: false,
    lede: "A US invoice in dollars on Letter paper, with your EIN and a sales tax line you set for your state. The example uses the Texas state rate.",
    example: {
        number: "INV-0302",
        note: "Example at the Texas state rate only. A local rate can add up to 2%.",
    },
    tips: [
        {
            title: "Look up the rate for your own state",
            text: "America has no single rate to copy. Texas starts at 6.25% and California at 7.25%, then local taxes sit on top. Find your figure on your state revenue office's site before you send anything.",
        },
        {
            title: "Keep your Social Security number off the bill",
            text: "A sole proprietor generally uses an SSN as a taxpayer ID, but that doesn't mean printing it on every invoice. When a client needs your number for their filing, Form W-9 is the way to give it.",
        },
        {
            title: "Write the month as a word",
            text: "Clients abroad read 03/04 as April, Americans read it as March. Mar 4, 2026 can't go wrong, and it's how this template prints every date, on Letter size paper.",
        },
    ],
    faqs: [
        {
            question: "Does a US invoice have to show an EIN?",
            answer: "None of the IRS pages we read says so. They tell you who needs an EIN: employers and entities such as partnerships, LLCs and corporations. Plenty of clients still ask to see one, so print it if you have it.",
        },
        {
            question: "Must American sellers list sales tax on its own line?",
            answer: "It depends on the state. The Texas Comptroller says you must state it separately on the bill, unless you tell the customer in writing and post a sign that tax is included. Check your own state's revenue office.",
        },
        {
            question: "How long should I keep copies of invoices for the IRS?",
            answer: "The IRS lists invoices among the documents that back up your gross receipts. Its general period for keeping records is 3 years, with longer periods in cases such as a bad debt deduction or income left off a return.",
        },
        {
            question: "Can I add a late fee to an unpaid American invoice?",
            answer: "We found no federal rule on the tax pages we read. Your contract and your state's law decide it. Agree any fee before the work begins, then print it on the invoice.",
        },
    ],
};
