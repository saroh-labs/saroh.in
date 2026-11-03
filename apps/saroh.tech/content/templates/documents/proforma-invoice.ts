import type { DocumentData } from "../types";

export const proformaInvoice: DocumentData = {
    slug: "proforma-invoice",
    name: "Proforma invoice",
    chip: "Proforma",
    line: "Show the final bill before the goods ship or the work starts.",
    reviewed: false,
    lede: "A proforma invoice looks like the real bill and says what it will come to, but it isn't a demand for payment or a tax record. Clients use it to get approval, a purchase order or customs paperwork moving.",
    items: [
        {
            line: "Goods",
            billedBy: "Per unit",
            description: "Stoneware mugs, boxed",
            qty: "100",
            rate: "8",
        },
        {
            line: "More goods",
            billedBy: "Per unit",
            description: "Serving bowls, large",
            qty: "40",
            rate: "20",
        },
        {
            line: "Custom work",
            billedBy: "A one-time fee",
            description: "Custom stamp with client logo",
            qty: "1",
            rate: "150",
        },
        {
            line: "Packing",
            billedBy: "Per crate",
            description: "Export crates",
            qty: "3",
            rate: "45",
        },
        {
            line: "Freight",
            billedBy: "A flat quote from the carrier",
            description: "Sea freight to port",
            qty: "1",
            rate: "400",
        },
        {
            line: "Insurance",
            billedBy: "A flat fee",
            description: "Cargo insurance",
            qty: "1",
            rate: "60",
        },
    ],
    payment: {
        text: "Nothing is legally owed on a proforma alone, yet clients often pay from it when you ask for money up front. Once the money or the go-ahead arrives, issue a true invoice with its own number for your records.",
        points: [
            "Paid in full up front, for new or overseas buyers",
            "A deposit against it, with the rest before shipping",
            "Used to raise a purchase order, then invoiced after",
        ],
    },
    fields: [
        {
            name: "The word Proforma",
            why: "Put it in the heading so nobody books this as a real invoice in their accounts.",
        },
        {
            name: "Pay by date",
            why: "Tell the buyer how long this price and this delivery plan will hold.",
        },
        {
            name: "Weights and shipping terms",
            why: "When goods cross a border, buyers and customs agents often ask for these details.",
        },
    ],
    example: {
        number: "PRO-0001",
        issued: "2026-07-06",
        due: "2026-07-27",
        terms: "custom",
        currency: "USD",
        from: {
            name: "Fernhill Ceramics",
            email: "orders@example.com",
            address: "17 Kiln Yard",
        },
        client: {
            name: "Blue Door Homeware",
            email: "buying@example.com",
            address: "90 Harbour Avenue",
        },
        facts: [{ label: "Ships", value: "When paid" }],
        note: "This is a proforma invoice, not a request for tax purposes. A final invoice follows when the order ships.",
    },
    tips: [
        {
            title: "Keep its numbers separate",
            text: "Use its own sequence, such as PRO-0001, away from your invoice numbers. Tax records need unbroken invoice numbers, and proformas that never become orders would leave holes in that list.",
        },
        {
            title: "Don't record it as income",
            text: "It's only a promise of a bill. Add it to your books the day you raise the true invoice, or your sales figures and your tax will look bigger than they really are.",
        },
        {
            title: "Match it to the final invoice",
            text: "Buyers compare the two side by side. If the freight changed, say why on the real invoice, because an unexplained difference will hold up payment at their end.",
        },
    ],
    faqs: [
        {
            question: "What is a proforma invoice for?",
            answer: "It gives a buyer the full cost before anything is final. Finance teams use it to approve spending, import agents use it to prepare customs forms, and banks may ask for it. You use it to ask for money before you start making anything.",
        },
        {
            question: "Can a client claim tax back on a proforma invoice?",
            answer: "Generally no, because it isn't treated as a true tax invoice. Your client needs the final invoice for that. Rules vary by country, so the safest wording says plainly on the page that a final invoice will follow.",
        },
        {
            question: "When do I issue the real invoice?",
            answer: "When the sale becomes real under your local rules: usually when goods ship, work is delivered or payment lands. Give it a normal invoice number and mention the proforma number on it so both sets of records line up.",
        },
        {
            question: "How is a proforma different from a quote?",
            answer: "A quote offers a price and waits for a yes. A proforma usually comes after the yes and sets out exactly what the invoice will say, including freight and quantities. If the buyer hasn't decided yet, send a quote first.",
        },
    ],
    band: {
        title: "Paid before you pack the crate.",
        line: "Send the proforma from Saroh, take the money through your own payment account, then turn it into the real invoice.",
    },
};
