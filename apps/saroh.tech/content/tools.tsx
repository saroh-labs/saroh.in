import Link from "next/link";

import type { MomentCopy } from "@/components/tools/signup-moment";
import type { ToolContent } from "@/components/tools/tool-page";
import { H2 } from "@/components/tools/tool-page";

const LIST = "m-0 list-disc pl-5 text-[17px] leading-[1.9]";
const COPY = "m-0 text-[17px] leading-relaxed text-body";
const FINE = "m-0 text-sm text-quiet";

const to = (href: string, name: string) => (
    <Link prefetch={false} href={href}>
        {name}
    </Link>
);

const TEMPLATES = (doc: string) => [
    { name: "Photographers", href: "/templates/for/photographer" },
    { name: "Cleaners", href: "/templates/for/cleaner" },
    { name: "Contractors", href: "/templates/for/contractor" },
    { name: "Tutors", href: "/templates/for/tutor" },
    { name: "UK", href: "/templates/in/uk" },
    { name: `${doc} template`, href: `/templates/${doc.toLowerCase()}` },
];

export const MOMENT_INVOICE: MomentCopy = {
    cardTitle: "Downloaded. Want to send it and get paid?",
    sheetTitle: "Want to send it and get paid?",
    cardLine:
        "Send it as a link your client can pay from, through your own Stripe, PayPal or bank. See when they open it. We never touch the money.",
    sheetLines: [
        "Send it as a link your client can pay from, through your own Stripe, PayPal or bank.",
        "See when they open it. Remind them in one tap from your email or WhatsApp.",
        "0% fees. We never touch your money.",
    ],
    sheetNote:
        "Free plan, no card. This invoice and your details come with you.",
    action: "Save, send and get paid",
    hint: "Free plan · this invoice comes with you",
};

export const MOMENT_QUOTE: MomentCopy = {
    cardTitle: "Downloaded. Want your client to accept it online?",
    sheetTitle: "Want your client to accept it online?",
    cardLine:
        "In Saroh they tap Accept, you see the time it happened, and it turns into an invoice in one tap.",
    sheetLines: [
        "Your client taps Accept, and you see the time it happened.",
        "Turn an accepted quote into an invoice in one tap.",
        "Every change and every yes is kept in one place.",
    ],
    sheetNote: "Free plan, no card. This quote and your details come with you.",
    action: "Send it from Saroh",
    hint: "Free plan · this quote comes with you",
    quiet: {
        title: "Want your client to accept it online?",
        line: "In Saroh they tap Accept, you see the time it happened, and it turns into an invoice in one tap.",
        link: "Send it from Saroh →",
    },
};

export const MOMENT_RECEIPT: MomentCopy = {
    cardTitle: "Downloaded. Want every receipt kept for you?",
    sheetTitle: "Want every receipt kept for you?",
    cardLine:
        "Record a payment in Saroh and the receipt is made and saved with the client.",
    sheetLines: [
        "Record a payment and the receipt is made for you.",
        "Every receipt is saved with the client.",
        "0% fees. We never touch your money.",
    ],
    sheetNote:
        "Free plan, no card. This receipt and your details come with you.",
    action: "Keep it in Saroh",
    hint: "Free plan · this receipt comes with you",
};

export const MOMENT_REMINDER: MomentCopy = {
    cardTitle: "Ready. Chasing more than one invoice?",
    sheetTitle: "Chasing more than one invoice?",
    cardLine:
        "Saroh writes the right reminder for every overdue invoice and tells you when to send it. It still comes from you, so it gets read.",
    sheetLines: [
        "The right reminder for every overdue invoice.",
        "Saroh tells you when to send it.",
        "It still comes from your own email or WhatsApp, so it gets read.",
    ],
    sheetNote: "Free plan, no card.",
    action: "Try one-tap reminders",
    hint: "Free plan, no card",
    quiet: {
        title: "Chasing more than one invoice?",
        line: "Saroh writes the right reminder for every overdue invoice and tells you when to send it. It still comes from you, so it gets read.",
        link: "Try one-tap reminders →",
    },
};

export const MOMENT_LATE_FEE: MomentCopy = {
    cardTitle: "Copied. Want to see every overdue invoice?",
    sheetTitle: "Want to see every overdue invoice?",
    cardLine: "Saroh shows what's late, by how much, and who to remind today.",
    sheetLines: [
        "See every overdue invoice by age.",
        "Know who to remind today, and remind them in one tap.",
        "0% fees. We never touch your money.",
    ],
    sheetNote: "Free plan, no card.",
    action: "See what's late",
    hint: "Free plan, no card",
};

export const MOMENT_TAX: MomentCopy = {
    cardTitle: "Copied. Want your tax lines on every invoice?",
    sheetTitle: "Want your tax lines on every invoice?",
    cardLine:
        "Save your tax lines in Saroh and they're on every invoice you send.",
    sheetLines: [
        "Your tax lines, saved on every invoice.",
        "Send invoices your client can pay from your own link.",
        "0% fees. We never touch your money.",
    ],
    sheetNote: "Free plan, no card.",
    action: "Save my tax lines",
    hint: "Free plan, no card",
};

const FREE_AND_PRIVATE = [
    {
        question: "Do you keep my invoice?",
        answer: "No. It stays in this browser until you clear it or sign up. Clear empties it, and we never see what you type.",
    },
    {
        question: "Can I add my logo?",
        answer: "Yes. Tap Add logo and pick a PNG or JPG. It's kept in this browser and appears on your PDF.",
    },
];

export const INVOICE: ToolContent = {
    tool: "invoice-generator",
    lede: "Fill it in, download a clean PDF. No sign-up, no watermark.",
    ticks: ["Any currency", "Your own tax lines", "Stays in this browser"],
    how: {
        title: "How to make an invoice in 2 minutes",
        steps: [
            {
                title: "Add your details",
                text: "Name, logo and tax ID. We remember them in this browser.",
            },
            {
                title: "Add your client",
                text: "Who pays, and where to send it.",
            },
            {
                title: "List the work",
                text: "Items, quantity and rate. Tax and totals add up as you type.",
            },
            {
                title: "Download or send",
                text: "Get the PDF, or send it as a payable link from Saroh.",
            },
        ],
    },
    explain: (
        <>
            <h2 className={H2}>What to put on an invoice</h2>
            <p className={COPY}>
                Most clients pay faster when nothing is missing. Check yours
                has:
            </p>
            <ul className={LIST}>
                <li>The word "Invoice" and a unique number</li>
                <li>Your name, address and contact</li>
                <li>Your client's name and address</li>
                <li>Issue date and due date</li>
                <li>Each item with quantity, rate and amount</li>
                <li>Tax lines, if you charge tax, and your tax ID</li>
                <li>The total due, in one currency</li>
                <li>How to pay you</li>
            </ul>
            <p className={FINE}>
                Some countries ask for more. See the{" "}
                {to("/templates/in/uk", "UK")}, {to("/templates/in/us", "US")},{" "}
                {to("/templates/in/canada", "Canada")} and{" "}
                {to("/templates/in/australia", "Australia")} templates. This is
                not tax advice.
            </p>
        </>
    ),
    faqs: [
        {
            question: "Is it really free?",
            answer: "Yes. Make and download as many invoices as you like. No sign-up, no watermark. The app is for sending, tracking and getting paid.",
        },
        ...FREE_AND_PRIVATE,
        {
            question: "Which currencies and taxes work?",
            answer: "Pick your currency from the list, then add your own tax lines with any name and rate. You choose the rate, so check it with your tax office.",
        },
        {
            question: "Can my client pay online?",
            answer: "Put your own Stripe, PayPal or other payment link on the invoice and they can pay from it. We never touch the money.",
        },
        {
            question: "How do I number my invoices?",
            answer: "Give each invoice its own number and keep them in order, such as INV-0001, INV-0002. Some countries have rules about gaps, so check yours.",
        },
    ],
    more: [
        {
            title: "Quote maker",
            line: "Send a price before the work.",
            href: "/tools/quote-maker",
        },
        {
            title: "Receipt maker",
            line: "Confirm a payment you got.",
            href: "/tools/receipt-maker",
        },
        {
            title: "Payment reminder writer",
            line: "Ask for late money, politely.",
            href: "/tools/payment-reminder",
        },
        {
            title: "Late fee calculator",
            line: "Work out what to add.",
            href: "/tools/late-fee-calculator",
        },
    ],
    templates: TEMPLATES("Invoice"),
    band: {
        title: "Send it, track it, get paid.",
        line: "0% fees. Your client pays you directly.",
    },
};

export const QUOTE: ToolContent = {
    tool: "quote-maker",
    lede: "Give your client a clear price before you start. Download a clean PDF, no sign-up.",
    how: {
        title: "How to make a quote",
        steps: [
            {
                title: "Pick quote or estimate",
                text: "A quote is a fixed price. An estimate can change.",
            },
            {
                title: "List the work",
                text: "Each item with its price. Add optional extras and a deposit.",
            },
            {
                title: "Say what's included",
                text: "And what isn't, and how long the price is good for.",
            },
            {
                title: "Download or send",
                text: "Get the PDF, or let your client accept it online from Saroh.",
            },
        ],
    },
    explain: (
        <>
            <h2 className={H2}>Quote or estimate?</h2>
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
                <table className="w-full border-collapse text-left text-[15px]">
                    <thead>
                        <tr className="border-b border-line">
                            <td className="p-3" />
                            <th scope="col" className="p-3">
                                Quote
                            </th>
                            <th scope="col" className="p-3">
                                Estimate
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ["Price", "Fixed", "Best guess"],
                            [
                                "Use when",
                                "You know the job",
                                "You'll find out more on site",
                            ],
                            [
                                "If it changes",
                                "Send a new version",
                                "Explain why, before you bill",
                            ],
                        ].map(([row, quote, estimate]) => (
                            <tr key={row} className="border-t border-line">
                                <th scope="row" className="p-3">
                                    {row}
                                </th>
                                <td className="p-3">{quote}</td>
                                <td className="p-3">{estimate}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className={COPY}>
                {to("/guides/quote-vs-estimate", "Read the full guide →")}
            </p>
            <h2 className={H2}>What to put on a quote</h2>
            <ul className={LIST}>
                <li>What you'll do, item by item</li>
                <li>Price for each, and the total</li>
                <li>How long the price is good for</li>
                <li>Any deposit, and when it's due</li>
                <li>What's not included</li>
                <li>A place for the client to say yes</li>
            </ul>
        </>
    ),
    faqs: [
        {
            question: "Can I turn a quote into an invoice?",
            answer: "Yes. Open it in the invoice generator with one tap, or in Saroh after the client accepts.",
        },
        {
            question: "How long should a quote be valid?",
            answer: "Long enough for your client to decide, and short enough that your costs won't change. Pick a date and put it on the quote.",
        },
        {
            question: "Should I ask for a deposit?",
            answer: "It's common when you buy materials or hold a date for someone. Choose a percentage or an amount, and the quote shows what's due on acceptance.",
        },
        {
            question: "What if the job changes?",
            answer: "Tell your client before you do the extra work and send a new version. Keep the old one, so you both know what changed.",
        },
    ],
    more: [
        {
            title: "Invoice generator",
            line: "Bill for the work once it's done.",
            href: "/tools/invoice-generator",
        },
        {
            title: "Guide: set your rate",
            line: "Price your time right.",
            href: "/guides/set-your-rate",
        },
        {
            title: "Quote templates",
            line: "Contractors, plumbers, designers…",
            href: "/templates/quote",
        },
    ],
    band: { title: "Every quote, every change, every “yes”, in one place." },
};

export const RECEIPT: ToolContent = {
    tool: "receipt-maker",
    lede: "Show a client they've paid. Ready in a minute, no sign-up, no watermark.",
    explain: (
        <>
            <h2 className={H2}>Receipt or invoice?</h2>
            <p className={COPY}>
                An invoice asks for money. A receipt says you got it. Send the
                receipt after the money arrives, and keep a copy for your
                records.
            </p>
            <h3 className="m-0 text-lg font-semibold">A good receipt shows</h3>
            <ul className={LIST}>
                <li>Who paid, and who was paid</li>
                <li>How much, and the currency</li>
                <li>The date and how they paid</li>
                <li>What it was for (the invoice number helps)</li>
                <li>Tax included, if you charge tax</li>
            </ul>
        </>
    ),
    faqs: [
        {
            question: "Can I make a receipt for a part payment?",
            answer: 'Yes. Put the amount you got, and in "For" write what\'s still owed, such as "Deposit for INV-0031, 360 left".',
        },
        {
            question: "Do I need to sign it?",
            answer: "Usually not, but rules differ by country and trade. If your client asks for a signature, print it and sign it.",
        },
        {
            question: "Can I make one for a cash payment?",
            answer: "Yes. Choose Cash under Paid by. A receipt is most useful for cash, because there's no bank record.",
        },
        {
            question: "How long should I keep receipts?",
            answer: "It depends on where you are. Your tax office's website says how long to keep business records. This isn't tax advice.",
        },
    ],
    more: [
        {
            title: "Invoice generator",
            line: "Ask for the money first.",
            href: "/tools/invoice-generator",
        },
        {
            title: "Payment reminder writer",
            line: "Ask for late money, politely.",
            href: "/tools/payment-reminder",
        },
        {
            title: "Receipt templates",
            line: "Word, Google Docs, Sheets.",
            href: "/templates/receipt",
        },
    ],
    band: {
        title: "Every receipt, kept with the client.",
        line: "Record a payment in Saroh and the receipt is made and saved for you.",
    },
};

export const REMINDER: ToolContent = {
    tool: "payment-reminder",
    lede: "Pick a tone, copy the message, send it from your own email or WhatsApp.",
    explain: (
        <>
            <h2 className={H2}>When to send which</h2>
            <dl className="m-0 flex flex-col">
                {[
                    [
                        "Day before",
                        "A friendly heads-up with the payment link. Many late payments are just forgotten ones.",
                    ],
                    ["3 days late", "Friendly. Assume it slipped through."],
                    ["2 weeks late", "Firm. Give a clear new date."],
                    [
                        "30 days late",
                        "Final. Mention a late fee only if your terms already say so.",
                    ],
                ].map(([when, what]) => (
                    <div
                        key={when}
                        className="flex flex-col gap-1 border-t border-line py-3 md:flex-row md:gap-4"
                    >
                        <dt className="font-bold md:w-32 md:shrink-0">
                            {when}
                        </dt>
                        <dd className="m-0 text-[15.5px] text-body">{what}</dd>
                    </div>
                ))}
            </dl>
        </>
    ),
    faqs: [
        {
            question: "Is email or WhatsApp better?",
            answer: "Use whatever your client already replies to. Email is better for a paper trail; a short WhatsApp gets seen faster.",
        },
        {
            question: "Can I charge a late fee?",
            answer: "Only if your terms said so before the work started, and some countries have rules on it. Work out the amount with the late fee calculator.",
        },
        {
            question: "What if they still don't pay?",
            answer: "Call them, then send a final notice with a clear date. After that, ask a local adviser about your options. This isn't legal advice.",
        },
        {
            question: "Do you send the message for me?",
            answer: "No. It opens in your own email or WhatsApp and you tap send, so it comes from you and nothing goes through us.",
        },
    ],
    more: [
        {
            title: "Late fee calculator",
            line: "Work out what to add.",
            href: "/tools/late-fee-calculator",
        },
        {
            title: "Invoice generator",
            line: "Resend a clean copy.",
            href: "/tools/invoice-generator",
        },
        {
            title: "Payment reminder letter template",
            line: "For a printed final notice.",
            href: "/templates/payment-reminder-letter",
        },
    ],
    band: { title: "Reminders that come from you, so they get read." },
};

export const LATE_FEE: ToolContent = {
    tool: "late-fee-calculator",
    lede: "Work out the fee on an overdue invoice and get a line you can add to it.",
    explain: (
        <>
            <h2 className={H2}>How the fee is worked out</h2>
            <ul className={LIST}>
                <li>
                    <b>Flat fee:</b> one fixed amount, once it's late.
                </li>
                <li>
                    <b>% a month:</b> amount × rate × (days charged ÷ 30).
                </li>
                <li>
                    <b>% a year:</b> amount × rate × (days charged ÷ 365).
                </li>
                <li>
                    <b>Days charged</b> = days late minus grace days.
                </li>
            </ul>
            <p className={FINE}>
                Simple interest, not compounded. Rounded to two decimals.
            </p>
        </>
    ),
    faqs: [
        {
            question: "What's a normal late fee?",
            answer: "It depends on your trade, your country and what your client agreed to. Put your fee in your terms and on every invoice, so it's never a surprise.",
        },
        {
            question: "Should I tell the client first?",
            answer: "Yes. Send a reminder before you add a fee. Many late payments are just forgotten ones.",
        },
        {
            question: "Is a grace period a good idea?",
            answer: "A few days can keep a good client relationship, and it costs little. Enter them as grace days and they aren't charged.",
        },
        {
            question: "Can I waive it if they pay now?",
            answer: "Yes, it's your fee to waive. Offering that can get an old invoice paid faster.",
        },
    ],
    more: [
        {
            title: "Payment reminder writer",
            line: "Ask before you charge.",
            href: "/tools/payment-reminder",
        },
        {
            title: "Invoice generator",
            line: "Add the fee and resend.",
            href: "/tools/invoice-generator",
        },
        {
            title: "Guide: payment terms explained",
            line: "Net 30, due on receipt, deposits.",
            href: "/guides/payment-terms",
        },
    ],
    band: {
        title: "See every overdue invoice by age.",
        line: "Saroh shows what's late, by how much, and who to remind today.",
    },
};

const formula = (name: string, rate: number, base: number, symbol: string) => {
    const factor = (1 + rate / 100).toFixed(2);
    const gross = (base * (1 + rate / 100)).toFixed(2).replace(/\.00$/, "");
    const wrong = (Number(gross) * (1 - rate / 100))
        .toFixed(2)
        .replace(/\.00$/, "");
    return (
        <div className="rounded-[14px] border border-line bg-surface p-4 text-[15.5px] leading-[1.7]">
            <b>Add {name}:</b> price × (1 + rate)
            <br />
            <span className="font-mono text-[13.5px] text-quiet">
                {symbol}
                {base} × {factor} = {symbol}
                {gross}
            </span>
            <br />
            <b>Remove {name}:</b> total ÷ (1 + rate)
            <br />
            <span className="font-mono text-[13.5px] text-quiet">
                {symbol}
                {gross} ÷ {factor} = {symbol}
                {base}
            </span>
            <br />
            <span className="text-quiet">
                A common mistake: taking {rate}% off {symbol}
                {gross} gives {symbol}
                {wrong}, not {symbol}
                {base}.
            </span>
        </div>
    );
};

const TAX_MORE = [
    {
        title: "Invoice generator",
        line: "Your own tax lines, any currency.",
        href: "/tools/invoice-generator",
    },
    {
        title: "Quote maker",
        line: "Show tax before the work starts.",
        href: "/tools/quote-maker",
    },
    {
        title: "Guide: VAT and sales tax basics",
        line: "Plain words, with official links.",
        href: "/guides/vat-and-sales-tax-basics",
    },
];

const TAX_BAND = { title: "Your tax lines, saved on every invoice." };

export const VAT: ToolContent = {
    tool: "vat-calculator",
    lede: "Add VAT to a price, or take it out of a total. Type a number, pick a rate.",
    explain: (
        <>
            <h2 className={H2}>How to work out VAT</h2>
            {formula("VAT", 20, 100, "£")}
            <p className={COPY}>
                VAT is added at each step of a sale. If you're registered, you
                charge it on your invoices and show it as its own line.
            </p>
        </>
    ),
    faqs: [
        {
            question: "Do I have to charge VAT?",
            answer: "It depends on where you are, what you sell and how much you earn. Your tax office's website says when you must register. This tool only does the maths. Not tax advice.",
        },
        {
            question: "Why is my rate different?",
            answer: "Countries set their own rates, and many have lower rates for some goods. The rates here are examples, so check the current one for what you sell.",
        },
        {
            question: "How do I show VAT on an invoice?",
            answer: "Show the price before VAT, the VAT amount and rate, and the total, with your VAT number. The invoice generator does this for you.",
        },
        {
            question: "Can I add more than one tax line?",
            answer: "This calculator works out one rate. The invoice generator lets you add as many tax lines as you need.",
        },
    ],
    more: TAX_MORE,
    band: TAX_BAND,
};

export const SALES_TAX: ToolContent = {
    tool: "sales-tax-calculator",
    lede: "Add sales tax to a price, or take it out of a total. Type a number, pick a rate.",
    explain: (
        <>
            <h2 className={H2}>How to work out sales tax</h2>
            {formula("sales tax", 8, 100, "$")}
            <p className={COPY}>
                In the US, sales tax can come from the state, the county and the
                city. Add them together and enter the combined rate.
            </p>
        </>
    ),
    faqs: [
        {
            question: "Do I have to charge sales tax?",
            answer: "It depends on where you and your customers are and what you sell. Your state's tax agency says when you must register. This tool only does the maths. Not tax advice.",
        },
        {
            question: "Why is my rate different?",
            answer: "Rates change by state, county and city, and some things aren't taxed. The rates here are round examples, so enter your own combined rate.",
        },
        {
            question: "How do I show sales tax on an invoice?",
            answer: "Show the price before tax, the tax amount and rate, and the total. The invoice generator does this for you.",
        },
        {
            question: "Can I add more than one tax line?",
            answer: "This calculator works out one combined rate. The invoice generator lets you add as many tax lines as you need.",
        },
    ],
    more: TAX_MORE,
    band: TAX_BAND,
};

export const GST: ToolContent = {
    tool: "gst-calculator",
    lede: "Add GST to a price, or take it out of a total. Type a number, pick a rate.",
    explain: (
        <>
            <h2 className={H2}>How to work out GST</h2>
            {formula("GST", 10, 100, "A$")}
            <p className={COPY}>
                GST works the same way in each country that has it, but the rate
                is different. Canada adds HST or PST in some provinces.
            </p>
        </>
    ),
    faqs: [
        {
            question: "Do I have to charge GST?",
            answer: "It depends on where you are, what you sell and how much you earn. Your tax office's website says when you must register. This tool only does the maths. Not tax advice.",
        },
        {
            question: "Why is my rate different?",
            answer: "Countries set their own rates, and some goods have other rates or none. The rates here are examples, so check the current one for what you sell.",
        },
        {
            question: "How do I show GST on an invoice?",
            answer: "Show the price before GST, the GST amount and rate, and the total, with your GST number if you have one. The invoice generator does this for you.",
        },
        {
            question: "Can I add more than one tax line?",
            answer: "This calculator works out one rate. The invoice generator lets you add as many tax lines as you need, such as GST and PST.",
        },
    ],
    more: TAX_MORE,
    band: TAX_BAND,
};
