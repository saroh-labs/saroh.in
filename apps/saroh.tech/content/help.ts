import { site } from "@/site.config";

import { placeholders } from "./placeholders";

export interface HelpStep {
    title: string;
    text: string;
}

export interface HelpArticle {
    slug: string;
    /** The H1, in plain words. */
    task: string;
    group: (typeof HELP_GROUPS)[number];
    minutes: number;
    /** The line on its card on the hub. */
    line: string;
    intro: string;
    steps: readonly HelpStep[];
    note?: string;
    /** The article's one next step. */
    next: { label: string; href: string; inApp?: boolean };
    related: readonly [string, string, string];
}

export const HELP_GROUPS = ["Free tools", "Invoices and payments"] as const;

/** The app isn't built: words about it come from the boards, not from the screen. */
const app = (title: string, text: string): HelpStep => ({
    title,
    text: `${text} ${placeholders.appSteps}`,
});

const doInSaroh = (path: string) => ({
    label: "Do this in Saroh",
    href: `${site.appUrl}${path}`,
    inApp: true,
});

export const HELP: readonly HelpArticle[] = [
    {
        slug: "make-an-invoice-pdf",
        task: "Make an invoice PDF without an account",
        group: "Free tools",
        minutes: 2,
        line: "Fill it in, download it, send it yourself.",
        intro: "The invoice generator runs in your browser. You don't need an account, and the PDF has no watermark.",
        steps: [
            {
                title: "Open the invoice generator",
                text: "Your draft saves in this browser as you type, so you can close the page and come back.",
            },
            {
                title: "Add who it's from and who it's for",
                text: "Fill in From with your business details, then Bill to with your customer's name and email.",
            },
            {
                title: "Add the work",
                text: "Use + Add item for each line. Add your tax name and rate, if you charge tax. Check that the rate is right for you.",
            },
            {
                title: "Download it",
                text: "Choose Download PDF. If some characters won't draw in the PDF, choose Print, then Save as PDF.",
            },
        ],
        next: {
            label: "Open the invoice generator",
            href: "/tools/invoice-generator",
        },
        related: [
            "write-a-payment-reminder",
            "add-your-tax-line",
            "record-a-payment",
        ],
    },
    {
        slug: "write-a-payment-reminder",
        task: "Write a payment reminder with the free tool",
        group: "Free tools",
        minutes: 2,
        line: "From polite to firm, ready to copy.",
        intro: "The reminder writer drafts the message. You send it from your own email or WhatsApp, so it comes from you.",
        steps: [
            {
                title: "Open the payment reminder writer",
                text: "You don't need an account.",
            },
            {
                title: "Fill in the invoice",
                text: "Add your customer's first name, your name, the invoice number, the amount and the date it was due. Add your payment link if you have one.",
            },
            {
                title: "Pick the tone and how you'll send it",
                text: "Choose a Tone, then choose how you'll send it under Send by. The message changes as you choose.",
            },
            {
                title: "Copy it and send it",
                text: "Choose Copy, then paste the message into your own email or WhatsApp.",
            },
        ],
        next: {
            label: "Open the reminder writer",
            href: "/tools/payment-reminder",
        },
        related: [
            "share-an-invoice",
            "make-an-invoice-pdf",
            "record-a-payment",
        ],
    },
    {
        slug: "add-your-tax-line",
        task: "Add your tax line to an invoice you write",
        group: "Invoices and payments",
        minutes: 2,
        line: "One tax line you name, with your tax number.",
        intro: "On an invoice you write, you can add one tax line, like VAT 20%. You choose the name and the rate. Saroh doesn't work out tax for you.",
        steps: [
            app("Write a new invoice", "Add your customer and each line."),
            app(
                "Add your tax line",
                "Give it a name and a rate. It's added on top of the total.",
            ),
            app(
                "Check your tax number",
                "Your tax number is kept on the invoice with the tax line.",
            ),
        ],
        note: "Invoices made from an order, a booking or a course have no tax line or tax number.",
        next: doInSaroh("/invoices"),
        related: [
            "record-a-payment",
            "share-an-invoice",
            "make-an-invoice-pdf",
        ],
    },
    {
        slug: "share-an-invoice",
        task: "Share an invoice by link or WhatsApp",
        group: "Invoices and payments",
        minutes: 1,
        line: "WhatsApp opens with the words typed. You press send.",
        intro: "Share an invoice from Saroh yourself. Your customer gets it from you, in your own WhatsApp or wherever you paste the link.",
        steps: [
            app("Open the invoice", "Find it in your invoices."),
            app(
                "Choose how to share it",
                "Copy its link, or choose WhatsApp. WhatsApp opens with the words typed.",
            ),
            app("Send it", "Read it, then press send."),
        ],
        next: doInSaroh("/invoices"),
        related: [
            "record-a-payment",
            "add-your-tax-line",
            "write-a-payment-reminder",
        ],
    },
    {
        slug: "record-a-payment",
        task: "Record a payment",
        group: "Invoices and payments",
        minutes: 1,
        line: "Mark the invoice as paid. It becomes a receipt.",
        intro: "Your customers pay you directly, so we never see the money. You record that it happened, and the invoice becomes a receipt.",
        steps: [
            app("Open the invoice", "Find it in your invoices."),
            app(
                "Record the payment",
                "Add the amount and the date you were paid.",
            ),
            app(
                "Check the receipt",
                "Once it's paid, the invoice reads as a receipt. Share it the same way.",
            ),
        ],
        next: doInSaroh("/invoices"),
        related: [
            "share-an-invoice",
            "add-your-tax-line",
            "make-an-invoice-pdf",
        ],
    },
];

export const helpArticle = (slug: string) => HELP.find((a) => a.slug === slug);

export const HELP_FAQS = [
    {
        question: "How do my customers pay me?",
        answer: "You take the money yourself, in cash, by card machine or by bank transfer, and record it in Saroh. Paying online isn't available yet.",
    },
    {
        question: "Do the free tools need an account?",
        answer: "No. They run in your browser, and what you type stays in that browser.",
    },
] as const;
