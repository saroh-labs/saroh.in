/**
 * The eight feature pages, from the Features template's `F` and `LINE` data
 * blocks, the Nav's `FEATURES` lines and Home's `modules` bodies.
 *
 * Changes from the design's words, each for a repo rule:
 * - "storefront" reads "location" (saroh-product.md);
 * - captions name no amounts (the public-repo rule: no currency in the repo);
 * - claims the product can't back are reworded (`MARKETING_CLAIMS.md`,
 *   DEC-075), and each "who" line names its business as a demo;
 * - steps carry no caption of their own: the frame reads the captured alt,
 *   which says what the screenshot really shows;
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
        },
        howTitle: "One screen before the first customer.",
        steps: [
            {
                title: "The most urgent thing is at the top",
                body: "Late orders, stock short for orders, failed renewals and overdue bills, each with the button that fixes it: Mark sent, Send reminder, or a new pay link for a failed renewal.",
                who: "Rye & Co. (demo bakery)",
                shot: "s-home",
            },
            {
                title: "Today's people, in order",
                body: "Who's booked, at what time and with whom, and who pays at the desk. Anything the team should know is beside their name.",
                who: "Kavi Dental (demo clinic)",
                shot: "d-home",
            },
            {
                title: "Money that needs chasing",
                body: "Overdue bills with a reminder ready to send, and failed renewals with a new pay link.",
                who: "Pulse Fitness (demo gym)",
                shot: "g-home",
            },
            {
                title: "Zoom out to the month",
                body: "The calendar shows every day's orders, bookings, renewals and bills, with money in, out and due.",
                who: "Rye & Co. (demo bakery)",
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
                body: "Mark an order sent or send a reminder without opening it.",
            },
            {
                title: "Right for each role",
                body: "Someone without money access sees today's people, not the takings.",
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
        closer: "Every morning, know what needs you.",
    },
    products: {
        slug: "products",
        name: "Products",
        navLine: "Prices, sizes, photos and stock, shared everywhere",
        cardLine: "Names, prices and stock for everything you sell.",
        homeBody:
            "Variants, prices, photos and stock, shared by your site and your orders.",
        headline: "Add a product once. It's right everywhere.",
        sub: "Your site and your orders read the same product. Change a price and the next order and its invoice use it; orders already placed keep the price agreed. Stock goes down as orders go out, and the Products list shows what's running low before a size runs out.",
        hero: {
            shot: "p-products",
        },
        howTitle: "From the first photo to the last one sold.",
        steps: [
            {
                title: "Add it once",
                body: "Give it a name, a price and photos. Add sizes if it comes in more than one, each with its own price and SKU. Its link on your shop is made from the name.",
                who: "Rye & Co. (demo bakery)",
                shot: "p-editor",
            },
            {
                title: "It's on your site straight away",
                body: "Publish it and it appears in your shop with its photo, sizes and price, or keep it as a draft until it's ready.",
                who: "Rye & Co. (demo bakery)",
                shot: "p-site",
            },
            {
                title: "Stock follows every order",
                body: "Each sale takes it off the shelf, for the location it was sold at. Count in the morning, move stock between locations, and every change is kept in a log.",
                who: "Rye & Co. (demo bakery)",
                shot: "p-stock",
            },
            {
                title: "See everything tied to it",
                body: "One page shows what can be sold now, the orders waiting on it, the discounts that apply, the pages it's on and its reviews.",
                who: "Rye & Co. (demo bakery)",
                shot: "p-detail",
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
                title: "Low stock at the top",
                body: "Set a warning level per size. Products short for orders already placed come to the top.",
            },
            {
                title: "A log of every change",
                body: "Received, sold, returned, moved, wasted or counted, with who did it. Nothing is deleted.",
            },
            {
                title: "Stock you don't count",
                body: "Turn tracking off for things that always sell, like a gift box. They don't sell out on their own; mark one sold out when you need to.",
            },
            {
                title: "What's in it",
                body: "Ingredients and allergens go on the product and on your shop page. A customer's allergy is matched to what they ordered, on the order and its kitchen ticket.",
            },
            {
                title: "Draft or live",
                body: "Get it ready now and publish when you choose.",
            },
            {
                title: "Reviews you can answer",
                body: "Ask for a review once an order is delivered, and reply from the product's page.",
            },
            {
                title: "The right people only",
                body: "Choose who can edit products, who can count stock and who can only look.",
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
        name: "Orders",
        navLine: "Every order in one list, late ones flagged",
        cardLine: "Every order, in one list.",
        homeBody: "One list from every location, with late orders flagged.",
        headline: "Every order in one list, and none slip.",
        sub: "Orders from your site and the counter land together, newest first, with how each one is collected, delivered or visited. Late ones are flagged.",
        hero: {
            shot: "s-orders",
        },
        howTitle: "From placed to picked up.",
        steps: [
            {
                title: "Open it and see the next step",
                body: "The order shows what to do next, who it's for, anything to watch for like an allergy, and the money. Print a ticket for the kitchen.",
                who: "Rye & Co. (demo bakery)",
                shot: "r-order",
            },
            {
                title: "Orders that take several visits",
                body: "A treatment sold as three visits is fulfilled by those visits. Mark each one attended, or book the next.",
                who: "Kavi Dental (demo clinic)",
                shot: "d-order",
            },
            {
                title: "Each one makes its invoice",
                body: "Paid orders get a numbered invoice with the right tax, ready to send or print.",
                who: "Rye & Co. (demo bakery)",
                shot: "r-invoice",
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
                body: "Edit items and the address until preparing starts, and how it's fulfilled until handover. After that, refund.",
            },
            {
                title: "Never deleted",
                body: "Cancelled and refunded orders stay on the record.",
            },
        ],
        worksLead:
            "Orders take names and prices from Products and write to Billing.",
        worksWith: ["products", "customers", "billing"],
        usedBy: ["shops", "clinics"],
        closer: "Send today's orders in the right order.",
    },
    customers: {
        slug: "customers",
        name: "Customers",
        navLine: "Bookings, bills, notes and linked orders on one page",
        cardLine: "Everything about each customer.",
        homeBody:
            "Bookings, bills, notes and linked orders on one page. Sensitive notes only for the right roles.",
        headline: "Know the person in front of you.",
        sub: "Every customer's bookings, plans, bills and notes on one page, with their orders once they're linked. What they usually buy, what they've spent, and anything the team should know before they arrive.",
        hero: {
            shot: "r-customers",
        },
        howTitle: "A page for everyone who pays.",
        steps: [
            {
                title: "Everything about them on one page",
                body: "What they've spent, how they usually get their order, and what they buy most, down to the size.",
                who: "Rye & Co. (demo bakery)",
                shot: "s-customer",
            },
            {
                title: "Members, with what they have left",
                body: "Classes left in their pack, their membership and their next booking.",
                who: "Pulse Fitness (demo gym)",
                shot: "g-customer",
            },
            {
                title: "Notes they send reach the team",
                body: "What a patient writes when booking is matched to their record. Check it, label it and add it where the team will see it.",
                who: "Kavi Dental (demo clinic)",
                shot: "d-customer",
            },
            {
                title: "Flags only for the right people",
                body: "Allergies and access needs show on their orders, kitchen tickets, today's list and bookings. Medical notes only show to those allowed to see them.",
                who: "Kavi Dental (demo clinic)",
                shot: "d-customers",
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
                body: "A role without contact access sees names, not phone numbers or emails.",
            },
            {
                title: "Search and filters",
                body: "By name, phone, email, returning, subscribers, open orders and more.",
            },
        ],
        worksLead:
            "A customer's page gathers their bookings, plans, bills and linked orders.",
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
        },
        howTitle: "From your hours to a full week.",
        steps: [
            {
                title: "Customers book themselves",
                body: "Your booking page shows only real free times, from your team's hours. They pick, and pay what you ask at booking.",
                who: "Pulse Fitness (demo gym)",
                shot: "g-book",
            },
            {
                title: "Classes and courses with places",
                body: "Set how many places a class has. Courses run for several weeks; enrol people and see who's paid.",
                who: "Pulse Fitness (demo gym)",
                shot: "g-courses",
            },
            {
                title: "Class packs",
                body: "Sell five or ten classes at a price. Credits are used as they book, and expire when you say.",
                who: "Pulse Fitness (demo gym)",
                shot: "g-packs",
            },
            {
                title: "Treatments over several visits",
                body: "A root canal is three visits of an hour. Patients book the first visit, pay a deposit or the whole amount, and tell you what you need to know. Your team books the rest.",
                who: "Kavi Dental (demo clinic)",
                shot: "d-book",
            },
        ],
        points: [
            {
                title: "Your team's hours",
                body: "Each person's hours and time off, including holidays when the whole business is closed.",
            },
            {
                title: "In person or online",
                body: "Or let the customer choose, with your video link on the booking's confirmation page.",
            },
            {
                title: "Deposits",
                body: "Nothing, a quarter, half or all of it at booking.",
            },
            {
                title: "Moves and cancellations",
                body: "Your team moves a booking to another real free time.",
            },
            {
                title: "Check-in and no-shows",
                body: "Mark who came. No-shows are counted on their record.",
            },
            {
                title: "Who can change what",
                body: "Booking and moving is one permission; changing services and hours is another.",
            },
        ],
        worksLead:
            "Bookings put people on the calendar, money in Billing and notes on the customer.",
        worksWith: ["customers", "billing", "subscriptions", "dashboard"],
        usedBy: ["gyms", "clinics"],
        closer: "Open your calendar to bookings.",
    },
    subscriptions: {
        slug: "subscriptions",
        name: "Subscriptions",
        navLine: "Plans that renew themselves",
        cardLine: "Plans that renew themselves.",
        homeBody:
            "Plans that renew on their day, with failed payments shown and a pay link ready.",
        headline: "Regulars on a plan, renewed on time.",
        sub: "Memberships, weekly bread, monthly boxes. Each renewal makes its invoice on the day, and plans can renew on their own by UPI Autopay where you've set it up on your Razorpay account. A failed payment is shown to you with a new pay link.",
        hero: {
            shot: "r-subdetail",
        },
        howTitle: "Set up once, renewed every time.",
        steps: [
            {
                title: "Your plans, on your site",
                body: "Plans are listed on your site with their price and what's included. You sign members up at the desk.",
                who: "Pulse Fitness (demo gym)",
                shot: "g-site",
            },
            {
                title: "Renewals run themselves",
                body: "Each plan renews on its day. If a payment fails, it's flagged for you with a new pay link.",
                who: "Rye & Co. (demo bakery)",
                shot: "s-subs",
            },
            {
                title: "Every renewal makes its invoice",
                body: "The invoice is made on the renewal day, ready to send.",
                who: "Rye & Co. (demo bakery)",
                shot: "s-billing",
            },
        ],
        points: [
            {
                title: "Pause, skip or change",
                body: "Pause a subscription, skip a week or move it to another plan.",
            },
            {
                title: "Price changes",
                body: "Change a plan's price for new members and keep current members on theirs, or move a member to the new price.",
            },
            {
                title: "Failed payments",
                body: "Shown on the dashboard with a new pay link, and never quietly lost.",
            },
            {
                title: "Renewals on the calendar",
                body: "Every renewal due this month shows on its day.",
            },
        ],
        worksLead:
            "Subscriptions invoice through Billing and show on the customer's page.",
        worksWith: ["billing", "customers", "bookings"],
        usedBy: ["shops", "gyms"],
        closer: "Turn regulars into renewals.",
    },
    billing: {
        slug: "billing",
        name: "Billing",
        navLine: "Invoices made for you",
        cardLine: "Invoices made for you.",
        homeBody:
            "Tax invoices and bills of supply, made from orders, bookings and renewals.",
        headline: "Invoices you don't have to write.",
        sub: "Every paid order gets its own numbered invoice with the right tax, and with Payments on, so do bookings paid online and every renewal. See what's owed, send a reminder with a pay link, and write one by hand when you need to.",
        hero: {
            shot: "s-billing",
        },
        howTitle: "Made, sent and paid.",
        steps: [
            {
                title: "Made from the order",
                body: "Your business's details, the customer, each line with its tax, and the total, numbered in order.",
                who: "Rye & Co. (demo bakery)",
                shot: "r-invoice",
            },
            {
                title: "The right kind for your business",
                body: "Mark a service GST-exempt and its invoices are bills of supply.",
                who: "Kavi Dental (demo clinic)",
                shot: "d-billing",
            },
            {
                title: "See what's overdue",
                body: "Overdue bills are flagged, with a reminder and a pay link ready to send.",
                who: "Pulse Fitness (demo gym)",
                shot: "g-billing",
            },
        ],
        points: [
            {
                title: "GST done right",
                body: "Tax invoices with GSTIN, HSN or SAC, and the tax split.",
            },
            {
                title: "Bills of supply",
                body: "For GST-exempt sales, like most healthcare.",
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
                body: "Export the month's money from the calendar as a CSV.",
            },
        ],
        worksLead:
            "Billing is where orders, bookings and renewals turn into money.",
        worksWith: ["orders", "subscriptions", "bookings"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "Get your Sundays back.",
    },
    /*
     * Insights says only what today's Insights shows (DEC-075, D2): site
     * views, visitors, enquiries and orders, views by day and the most-viewed
     * pages, for the last 7, 30 or 90 days. The designed takings, best week,
     * week-on-week and location split are to be built; the page names none
     * of them until they ship. The shots come from Northwind Supply, the demo
     * business with Insights on.
     */
    insights: {
        slug: "insights",
        name: "Insights",
        navLine: "Site views, visitors, enquiries and orders",
        cardLine: "How your site is doing.",
        homeBody: "Site views, visitors, enquiries and orders, day by day.",
        headline: "See how your site is doing.",
        sub: "Site views, visitors, enquiries and orders for the last week, month or three months, with views by day and the pages people open most.",
        hero: { shot: "s-insights" },
        howTitle: "From this week to the last three months.",
        steps: [
            {
                title: "Four numbers for your site",
                body: "Site views, unique visitors, enquiries and orders, side by side for the days you pick.",
                who: "Northwind Supply (demo business)",
                shot: "i-compare",
            },
            {
                title: "Views, day by day",
                body: "A bar for each day shows when people came to your site.",
                who: "Northwind Supply (demo business)",
                shot: "i-weeks",
            },
            {
                title: "The pages people open most",
                body: "See which pages get the most views, so you know what people come for.",
                who: "Northwind Supply (demo business)",
                shot: "i-store",
            },
        ],
        points: [
            {
                title: "Pick the days",
                body: "The last 7, 30 or 90 days.",
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
            "Insights counts what happens on your site: views, visitors, enquiries and orders.",
        worksWith: ["dashboard", "orders"],
        usedBy: ["shops", "gyms", "clinics"],
        closer: "See how your site is doing.",
    },
};

/** The features in the menu's order. */
export const featureList: Feature[] = FEATURE_SLUGS.map((s) => features[s]);

export const featureHref = (slug: FeatureSlug) => `/features/${slug}`;

export function isFeatureSlug(value: string): value is FeatureSlug {
    return (FEATURE_SLUGS as readonly string[]).includes(value);
}
