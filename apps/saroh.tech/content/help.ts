import { site } from "@/site.config";

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
    "Get set up",
    "Products and stock",
    "Orders",
    "Bookings",
    "Your website",
    "Invoices and payments",
    "Free tools",
] as const;

const doInSaroh = (path: string) => ({
    label: "Do this in Saroh",
    href: `${site.appUrl}${path}`,
    inApp: true,
});

export const HELP: readonly HelpArticle[] = [
    /*
     * After apps/saroh.in/content/help, for one person outside India. Every step
     * was read against apps/app.saroh.in on 4 Nov 2026, in the code, on the batch
     * this was written on. Nothing here was run in a browser. Left out because
     * they aren't true on Global or Free: Payments, classes sold ahead, staff, GST and UPI.
     */
    // Sources: accounts signup-form.tsx; setup-kind-choice, setup-name-step,
    // setup-country-fields, setup-goal-choice; lib/organizations/setup-steps.ts.
    {
        slug: "create-your-business",
        task: "Set up your business",
        group: "Get set up",
        minutes: 3,
        line: "Your account, its name and web address, your country and currency.",
        intro: "Your account is you, and the business is what you set up inside it. It takes four short steps, and it ends in the product.",
        steps: [
            {
                title: "Make your account",
                text: "Open Sign up, enter your name and email, and choose Email me a code. There's no password. Type the code from your email.",
            },
            {
                title: "Say what you're setting up",
                text: "Choose A business, Just me or A site for my work. It changes the words Saroh uses and what it suggests first, never what you can do. You can change it later in Settings.",
            },
            {
                title: "Name it and check its web address",
                text: "Type the name people see on your site and invoices. The web address on saroh.app follows the name until you edit it. Changing it later breaks saved links, so get it right now.",
            },
            {
                title: "Say where it is, and its currency",
                text: "Under Where is your business?, choose your country. You can't change this later without asking us. Saroh suggests a currency for it, and you can pick another. It's one currency for everything your business sells.",
            },
            {
                title: "Pick what you'll do first",
                text: "Choose Sell things, Take bookings, Put up a website or Keep track of people, then choose Create the business. It opens ready to fill in, and you can add the others whenever you like.",
            },
        ],
        next: doInSaroh("/onboarding"),
        related: [
            "add-your-first-product",
            "add-a-service",
            "make-your-link-look-right-when-shared",
        ],
    },
    // Sources: catalogue-header.tsx; product-editor-v2 basics, photos, visibility,
    // stock sections; product-variants/variants-section.tsx; lib/products/mrp-label.ts.
    {
        slug: "add-your-first-product",
        task: "Add your first product",
        group: "Products and stock",
        minutes: 2,
        line: "Its name, price and photos, then its sizes and stock.",
        intro: "A product is anything you sell. You add it once, and your site, your orders and your invoices all read it from the same place.",
        steps: [
            {
                title: "Open Products",
                text: "In the sidebar, open Sell, then Products, and choose New product.",
            },
            {
                title: "Name and price",
                text: "Give it a name and a price. Add a category if you'd like it grouped on your site, and an original price to show struck through beside today's.",
            },
            {
                title: "Photos",
                text: "Under Photos and videos, add your photos. The first is the cover, on the shop and in lists.",
            },
            {
                title: "Draft or live, then create",
                text: "Under Visibility, Draft keeps it to you, and Live puts it on sale as soon as it's created. The button at the top says Create draft or Create and publish.",
            },
            {
                title: "Sizes and stock",
                text: "Once it's created, choose Add variants if it comes in more than one size. To count it, turn on Track stock and enter how many you have on hand.",
            },
        ],
        note: "Something that never runs out, like a gift box? Leave Track stock off. It keeps no count, and sells until you mark it sold out.",
        next: doInSaroh("/commerce/products/new"),
        related: [
            "add-sizes-and-options",
            "count-and-move-stock",
            "take-your-first-order",
        ],
    },
    // Sources: product-settings/options-tab.tsx, option-sheet.tsx;
    // product-variants/variants-section.tsx, variant-add-row.tsx; section-card.tsx.
    {
        slug: "add-sizes-and-options",
        task: "Add sizes and options",
        group: "Products and stock",
        minutes: 3,
        line: "Each size gets its own SKU, price and stock count.",
        intro: "When a product comes in sizes or colours, add each one as a variant of it. Each has its own SKU, its own price if it needs one, and its own stock count.",
        steps: [
            {
                title: "Set up your options",
                text: "An option is what customers choose by, like Size. In Products, open More, then Product settings, then Options. Choose New option, name it, add its values and choose Add option.",
            },
            {
                title: "Open the product",
                text: "Until it has variants, a product is sold as itself, at its own price. Under Variants, choose Add variants.",
            },
            {
                title: "Add each size to the list",
                text: "Next to Customers choose by, pick the option. Pick a value, check the SKU and type a price if this one costs something different. A blank price uses the product's own. Choose Add to list.",
            },
            {
                title: "Save variants",
                text: "The list isn't saved until you say so. Check it, then choose Save variants.",
            },
        ],
        note: "A value a product already uses can't be removed. Change that product's variants first.",
        next: doInSaroh("/commerce/products/settings"),
        related: [
            "add-your-first-product",
            "count-and-move-stock",
            "take-your-first-order",
        ],
    },
    // Sources: commerce/stock stock-screen.tsx, count-bar.tsx, move-dialog.tsx,
    // entry-sheet.tsx; lib/stock/screen.ts. The catalogue's `locations` row counts
    // only places customers visit, so a place and a No counter location can both exist.
    {
        slug: "count-and-move-stock",
        task: "Count and move stock",
        group: "Products and stock",
        minutes: 3,
        line: "Count the shelf, and see every change in the log.",
        intro: "Saroh keeps a count of each product, and of each size. Count the shelf to put it right, and record what comes in or gets thrown away.",
        steps: [
            {
                title: "Open Stock",
                text: "In the sidebar, open Sell, then Stock. Levels shows how many of each product you can sell, how many are on hand and how many are promised to orders. A product only shows here once Track stock is on.",
            },
            {
                title: "Count what's on the shelf",
                text: "Choose Count stock. Each shelf turns into a box, with what the log expects under it. Type what you count, and leave a box empty to skip it. Choose Save count.",
            },
            {
                title: "Record what came in or went",
                text: "Choose Record stock for stock you received or made, or threw away.",
            },
            {
                title: "Move stock, if you keep some apart",
                text: "With your place and a location for online orders only, Move stock moves it between them. Only stock that isn't promised to an order can move.",
            },
            {
                title: "See every change in the Log",
                text: "Open the Log tab to see each change and the count before and after. Entries can't be deleted, so a mistake is fixed with a new entry.",
            },
        ],
        next: doInSaroh("/commerce/stock"),
        related: [
            "add-your-first-product",
            "add-sizes-and-options",
            "take-your-first-order",
        ],
    },
    // Sources: commerce/new-order new-order-sheet, customer-picker, leaves-step,
    // pay-step; lib/orders/new-order.ts, lifecycle.ts; order-payment/record-paid-dialog.
    {
        slug: "take-your-first-order",
        task: "Take your first order",
        group: "Orders",
        minutes: 2,
        line: "Who it's for, what they're buying, then follow it to done.",
        intro: "An order at the counter or on the phone goes into one list with your others, so your orders, stock and invoices stay in step.",
        steps: [
            {
                title: "Open Orders",
                text: "In the sidebar, open Sell, then Orders, and choose New order.",
            },
            {
                title: "Customer and items",
                text: "Search by name or phone. For someone you don't know, choose Walk-in and type their name, with a phone if they give one, and they're kept as a customer. Then type to find a product.",
            },
            {
                title: "How it leaves and how it's paid",
                text: "Under How it leaves, choose from the ways your location offers. For money taken now, choose Cash or Card. For a pick-up they'll pay for later, choose Pay on collection. The button says what will happen. Saroh doesn't charge a card: it records what you took.",
            },
            {
                title: "Follow it to done",
                text: "A counter sale can be Handed over now. Otherwise it starts at New: open it and choose Start preparing, then Mark ready, then Mark collected.",
            },
            {
                title: "Take a payment that's still due",
                text: "An order that isn't paid says Not paid yet. When they pay, choose Paid in cash, then Record as paid. It can't be taken back.",
            },
        ],
        next: doInSaroh("/commerce/orders?new=1"),
        related: [
            "add-your-first-product",
            "record-a-payment",
            "count-and-move-stock",
        ],
    },
    // Sources: services/service-fields/questions.tsx, length-field.tsx; new-service.tsx;
    // services/list/booking-link-row.tsx; bookings/booking-words.ts (DEC-170, DEC-175).
    {
        slug: "add-a-service",
        task: "Add a service and share your booking page",
        group: "Bookings",
        minutes: 3,
        line: "What you offer, how long it takes, and the page people book on.",
        intro: "A service is what people book. Add one, and your booking page offers it at the times you're free.",
        steps: [
            {
                title: "Open Services",
                text: "In the sidebar, open Bookings, then Services, and choose New service.",
            },
            {
                title: "Answer its questions",
                text: "What is it called? Who comes: One person or A group class, with how many places? How long does it take? What's the price, in your currency? Then choose Add service.",
            },
            {
                title: "Make your booking page",
                text: "On Services, Your booking page says where it is. With no website yet, choose Make my booking page. Then publish it, and customers can open it.",
            },
            {
                title: "Share it",
                text: "Choose Copy link, and send it to whoever you like.",
            },
        ],
        note: "People pay you at the visit, and you record it. Paying online isn't available yet.",
        next: doInSaroh("/services"),
        related: [
            "set-your-hours",
            "create-your-business",
            "make-your-link-look-right-when-shared",
        ],
    },
    // Sources: bookings/availability availability-editor.tsx, whose-hours.tsx,
    // weekly-hours.tsx; bookings/time-off/add-time-off-sheet.tsx.
    {
        slug: "set-your-hours",
        task: "Set your hours and time off",
        group: "Bookings",
        minutes: 3,
        line: "People only see free times inside your hours.",
        intro: "Your booking page only offers times when you're working. Every change saves as you make it, with Undo, so there's no Save button to find.",
        steps: [
            {
                title: "Open Hours and time off",
                text: "In the sidebar, open Bookings, then Hours and time off.",
            },
            {
                title: "Set your week",
                text: "The week is a list with a row a day. Open a day to set its hours, and use the chips above it to change several days at once.",
            },
            {
                title: "Add time off",
                text: "Choose Add time off when you're away. Bookings already made stay booked, and Saroh says how many, so you can move them.",
            },
            {
                title: "Check the booking rules",
                text: "Under More, you'll find extra opening hours, what customers see, and the rules for how far ahead people can book.",
            },
        ],
        next: doInSaroh("/bookings/availability"),
        related: [
            "add-a-service",
            "create-your-business",
            "make-your-link-look-right-when-shared",
        ],
    },
    // Sources: sites/search-sharing/search-sharing-group.tsx, search-sharing-sheets.tsx;
    // sites/settings/site-settings-read.tsx, publish-bar.tsx; ui share-cards, share-facts.
    {
        slug: "make-your-link-look-right-when-shared",
        task: "Make your link look right when shared",
        group: "Your website",
        minutes: 3,
        line: "The picture, title and line people see on WhatsApp and elsewhere.",
        intro: "When someone posts a link to your site, the app they're in draws a card: a picture, a title and a line about you. You choose them in your website's settings.",
        steps: [
            {
                title: "Open Search and sharing",
                text: "In the sidebar, open Website, choose the Settings tab, then Search and sharing. When shared shows how your link looks on each app right now.",
            },
            {
                title: "Add a share image",
                text: "Choose a picture 1200 by 630 pixels, and keep it light. You're told when it's too small for Facebook and LinkedIn, or too heavy for WhatsApp.",
            },
            {
                title: "Write the title and description",
                text: "Leave the title and your site's name is used. Write a description of about 155 characters: it's what most apps show.",
            },
            {
                title: "Publish your site",
                text: "These settings are part of your draft. Choose Review and publish, and they reach your live site.",
            },
        ],
        next: doInSaroh("/sites"),
        related: ["verify-your-site", "create-your-business", "add-a-service"],
    },
    // Sources: sites/search-tracking/verification-codes.tsx; site-settings-read.tsx.
    {
        slug: "verify-your-site",
        task: "Verify your site with Google or Bing",
        group: "Your website",
        minutes: 5,
        line: "Show a search engine the site is yours, and give it your sitemap.",
        intro: "Each site has its own sitemap. Add a search engine's code, and it can see the site is yours. What you save here is live at once, with nothing to publish.",
        steps: [
            {
                title: "Open Tracking",
                text: "In the sidebar, open Website, choose the Settings tab, then Tracking. Open Verification codes.",
            },
            {
                title: "Get the code",
                text: "In Google Search Console or Bing Webmaster Tools, add your site by its live address exactly as Saroh shows it, and choose the HTML tag. Copy what it gives you.",
            },
            {
                title: "Paste it and save",
                text: "Paste the whole tag or just the code into the box for that search engine, and choose Save.",
            },
            {
                title: "Verify",
                text: "Go back to the search engine and choose Verify. Keep the code saved, as it may check again.",
            },
        ],
        next: doInSaroh("/sites"),
        related: [
            "make-your-link-look-right-when-shared",
            "create-your-business",
            "add-a-service",
        ],
    },
    // Sources: invoices/new-invoice/invoice-form.tsx, invoices/details, invoices/share,
    // record-payment-sheet.tsx; organizations/tax/business-tax-rows.tsx, global-tax-fields.tsx.
    {
        slug: "write-an-invoice",
        task: "Write an invoice",
        group: "Invoices and payments",
        minutes: 2,
        line: "A numbered invoice in your currency.",
        intro: "Write a numbered invoice in your currency, for bulk orders or anything else outside your orders.",
        steps: [
            {
                title: "Choose New invoice",
                text: "In the sidebar, open Invoices and choose New invoice.",
            },
            {
                title: "Add who it's for and each line",
                text: "Find your customer and add a line for each thing. It saves as you type, and the right shows how it will look.",
            },
            {
                title: "Issue it",
                text: "Issuing locks its lines and gives it its number. Choose Issue it when it's right.",
            },
        ],
        next: doInSaroh("/billing/invoices/new"),
        related: ["add-your-tax-line", "share-an-invoice", "record-a-payment"],
    },
    {
        slug: "add-your-tax-line",
        task: "Add your tax line to an invoice you write",
        group: "Invoices and payments",
        minutes: 2,
        line: "One tax line you name, with your tax ID.",
        intro: "You set one tax line for your business, like VAT 20%. You choose the name and the rate, and it prints on each new invoice you write. Saroh doesn't work out tax for you.",
        steps: [
            {
                title: "Open your business's settings",
                text: "Open Settings, then Business, and find the tax rows. Tax says None on your invoices until you set it.",
            },
            {
                title: "Add your tax line",
                text: "Choose Change beside Tax. Give it a name, like VAT, and a rate in percent. It's added on top of the total.",
            },
            {
                title: "Add your tax ID",
                text: "Choose Add tax ID. It prints on each new invoice with your tax line.",
            },
            {
                title: "Write the invoice",
                text: "Choose New invoice and add your lines. The tax line shows under them, and stays on the invoice once it's issued.",
            },
        ],
        note: "Invoices made from an order, a booking or a course have no tax line or tax number.",
        next: doInSaroh("/settings/organization?section=tax"),
        related: ["write-an-invoice", "record-a-payment", "share-an-invoice"],
    },
    {
        slug: "share-an-invoice",
        task: "Share an invoice by link or WhatsApp",
        group: "Invoices and payments",
        minutes: 1,
        line: "WhatsApp opens with the words typed. You press send.",
        intro: "Share an invoice from Saroh yourself. Your customer gets it from you, in your own WhatsApp or wherever you paste the link.",
        steps: [
            {
                title: "Open the invoice",
                text: "Find it in Invoices, and choose Share.",
            },
            {
                title: "Choose how to share it",
                text: "Choose WhatsApp, which opens with the words typed, or Link, then Copy link. PDF downloads a copy.",
            },
            {
                title: "Send it",
                text: "Read it, then press send.",
            },
        ],
        next: doInSaroh("/billing/invoices"),
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
            {
                title: "Open the invoice",
                text: "Find it in Invoices, and choose Record payment.",
            },
            {
                title: "Record the payment",
                text: "Add the amount received, how they paid and the day it came in, then record it.",
            },
            {
                title: "Check the receipt",
                text: "Once it's paid in full, the invoice reads as a receipt. Share it the same way.",
            },
        ],
        next: doInSaroh("/billing/invoices"),
        related: [
            "share-an-invoice",
            "add-your-tax-line",
            "make-an-invoice-pdf",
        ],
    },
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
