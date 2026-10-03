/**
 * The eight feature pages, from the Features template's `F` and `LINE` data
 * blocks, the Nav's `FEATURES` lines and Home's `modules` bodies.
 *
 * Changes from the design's words, each for a repo rule:
 * - "storefront" reads "location" (saroh-product.md);
 * - captions name no amounts (the public-repo rule: no currency in the repo);
 * - the design's `home` key is the `dashboard` slug (/features/dashboard).
 */
import type { Feature, FeatureSlug } from "./types";
import { FEATURE_SLUGS } from "./types";

export const features: Record<FeatureSlug, Feature> = {
    dashboard: {
        slug: "dashboard",
        name: "Dashboard",
        navLine: "What needs you today, for each person",
        cardLine: "What needs you today.",
        homeBody: "What needs each person today, based on their role.",
        headline: "Open up and see what needs you.",
        sub: "Every morning, the dashboard lists what's late, who's coming in, what's owed and what failed, most urgent first. Each person sees the part that's theirs, and most things can be done right from the list.",
        hero: {
            shot: "s-home",
            alt: "Home at Rye & Co.: nine things that need Priya, from late orders to a failed renewal",
        },
        howTitle: "One screen before the first customer.",
        steps: [
            {
                title: "The most urgent thing is at the top",
                body: "Late orders, stock short for orders, failed renewals and overdue bills, each with the button that fixes it: Mark sent, Retry now, Send a reminder.",
                who: "Rye & Co., a bakery",
                shot: "s-home",
                alt: "Rye & Co.'s Home with late orders and a failed renewal",
            },
            {
                title: "Today's people, in order",
                body: "Who's booked, at what time, with whom, and whether they've paid. Anything the team should know before they arrive is shown beside their name.",
                who: "Kavi Dental, a clinic",
                shot: "d-home",
                alt: "Kavi Dental's Home: today's patients with their dentist, chair and flags",
            },
            {
                title: "Money that needs chasing",
                body: "Overdue memberships and renewals that failed, with a reminder ready to send.",
                who: "Pulse Fitness, a gym",
                shot: "g-home",
                alt: "Pulse Fitness's Home: overdue memberships, a failed renewal and today's sessions",
            },
            {
                title: "Zoom out to the month",
                body: "The calendar shows every day's orders, bookings, renewals and bills, with money in, out and due.",
                who: "Rye & Co.",
                shot: "r-calendar",
                alt: "September on the calendar with each day's money and a strip of totals",
            },
        ],
        points: [
            {
                title: "Sorted by what matters",
                body: "Late before due, due before coming up. Nothing that's fine is shown as a problem.",
            },
            {
                title: "Done from the list",
                body: "Mark an order sent or retry a payment without opening it.",
            },
            {
                title: "Right for each role",
                body: "The front desk sees today's people. The owner also sees the money.",
            },
            {
                title: "The last 24 hours",
                body: "New orders and what was taken, in one line at the top.",
            },
            {
                title: "A calendar of everything",
                body: "Month or week, with each day's money and problems named.",
            },
            {
                title: "Caught up means caught up",
                body: "When nothing needs you, the dashboard says so.",
            },
        ],
        worksLead:
            "The dashboard reads from everything else in Saroh, so it's only as busy as your day is.",
        worksWith: ["orders", "bookings", "subscriptions", "billing"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "Tomorrow morning, know what needs you.",
    },
    products: {
        slug: "products",
        name: "Products",
        navLine: "Prices, sizes, photos and stock, shared everywhere",
        cardLine: "Names, prices and stock for everything you sell.",
        homeBody:
            "Variants, prices, photos and stock, shared by your site and your orders.",
        headline: "Add a product once. It's right everywhere.",
        sub: "Your site, your orders and your invoices all read the same product. Change a price and it changes in all three. Stock goes down as orders go out, and you're told before a size runs short.",
        hero: {
            shot: "p-products",
            alt: "The Products list at Rye & Co.: what needs restocking at the top, then every product with status, stock and price",
        },
        howTitle: "From the first photo to the last one sold.",
        steps: [
            {
                title: "Add it once",
                body: "Give it a name, a price and photos. Add sizes if it comes in more than one, each with its own price and SKU. The web address is made from the name.",
                who: "Rye & Co.",
                shot: "p-editor",
                alt: "The product editor: name, address on the shop, price and category beside visibility, variants and stock",
            },
            {
                title: "It's on your site straight away",
                body: "Publish it and it appears in your shop with its photo, sizes and price. Leave it as a draft, or schedule it for Saturday morning.",
                who: "Rye & Co.",
                shot: "p-site",
                alt: "Rye & Co.'s shop page showing each product with its sizes, price and an Add to bag button",
            },
            {
                title: "Stock follows every order",
                body: "Each sale takes it off the shelf, for the location it was sold at. Count in the morning, move stock between locations, and every change is kept in a log.",
                who: "Rye & Co.",
                shot: "p-stock",
                alt: "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
            },
            {
                title: "See everything tied to it",
                body: "One page shows what can be sold now, the orders waiting on it, the discounts that apply, the pages it's on and its reviews.",
                who: "Rye & Co.",
                shot: "p-detail",
                alt: "Sourdough loaf's page: 25 can be sold now, with open orders, discounts, collections, pages and reviews",
            },
        ],
        points: [
            {
                title: "Sizes and options",
                body: "Each one has its own price, SKU and stock. Leave the price blank and it uses the product's.",
            },
            {
                title: "Stock for each location",
                body: "The counter and your site count separately, because an order holds stock where it was placed.",
            },
            {
                title: "Told before it runs out",
                body: "Set a warning level per size. Products short for orders already placed come to the top.",
            },
            {
                title: "A log of every change",
                body: "Received, sold, returned, moved, wasted or counted, with who did it. Nothing is deleted.",
            },
            {
                title: "Stock you don't count",
                body: "Turn tracking off for things that always sell, like a gift box. They never show Sold out.",
            },
            {
                title: "What's in it",
                body: "Ingredients and allergens go on the product, so the shop and the ticket both show them.",
            },
            {
                title: "Draft, scheduled or live",
                body: "Get it ready now and choose when customers see it.",
            },
            {
                title: "Reviews you can answer",
                body: "See what customers said and reply from the product's page.",
            },
            {
                title: "The right people only",
                body: "Choose who can change prices, who can count stock and who can only look.",
            },
        ],
        worksLead:
            "Products is where the rest of Saroh gets its names, prices and stock.",
        worksWith: ["orders", "billing", "customers", "insights"],
        usedBy: ["shops"],
        closer: "Add your first product in two minutes.",
    },
    orders: {
        slug: "orders",
        name: "Orders",
        navLine: "Every order in one list, late ones flagged",
        cardLine: "Every order, in one list.",
        homeBody: "One list from every location, with late orders flagged.",
        headline: "Every order in one list, and none slip.",
        sub: "Orders from your site and the counter land together, newest first, with how each one is collected, delivered or visited. Late ones are flagged, and every step tells the customer.",
        hero: {
            shot: "s-orders",
            alt: "The Orders list at Rye & Co.: each order's step, how long it has waited, when it was placed and its total",
        },
        howTitle: "From placed to picked up.",
        steps: [
            {
                title: "Open it and see the next step",
                body: "The order shows what to do next, who it's for, anything to watch for like an allergy, and the money. Print a ticket for the kitchen.",
                who: "Rye & Co.",
                shot: "r-order",
                alt: "Order #1020: waiting 16 minutes, a sesame allergy warning, items, customer and money",
            },
            {
                title: "Orders that take several visits",
                body: "A treatment sold as three visits is fulfilled by those visits. Mark each one attended, or book the next.",
                who: "Kavi Dental",
                shot: "d-order",
                alt: "Order #D301, a root canal: visit 1 attended, visit 2 today, visit 3 still to book",
            },
            {
                title: "Each one makes its invoice",
                body: "Paid orders get a numbered invoice with the right tax, ready to send or print.",
                who: "Rye & Co.",
                shot: "r-invoice",
                alt: "A GST invoice made from an order, with the business's details and tax",
            },
        ],
        points: [
            {
                title: "Pick-up, delivery, shipping, visits",
                body: "Each way of fulfilling an order has its own steps.",
            },
            {
                title: "Late is per type",
                body: "A pick-up is late sooner than a parcel. The list knows the difference.",
            },
            {
                title: "Filters that matter",
                body: "By step, fulfilment, payment, product, date, and who needs attention.",
            },
            {
                title: "Change it safely",
                body: "Edit items until preparing starts, and the address until handover. After that, refund.",
            },
            {
                title: "Never deleted",
                body: "Cancelled and refunded orders stay on the record.",
            },
        ],
        worksLead:
            "Orders take names and prices from Products and write to Billing and Insights.",
        worksWith: ["products", "customers", "billing", "insights"],
        usedBy: ["shops", "clinics"],
        closer: "Send today's orders in the right order.",
    },
    customers: {
        slug: "customers",
        name: "Customers",
        navLine: "Orders, bookings, bills and notes on one page",
        cardLine: "Everything about each customer.",
        homeBody:
            "Orders, bookings, bills and notes in one record. Sensitive notes only for the right roles.",
        headline: "Know the person in front of you.",
        sub: "Every customer's orders, bookings, plans, bills and notes on one page. What they usually buy, what they've spent, and anything the team should know before they arrive.",
        hero: {
            shot: "r-customers",
            alt: "The Customers list: each customer with tags, last order, orders and spend",
        },
        howTitle: "One record for everyone you serve.",
        steps: [
            {
                title: "Everything about them on one page",
                body: "What they've spent, how they usually get their order, and what they buy most, down to the size.",
                who: "Rye & Co.",
                shot: "s-customer",
                alt: "Priya Raman's page: six orders, what she has spent, a sesame allergy and what she usually buys",
            },
            {
                title: "Members, with what they have left",
                body: "Classes left in their pack, their membership, their course and their next booking.",
                who: "Pulse Fitness",
                shot: "g-customer",
                alt: "Farah Khan's page at Pulse: a six-week course, classes left and her next booking",
            },
            {
                title: "Notes they send reach the team",
                body: "What a patient writes when booking is matched to their record. Check it, label it and add it where the team will see it.",
                who: "Kavi Dental",
                shot: "d-customer",
                alt: "Rahul Verma's page with a note from the booking page about a new blood-pressure tablet",
            },
            {
                title: "Flags only for the right people",
                body: "Allergies and access needs show wherever their name appears. Medical notes only show to those allowed to see them.",
                who: "Kavi Dental",
                shot: "d-customers",
                alt: "Kavi Dental's patients with medical and allergy tags",
            },
        ],
        points: [
            {
                title: "Spent means paid",
                body: "Orders and renewals that were actually paid, counted the same everywhere.",
            },
            {
                title: "Needs attention",
                body: "Allergies, medical notes and access needs, on orders, bookings and tickets too.",
            },
            {
                title: "Contact details by permission",
                body: "Some roles see names but not phone numbers.",
            },
            {
                title: "Said yes to offers",
                body: "Only the customer can say yes, and when they did is recorded.",
            },
            {
                title: "Search and filters",
                body: "By name, phone, email, returning, subscribers, open orders and more.",
            },
        ],
        worksLead:
            "A customer's page gathers what every other part of Saroh knows about them.",
        worksWith: ["orders", "bookings", "subscriptions", "billing"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "Remember every regular.",
    },
    bookings: {
        slug: "bookings",
        name: "Bookings",
        navLine: "Classes, sessions and appointments",
        cardLine: "Classes, sessions and appointments.",
        homeBody:
            "Classes, sessions and appointments with staff, places and hours.",
        headline: "A calendar customers can book into themselves.",
        sub: "Classes, one-to-one sessions and appointments, with staff, places and hours. Customers book on your site, pay a deposit or use a credit, and you see it straight away.",
        hero: {
            shot: "g-bookings",
            alt: "Pulse Fitness's week: personal training and classes for each trainer, by the hour",
        },
        howTitle: "From your hours to a full week.",
        steps: [
            {
                title: "Customers book themselves",
                body: "Your booking page shows only real free times, from your team's hours. They pick, pay what you ask at booking, and get a reminder.",
                who: "Pulse Fitness",
                shot: "g-book",
                alt: "Pulse Fitness's booking page with services, courses and a summary",
            },
            {
                title: "Classes and courses with places",
                body: "Set how many places a class has. Courses run for several weeks and show who's paid and who's behind.",
                who: "Pulse Fitness",
                shot: "g-courses",
                alt: "Courses at Pulse: a six-week beginners' course and a 5K course with places filled",
            },
            {
                title: "Class packs",
                body: "Sell five or ten classes at a price. Credits are used as they book, and expire when you say.",
                who: "Pulse Fitness",
                shot: "g-packs",
                alt: "Class packs: 5 and 10 classes with how many are sold and still to use",
            },
            {
                title: "Treatments over several visits",
                body: "A root canal is three visits of an hour. Patients book, pay a deposit or the whole amount, and tell you what you need to know.",
                who: "Kavi Dental",
                shot: "d-book",
                alt: "Kavi Dental's booking page with check-ups, a root canal over three visits and a video consult",
            },
        ],
        points: [
            {
                title: "Your team's hours",
                body: "Each person's hours and time off, including holidays when the whole business is closed.",
            },
            {
                title: "In person or online",
                body: "Or let the customer choose, with a video link sent for online.",
            },
            {
                title: "Deposits",
                body: "Nothing, a quarter, half or all of it at booking.",
            },
            {
                title: "Moves and cancellations",
                body: "Customers can move a booking from their account, within your rules.",
            },
            {
                title: "Check-in and no-shows",
                body: "Mark who came. No-shows are counted on their record.",
            },
            {
                title: "Who can change what",
                body: "The front desk can book and move. Only some can change services or hours.",
            },
        ],
        worksLead:
            "Bookings put people on the calendar, money in Billing and notes on the customer.",
        worksWith: ["customers", "billing", "subscriptions", "dashboard"],
        usedBy: ["gyms", "clinics"],
        closer: "Open your calendar to bookings tonight.",
    },
    subscriptions: {
        slug: "subscriptions",
        name: "Subscriptions",
        navLine: "Plans that renew themselves",
        cardLine: "Plans that renew themselves.",
        homeBody: "Plans that renew, with failed payments retried and shown.",
        headline: "Regulars who pay without being asked.",
        sub: "Memberships, weekly bread, monthly boxes. UPI Autopay or card renews on its own, each renewal makes its invoice, and a failed payment is retried and shown to you.",
        hero: {
            shot: "r-subdetail",
            alt: "Priya Raman's weekly loaf: next charge, upcoming collections, plan and changes",
        },
        howTitle: "Set up once, paid every time.",
        steps: [
            {
                title: "Customers join on your site",
                body: "Plans are listed on your site with their price and what's included. Joining sets up Autopay.",
                who: "Pulse Fitness",
                shot: "g-site",
                alt: "Pulse Fitness's site with classes today and a link to memberships",
            },
            {
                title: "Renewals run themselves",
                body: "Each plan renews on its day. If a payment fails, it's retried once and flagged for you.",
                who: "Rye & Co.",
                shot: "s-subs",
                alt: "Subscriptions at Rye & Co. with one failed renewal flagged",
            },
            {
                title: "Every renewal makes its invoice",
                body: "The invoice is made and sent when the renewal is paid.",
                who: "Rye & Co.",
                shot: "s-billing",
                alt: "Invoices at Rye & Co., each from an order or a renewal",
            },
        ],
        points: [
            {
                title: "Pause, skip or change",
                body: "Customers can pause, skip a week or change plan from their account.",
            },
            {
                title: "Price changes",
                body: "Change a plan's price for new members and keep current members on theirs, or move them.",
            },
            {
                title: "Failed payments",
                body: "Retried, shown on the dashboard, and never quietly lost.",
            },
            {
                title: "Renewals on the calendar",
                body: "Every renewal due this month shows on its day.",
            },
        ],
        worksLead:
            "Subscriptions charge through Billing and show on the customer's page.",
        worksWith: ["billing", "customers", "bookings", "insights"],
        usedBy: ["shops", "gyms"],
        closer: "Turn regulars into renewals.",
    },
    billing: {
        slug: "billing",
        name: "Billing",
        navLine: "Invoices and receipts made for you",
        cardLine: "Invoices made for you.",
        homeBody:
            "Tax invoices, bills of supply and receipts, made from orders and bookings.",
        headline: "Invoices you don't have to write.",
        sub: "Every paid order, booking and renewal gets its own numbered invoice with the right tax. See what's owed, send a reminder with a pay link, and write one by hand when you need to.",
        hero: {
            shot: "s-billing",
            alt: "Invoices at Rye & Co.: each order's GST invoice, paid or due, with a bulk order in draft",
        },
        howTitle: "Made, sent and paid.",
        steps: [
            {
                title: "Made from the order",
                body: "Your business's details, the customer, each line with its tax, and the total, numbered in order.",
                who: "Rye & Co.",
                shot: "r-invoice",
                alt: "A GST tax invoice from Rye & Co. to Third Wave Café",
            },
            {
                title: "The right kind for your business",
                body: "Healthcare is exempt from GST, so a clinic gets bills of supply, one for each treatment.",
                who: "Kavi Dental",
                shot: "d-billing",
                alt: "Kavi Dental's bills of supply with one overdue",
            },
            {
                title: "See what's overdue",
                body: "Overdue bills are flagged, with a reminder and a pay link ready to send.",
                who: "Pulse Fitness",
                shot: "g-billing",
                alt: "Pulse Fitness's invoices with four overdue",
            },
        ],
        points: [
            {
                title: "GST done right",
                body: "Tax invoices with GSTIN, HSN or SAC, and the tax split.",
            },
            {
                title: "Bills of supply",
                body: "For businesses that don't charge GST.",
            },
            {
                title: "Pay links",
                body: "UPI or card, from the invoice or the reminder.",
            },
            {
                title: "Written by hand",
                body: "For bulk orders or anything outside Saroh.",
            },
            {
                title: "Never renumbered",
                body: "Cancelling makes a credit note. The number stays.",
            },
            {
                title: "For your accountant",
                body: "Export the month from the calendar as a spreadsheet.",
            },
        ],
        worksLead:
            "Billing is where orders, bookings and renewals turn into money.",
        worksWith: ["orders", "subscriptions", "bookings", "insights"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "Get your Sundays back.",
    },
    insights: {
        slug: "insights",
        name: "Insights",
        navLine: "How the week went, against the weeks before",
        cardLine: "How the week went.",
        homeBody:
            "Takings and orders over time, per location, against the weeks before.",
        headline: "Know how the week went, without a spreadsheet.",
        sub: "Takings, orders and average order against the weeks before, your best week, and where the money came from: the counter, your site, each location.",
        hero: {
            shot: "s-insights",
            alt: "Insights at Rye & Co.: four weeks of takings, twelve weeks of bars, and Hill Road against Online",
        },
        howTitle: "From today's takings to the season.",
        steps: [
            {
                title: "Four weeks against the four before",
                body: "Takings, orders, your best week and average order, each with how it moved. Compare with the four weeks before those, or the same time last year once you have a year.",
                who: "Rye & Co.",
                shot: "i-compare",
                alt: "Insights at Rye & Co.: takings, orders, best week and average order for four weeks",
            },
            {
                title: "Twelve weeks at a glance",
                body: "Each bar is a week. Your best week is marked in saffron, so you know what good looks like.",
                who: "Rye & Co.",
                shot: "i-weeks",
                alt: "Twelve weeks of takings, from 7 Jul to 22 Sep, with 15 Sep marked as the best week",
            },
            {
                title: "One location at a time",
                body: "Pick the counter or your site, and every figure and bar shows just that location.",
                who: "Rye & Co.",
                shot: "i-store",
                alt: "Insights for Hill Road only: its takings and orders in four weeks",
            },
        ],
        points: [
            {
                title: "Compared fairly",
                body: "Against the four weeks before, or the same time last year.",
            },
            {
                title: "Best week",
                body: "Marked, so you know what good looks like.",
            },
            {
                title: "By location",
                body: "The counter and your site, side by side.",
            },
            {
                title: "The last 24 hours",
                body: "New orders and what was taken, at the top of the dashboard every morning.",
            },
            {
                title: "Each day's money",
                body: "The calendar shows money in, money out and what's due, day by day.",
            },
            {
                title: "For owners only",
                body: "Only people with access to money see it.",
            },
        ],
        worksLead:
            "Insights reads from Orders, Billing and Subscriptions, so the numbers match.",
        worksWith: ["orders", "billing", "subscriptions", "dashboard"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "See how this week is going.",
    },
};

/** The features in the menu's order. */
export const featureList: Feature[] = FEATURE_SLUGS.map((s) => features[s]);

export const featureHref = (slug: FeatureSlug) => `/features/${slug}`;

export function isFeatureSlug(value: string): value is FeatureSlug {
    return (FEATURE_SLUGS as readonly string[]).includes(value);
}
