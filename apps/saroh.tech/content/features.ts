/**
 * The nine feature pages for a business outside India, line by line after
 * apps/saroh.in/content/features.ts: a true line stays as it is, and what isn't
 * true outside India today is reworded or gone. Each line traces to the private
 * claims ledger. Each feature carries its state (`StatedFeature`), and a Limited
 * page says plainly what works today in `worksToday`.
 *
 * Left out on purpose: payment links, deposits, reminders and invoice email,
 * your own domain, and saroh.in's tax words. A Free business has one place
 * customers visit, so "your place and your online shop", never "every location". Screenshots are
 * this site's own, of the Global demo businesses (plan U11), and each `who`
 * names the business in that screenshot.
 */
import type {
    FeatureSlug,
    StatedFeature,
} from "@saroh/marketing/content-types";
import { FEATURE_SLUGS } from "@saroh/marketing/content-types";

export { NOT_AVAILABLE_YET } from "./coming";

/** The day this module's words last changed: its pages' `updated`. */
export const UPDATED = "2026-11-04";

export const features: Record<FeatureSlug, StatedFeature> = {
    dashboard: {
        slug: "dashboard",
        state: "limited",
        worksToday:
            "Today the dashboard lists late orders, stock short for orders, overdue invoices and who's booked.",
        phrase: "business dashboard",
        seoTitle: "Business dashboard for small business owners",
        seoDescription:
            "A business dashboard that lists what's late, who's coming in and what's owed each morning, most urgent first.",
        name: "Dashboard",
        navLine: "What needs you today",
        cardLine: "What needs you today.",
        homeBody:
            "What's late, who's coming in and what's owed, most urgent first.",
        headline: "Open up and see what needs you.",
        sub: "A business dashboard that starts with what needs you. Every morning it lists what's late, who's coming in and what's owed, most urgent first.",
        hero: {
            shot: "s-home",
        },
        howTitle: "One screen before the first customer.",
        steps: [
            {
                title: "The most urgent thing is at the top",
                body: "Late orders, stock short for orders and overdue invoices, each with its next step. Hand over an order right from the list.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "s-home",
            },
            {
                title: "Today's people, in order",
                body: "Who's booked and at what time. Anything you should know is beside their name.",
                who: "Wrenfield Dental (demo clinic)",
                shot: "d-home",
            },
            {
                title: "Money that's owed",
                body: "Overdue invoices are listed, so you know who to ask.",
                who: "Ironvale Fitness (demo gym)",
                shot: "g-home",
            },
            {
                title: "Zoom out to the month",
                body: "The calendar shows every day's orders, bookings and invoices, with money in, out and due.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "r-calendar",
            },
        ],
        points: [
            {
                title: "Sorted by what matters",
                body: "Late before due, due before coming up. Nothing that's fine is shown as a problem.",
            },
            {
                title: "Done from the list",
                body: "Hand over an order without opening it.",
            },
            {
                title: "The last 24 hours",
                body: "New orders and what was taken, in one line at the top.",
            },
            {
                title: "A calendar of everything",
                body: "Month or week, with each day's money and problems named.",
            },
        ],
        worksLead:
            "The dashboard reads from everything else in Saroh, so it's only as busy as your day is.",
        worksWith: ["orders", "bookings", "customers", "billing"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "Every morning, know what needs you.",
    },
    products: {
        slug: "products",
        state: "full",
        phrase: "stock management",
        seoTitle: "Stock management software for small business",
        seoDescription:
            "Stock management and a product catalogue for small businesses: sizes, prices and photos, stock you can count, and low stock shown first.",
        name: "Products",
        navLine: "Prices, sizes, photos and stock, in one place",
        cardLine: "Names, prices and stock for everything you sell.",
        homeBody: "Variants, prices, photos and stock, in one place.",
        headline: "Add a product once. It's right everywhere.",
        sub: "A product catalogue and stock management for any business that sells things. Change a price and the next order uses it. Orders already placed keep the price agreed. Stock goes down as orders go out, and the Products list shows what's running low before a size runs out.",
        hero: {
            shot: "p-products",
        },
        howTitle: "From the first photo to the last one sold.",
        steps: [
            {
                title: "Add it once",
                body: "Give it a name, a price and photos. Add sizes if it comes in more than one, each with its own price and SKU.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "p-editor",
            },
            {
                title: "Stock follows every order",
                body: "Each sale takes it off the shelf. Count in the morning, move stock between your place and your online shop, and every change is kept in a log.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "p-stock",
            },
            {
                title: "See everything tied to it",
                body: "One page shows what can be sold now, the orders waiting on it and the discounts that apply.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "p-detail",
            },
        ],
        points: [
            {
                title: "Sizes and options",
                body: "Each one has its own price, SKU and stock. Leave the price blank and it uses the product's.",
            },
            {
                title: "A price and an original price",
                body: "Show a struck-through original price beside today's.",
            },
            {
                title: "Stock for your place and your online shop",
                body: "Your online shop can sell from your place's stock, or keep its own. An order holds stock where it was placed.",
            },
            {
                title: "Low stock at the top",
                body: "Set a warning level per size. Products short for orders already placed come to the top.",
            },
            {
                title: "A log of every change",
                body: "Received, sold, returned, moved, wasted or counted. Nothing is deleted.",
            },
            {
                title: "Stock you don't count",
                body: "Turn tracking off for things that always sell, like a gift box. They don't sell out on their own. Mark one sold out when you need to.",
            },
            {
                title: "What's in it",
                body: "Ingredients and allergens go on the product. A customer's allergy is matched to what they ordered, on the order and its kitchen ticket.",
            },
            {
                title: "Draft or live",
                body: "Get it ready now and publish when you choose.",
            },
            {
                title: "Bring them in",
                body: "Import your products from a CSV.",
            },
        ],
        worksLead:
            "Products is where the rest of Saroh gets its names, prices and stock.",
        worksWith: ["orders", "billing", "customers"],
        usedBy: ["shops"],
        closer: "Add your first product in two minutes.",
    },
    orders: {
        slug: "orders",
        state: "limited",
        worksToday:
            "Today you take orders at the counter, paid at pick-up or recorded by hand. Online payment isn't available yet.",
        phrase: "order management",
        seoTitle: "Order management software for small business",
        seoDescription:
            "Order management for small businesses: counter orders in one list, with the next step on each, late ones flagged and a CSV export.",
        name: "Orders",
        navLine: "Every order in one list, late ones flagged",
        cardLine: "Every order, in one list.",
        homeBody: "One list of every order, with late ones flagged.",
        headline: "Every order in one list, and none slip.",
        sub: "Order management for a small business. Take orders at the counter and follow each one to done, with its next step on the order. Late ones are flagged.",
        hero: {
            shot: "s-orders",
        },
        howTitle: "From placed to picked up.",
        steps: [
            {
                title: "Open it and see the next step",
                body: "The order shows what to do next, who it's for, anything to watch for like an allergy, and the money. Print a ticket for the kitchen.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "r-order",
            },
            {
                title: "Orders that take several visits",
                body: "A treatment sold as three visits is fulfilled by those visits. Mark each one attended, or book the next.",
                who: "Wrenfield Dental (demo clinic)",
                shot: "d-order",
            },
            {
                title: "Make its invoice",
                body: "Make a numbered invoice from the order, in your currency. It has no tax line. To add yours, write the invoice by hand.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "r-invoice",
            },
        ],
        points: [
            {
                title: "Steps to fit the order",
                body: "A pick-up and an order fulfilled by visits each follow their own steps.",
            },
            {
                title: "Late is per type",
                body: "The list knows how soon each kind of order is late.",
            },
            {
                title: "Filters that matter",
                body: "By step, fulfilment, payment, product, date, and who needs attention.",
            },
            {
                title: "Change it safely",
                body: "Edit items until preparing starts. After that, refund by hand.",
            },
            {
                title: "Never deleted",
                body: "Cancelled and refunded orders stay on the record.",
            },
            {
                title: "Take it with you",
                body: "Export your orders as a CSV.",
            },
        ],
        worksLead:
            "Orders take names and prices from Products and make invoices in Billing.",
        worksWith: ["products", "customers", "billing"],
        usedBy: ["shops", "clinics"],
        closer: "Hand over today's orders in the right order.",
    },
    customers: {
        slug: "customers",
        state: "full",
        phrase: "customer management",
        seoTitle: "Customer management software for small business",
        seoDescription:
            "Customer management for small businesses: each customer's bookings, invoices, notes and linked orders on one page, with what they've spent.",
        name: "Customers",
        navLine: "Bookings, invoices, notes and linked orders on one page",
        cardLine: "Everything about each customer.",
        homeBody:
            "Bookings, invoices, notes and linked orders on one page. Medical notes only you can read.",
        headline: "Know the person in front of you.",
        sub: "Customer management for a small business. Every customer's bookings, invoices and notes on one page, with their orders once they're linked. What they usually buy, what they've spent, and anything you should know before they arrive.",
        hero: {
            shot: "r-customers",
        },
        howTitle: "A page for everyone who pays.",
        steps: [
            {
                title: "Everything about them on one page",
                body: "What they've spent, how they usually get their order, and what they buy most, down to the size.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "s-customer",
            },
            {
                title: "Regulars, with what's next",
                body: "Their next booking and the classes they've been to.",
                who: "Ironvale Fitness (demo gym)",
                shot: "g-customer",
            },
            {
                title: "Notes they send reach you",
                body: "What a patient writes when booking is matched to their record. Check it, label it and add it where you'll see it.",
                who: "Wrenfield Dental (demo clinic)",
                shot: "d-customer",
            },
            {
                title: "Flags where you need them",
                body: "Allergies and access needs show on their orders, kitchen tickets, today's list and bookings. Medical notes only show to you.",
                who: "Wrenfield Dental (demo clinic)",
                shot: "d-customers",
            },
        ],
        points: [
            {
                title: "Spent means paid",
                body: "Orders and bookings that were actually paid, counted the same everywhere.",
            },
            {
                title: "Needs attention",
                body: "Allergies, medical notes and access needs, on orders, bookings and tickets too.",
            },
            {
                title: "Search and filters",
                body: "By name, phone, email, returning, open orders and more.",
            },
            {
                title: "Phones from any country",
                body: "Save a customer's number with its country code, wherever they are.",
            },
            {
                title: "Bring them in",
                body: "Import your customers from a CSV.",
            },
        ],
        worksLead:
            "A customer's page gathers their bookings, invoices and linked orders.",
        worksWith: ["orders", "bookings", "billing"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "Remember every regular.",
    },
    bookings: {
        slug: "bookings",
        state: "limited",
        worksToday:
            "Today people book a free time on your site, or you book them at the desk. They pay at the visit, and you record it.",
        phrase: "online booking",
        seoTitle: "Online booking and appointment scheduling software",
        seoDescription:
            "Online booking and appointment scheduling for classes and one-to-one sessions: customers pick a real free time.",
        name: "Bookings",
        navLine: "Classes, sessions and appointments",
        cardLine: "Classes, sessions and appointments.",
        homeBody:
            "Classes, sessions and appointments, in your hours, with places for each class.",
        headline: "A calendar customers can book into themselves.",
        sub: "Online booking and appointment scheduling for classes, one-to-one sessions and appointments. Customers book a free time on your site, and you manage the day at the desk.",
        hero: {
            shot: "g-bookings",
        },
        howTitle: "From your hours to a full week.",
        steps: [
            {
                title: "Customers book themselves",
                body: "Your booking page shows only real free times, from your hours.",
                who: "Ironvale Fitness (demo gym)",
                shot: "g-book",
            },
            {
                title: "Classes and courses with places",
                body: "Set how many places a class has. Courses run for several weeks. Enrol people and see who's on each.",
                who: "Ironvale Fitness (demo gym)",
                shot: "g-courses",
            },
            {
                title: "Treatments over several visits",
                body: "A course of treatment can be three visits of an hour. Patients book the first visit and tell you what you need to know. You book the rest.",
                who: "Wrenfield Dental (demo clinic)",
                shot: "d-book",
            },
        ],
        points: [
            {
                title: "Your hours",
                body: "Your hours and time off, including holidays when the business is closed.",
            },
            {
                title: "In person or online",
                body: "Choose one, or let the customer choose. Your video link is on the booking's confirmation page.",
            },
            {
                title: "Moves and cancellations",
                body: "Move a booking to another real free time, or cancel it.",
            },
            {
                title: "Check-in and no-shows",
                body: "Mark who came. No-shows are counted on their record.",
            },
        ],
        worksLead:
            "Bookings put people on the calendar and notes on the customer.",
        worksWith: ["customers", "billing", "dashboard"],
        usedBy: ["salons", "gyms", "clinics"],
        closer: "Open your calendar to bookings.",
    },
    /*
     * Not usable yet for a business outside India, so nothing here is sold as
     * working: the page and its place stay (the plan's Feature state rule), the
     * hero says so, every part is marked, and no other feature or solution leans
     * on it. The words name no plan's contents.
     */
    subscriptions: {
        slug: "subscriptions",
        state: "coming-soon",
        worksToday:
            "Subscriptions isn't available yet, so you can't start one.",
        phrase: "membership and subscription billing",
        seoTitle: "Membership and subscription billing software",
        seoDescription:
            "Membership and subscription billing in Saroh is not available yet. Here's what it will do.",
        name: "Subscriptions",
        navLine: "Plans that renew on their day. Not available yet",
        cardLine: "Plans that renew on their day. Not available yet.",
        homeBody:
            "Not available yet. Plans that renew on their day, each with its invoice.",
        headline: "Regulars on a plan. Not available yet.",
        sub: "Membership and subscription billing for your regulars: memberships, weekly boxes, monthly sessions. It isn't available yet, so here's what it will do.",
        hero: {
            shot: "r-subdetail",
        },
        howTitle: "What it will do.",
        steps: [
            {
                title: "Each plan renews on its day",
                body: "You sign members up at the desk, and each plan renews on its day.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "s-subs",
                notYet: true,
            },
            {
                title: "Every renewal makes its invoice",
                body: "The invoice is made on the renewal day, and your customer pays it by hand.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "s-billing",
                notYet: true,
            },
        ],
        points: [
            {
                title: "Pause or skip",
                body: "Pause a subscription or skip a week.",
                notYet: true,
            },
            {
                title: "Price changes",
                body: "Change a plan's price for new members and keep current members on theirs, or move a member to the new price.",
                notYet: true,
            },
        ],
        worksLead:
            "Subscriptions will invoice through Billing and show on the customer's page.",
        worksWith: ["billing", "customers", "bookings"],
        usedBy: [],
        closer: "Start with bookings and invoices today.",
    },
    billing: {
        slug: "billing",
        state: "limited",
        worksToday:
            "Today you write invoices or make them from an order, and record what's paid. Saroh doesn't work out tax, and online payment isn't available yet.",
        phrase: "invoice software",
        seoTitle: "Invoice software for small business",
        seoDescription:
            "Invoice software for small businesses: numbered invoices in your currency, your own tax line on an invoice you write, and what's paid recorded.",
        name: "Billing",
        navLine: "Numbered invoices, in your currency",
        cardLine: "Numbered invoices, in your currency.",
        homeBody:
            "Numbered invoices with your own tax line and number, written by hand or made from an order.",
        headline: "Invoices in your currency, numbered for you.",
        sub: "Invoice software for a small business. Write a numbered invoice with your own tax line and number, in your currency, or make one from an order. See what's overdue and record what's paid.",
        hero: {
            shot: "s-billing",
        },
        howTitle: "Written, shared and paid.",
        steps: [
            {
                title: "Write it, or make it from an order",
                body: "Your business's details, the customer, each line and the total, numbered in order.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "r-invoice",
            },
            {
                title: "Add your tax line",
                body: "On an invoice you write, add one tax line you name yourself, like VAT 20%, on top of the total. It's kept on the invoice with your tax number. You choose the rate: Saroh doesn't work out tax.",
                who: "Larkspur & Vane (demo salon)",
                shot: "l-invoice",
            },
            {
                title: "See what's overdue",
                body: "Overdue invoices are listed. Record a payment and the invoice becomes a receipt.",
                who: "Ironvale Fitness (demo gym)",
                shot: "g-billing",
            },
        ],
        points: [
            {
                title: "Your own tax line",
                body: "On invoices you write. Invoices made from an order, a booking or a course have no tax line or tax number.",
            },
            {
                title: "Share it yourself",
                body: "Share an invoice by link, or on WhatsApp: it opens with the words typed, and you press send.",
            },
            {
                title: "Invoice, then receipt",
                body: "A numbered invoice becomes a receipt once it's paid.",
            },
            {
                title: "Your numbering year",
                body: "Number invoices from January to December, or from April to March.",
            },
            {
                title: "Written by hand",
                body: "For bulk orders or anything outside Saroh.",
            },
            {
                title: "For your accountant",
                body: "Export your data, invoices included, one CSV per table.",
            },
        ],
        worksLead:
            "Billing is where orders turn into invoices and what's paid is kept.",
        worksWith: ["orders", "customers", "bookings"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "Write your first invoice today.",
    },
    website: {
        slug: "website",
        state: "limited",
        worksToday:
            'Today your site lives on a saroh.app address, in English, with a "Made with Saroh" credit.',
        phrase: "website builder",
        seoTitle: "Website builder for small business with bookings",
        seoDescription:
            "A website builder for small businesses: your services, prices and hours stay up to date, with online booking, on a saroh.app address.",
        name: "Website",
        navLine: "A site that keeps up with your business",
        cardLine: "A site that keeps up with your business.",
        homeBody:
            "Your services, prices and hours on your own site, with a booking page built in.",
        headline: "A website that keeps up with your business.",
        sub: "A website builder for a small business, joined to the rest of Saroh. Your services, prices and opening hours are read from where you already keep them, customers book from the page, and it lives on a saroh.app address.",
        hero: {
            shot: "g-site",
        },
        howTitle: "From your first page to published.",
        steps: [
            {
                title: "It reads what you already entered",
                body: "A services list shows each service with how long it takes and its price. Opening hours, today's free times, your phone and your address are read the same way, so a change in Saroh shows on your site without editing the page.",
                who: "Wrenfield Dental (demo clinic)",
                shot: "d-site",
            },
            {
                title: "Customers book from it",
                body: "With Bookings on, your site has a booking page that offers only real free times, and you see the booking straight away.",
                who: "Ironvale Fitness (demo gym)",
                shot: "g-book",
            },
        ],
        points: [
            {
                title: "Draft, then publish",
                body: "Changes stay in a draft until you publish. Send a preview link first when someone should see it before it goes live.",
            },
            {
                title: "Every version kept",
                body: "Each publish is kept in Version history, and you can put an earlier one back.",
            },
            {
                title: "How a shared link looks",
                body: "Set the title, description and share image under Search and sharing. You're told when the picture is too small for Facebook and LinkedIn, or too heavy for WhatsApp.",
            },
            {
                title: "Ready for search",
                body: "Each site has its own sitemap, and you can add your Google Search Console or Bing Webmaster Tools code in Settings.",
            },
            {
                title: "Your look",
                body: "Choose a colourway, a pair of typefaces and the spacing, and every page follows.",
            },
            {
                title: "Enquiries reach you",
                body: "A form on your site adds the person to your contacts as a lead.",
            },
            {
                title: "A blog when you want one",
                body: "Write posts and list them on a page of your site.",
            },
        ],
        worksLead:
            "Your site reads from Bookings and your business's own details, so it says what's true today.",
        worksWith: ["bookings", "customers", "insights"],
        usedBy: ["shops", "salons", "gyms", "clinics"],
        closer: "Put your business on a site of its own.",
    },
    insights: {
        slug: "insights",
        state: "limited",
        worksToday:
            "Insights reads what's on record in Saroh: your paid orders and bookings, your enquiries and your site's visits.",
        phrase: "website analytics",
        seoTitle: "Website analytics and answers for your business",
        seoDescription:
            "Website analytics and money answers for a small business: am I making more money, what sells, and where do customers come from.",
        name: "Insights",
        navLine: "Money in, what sells and where customers come from",
        cardLine: "How your business is doing.",
        homeBody:
            "Am I making more money? What sells, who books? Where do customers come from?",
        headline: "See how your business is doing.",
        sub: "Website analytics and money answers for a small business. For the last 7 days, 4 weeks or 3 months, Insights answers three questions: Am I making more money? What sells, who books? Where do customers come from?",
        hero: { shot: "s-insights" },
        howTitle: "From this week to the last three months.",
        steps: [
            {
                title: "Three answers first",
                body: "Each question is answered in a sentence, from the same figures its card draws, and each opens its own tab.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "s-insights",
            },
            {
                title: "Four numbers for your site",
                body: "Visits, Visitors, Enquiries, and Paid orders and bookings, each against the period before.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "i-compare",
            },
            {
                title: "Visits, day by day",
                body: "A bar for each day shows when people came to your site.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "i-weeks",
            },
            {
                title: "The pages people open most",
                body: "See which pages get the most visits, so you know what people come for.",
                who: "Thistlewick Bakery (demo bakery)",
                shot: "i-store",
            },
        ],
        points: [
            {
                title: "Pick the days",
                body: "The last 7 days, 4 weeks or 3 months.",
            },
            {
                title: "The Money tab",
                body: "What came in, week by week, in your currency, against the same length before.",
            },
            {
                title: "The last 24 hours",
                body: "New orders and what was taken, at the top of the dashboard every morning.",
            },
            {
                title: "Each day's money",
                body: "The calendar shows money in, money out and what's due, day by day, in your currency.",
            },
        ],
        worksLead:
            "Each answer comes from your orders, bookings and site, so it says what really happened.",
        worksWith: ["website", "dashboard", "orders"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "See how your business is doing.",
    },
};

/** The features in the menu's order. */
export const featureList: StatedFeature[] = FEATURE_SLUGS.map(
    (s) => features[s],
);

export const featureHref = (slug: FeatureSlug) => `/features/${slug}`;
