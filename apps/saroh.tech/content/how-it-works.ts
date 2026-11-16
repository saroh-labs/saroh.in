/**
 * /features, "How it works" (DEC-221; saroh.in's boards HWDesk and HWPhone2,
 * in Global's words): the ownership chapters, how money moves, "everything
 * stays yours" and the full feature index, grouped as Your records,
 * Reaching customers, and Asking and connecting. The same shape as
 * apps/saroh.in/content/how-it-works.ts (`HowItWorksWords`).
 *
 * Words only: every name, number, time and address in a drawing comes from
 * `content/world.ts` (Thistlewick Bakery's Tuesday). `**bold**` marks the
 * board's bold words. A line with a gate shows only while its claim switch
 * or its feature's release switch is on.
 *
 * Global's truths (`content/features.ts` states, the private ledger,
 * `scripts/check-claims.mjs`): one person runs the business, so nothing
 * says team, staff or roles; customers pay at the counter or by card
 * through the business's own Stripe, named only on /features pages; the
 * site lives on a saroh.app address; invoices made from an order carry no
 * tax line; Subscriptions comes with a paid plan; a domain you own follows
 * the paid-plans switch (`plan-words.ts`); no plan is named.
 */
import type { HowItWorksWords } from "@saroh/marketing/how-it-works/words";

import { planWords } from "./plan-words";

/** The day these words last changed. */
export const UPDATED = "2026-11-15";

/** The page's words, its domain lines in the wording `on` asks for. */
export const howItWorksWords = (on: boolean): HowItWorksWords => ({
    href: "/features",
    seoTitle: "Features: how Saroh works",
    seoDescription:
        "How Saroh keeps your records, reaches your customers and answers your questions, and how the money moves to your own account.",
    title: {
        before: "How it works, and why it all stays ",
        mark: "yours",
        after: ".",
    },
    lede: "Your records, the things that reach your customers, and the ways you ask and connect. Each is shown in the screens you'd use, with {business} in Madison as the example.",
    examplesLegend: "Examples from a",
    trades: {
        bakery: "Bakery",
        salon: "Salon",
        gym: "Gym",
        florist: "Florist",
    },
    contentsLabel: "On this page",
    chaptersLabel: "Chapters",
    yoursLink: "Everything stays yours",
    readMore: "Read more",
    andMore: (first, n) => `${first} and ${n} more`,
    newTag: "New",
    of: "of",

    hero: {
        live: "Live",
        paid: "Paid",
        nav: ["Order", "Visit"],
        paidInto: "Paid into",
        sarohHolds: "Saroh holds",
        nothing: "Nothing",
        account: (business, provider) => `${business}'s ${provider}`,
        siteLine: {
            thistlewick: "Bread and pastry, baked before you wake.",
            larkspur: "Cut, colour and blow-dry, by appointment.",
            ironvale: "Small classes. Real coaching.",
            bramble: "Flowers for every day, and the big ones.",
        },
        label: (business) => `${business}'s site and a paid order, an example`,
    },

    groups: {
        records: {
            name: "Your records",
            line: "What you keep: orders, products, customers, bookings, invoices and stock. One calm list each.",
            indexLine: "What you keep, one calm list each",
        },
        reach: {
            name: "Reaching customers",
            line: "What goes out to them: your website, your posts, and how they pay you.",
            indexLine: "What goes out to them",
        },
        ask: {
            name: "Asking and connecting",
            line: "How you talk to your business: Ask AI inside Saroh, and your own assistant.",
            indexLine: "How you talk to your business",
        },
    },

    chapters: [
        {
            id: "shop",
            group: "records",
            title: "Your shop and bookings.",
            name: "Your shop and bookings",
            line: "Orders, bookings, customers, stock",
            chip: "Shop and bookings",
            lead: {
                text: "Add what you sell **once**. Your orders, invoices and posts use it, stock follows every order, and each customer's bookings and invoices sit on their own page. Customers book a free time on your site. Every morning, Home shows what needs you.",
            },
            captions: [
                {
                    title: "Add it once.",
                    body: {
                        text: "Prices, sizes, photos and stock, shared by your orders, invoices and posts.",
                    },
                },
                {
                    title: "Customers book themselves.",
                    body: {
                        text: "Appointments and classes with places, at the times you're free.",
                    },
                },
                {
                    title: "Open up and see what needs you.",
                    body: {
                        text: "Most urgent first, and most of it done from the list.",
                    },
                },
            ],
            more: [
                { label: "Orders", href: "/features/orders" },
                { label: "Products", href: "/features/products" },
                { label: "Bookings", href: "/features/bookings" },
                { label: "Customers", href: "/features/customers" },
                { label: "Stock", href: "/features/products" },
                { label: "Subscriptions", href: "/features/subscriptions" },
                { label: "Dashboard", href: "/features/dashboard" },
            ],
        },
        {
            id: "site",
            group: "reach",
            title: "Your site.",
            name: "Your site",
            line: "A website in your look, live today",
            chip: "Your site",
            lead: {
                text: `A website builder that starts from **a template made for your trade**, in your colours, live at a saroh.app address from the first day, and at a domain you own ${planWords(on).domainWhen}. Your booking page is already in it, and prices and hours come from where you keep them.`,
            },
            captions: [
                {
                    title: "Pick your trade's template.",
                    body: {
                        text: "See it with your own name and details before you choose.",
                    },
                },
                {
                    title: "Go live at your saroh.app address.",
                    body: {
                        text: "Live at yourname.saroh.app from the first day. A domain you own comes with paid plans.",
                    },
                },
                {
                    title: "Change it, then publish.",
                    body: {
                        text: "Edits stay a draft until you press Publish, and every version is kept.",
                    },
                },
            ],
            more: [{ label: "Website builder", href: "/features/website" }],
        },
        {
            id: "posts",
            group: "reach",
            release: "social",
            title: "Your posts.",
            name: "Your posts",
            line: "Posts made from what you sell",
            chip: "Your posts",
            lead: {
                text: "Press Share on anything with a page and it becomes a post **in your own colours, fonts and logo**. Photo, Price tag, Offer or Simple. Post it yourself on Instagram, WhatsApp or Facebook.",
                tails: [
                    {
                        claim: "social-posting",
                        text: " Or let Saroh Social, an add-on, post and schedule it for you.",
                    },
                ],
            },
            captions: [
                {
                    title: "Press Share on what you sell.",
                    body: {
                        text: "Products, services and classes, offers, blog posts and your booking page each get a Share button.",
                    },
                },
                {
                    title: "Pick a card and a size.",
                    body: {
                        text: "Check the caption. The link on it brings people back to the item's page.",
                    },
                },
                {
                    title: "Post it, or have it posted.",
                    body: {
                        text: "From your own accounts, with nothing to connect. Saroh Social schedules posts for you if you'd rather not.",
                    },
                    off: {
                        gate: { claim: "social-posting" },
                        title: "Post it from your own accounts.",
                        body: "From your own Instagram, WhatsApp or Facebook, with nothing to connect.",
                    },
                },
            ],
            more: [
                { label: "Share and posts", href: "/features/social" },
                {
                    label: "Saroh Social",
                    href: "/features/social",
                    claim: "social-posting",
                },
            ],
        },
        {
            id: "money",
            group: "reach",
            title: "Your money.",
            name: "Your money",
            line: "How it moves, into your own account",
            chip: "Your money",
            lead: {
                text: "Customers pay you at the counter, or by card online into **your own Stripe account**, under your name. Saroh never holds your money, so there's no waiting on us for a payout. Saroh records each payment, so you see what's still owed.",
            },
            captions: [
                {
                    title: "Connect your own account.",
                    body: {
                        text: "Connect your Stripe account once. Stripe's own fees and payout schedule apply.",
                    },
                },
                {
                    title: "Your customer pays you.",
                    body: {
                        text: "By card online, or at the counter, where you record it on the order.",
                    },
                },
                {
                    title: "Saroh hears it's paid.",
                    body: {
                        text: "It marks the order paid and tells you. The money never passes through us.",
                    },
                },
            ],
            more: [
                { label: "Payments", href: "/integrations" },
                { label: "Billing and invoices", href: "/features/billing" },
            ],
        },
        {
            id: "ai",
            group: "ask",
            title: "Your AI and agents.",
            name: "Your AI and agents",
            line: "Ask AI, and your own assistant",
            chip: "AI and agents",
            lead: {
                text: "Ask about your business, and **Ask AI** answers from your own records, with the rows behind it. Or connect **Claude or ChatGPT** and run your business from the assistant you already use. Nothing changes until you confirm.",
            },
            captions: [
                {
                    title: "Ask from any screen.",
                    body: {
                        text: "Ask AI knows which screen you're on. Type, or tap a ready question.",
                    },
                },
                {
                    title: "Get the answer, and the rows behind it.",
                    body: {
                        text: "Ask it to add or change something and it fills a card you confirm.",
                    },
                },
                {
                    title: "Or use your own assistant.",
                    body: {
                        text: "Connect Claude, ChatGPT or another AI app. It works as you, and can do only what you can do in Saroh.",
                    },
                },
            ],
            more: [
                { label: "Ask AI", href: "/features/ask-ai" },
                { label: "AI apps", href: "/features/ai-apps" },
            ],
        },
        {
            id: "data",
            group: "ask",
            title: "Your data and API.",
            name: "Your data and API",
            line: "Insights and your records",
            chip: "Data and API",
            lead: {
                text: "See how you're doing in plain figures, and download your records whenever you want.",
                tails: [
                    {
                        release: "developers",
                        text: " Make **API keys and webhooks** for your own workflows. A key can never do more than you can. API keys come with paid plans.",
                    },
                ],
            },
            captions: [
                {
                    title: "Know how you're doing.",
                    body: {
                        text: "Site visits, enquiries, orders and bookings, for the last 7 days, 4 weeks or 3 months.",
                    },
                },
                {
                    title: "Make a key for a workflow.",
                    body: {
                        text: "Give it only the parts it needs: products, bookings, orders or customers.",
                    },
                },
                {
                    title: "Hear the moment it happens.",
                    body: {
                        text: "Signed webhooks tell your server when an order is paid or a booking is made.",
                    },
                },
            ],
            more: [
                { label: "Insights", href: "/features/insights" },
                { label: "API and webhooks", href: "/developers" },
            ],
            aside: { label: "For developers", href: "/developers" },
        },
    ],

    panels: {
        product: {
            title: "New product",
            meta: "Draft",
            name: "Name",
            price: "Price",
            stock: "In stock",
            shows: () =>
                "Ready for **orders, invoices and posts** when you save.",
            save: "Save",
        },
        booking: {
            meta: "Classes",
            places: (booked, of) =>
                `${booked} of ${of} places booked · ${of - booked} left`,
            pay: (price) => `Book a place · ${price} at the class`,
        },
        home: {
            title: "Home",
            toBake: (n) => `${n} cakes to make today`,
            unpaid: (name) => `${name} hasn't paid`,
            sendLink: "Open",
            low: (item) => `${item} running low`,
            left: (left, of, note) => `${left} left of ${of} ${note}`,
        },
        template: {
            title: "Pick a template",
            meta: (trade) => `For ${trade}`,
            plural: {
                bakery: "bakeries",
                salon: "salons",
                gym: "gyms",
                florist: "florists",
            },
            caption: "Yours, in your colours",
        },
        address: {
            title: "Your web address",
            live: "Live",
            then: "Then, with paid plans",
            connected: "Coming",
            comes: "Your booking page comes with it: **/book**.",
            // An example domain, never a real one: Thistlewick has none yet.
            example: "thistlewick.example",
        },
        draft: {
            changes: "**2 changes in draft.** Holiday menu, hours for Sunday.",
            publish: "Publish",
            versions: "Every version is kept. Go back to any of them.",
        },
        share: {
            title: "Products",
            meta: "Live on your site",
            button: "Share",
        },
        cards: {
            title: "Pick a card",
            meta: "Post · Square · Story",
            kinds: ["Photo", "Price tag", "Offer", "Simple"],
            offer: "20% off",
            note: "Drawn in the business's own fonts and colours. No offer running? No Offer card.",
        },
        shareTo: {
            title: "Share to",
            apps: ["WhatsApp", "Instagram", "Facebook"],
            social: "Or let Saroh Social post it",
            addOn: "(add-on)",
            slots: [
                { day: "Sat", at: "09:00", where: "Instagram · Price tag" },
                { day: "Sun", at: "08:00", where: "Facebook · Photo" },
            ],
        },
        payments: {
            title: "Settings · Payments",
            own: (business) => `${business}'s own account`,
            connected: "Connected",
            connect: "Connect",
            // Stripe is the one provider a Global business connects.
            others: [],
        },
        paying: {
            label: "Paying",
            paidBy: (method) => `Paid by ${method}`,
        },
        paidOrder: {
            paid: "Paid",
            paidInto: "Paid into",
            payoutTo: "Payout to",
            herBank: "Her bank",
            invoice: "Invoice",
            // An invoice made from an order has no tax line on Global.
            invoiceLine: (invoice) => invoice,
            sarohHolds: "Saroh holds",
            nothing: "Nothing",
        },
        askList: {
            title: "Orders",
            button: "Ask AI",
            about: "Asking about: Orders, this week",
            questions: [
                { q: "What sold most this week?", from: "from paid orders" },
                {
                    q: "Who hasn't come back this month?",
                    from: "from customers",
                },
                { q: "Add the holiday menu", from: "you confirm it" },
            ],
        },
        answer: {
            question: {
                hinglish: "What sold most this week?",
                english: "What sold most this week?",
            },
            reply: {
                hinglish: (item, n) => `${item}s are ahead, ${n} sold.`,
                english: (item, n) => `${item}s are ahead, ${n} sold.`,
            },
            head: ["Product", "Sold", "Takings"],
            readFrom: "Read from",
            sources: ["Orders", "Products"],
        },
        assistant: {
            title: "Claude",
            on: "On",
            ask: "Add the holiday menu:",
            meta: (business) => `Saroh · ${business}`,
            reply: "Done. Both are drafts in Products. The change to your website waits for you to publish it.",
            added: (n, owner) => `${n} drafts added, as ${owner}`,
            undo: "Undo",
        },
        insights: {
            title: "Insights",
            meta: "Last 6 weeks",
            question: "Am I making more money?",
            week: (takings, change) => `${takings} this week, ${change}`,
            weeks: ["13 Oct", "20", "27", "3 Nov", "10", "17"],
        },
        key: {
            title: "Settings · API keys",
            button: "New key",
            name: "Stock sheet",
            token: "sk_live_····4c1e",
            scopes: ["Products: read", "Orders: read", "Stock: write"],
            made: (owner) =>
                `Made by ${owner}. Turn it off any time; every call is logged.`,
        },
        webhook: {
            title: "Webhook · sheets.example.com",
            events: [
                {
                    name: "order.paid",
                    line: "An order is paid",
                    took: "200 · 0.4 s",
                },
                {
                    name: "booking.created",
                    line: "A booking is made",
                    took: "200 · 0.3 s",
                },
            ],
            signed: "Signed, so your server knows it came from Saroh",
        },
    },

    money: {
        label: "How the money moves, an example",
        /** On a phone, the money's path is cut; this opens it. */
        more: "See where the money goes",
        /** When the example's customer pays (world: ORD-044, 1:06 pm). */
        at: "13:06",
        pays: (name, amount) => `${name} pays ${amount}`,
        by: (method, order) => `By ${method}, online, for ${order}`,
        yourAccount: "Your account",
        inName: (owner, provider) =>
            `In ${owner}'s name. ${provider}'s own fees apply.`,
        yourBank: "Your bank",
        bank: (owner) => `${owner}'s bank`,
        schedule: (provider) => `On ${provider}'s payout schedule`,
        saroh: "Saroh",
        hears: (order, invoice, _tax, owner) =>
            `Hears it's paid. Marks **${order}** and **${invoice}** paid, and tells ${owner}.`,
        holds: "Holds",
        zero: "nothing",
    },

    yours: {
        id: "yours",
        title: "Everything stays yours.",
        lead: (n) =>
            `${n} things a small business worries about handing over, and where each one actually sits.`,
        foldMore: (n) => `${n} more things that stay yours`,
        rows: [
            {
                name: "Your money",
                body: {
                    text: "Paid into your own Stripe account, in your name, or into your hand at the counter. Saroh never holds it.",
                },
                chip: "Saroh holds nothing",
            },
            {
                name: "Your address",
                body: {
                    text: `Live at yourname.saroh.app from the first day, and at a domain you own ${planWords(on).domainWhen}.`,
                },
                chip: "{site}",
            },
            {
                name: "Your customers",
                body: {
                    text: "They book your own page, under your name. No marketplace sits between you and them.",
                },
                chip: "{site}/book",
            },
            {
                name: "Your records",
                body: {
                    text: "Products, customers and invoices are yours to export whenever you want, one CSV per table.",
                    tails: [
                        {
                            release: "developers",
                            text: " Or read them from your own server with an API key. API keys come with paid plans.",
                        },
                    ],
                },
                chip: "Export · CSV",
            },
            {
                name: "Your accounts",
                release: "social",
                body: {
                    text: "Posts go out from your own Instagram, WhatsApp and Facebook. Saroh never posts as you.",
                    tails: [
                        {
                            claim: "social-posting",
                            text: " Unless you add Saroh Social, which posts for you.",
                        },
                    ],
                },
                chip: "Your own accounts",
            },
            {
                name: "Your conversations",
                release: "ask-ai",
                body: {
                    text: "Only you see your Ask AI history, and it's deleted after 90 days.",
                    tails: [
                        {
                            release: "ai-apps",
                            text: " An assistant you connect works as you, and can do only what you can do in Saroh.",
                        },
                    ],
                },
                chip: "Deleted after 90 days",
            },
        ],
    },

    day: {
        lead: "Want to see all of this happen in order?",
        link: (business) => `Follow one Tuesday at ${business}`,
    },

    index: {
        id: "every-feature",
        title: "Every feature, in one list.",
        lead: "Each one has its own page, with how it works and what it does for a business like yours.",
        groups: {
            records: [
                {
                    feature: "dashboard",
                    name: "Dashboard",
                    line: "What needs you today",
                },
                {
                    feature: "orders",
                    name: "Orders",
                    line: "Every order in one list, late ones flagged",
                },
                {
                    feature: "products",
                    name: "Products",
                    line: "Prices, sizes, photos and stock, shared everywhere",
                },
                {
                    feature: "customers",
                    name: "Customers",
                    line: "Notes, bookings and invoices on each customer's page",
                },
                {
                    feature: "bookings",
                    name: "Bookings",
                    line: "Classes, sessions and appointments",
                },
                {
                    feature: "subscriptions",
                    name: "Subscriptions",
                    line: "Regulars on a plan",
                },
                {
                    feature: "billing",
                    name: "Billing",
                    line: "Invoices in your currency, numbered for you",
                },
                {
                    href: "/features/products",
                    name: "Stock",
                    line: "Counts that follow every order",
                },
            ],
            reach: [
                {
                    feature: "website",
                    name: "Website",
                    line: "A site that keeps up with your business",
                },
                {
                    feature: "social",
                    name: "Share and posts",
                    line: "Cards and posts made from what you sell",
                },
                {
                    href: "/integrations",
                    name: "Payments",
                    line: "Card payments through your own Stripe",
                },
                {
                    feature: "social",
                    claim: "social-posting",
                    name: "Saroh Social",
                    line: "An add-on that posts and schedules for you",
                },
            ],
            ask: [
                {
                    feature: "ask-ai",
                    name: "Ask AI",
                    line: "Ask about your business, inside Saroh",
                },
                {
                    feature: "ai-apps",
                    name: "AI apps",
                    line: "Use Saroh from your own assistant",
                },
                {
                    feature: "insights",
                    name: "Insights",
                    line: "Site visits, enquiries, orders and bookings",
                },
                {
                    href: "/developers",
                    name: "API and webhooks",
                    line: "Your records, from your own server",
                },
                {
                    href: "/integrations",
                    name: "Integrations",
                    line: "What Saroh connects to today",
                },
            ],
        },
    },

    close: {
        title: "Build it once. Keep all of it.",
        pricing: "See pricing",
        note: "Free to start. No card needed.",
    },
});
