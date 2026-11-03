import type { Combo } from "../types";

export const creditNoteUs: Combo = {
    document: "credit-note",
    country: "us",
    reviewed: false,
    lede: "A US credit note, sometimes called a credit memo, in dollars. It takes money off an invoice you've sent and gives back the sales tax on that part.",
    example: { number: "CN-0302" },
    payment: {
        text: "Say which of these happens next, because a client's accounts team will ask: the amount comes off what they owe, the money comes back, or it stays as credit.",
        points: [
            "Off an unpaid invoice",
            "A refund, by the way they paid",
            "Credit on their next order, agreed in writing",
        ],
    },
    fields: [
        {
            name: "Credit memo number",
            why: "A separate run of numbers keeps these apart from invoices in your books.",
        },
        {
            name: "Sales tax returned",
            why: "Show it on its own line. Your state return should report the lower sale, not the original one.",
        },
    ],
    tips: [
        {
            title: "Use the word your client's system uses",
            text: "Plenty of American bookkeeping tools say credit memo, and others say credit note. They do the same job. If a client's accounts team asks for one by name, change the heading to match.",
        },
        {
            title: "Reverse the tax at the rate you charged",
            text: "Use the same rate as the invoice, even if your local rate has changed since. Ask your state revenue office how to report it, because the tax pages we read don't set one method.",
        },
        {
            title: "Treat a bad debt differently",
            text: "A customer who simply won't pay isn't a credit note situation. The IRS keeps a separate 7-year record period for a bad debt deduction, so talk to your tax preparer before writing it off.",
        },
    ],
    faqs: [
        {
            question:
                "Is a credit memo the same thing as a credit note in the US?",
            answer: "In everyday use, yes. Both reduce what a customer owes on an invoice you've already sent. No IRS page we read defines either term, so pick the one your clients recognize and use it every time.",
        },
        {
            question: "Do I need to file anything with the IRS for one?",
            answer: "The pages we read don't describe a separate filing. Keep it with your other records of gross receipts, and let your books show the lower income. Ask your tax preparer if the credit crosses into a new tax year.",
        },
        {
            question: "How long should I hold on to an American credit memo?",
            answer: "Keep it beside the invoice it changes, for as long as you keep that invoice. The IRS gives 3 years as its general period, longer in some cases, so count from your return and not the memo.",
        },
    ],
    band: {
        title: "Correct a US bill without the mess.",
        line: "Issue a credit note in Saroh and it stays attached to the invoice and the client, with the tax already worked out.",
    },
};
