/**
 * /features, "How it works" (DEC-221, story ownership; boards HWDesk and
 * HWPhone2): the ownership chapters, how money moves, "everything stays
 * yours" and the full feature index, grouped as Your records, Reaching
 * customers, and Asking and connecting.
 *
 * Words only: every name, number, time and address in a drawing comes from
 * `content/world.ts`. `**bold**` marks the board's bold words. A line or row
 * with a `gate` shows only while its claim switch (`claimOn`) or its
 * feature's release switch is on, so a switched-off feature is never
 * claimed or linked (MARKETING_CLAIMS.md, DEC-221).
 *
 * Changes from the board, each for the claims ledger:
 * - "takes nothing from it" and "The domain stays registered to you" are
 *   held back (HWNotes: still open);
 * - "Change it later without losing anything" is held back (the website
 *   templates test bans lossless switching);
 * - the Stripe chip and the Staff index row are not drawn: neither has a
 *   page to link to yet;
 * - Hinglish and Hindi questions, "On Grow and Pro" and Saroh Social posting
 *   for you sit behind their claim switches.
 */
import type {
    ClaimSwitch,
    ReleaseSwitch,
} from "@saroh/marketing/feature-switches";

import type { FeatureSlug } from "./types";

/** The day these words last changed (`pnpm check:content-dates`). */
export const UPDATED = "2026-11-15";

/** Shown only while its claim switch, or its feature's release switch, is on. */
export interface Gate {
    claim?: ClaimSwitch;
    release?: ReleaseSwitch;
}

/** A line that may grow a gated sentence at its end. */
export interface GatedText {
    text: string;
    tails?: readonly ({ text: string } & Gate)[];
}

export interface Caption {
    title: string;
    body: GatedText;
    /** The caption drawn instead while `gate` is off. */
    off?: { gate: Gate; title: string; body: string };
}

export interface ReadMore extends Gate {
    label: string;
    href: string;
}

export type GroupId = "records" | "reach" | "ask";
export type ChapterId = "shop" | "site" | "posts" | "money" | "ai" | "data";

export interface Chapter extends Gate {
    id: ChapterId;
    group: GroupId;
    /** The h2, with its full stop. */
    title: string;
    /** The contents list's name for it, and its line. */
    name: string;
    line: string;
    /** The phone chip's name. */
    chip: string;
    lead: GatedText;
    captions: readonly [Caption, Caption, Caption];
    more: readonly ReadMore[];
    /** A link at the end of the Read more row ("Browse templates …"). */
    aside?: ReadMore;
}

export interface IndexItem extends Gate {
    name: string;
    line: string;
    /** A feature page; or `href` for a page that isn't one. */
    feature?: FeatureSlug;
    href?: string;
}

export const HOW_IT_WORKS = {
    href: "/features",
    seoTitle: "Features: how Saroh works",
    seoDescription:
        "How Saroh keeps your records, reaches your customers and answers your questions, and how the money moves to your own account.",
    /** The h1, around the one word the Saffron mark sits under. */
    title: {
        before: "How it works, and why it all stays ",
        mark: "yours",
        after: ".",
    },
    lede: "Your records, the things that reach your customers, and the ways you ask and connect. Each is shown in the screens you'd use, with {business} on {street} as the example.",
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
    /** "Orders and 6 more", the phone's folded Read more row. */
    andMore: (first: string, n: number) => `${first} and ${n} more`,
    newTag: "New",
    of: "of",

    /** The hero's drawing: the example's site, and a paid order over it. */
    hero: {
        live: "Live",
        paid: "Paid",
        nav: ["Shop", "Pre-order", "Visit"],
        paidInto: "Paid into",
        sarohHolds: "Saroh holds",
        nothing: "Nothing",
        account: (business: string, provider: string) =>
            `${business}'s ${provider}`,
        /** Each example's site headline, an example. */
        siteLine: {
            rye: "Baked on Hill Road since six this morning.",
            neel: "Cuts and colour, booked in a minute.",
            pulse: "Classes all week. Book your place.",
            petal: "Flowers for today, delivered by evening.",
        } as Readonly<Record<string, string>>,
        label: (business: string) =>
            `${business}'s site and a paid order, an example`,
    },

    groups: {
        records: {
            name: "Your records",
            line: "What you keep: orders, products, customers, bookings, invoices, stock and staff. One calm list each.",
            indexLine: "What you keep, one calm list each",
        },
        reach: {
            name: "Reaching customers",
            line: "What goes out to them: your website, your posts, and how they pay you.",
            indexLine: "What goes out to them",
        },
        ask: {
            name: "Asking and connecting",
            line: "How you talk to your business: Ask AI inside Saroh, your own assistant, and the API.",
            indexLine: "How you talk to your business",
        },
    } satisfies Record<
        GroupId,
        { name: string; line: string; indexLine: string }
    >,

    chapters: [
        {
            id: "shop",
            group: "records",
            title: "Your shop and bookings.",
            name: "Your shop and bookings",
            line: "Orders, bookings, customers, stock",
            chip: "Shop and bookings",
            lead: {
                text: "Add what you sell **once**. It's on your site straight away, customers order or book from it, stock follows every order, and each customer's orders and bills sit on their own page. Every morning, Home shows what needs you.",
            },
            captions: [
                {
                    title: "Add it once.",
                    body: {
                        text: "Prices, sizes, photos and stock, shared by your site, orders, bills and posts.",
                    },
                },
                {
                    title: "Customers order and book themselves.",
                    body: {
                        text: "Pick-ups, appointments, classes with places, and plans that renew on their own.",
                    },
                },
                {
                    title: "Open up and see what needs you.",
                    body: {
                        text: "Most urgent first, for each person, and most of it done from the list.",
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
                text: "A website builder that starts from **a template made for your trade**, in your colours, live at a saroh.app address from the first day or at a domain you own. Your shop and booking page are already in it, and prices and hours come from where you keep them.",
            },
            captions: [
                {
                    title: "Pick your trade's template.",
                    body: {
                        text: "See it with your own name, menu and photos before you choose.",
                    },
                },
                {
                    title: "Go live at your own address.",
                    body: {
                        text: "Start on yourname.saroh.app today. Bring a domain you own whenever you like.",
                    },
                },
                {
                    title: "Change it, then publish.",
                    body: {
                        text: "Edits stay a draft until you press Publish, and new products show up on their own.",
                    },
                },
            ],
            more: [{ label: "Website builder", href: "/features/website" }],
            aside: {
                label: "Browse templates for your trade",
                href: "/templates",
                release: "templates",
            },
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
                text: "Press Share on anything you sell and it becomes a post **in your own colours, fonts and logo**. Photo, Price tag, Offer or Simple. Post it yourself on Instagram, WhatsApp or Facebook.",
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
                        text: "Products, services, classes, offers, blog posts and your booking page each get a Share button.",
                    },
                },
                {
                    title: "Pick a card and a size.",
                    body: {
                        text: "Check the caption. The link on it brings people back to the item's page to buy or book.",
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
                text: "Customers pay by UPI or card, and it lands in **your own Razorpay or Cashfree account**, or Stripe outside India, under your name. Saroh never holds your money, so there's no waiting on us for a payout. Every paid order makes its own GST invoice.",
            },
            captions: [
                {
                    title: "Connect your own account.",
                    body: {
                        text: "Paste your keys once. Razorpay's or Cashfree's own fees and payout schedule apply.",
                    },
                },
                {
                    title: "Your customer pays you.",
                    body: {
                        text: "By UPI or card, at checkout, on a booking deposit or from a pay link on a bill.",
                    },
                },
                {
                    title: "Saroh hears it's paid, and does the paperwork.",
                    body: {
                        text: "It marks the order, makes the invoice and tells you. The money never passes through us.",
                    },
                },
            ],
            more: [
                { label: "Payments", href: "/integrations" },
                {
                    label: "Billing and GST invoices",
                    href: "/features/billing",
                },
                { label: "Razorpay", href: "/integrations/razorpay" },
                { label: "Cashfree", href: "/integrations/cashfree" },
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
                text: "Ask about your business, and **Ask AI** answers from your own records, with the rows behind it. Or connect **Claude or ChatGPT** and run the shop from the assistant you already use. Nothing changes until you confirm.",
            },
            captions: [
                {
                    title: "Ask from any screen.",
                    body: {
                        text: "Ask AI knows which screen you're on. Type, or tap a ready question.",
                        tails: [
                            {
                                claim: "ask-ai-plans",
                                text: " On Grow and Pro.",
                            },
                        ],
                    },
                },
                {
                    title: "Get the answer, and the rows behind it.",
                    body: {
                        text: "Ask it to add or change something and it fills a card you confirm. Undo it the same day.",
                    },
                },
                {
                    title: "Or use your own assistant.",
                    body: {
                        text: "Connect Claude, ChatGPT or another AI app. It works as you, with your role, and can't refund or cancel.",
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
            line: "Insights, API keys, webhooks",
            chip: "Data and API",
            lead: {
                text: "See how you're doing in plain figures, and download your records whenever you want.",
                tails: [
                    {
                        release: "developers",
                        text: " Make **API keys and webhooks** for your own workflows, or for the developer or agency who helps you. A key can never do more than the person who made it.",
                    },
                ],
            },
            captions: [
                {
                    title: "Know how you're doing.",
                    body: {
                        text: "Site views, visitors, enquiries and orders, and what to do next. Owners only.",
                    },
                },
                {
                    title: "Make a key for a workflow.",
                    body: {
                        text: "Give it only the parts it needs. Your developer reads and changes products, bookings, orders and customers.",
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
    ] satisfies readonly Chapter[],

    /** The drawings' own words: the app's labels, as its screens show them. */
    panels: {
        product: {
            title: "New product",
            meta: "Draft",
            name: "Name",
            price: "Price",
            stock: "In stock",
            shows: (address: string) =>
                `Shows on **${address}** when you save.`,
            save: "Save",
        },
        booking: {
            meta: "Classes",
            places: (booked: number, of: number) =>
                `${booked} of ${of} places booked · ${of - booked} left`,
            pay: (price: string) => `Pay ${price} and book`,
        },
        home: {
            title: "Home",
            toBake: (n: number) => `${n} cakes to bake today`,
            unpaid: (name: string) => `${name} hasn't paid`,
            sendLink: "Send link",
            low: (item: string) => `${item} running low`,
            left: (left: number, of: number, note: string) =>
                `${left} left of ${of} ${note}`,
        },
        template: {
            title: "Pick a template",
            meta: (trade: string) => `For ${trade}`,
            /** The trade, as "For bakeries" names it. */
            plural: {
                bakery: "bakeries",
                salon: "salons",
                gym: "gyms",
                florist: "florists",
            } as Readonly<Record<string, string>>,
            caption: "Yours, in your colours",
        },
        address: {
            title: "Your web address",
            live: "Live",
            then: "Then, when you're ready",
            connected: "Connected",
            comes: "Your shop and booking page come with it: **/shop** and **/book**.",
        },
        draft: {
            changes:
                "**2 changes in draft.** Christmas menu, hours for Sunday.",
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
            own: (business: string) => `${business}'s own account`,
            connected: "Connected",
            connect: "Connect",
            /** The other providers a business in India may connect. */
            others: ["Cashfree", "Stripe"],
            cashfree: "If you already use it",
            stripe: "For businesses outside India",
        },
        paying: {
            label: "Paying",
            paidBy: (method: string) => `Paid by ${method}`,
        },
        paidOrder: {
            paid: "Paid",
            paidInto: "Paid into",
            payoutTo: "Payout to",
            herBank: "Her bank",
            invoice: "Invoice",
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
                    q: "Is hafte kaun wapas nahi aaya?",
                    from: "from customers",
                    claim: "ask-ai-languages",
                },
                {
                    q: "शनिवार की क्लास में कितनी जगह बची है?",
                    from: "from bookings",
                    claim: "ask-ai-languages",
                },
                {
                    q: "Who hasn't come back this month?",
                    from: "from customers",
                    off: "ask-ai-languages",
                },
                { q: "Add the Christmas menu", from: "you confirm it" },
            ] as readonly {
                q: string;
                from: string;
                claim?: ClaimSwitch;
                /** Shown only while this claim is off, in its place. */
                off?: ClaimSwitch;
            }[],
        },
        answer: {
            /** The question in Hinglish, while languages are on; else English. */
            question: {
                hinglish: "Is hafte sabse zyada kya bika?",
                english: "What sold most this week?",
            },
            reply: {
                hinglish: (item: string, n: number) =>
                    `${item} sabse aage hai, ${n} box.`,
                english: (item: string, n: number) =>
                    `The ${item.toLowerCase()} is ahead, ${n} boxes.`,
            },
            head: ["Product", "Sold", "Takings"],
            readFrom: "Read from",
            sources: ["Orders", "Products"],
        },
        assistant: {
            title: "Claude",
            on: "On",
            ask: "Add the Christmas menu:",
            meta: (business: string) => `Saroh · ${business}`,
            reply: "Done. Both are drafts in Products. The change to your website waits for you to publish it.",
            added: (n: number, owner: string) =>
                `${n} drafts added, as ${owner}`,
            undo: "Undo",
        },
        insights: {
            title: "Insights",
            meta: "Last 6 weeks",
            question: "Am I making more money?",
            week: (takings: string, change: string) =>
                `${takings} this week, ${change}`,
            weeks: ["12 Oct", "19", "26", "2 Nov", "9", "16"],
        },
        key: {
            title: "Settings · API keys",
            button: "New key",
            name: "Stock sheet",
            token: "sk_live_····a91f",
            scopes: ["Products: read", "Orders: read", "Stock: write"],
            made: (owner: string) =>
                `Made by ${owner} · owner. Turn it off any time; every call is logged.`,
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
                {
                    name: "enquiry.received",
                    line: "An enquiry comes in",
                    took: "200 · 0.5 s",
                },
            ],
            signed: "Signed, so your server knows it came from Saroh",
        },
    },

    /** How money moves, drawn on the ledger band. */
    money: {
        label: "How the money moves, an example",
        /** When the example's customer pays (WORLD: ORD-1044, 4:06 pm). */
        at: "16:06",
        pays: (name: string, amount: string) => `${name} pays ${amount}`,
        by: (method: string, order: string) =>
            `By ${method}, from the link on ${order}`,
        yourAccount: "Your account",
        inName: (owner: string, provider: string) =>
            `In ${owner}'s name. ${provider}'s own fees apply.`,
        yourBank: "Your bank",
        bank: (owner: string) => `${owner}'s bank`,
        schedule: (provider: string) => `On ${provider}'s payout schedule`,
        saroh: "Saroh",
        hears: (order: string, invoice: string, tax: string, owner: string) =>
            `Hears it's paid. Marks **${order}** paid, writes **${invoice}** with ${tax}, and tells ${owner}.`,
        holds: "Holds",
        zero: "nothing",
    },

    yours: {
        id: "yours",
        title: "Everything stays yours.",
        lead: (n: string) =>
            `${n} things a small business worries about handing over, and where each one actually sits.`,
        foldMore: (n: number) => `${n} more things that stay yours`,
        rows: [
            {
                name: "Your money",
                body: {
                    text: "Paid into your own Razorpay, Cashfree or Stripe account, in your name. Saroh never holds it.",
                },
                chip: "Saroh holds nothing",
            },
            {
                name: "Your address",
                body: {
                    text: "Live at yourname.saroh.app from the first day, or at a domain you own.",
                },
                chip: "{domain}",
            },
            {
                name: "Your customers",
                body: {
                    text: "They buy on your own site and book your own page, under your name. No marketplace sits between you and them.",
                },
                chip: "{site}/shop",
            },
            {
                name: "Your records",
                body: {
                    text: "Orders, customers and bills are yours to export whenever you want.",
                    tails: [
                        {
                            release: "developers",
                            text: " Or read them from your own server with an API key.",
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
                            text: " An assistant you connect works as you, and can't refund or cancel.",
                        },
                    ],
                },
                chip: "Deleted after 90 days",
            },
        ] as readonly ({
            name: string;
            body: GatedText;
            /** `{domain}` and `{site}` are the example's. */
            chip: string;
        } & Gate)[],
    },

    day: {
        lead: "Want to see all of this happen in order?",
        link: (business: string) => `Follow one Monday at ${business}`,
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
                    line: "What needs you today, for each person",
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
                    line: "Notes, orders and bills on each customer's page",
                },
                {
                    feature: "bookings",
                    name: "Bookings",
                    line: "Classes, sessions and appointments",
                },
                {
                    feature: "subscriptions",
                    name: "Subscriptions",
                    line: "Plans that renew themselves",
                },
                {
                    feature: "billing",
                    name: "Billing",
                    line: "GST invoices and bills of supply, made for you",
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
                    line: "Razorpay, Cashfree or Stripe, in your name",
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
                    line: "Site views, visitors, enquiries and orders",
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
        } satisfies Record<GroupId, readonly IndexItem[]>,
    },

    close: {
        title: "Build it once. Keep all of it.",
        pricing: "See pricing",
        note: "Free to start. No card needed.",
    },
} as const;
