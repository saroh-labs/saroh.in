import type { Faq } from "@/components/shared/faq-list";

/**
 * Guide words as typed data, not MDX: a static export under Turbopack needs no
 * loader this way, and the HowTo and FAQ schema read the same steps and answers
 * the page draws.
 */
/** Who signs a guide, as saroh.in's guides are signed. */
export const GUIDE_AUTHOR = {
    name: "Yash Mehta",
    role: "Founder at Saroh",
} as const;

export type GuideBlock =
    | { kind: "text"; text: string }
    | { kind: "list"; items: readonly string[] }
    | { kind: "checklist"; items: readonly string[] }
    | { kind: "steps"; items: readonly { title: string; text: string }[] }
    /** A worked example as invoice lines. Numbers are always made up. */
    | {
          kind: "lines";
          label: string;
          rows: readonly (readonly [string, string])[];
          total: readonly [string, string];
      }
    /** A message to copy. */
    | { kind: "message"; title: string; text: string }
    | {
          kind: "table";
          head: readonly string[];
          rows: readonly (readonly string[])[];
      }
    /** Official pages: anything country or law specific points here. */
    | { kind: "sources"; items: readonly { name: string; href: string }[] }
    /** The tool, in the middle of the page. */
    | { kind: "tool"; title: string; line: string };

export interface GuideSection {
    id: string;
    title: string;
    blocks: readonly GuideBlock[];
}

export type GuideGroup = "Getting paid" | "Pricing your work" | "Tax";

export interface Guide {
    slug: string;
    group: GuideGroup;
    /** How other pages name this guide: the Read next and hub cards. */
    card: { title: string; line: string };
    short: string;
    sections: readonly GuideSection[];
    faqs: readonly Faq[];
    next: readonly string[];
    tool: { name: string; href: string };
    band: { title: string; line: string };
}

const INVOICE_RULES = [
    {
        name: "UK: what an invoice must include (GOV.UK)",
        href: "https://www.gov.uk/invoicing-and-taking-payment-from-customers",
    },
    {
        name: "Australia: tax invoices (ATO)",
        href: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices",
    },
    {
        name: "Canada: GST/HST for businesses (CRA)",
        href: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html",
    },
    {
        name: "EU: VAT rules (Your Europe)",
        href: "https://europa.eu/youreurope/business/taxation/vat/index_en.htm",
    },
] as const;

const TAX_OFFICES = [
    { name: "UK: VAT rates (GOV.UK)", href: "https://www.gov.uk/vat-rates" },
    {
        name: "UK: registering for VAT (GOV.UK)",
        href: "https://www.gov.uk/vat-registration",
    },
    {
        name: "EU: VAT rules (Your Europe)",
        href: "https://europa.eu/youreurope/business/taxation/vat/index_en.htm",
    },
    {
        name: "US: state tax offices (USA.gov)",
        href: "https://www.usa.gov/state-taxes",
    },
    {
        name: "Canada: GST/HST for businesses (CRA)",
        href: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html",
    },
    {
        name: "Australia: GST (ATO)",
        href: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst",
    },
    {
        name: "New Zealand: GST (Inland Revenue)",
        href: "https://www.ird.govt.nz/gst",
    },
    {
        name: "Singapore: GST (IRAS)",
        href: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)",
    },
    { name: "UAE: Federal Tax Authority", href: "https://tax.gov.ae/en/" },
] as const;

const LATE_RULES = {
    name: "UK: late commercial payments (GOV.UK)",
    href: "https://www.gov.uk/late-commercial-payments-interest-debt-recovery",
} as const;

export const GUIDE_CONTENT: readonly Guide[] = [
    {
        slug: "how-to-write-an-invoice",
        group: "Getting paid",
        card: {
            title: "How to write an invoice",
            line: "8 steps and an example",
        },
        short: `Put "Invoice" and a unique number at the top, then your details, your client's details, the dates, each item with its price, any tax, the total, and how to pay you. Send it as a PDF or a link, and keep a copy.`,
        sections: [
            {
                id: "steps",
                title: "8 steps",
                blocks: [
                    {
                        kind: "steps",
                        items: [
                            {
                                title: `Write "Invoice" and a number`,
                                text: "Use a number you never reuse, like INV-0001. It's how you and your client find it later.",
                            },
                            {
                                title: "Add your details",
                                text: "Business name, address, email, and your tax number if you charge tax.",
                            },
                            {
                                title: "Add your client's details",
                                text: "Their name or company and address. For a company, ask who handles invoices.",
                            },
                            {
                                title: "Set the dates",
                                text: `The issue date and a clear due date. "Due 31 Dec" is easier to act on than "Net 30".`,
                            },
                            {
                                title: "List the work",
                                text: "One line per thing you did, with quantity, rate and amount.",
                            },
                            {
                                title: "Add tax, if you charge it",
                                text: "Show each tax line and its rate. The rules depend on your country; check your tax office's site.",
                            },
                            {
                                title: "Show the total and how to pay",
                                text: "A payment link, bank details, or both. The easier it is, the sooner you're paid.",
                            },
                            {
                                title: "Send it and keep a copy",
                                text: "Email a PDF or send a link. Note the date you sent it.",
                            },
                        ],
                    },
                    {
                        kind: "tool",
                        title: "Do all 8 steps in one place",
                        line: "The free invoice generator adds up the totals for you. No sign-up.",
                    },
                ],
            },
            {
                id: "example",
                title: "An example",
                blocks: [
                    {
                        kind: "text",
                        text: "A designer billing a client for a logo and five web pages, with UK VAT. The numbers are made up for the example. Check the current rate on GOV.UK before you use one.",
                    },
                    {
                        kind: "lines",
                        label: "Example invoice lines: brand identity 1,200, website pages 900, VAT 420, total 2,520",
                        rows: [
                            ["Brand identity design", "£1,200.00"],
                            ["Website pages, 5 × 180", "£900.00"],
                            ["VAT 20%", "£420.00"],
                        ],
                        total: ["Total due 31 Dec", "£2,520.00"],
                    },
                ],
            },
            {
                id: "mistakes",
                title: "Mistakes to avoid",
                blocks: [
                    {
                        kind: "list",
                        items: [
                            "Reusing an invoice number",
                            "No due date, or a vague one",
                            "Hiding how to pay at the bottom of an email",
                            "Mixing two currencies in one invoice",
                            "Sending it weeks after the work is done",
                        ],
                    },
                ],
            },
            {
                id: "rules",
                title: "What the law asks for",
                blocks: [
                    {
                        kind: "text",
                        text: "Some countries list what an invoice must show, above all if you charge tax. These official pages are the place to check. In any other country, look on your tax office's site.",
                    },
                    {
                        kind: "sources",
                        items: [
                            ...INVOICE_RULES,
                            {
                                name: "UK: VAT rates (GOV.UK)",
                                href: "https://www.gov.uk/vat-rates",
                            },
                        ],
                    },
                ],
            },
        ],
        faqs: [
            {
                question: "Do I need a business to send an invoice?",
                answer: "No. Freelancers and sole traders send invoices too. Some countries have rules on what yours must show; check your tax office's site.",
            },
            {
                question:
                    "What's the difference between an invoice and a receipt?",
                answer: "An invoice asks for payment. A receipt shows that payment has been made. You send the invoice first and the receipt once you've been paid.",
            },
            {
                question: "When should I send it?",
                answer: "As soon as the work is done, or on the date you agreed. The longer you wait, the later you're paid.",
            },
            {
                question: "What if the client doesn't pay?",
                answer: "Send a polite reminder first, then a firmer one. Our guide on asking for payment has messages you can copy. If that fails, your country's small claims process or a legal adviser can tell you what's next.",
            },
        ],
        next: ["quote-vs-estimate", "payment-terms", "ask-client-for-payment"],
        tool: { name: "invoice generator", href: "/tools/invoice-generator" },
        band: {
            title: "Make your first invoice now.",
            line: "All 8 steps in one place. Free, no sign-up.",
        },
    },
    {
        slug: "quote-vs-estimate",
        group: "Pricing your work",
        card: { title: "Quote vs estimate", line: "Which one to send" },
        short: "A quote is a fixed price for the work you've described. An estimate is your best guess, and the final price can change. Send a quote when you know the job. Send an estimate when you don't yet.",
        sections: [
            {
                id: "difference",
                title: "The difference",
                blocks: [
                    {
                        kind: "table",
                        head: ["", "Quote", "Estimate"],
                        rows: [
                            [
                                "What it is",
                                "A set price for set work",
                                "A rough price, based on what you know today",
                            ],
                            [
                                "Can the price change?",
                                "Only if the work changes",
                                "Yes. Say by how much, and tell the client first",
                            ],
                            [
                                "Best for",
                                "Work you've done many times",
                                "Work you can't fully see yet",
                            ],
                            [
                                "What to include",
                                "Scope, price, how long the price holds",
                                "Scope, a price or range, what could change it",
                            ],
                        ],
                    },
                    {
                        kind: "text",
                        text: "Names aren't everything. Whether a quote binds you depends on your country and on the words you use. If a job is large, check your local rules or ask a legal adviser.",
                    },
                ],
            },
            {
                id: "which",
                title: "Which one to send",
                blocks: [
                    {
                        kind: "checklist",
                        items: [
                            "Have you seen the job in full? Send a quote.",
                            "Could something hidden change the work? Send an estimate.",
                            "Is the client comparing prices? A quote is easier to compare.",
                            "Is the client still deciding what they want? Send an estimate, then a quote once they've decided.",
                        ],
                    },
                    {
                        kind: "tool",
                        title: "Make either one in two minutes",
                        line: "The free quote maker handles quotes and estimates. No sign-up.",
                    },
                ],
            },
            {
                id: "example",
                title: "An example of each",
                blocks: [
                    {
                        kind: "text",
                        text: "A painter is asked to paint a room. Numbers are made up for the example.",
                    },
                    {
                        kind: "lines",
                        label: "Example quote: painting one room 450, materials 120, total 570",
                        rows: [
                            ["Quote: paint one room, two coats", "£450.00"],
                            ["Paint and materials", "£120.00"],
                        ],
                        total: ["Fixed price, holds for 30 days", "£570.00"],
                    },
                    {
                        kind: "lines",
                        label: "Example estimate: painting one room 450 to 650, materials 120, total 570 to 770",
                        rows: [
                            [
                                "Estimate: paint one room, may need wall repairs",
                                "£450 to £650",
                            ],
                            ["Paint and materials", "£120.00"],
                        ],
                        total: [
                            "Final price after a look at the walls",
                            "£570 to £770",
                        ],
                    },
                ],
            },
        ],
        faqs: [
            {
                question: "Can I change a quote after I send it?",
                answer: "If the client hasn't said yes, send a new version and say what changed. If they have, agree the change with them in writing before you do the work.",
            },
            {
                question: "How long should a quote last?",
                answer: "Pick a period that suits your costs, like 14 or 30 days, and write it on the quote. Then the price can't catch you out months later.",
            },
            {
                question: "Should I charge for a quote?",
                answer: "Small jobs are often quoted for free. If working out the price takes real time, such as a site visit or a long brief, you can charge and take the cost off the job.",
            },
            {
                question: "What happens after the client says yes?",
                answer: "Start the work, or take a deposit first if you agreed one. When the work is done, turn the quote into an invoice.",
            },
        ],
        next: ["charge-a-deposit", "set-your-rate", "how-to-write-an-invoice"],
        tool: { name: "quote maker", href: "/tools/quote-maker" },
        band: {
            title: "Make your first quote now.",
            line: "Quotes and estimates in one place. Free, no sign-up.",
        },
    },
    {
        slug: "ask-client-for-payment",
        group: "Getting paid",
        card: {
            title: "How to ask for payment",
            line: "With examples to copy",
        },
        short: "Ask early, ask clearly and make paying easy. Name the invoice, the amount and the due date, and put the payment link right in the message. Start friendly, and get firmer only if you need to.",
        sections: [
            {
                id: "what-works",
                title: "What makes people pay",
                blocks: [
                    {
                        kind: "checklist",
                        items: [
                            "The invoice number, the amount and the due date are in the first line",
                            "The payment link or bank details are in the message itself",
                            "You ask for one clear thing: pay by this date",
                            "You write to the person who pays, not only the person you worked with",
                            "You assume it slipped their mind. It often has",
                        ],
                    },
                ],
            },
            {
                id: "when",
                title: "When to ask",
                blocks: [
                    {
                        kind: "table",
                        head: ["When", "What to send", "Tone"],
                        rows: [
                            ["A few days before", "A heads up", "Friendly"],
                            ["On the due date", "A reminder", "Friendly"],
                            ["A week late", "A follow up", "Direct"],
                            [
                                "Two to four weeks late",
                                "A final notice",
                                "Firm",
                            ],
                        ],
                    },
                    {
                        kind: "text",
                        text: "These timings are a starting point. Change them to suit how well you know the client and how big the invoice is.",
                    },
                ],
            },
            {
                id: "examples",
                title: "Examples to copy",
                blocks: [
                    {
                        kind: "text",
                        text: "Change the names, dates and numbers. All of these are made up.",
                    },
                    {
                        kind: "message",
                        title: "Before it's due",
                        text: "Hi Sam, a quick note that invoice INV-0042 for £1,250 is due on Friday 14 March. You can pay here: [payment link]. Thanks for your business. Asha, Lumen Studio",
                    },
                    {
                        kind: "message",
                        title: "On the due date",
                        text: "Hi Sam, invoice INV-0042 for £1,250 is due today. Here's the link again: [payment link]. Let me know if you need anything from me. Asha",
                    },
                    {
                        kind: "message",
                        title: "A week late",
                        text: "Hi Sam, invoice INV-0042 for £1,250 was due on 14 March and I haven't received payment. Could you pay it by 25 March? The link is here: [payment link]. If there's a problem with the invoice, please tell me today. Asha",
                    },
                    {
                        kind: "message",
                        title: "Final notice",
                        text: "Hi Sam, invoice INV-0042 for £1,250 is now three weeks overdue. I've written twice. Please pay by 8 April. If it's still unpaid after that date, I'll pause any open work and look at my next options. Link: [payment link]. Asha",
                    },
                    {
                        kind: "tool",
                        title: "Get the words for your invoice",
                        line: "The free reminder writer fills in your details, from polite to firm. No sign-up.",
                    },
                ],
            },
            {
                id: "if-they-dont",
                title: "If they still don't pay",
                blocks: [
                    {
                        kind: "list",
                        items: [
                            "Call them. A phone call is harder to ignore than an email.",
                            "Offer to split the payment if money is tight. Agree the dates in writing.",
                            "Hold new work until the old invoice is paid.",
                            "Charge a late fee only if your terms allow it and your local rules do too.",
                            "As a last step, look at your country's small claims process or ask a legal adviser.",
                        ],
                    },
                    {
                        kind: "text",
                        text: "Some countries give you rights when another business pays late. The UK page below is one example. Elsewhere, check with your tax office or a local adviser.",
                    },
                    { kind: "sources", items: [LATE_RULES] },
                ],
            },
        ],
        faqs: [
            {
                question: "Is it rude to ask for payment?",
                answer: "No. You did the work and the invoice says when it's due. A short, polite message is normal business.",
            },
            {
                question: "Should I email or use WhatsApp?",
                answer: "Use whatever your client answers fastest. Send the first reminder where you usually talk, and keep a copy of what you sent.",
            },
            {
                question: "How many reminders should I send?",
                answer: "Three or four is usually enough. After that, call them or move on to the steps in the section above.",
            },
            {
                question: "Can I threaten legal action?",
                answer: "Only say what you really mean to do, and take advice first. The rules differ by country, so check with a local adviser before you put it in writing.",
            },
        ],
        next: ["payment-terms", "charge-a-deposit", "how-to-write-an-invoice"],
        tool: {
            name: "payment reminder writer",
            href: "/tools/payment-reminder",
        },
        band: {
            title: "Write your reminder now.",
            line: "Polite to firm, ready for email or WhatsApp. Free, no sign-up.",
        },
    },
    {
        slug: "payment-terms",
        group: "Getting paid",
        card: {
            title: "Payment terms explained",
            line: "Net 30, due on receipt",
        },
        short: `"Net 30" means the invoice is due 30 days after its date. Payment terms are simply when you expect to be paid and how. Write the real date on the invoice too, because "Due 31 March" is harder to miss.`,
        sections: [
            {
                id: "terms",
                title: "Common terms",
                blocks: [
                    {
                        kind: "table",
                        head: ["Term", "What it usually means"],
                        rows: [
                            [
                                "Due on receipt",
                                "Pay as soon as you get the invoice",
                            ],
                            [
                                "Net 7, Net 14",
                                "Pay within 7 or 14 days of the invoice date",
                            ],
                            [
                                "Net 30",
                                "Pay within 30 days of the invoice date",
                            ],
                            [
                                "Net 60",
                                "Pay within 60 days of the invoice date",
                            ],
                            ["EOM", "Pay by the end of the month"],
                            [
                                "2/10 Net 30",
                                "Take 2% off if you pay within 10 days. Otherwise pay in full within 30",
                            ],
                            [
                                "50% upfront",
                                "Pay half before work starts, and the rest at the end",
                            ],
                        ],
                    },
                    {
                        kind: "text",
                        text: "These are common habits, not laws. Not every client reads them the same way, so spell out the date.",
                    },
                ],
            },
            {
                id: "pick",
                title: "How to pick yours",
                blocks: [
                    {
                        kind: "checklist",
                        items: [
                            "How long can you wait for the money? Start from your own bills.",
                            "Is it a new client? Use shorter terms, or take a deposit.",
                            "Is it a big company? Ask about their payment run before you agree.",
                            "Is the job long? Bill in stages, not all at the end.",
                            "Did you agree the terms before you started? Put them on the quote as well.",
                        ],
                    },
                    {
                        kind: "tool",
                        title: "Put a clear due date on your next invoice",
                        line: "The free invoice generator works out the date from your terms. No sign-up.",
                    },
                ],
            },
            {
                id: "example",
                title: "An example",
                blocks: [
                    {
                        kind: "text",
                        text: "An invoice dated 1 March on Net 30 is due on 31 March. Write both on it. Numbers are made up for the example.",
                    },
                    {
                        kind: "lines",
                        label: "Example invoice dates: issued 1 March, terms Net 30, due 31 March, amount 800",
                        rows: [
                            ["Issued", "1 March"],
                            ["Terms", "Net 30"],
                        ],
                        total: ["Due 31 March", "$800.00"],
                    },
                ],
            },
            {
                id: "late",
                title: "Late fees and the law",
                blocks: [
                    {
                        kind: "text",
                        text: "If you plan to charge a late fee, put it in your terms before work starts. Some countries set limits on terms, on late fees or on the interest you can claim. We don't give a rule here because it depends on where you and your client are. The UK page below is one example. Elsewhere, check with your tax office or a local adviser.",
                    },
                    { kind: "sources", items: [LATE_RULES] },
                ],
            },
        ],
        faqs: [
            {
                question: "What does Net 30 mean?",
                answer: "Payment is due within 30 days of the invoice date. Some clients count from the day they received it, so write the real due date as well.",
            },
            {
                question: "Is Net 30 the same as 30 days?",
                answer: "Usually, yes. Net 30 normally counts calendar days, including weekends, not working days. Writing the date avoids any doubt.",
            },
            {
                question: "Can I change my terms for a client?",
                answer: "Yes, for future work. Tell them before you send the next quote. For work already agreed, keep to what you both agreed unless they say yes to a change.",
            },
            {
                question: "What are the best terms for a freelancer?",
                answer: "The shortest your clients will accept. You might try 7 or 14 days, with a deposit for new clients. There's no single right answer.",
            },
        ],
        next: [
            "ask-client-for-payment",
            "charge-a-deposit",
            "how-to-write-an-invoice",
        ],
        tool: { name: "invoice generator", href: "/tools/invoice-generator" },
        band: {
            title: "Make an invoice with a clear due date.",
            line: "Any terms, nine currencies. Free, no sign-up.",
        },
    },
    {
        slug: "charge-a-deposit",
        group: "Getting paid",
        card: {
            title: "How to charge a deposit",
            line: "What to ask for, and when",
        },
        short: "Agree the deposit in your quote, ask for it before you start, and take it off the final invoice. Say how much it is, when it's due, and what happens to it if the job is cancelled.",
        sections: [
            {
                id: "steps",
                title: "5 steps",
                blocks: [
                    {
                        kind: "steps",
                        items: [
                            {
                                title: "Decide how much",
                                text: "Pick an amount or a share of the total. Enough to cover your materials and the time you're holding is a good place to start.",
                            },
                            {
                                title: "Put it on the quote",
                                text: "Show the deposit, its due date and the balance as separate lines, so nothing is a surprise.",
                            },
                            {
                                title: "Say what happens if it's cancelled",
                                text: "Write down whether the deposit comes back, and when. Local rules may decide this for you, above all for consumers.",
                            },
                            {
                                title: "Ask for it before you start",
                                text: "Send a deposit invoice or a payment link when the client says yes. Start the work once it arrives.",
                            },
                            {
                                title: "Take it off the final invoice",
                                text: "Show the full price, the deposit paid and its date, and the balance due.",
                            },
                        ],
                    },
                    {
                        kind: "tool",
                        title: "Add a deposit to your next quote",
                        line: "The free quote maker shows the deposit and the balance for you. No sign-up.",
                    },
                ],
            },
            {
                id: "example",
                title: "An example",
                blocks: [
                    {
                        kind: "text",
                        text: "A photographer books a wedding at £2,400 and asks for a quarter upfront. Numbers are made up for the example.",
                    },
                    {
                        kind: "lines",
                        label: "Example final invoice: wedding photography 2,400, deposit paid 600, balance due 1,800",
                        rows: [
                            ["Wedding photography", "£2,400.00"],
                            ["Deposit paid 3 March", "−£600.00"],
                        ],
                        total: ["Balance due 20 June", "£1,800.00"],
                    },
                ],
            },
            {
                id: "check",
                title: "Before you send it",
                blocks: [
                    {
                        kind: "checklist",
                        items: [
                            "The client said yes to the full price",
                            "The deposit amount and due date are in writing",
                            "Your cancellation terms are in writing",
                            "You know when the balance is due",
                            "You've given a receipt for the deposit",
                        ],
                    },
                ],
            },
            {
                id: "tax",
                title: "Deposits and tax",
                blocks: [
                    {
                        kind: "text",
                        text: "A deposit can count as a sale when you receive it, and that can change when you owe tax. Consumer rules on refunds differ too. It depends on your country, so check with your tax office before you decide how to show it.",
                    },
                    { kind: "sources", items: TAX_OFFICES },
                ],
            },
        ],
        faqs: [
            {
                question: "How much should a deposit be?",
                answer: "There's no fixed figure. Think about your upfront costs, how long you'll hold the date, and how well you know the client. Your trade may have its own custom too.",
            },
            {
                question:
                    "What's the difference between a deposit and a retainer?",
                answer: "A deposit is part of the price of one job. A retainer is usually paid ahead for ongoing work or for keeping your time free. Say which you mean in writing.",
            },
            {
                question: "Should a deposit be refundable?",
                answer: "That's up to your terms, within your local rules. Consumer law in some countries may give the client rights whatever your terms say, so check before you write non-refundable.",
            },
            {
                question: "What if the client won't pay a deposit?",
                answer: "Ask why. You can offer a smaller deposit or stage payments. If they won't commit at all, you can decide whether to hold the date for them.",
            },
        ],
        next: ["quote-vs-estimate", "payment-terms", "how-to-write-an-invoice"],
        tool: { name: "quote maker", href: "/tools/quote-maker" },
        band: {
            title: "Make a quote with a deposit.",
            line: "The deposit and the balance, worked out for you. Free, no sign-up.",
        },
    },
    {
        slug: "set-your-rate",
        group: "Pricing your work",
        card: { title: "How to set your freelance rate", line: "A simple sum" },
        short: "Add the pay you need, your costs and money for tax. Divide that by the hours you can really bill in a year. That's your lowest rate. Then check it against the market and the value of your work.",
        sections: [
            {
                id: "steps",
                title: "5 steps",
                blocks: [
                    {
                        kind: "steps",
                        items: [
                            {
                                title: "Decide the pay you need",
                                text: "Start from what you need to live on for a year, not from what others charge.",
                            },
                            {
                                title: "Add your costs",
                                text: "Software, equipment, insurance, your accountant, and anything else the business pays for.",
                            },
                            {
                                title: "Add money for tax",
                                text: "Set money aside for income tax and any other taxes you pay yourself. Your tax office or accountant can tell you how much.",
                            },
                            {
                                title: "Count your real billable hours",
                                text: "Take off holidays, sick days and the hours you spend on admin and finding work. It's often far fewer than you first think.",
                            },
                            {
                                title: "Divide, then round up",
                                text: "Divide the yearly total by your billable hours. Round up to a number you're happy to say out loud.",
                            },
                        ],
                    },
                ],
            },
            {
                id: "example",
                title: "A worked example",
                blocks: [
                    {
                        kind: "text",
                        text: "Say you want 48,000 a year, your costs are 6,000, and you set aside 18,000 for tax. You work 46 weeks and can bill 20 hours in each. That's 920 hours. Numbers are made up for the example.",
                    },
                    {
                        kind: "lines",
                        label: "Example rate sum: pay 48,000, costs 6,000, tax 18,000, total 72,000, divided by 920 hours gives about 78, rounded up to 80",
                        rows: [
                            ["Pay you need", "$48,000"],
                            ["Costs", "$6,000"],
                            ["Set aside for tax", "$18,000"],
                            ["Yearly total", "$72,000"],
                            ["Billable hours, 46 weeks × 20", "920"],
                            ["Total ÷ hours", "$78.26"],
                        ],
                        total: ["Lowest hourly rate, rounded up", "$80.00"],
                    },
                    {
                        kind: "tool",
                        title: "Put your rate on a quote",
                        line: "The free quote maker adds up the lines for you. No sign-up.",
                    },
                ],
            },
            {
                id: "check",
                title: "Check it against the real world",
                blocks: [
                    {
                        kind: "checklist",
                        items: [
                            "Ask people in your trade what they charge. Most will tell you a range.",
                            "Think about the client's result. A logo for a large company is worth more to them than one for a new shop.",
                            "If almost everyone says yes straight away, your rate may be too low.",
                            "Quote by the project if you get faster with practice, so speed earns you more.",
                            "Review your rate once a year, and tell clients early about any change.",
                        ],
                    },
                ],
            },
        ],
        faqs: [
            {
                question: "Should I charge by the hour or by the project?",
                answer: "Charge by the project when you can see the whole job, because you keep the gain from working faster. Charge by the hour when the work can't be scoped.",
            },
            {
                question: "How do I raise my rate?",
                answer: "Give existing clients notice and a date, then apply it to new work. Use your new rate with every new client from today.",
            },
            {
                question: "What if a client says I'm too expensive?",
                answer: "Offer less work for less money, not the same work for less. If they still say no, they may not be the right client.",
            },
            {
                question: "Should I add tax on top of my rate?",
                answer: "If you're registered to charge VAT, GST or sales tax, it usually goes on top as its own line. The rules depend on your country, so check with your tax office.",
            },
        ],
        next: ["quote-vs-estimate", "charge-a-deposit", "payment-terms"],
        tool: { name: "quote maker", href: "/tools/quote-maker" },
        band: {
            title: "Put your rate to work.",
            line: "Make a clear quote in two minutes. Free, no sign-up.",
        },
    },
    {
        slug: "vat-and-sales-tax-basics",
        group: "Tax",
        card: { title: "VAT and sales tax basics", line: "In plain words" },
        short: "VAT and GST are generally charged at each step of a sale, and businesses usually claim back what they paid. Sales tax is generally charged once, to the final buyer. Rates and rules depend on your country, so check your tax office's site.",
        sections: [
            {
                id: "difference",
                title: "The difference",
                blocks: [
                    {
                        kind: "table",
                        head: ["", "VAT or GST", "Sales tax"],
                        rows: [
                            [
                                "Where you'll see it",
                                "Most countries",
                                "Mainly the US",
                            ],
                            [
                                "When it's charged",
                                "Generally at each step of a sale",
                                "Generally once, to the final buyer",
                            ],
                            [
                                "Who sets the rate",
                                "Usually the national government",
                                "In the US, states and local areas",
                            ],
                            [
                                "Can a business claim it back?",
                                "Usually, if registered",
                                "It's usually not charged on goods for resale",
                            ],
                        ],
                    },
                    {
                        kind: "text",
                        text: "This is the general picture, not the rule for your business. Countries differ a lot, and we don't list rates here because they change.",
                    },
                ],
            },
            {
                id: "worked",
                title: "How the sum works",
                blocks: [
                    {
                        kind: "text",
                        text: "Here's the sum with a made-up rate of 10%. It's only there to make the maths easy, and it isn't any country's rate. To add tax, multiply. To take it out of a total, divide. Don't just take 10% off the total.",
                    },
                    {
                        kind: "lines",
                        label: "Example: price 300, tax at a made-up 10% is 30, total 330. To take it out, 330 divided by 1.10 is 300",
                        rows: [
                            ["Price before tax", "$300.00"],
                            ["Tax at a made-up 10%", "$30.00"],
                        ],
                        total: ["Total", "$330.00"],
                    },
                    {
                        kind: "text",
                        text: "Going back: 330 ÷ 1.10 = 300. Taking 10% off 330 would give 297, which is wrong.",
                    },
                    {
                        kind: "tool",
                        title: "Let the calculator do it",
                        line: "Add tax or take it out, with a rate you can change. No sign-up.",
                    },
                ],
            },
            {
                id: "questions-to-ask",
                title: "What to find out",
                blocks: [
                    {
                        kind: "checklist",
                        items: [
                            "Do I need to register? Many countries set a sales level for this.",
                            "What rate applies to what I sell? Some goods and services differ.",
                            "What must my invoice show? A tax number is a common one.",
                            "How often do I report and pay?",
                            "What about clients in another country or state?",
                        ],
                    },
                ],
            },
            {
                id: "where",
                title: "Where to check",
                blocks: [
                    {
                        kind: "text",
                        text: "Start with your own tax office. These are the official pages for some common places. If yours isn't here, search for your tax office's site.",
                    },
                    { kind: "sources", items: TAX_OFFICES },
                ],
            },
        ],
        faqs: [
            {
                question: "Do I have to charge VAT or sales tax?",
                answer: "It depends on your country, what you sell and how much you sell. Check your tax office's site, or ask an accountant.",
            },
            {
                question: "Is GST the same as VAT?",
                answer: "They work in a similar way, and different countries use different names. The details depend on the country, so check your tax office's site.",
            },
            {
                question: "How do I show tax on an invoice?",
                answer: "Usually as its own line, with the rate, below the items. Your country may ask for more, like your tax number. Check your tax office's site.",
            },
            {
                question: "Which rate should I use on the calculators?",
                answer: "The current rate from your tax office. The rates in our calculators are examples you can change.",
            },
        ],
        next: ["how-to-write-an-invoice", "set-your-rate", "payment-terms"],
        tool: { name: "VAT calculator", href: "/tools/vat-calculator" },
        band: {
            title: "Work out your tax now.",
            line: "Add it or take it out, in your browser. Free, no sign-up.",
        },
    },
];

export const guideOf = (slug: string) => {
    const guide = GUIDE_CONTENT.find((g) => g.slug === slug);
    if (!guide) throw new Error(`no guide called ${slug}`);
    return guide;
};

export const GUIDE_GROUPS: readonly GuideGroup[] = [
    "Getting paid",
    "Pricing your work",
    "Tax",
];

/** Steps first: a guide with steps is a HowTo, the rest are Articles. */
export const guideSteps = (guide: Guide) =>
    guide.sections
        .flatMap((s) => s.blocks)
        .flatMap((b) => (b.kind === "steps" ? b.items : []));

export const readMinutes = (guide: Guide) =>
    Math.max(1, Math.ceil(JSON.stringify(guide).split(/\s+/).length / 200));
