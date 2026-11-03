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

export const HELP_GROUPS = [
    "Free tools",
    "Quotes and client pages",
    "Getting paid",
    "Your plan",
] as const;

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
                text: "Fill in From with your business details, then Bill to with your client's name and email.",
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
            "move-a-draft-into-saroh",
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
                text: "Add your client's first name, your name, the invoice number, the amount and the date it was due. Add your payment link if you have one.",
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
            "send-a-payment-reminder",
            "make-an-invoice-pdf",
            "record-a-payment",
        ],
    },
    {
        slug: "move-a-draft-into-saroh",
        task: "Move a free tool draft into Saroh",
        group: "Free tools",
        minutes: 2,
        line: "Keep what you typed when you sign up.",
        intro: "When you sign up from a free tool, your draft and your details come with you. Nothing is typed twice.",
        steps: [
            {
                title: "Finish your draft in the free tool",
                text: "Make your invoice or quote, then choose Download PDF.",
            },
            {
                title: "Choose to carry on in Saroh",
                text: "After the download, choose Save, send and get paid. On the quote maker it says Send it from Saroh.",
            },
            app("Sign up", "Create your account. The free plan needs no card."),
            app(
                "Check your draft and add your logo",
                "Your draft opens in the app. A logo is too long to travel in a link, so add it again.",
            ),
        ],
        next: doInSaroh("/import"),
        related: ["make-an-invoice-pdf", "send-a-quote", "share-a-client-page"],
    },
    {
        slug: "send-a-quote",
        task: "Send a quote",
        group: "Quotes and client pages",
        minutes: 5,
        line: "Pick your services, set a deposit, send the link.",
        intro: "Your client gets a link to the quote and accepts it online. You see when they did.",
        steps: [
            app("Start a new quote", "Choose your client, or add a new one."),
            app(
                "Add the work",
                "Pick from your saved services, or add a line for this job.",
            ),
            app("Set a deposit", "Add a deposit if you want one up front."),
            app(
                "Send the link",
                "Send your client the link to the quote. They don't need a login.",
            ),
            app(
                "See the yes",
                "Your client taps Accept on their client page. You get told, and the time is kept with the quote.",
            ),
        ],
        next: doInSaroh("/quotes/new"),
        related: [
            "turn-a-quote-into-an-invoice",
            "share-a-client-page",
            "add-your-stripe-payment-link",
        ],
    },
    {
        slug: "turn-a-quote-into-an-invoice",
        task: "Turn an accepted quote into an invoice",
        group: "Quotes and client pages",
        minutes: 1,
        line: "One tap. Nothing typed twice.",
        intro: "An accepted quote becomes an invoice in one tap, with the same client and the same lines.",
        steps: [
            app("Open the accepted quote", "Find it in your quotes."),
            app(
                "Make the invoice",
                "Choose to turn it into an invoice. The lines come across.",
            ),
            app(
                "Check it and send it",
                "Check the amounts and the due date, then send the link.",
            ),
        ],
        next: doInSaroh("/quotes"),
        related: [
            "send-a-quote",
            "record-a-payment",
            "add-your-stripe-payment-link",
        ],
    },
    {
        slug: "share-a-client-page",
        task: "Share a client page",
        group: "Quotes and client pages",
        minutes: 2,
        line: "One link, with everything for that client.",
        intro: "Every client gets one page with their quotes, invoices, payments and notes. It's one link, and they don't need a login.",
        steps: [
            app(
                "Add your logo and payment link",
                "These two things make the page work: your logo so it looks like you, and your payment link so there's a Pay button.",
            ),
            app("Open your client", "Find them in your client list."),
            app(
                "Copy the link",
                "Copy the link to their client page, then send it to them.",
            ),
        ],
        next: doInSaroh("/clients"),
        related: [
            "add-your-stripe-payment-link",
            "send-a-quote",
            "send-a-payment-reminder",
        ],
    },
    {
        slug: "add-your-stripe-payment-link",
        task: "Add your Stripe payment link",
        group: "Getting paid",
        minutes: 3,
        line: "Put a Pay button on your client pages.",
        intro: "Your client pays you through your own Stripe account. The money goes to you, and we take 0% of it.",
        steps: [
            {
                title: "Copy a payment link from Stripe",
                text: "In your Stripe account, make a payment link and copy it.",
            },
            app(
                "Paste it into Saroh",
                "Open your payment settings in Saroh and paste the link.",
            ),
            app(
                "Check the Pay button",
                "Open one of your client pages and check that the Pay button goes to your Stripe page.",
            ),
        ],
        note: "Stripe's own fees still apply. PayPal links and bank details work the same way.",
        next: doInSaroh("/settings/payments"),
        related: [
            "record-a-payment",
            "share-a-client-page",
            "send-a-payment-reminder",
        ],
    },
    {
        slug: "record-a-payment",
        task: "Record a payment",
        group: "Getting paid",
        minutes: 1,
        line: "Mark the invoice as paid. The receipt is made.",
        intro: "Clients pay you directly, so we never see the money. You record that it happened, and the receipt is made for you.",
        steps: [
            app("Open the invoice", "Find it in your invoices."),
            app(
                "Record the payment",
                "Add the amount and the date you were paid.",
            ),
            app(
                "Check the receipt",
                "The receipt is made from the invoice. Your client can see it on their client page.",
            ),
        ],
        next: doInSaroh("/invoices"),
        related: [
            "add-your-stripe-payment-link",
            "send-a-payment-reminder",
            "turn-a-quote-into-an-invoice",
        ],
    },
    {
        slug: "send-a-payment-reminder",
        task: "Send a payment reminder from Saroh",
        group: "Getting paid",
        minutes: 1,
        line: "See who's late. One tap writes the message.",
        intro: "Saroh tells you who's late and writes the message. It goes out from your own email or WhatsApp, so your client sees your name.",
        steps: [
            app("See who's late", "Open your overdue invoices."),
            app("Choose Remind", "Choose Remind beside the invoice."),
            app(
                "Send it from your own app",
                "Your email or WhatsApp opens with the message filled in. Read it, then send it.",
            ),
        ],
        next: doInSaroh("/invoices"),
        related: [
            "write-a-payment-reminder",
            "record-a-payment",
            "share-a-client-page",
        ],
    },
    {
        slug: "cancel-your-plan",
        task: "Cancel your plan",
        group: "Your plan",
        minutes: 1,
        line: "In Settings. No calls, no forms.",
        intro: "Plans are prepaid. Cancel in Settings whenever you like, and you keep access until the end of what you paid for.",
        steps: [
            app("Open Settings", "Go to billing in your settings."),
            app(
                "Cancel your plan",
                "Choose to cancel and confirm it. It takes two taps.",
            ),
            app(
                "Keep working until the period ends",
                "You keep access until the end of what you paid for. We don't charge you again.",
            ),
        ],
        next: doInSaroh("/settings/billing"),
        related: ["record-a-payment", "share-a-client-page", "send-a-quote"],
    },
];

export const helpArticle = (slug: string) => HELP.find((a) => a.slug === slug);

export const HELP_FAQS = [
    {
        question: "Do you take a cut when my client pays?",
        answer: "No. Payments go straight to your own Stripe, PayPal or bank. We only record that it happened. Your payment provider's own fees still apply.",
    },
    {
        question: "Do the free tools need an account?",
        answer: "No. They run in your browser, and what you type stays in that browser unless you choose to carry it into Saroh.",
    },
    {
        question: "Does my client need an account?",
        answer: "No. Your client gets one link and needs no login.",
    },
    {
        question: "Can I cancel any time?",
        answer: "Yes. Plans are prepaid. Cancel in Settings, and you keep access until the end of what you paid for.",
    },
] as const;
