import type { DocumentData } from "../types";

export const invoice: DocumentData = {
    slug: "invoice",
    name: "Invoice",
    chip: "Invoice",
    line: "Ask for payment for work you've done.",
    reviewed: false,
    lede: "A clean invoice with real example lines, a due date and a total that adds up. Fill it online, or download the file and make it yours.",
    items: [
        {
            line: "Project work",
            billedBy: "A fixed fee",
            description: "Logo design, final files",
            qty: "1",
            rate: "800",
        },
        {
            line: "Hours",
            billedBy: "Per hour",
            description: "Brand workshop, hours",
            qty: "4",
            rate: "75",
        },
        {
            line: "Set of items",
            billedBy: "Per item",
            description: "Social media banners",
            qty: "6",
            rate: "40",
        },
        {
            line: "Changes",
            billedBy: "Per round, after the ones included",
            description: "Extra revision round",
            qty: "1",
            rate: "150",
        },
        {
            line: "Bought in for the job",
            billedBy: "What you paid, shown on its own line",
            description: "Stock photo licence",
            qty: "2",
            rate: "25",
        },
        {
            line: "Getting there",
            billedBy: "A flat fee or by distance",
            description: "Travel to client's office",
            qty: "1",
            rate: "30",
        },
    ],
    payment: {
        text: "An invoice is a request to be paid, so it needs a date the money is due. The shorter and clearer the terms, the less you end up chasing. Agree them before the work starts, then repeat them on the invoice.",
        points: [
            "Due on receipt, for small one-off jobs",
            "Net 14 or Net 30, for regular business clients",
            "A deposit first, with the balance on this invoice",
        ],
    },
    fields: [
        {
            name: "Invoice number",
            why: "Every invoice gets its own number, in order, so you and your client can both find it later.",
        },
        {
            name: "Issue date and due date",
            why: "Write the real date, not just 'Net 30', so nobody has to count days.",
        },
        {
            name: "How to pay",
            why: "A bank account or payment link on the page removes the most common excuse for paying late.",
        },
    ],
    example: {
        number: "INV-0001",
        issued: "2026-03-02",
        due: "2026-03-16",
        terms: "net14",
        currency: "USD",
        from: {
            name: "Lumen Studio",
            email: "hello@example.com",
            address: "12 Mill Lane",
        },
        client: {
            name: "Harbour Cafe",
            email: "accounts@example.com",
            address: "4 Quay Street",
        },
        note: "Pay by bank transfer to the account on file, or use the payment link sent with this invoice.",
    },
    tips: [
        {
            title: "Describe the work, not the job title",
            text: "'Logo design, final files' gets approved quickly. 'Design services' gets a question back, and a question back means a week of waiting for your money.",
        },
        {
            title: "Never reuse a number",
            text: "Two invoices with one number confuse your client's accounts team and your own records. Keep one running list and move on to the next number, even after a cancelled job.",
        },
        {
            title: "Send it the day the work ends",
            text: "The due date only starts counting when the invoice arrives. An invoice sent three weeks late is three weeks of free credit that you gave away without meaning to.",
        },
    ],
    faqs: [
        {
            question: "What must an invoice include?",
            answer: "At the least: the word Invoice, a unique number, the date, your name and contact details, your client's name, what you did, the amount, and when it's due. Some countries ask for more, such as a tax number, so check your tax office's rules.",
        },
        {
            question: "What's the difference between an invoice and a receipt?",
            answer: "An invoice asks for money that's still owed. A receipt confirms money that has already arrived. Many clients want both: the invoice to approve the payment, then the receipt for their files once you've been paid.",
        },
        {
            question: "Can I send an invoice before the work is finished?",
            answer: "Yes, if your client agreed to it. Long jobs are often split into stages, with an invoice at each stage. Say which stage the invoice covers on the line itself, so the running total stays easy to follow on both sides.",
        },
        {
            question: "What if my client doesn't pay by the due date?",
            answer: "Start with a short, friendly note the day after it's due, and attach the invoice again. Most late payments are forgotten, not refused. If it runs on, send a firmer letter, and add a late fee only if your terms already said so.",
        },
    ],
    band: {
        title: "Send it, then see it get paid.",
        line: "Send the invoice as a link your client can pay from, through your own payment account. 0% fees.",
    },
};
