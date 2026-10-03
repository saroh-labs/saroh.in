/**
 * The three solution pages, from the Solutions template's `S` and `SUB` data
 * blocks, the Nav's `SOLUTIONS` lines and Home's `kinds` cards.
 *
 * Changes from the design's words: "storefront" reads "location"
 * (saroh-product.md), and captions name no amounts. Plan prices and plan
 * summaries are not here: the pricing block names plans by id and renders the
 * placeholder until the catalogue feeds the site.
 */
import type {
    FeatureSlug,
    Solution,
    SolutionSegment,
    SolutionSlug,
} from "./types";
import { SOLUTION_SLUGS } from "./types";

export const solutions: Record<SolutionSlug, Solution> = {
    shops: {
        slug: "shops",
        name: "Shops",
        navLine: "Sell at the counter and online",
        longName: "Shops and bakeries",
        card: {
            name: "Shops and bakeries",
            body: "Sell at the counter and online, with stock that stays right and orders that don't get lost.",
            day: "Start: send the morning's orders, reply to a review, check stock.",
            uses: "Products · Orders · Subscriptions · Website",
            link: "See Saroh for shops",
        },
        headline: "Sell at the counter and online, from one place.",
        sub: "For bakeries, cafés, boutiques and anyone with shelves to fill. Your site, your orders, your stock and your bills stay in step, so nothing gets lost between the chat, the notebook and the till.",
        hero: {
            shot: "p-site",
            alt: "Rye & Co.'s own shop, built on Saroh: products with sizes, prices and Add to bag",
        },
        heroNote:
            "Rye & Co., a bakery on Hill Road, sells at the counter and on its own Saroh site.",
        changeTitle:
            "The problems every shop knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I open up and don't know what to do first.”",
                title: "One list of what needs you this morning",
                body: "Late orders, sizes short for orders, a failed renewal and what's due today, most urgent first. Mark an order sent right from the list.",
                shot: "s-home",
                alt: "Home at Rye & Co.: nine things that need Priya, from late orders to a failed renewal",
            },
            {
                feature: "products",
                pain: "“The price on the site says one thing and the bill says another.”",
                title: "Change a price once. It's right everywhere.",
                body: "Your site, your orders and your invoices read the same product. Stock drops as orders go out, and the list tells you what to restock before customers notice.",
                shot: "p-products",
                alt: "The Products list: what needs restocking at the top, then every product with status, stock and price",
            },
            {
                feature: "orders",
                pain: "“Orders come in on WhatsApp, Instagram and at the counter, and one always slips.”",
                title: "Every order in one list, late ones flagged",
                body: "Site and counter orders land together, with how each one is collected or delivered. Marking one ready or sent tells the customer.",
                shot: "s-orders",
                alt: "The Orders list: each order with its step, how long it has waited, when it was placed and its total",
            },
            {
                feature: "customers",
                pain: "“A regular walks in and I can't remember her usual, or her allergy.”",
                title: "Know your regulars before they reach the counter",
                body: "What they usually buy and in which size, how they collect, what they've spent, and allergies shown in red wherever their name appears.",
                shot: "s-customer",
                alt: "Priya Raman's page: six orders, what she has spent, a sesame allergy and what she usually buys",
            },
            {
                feature: "subscriptions",
                pain: "“I have to remember who gets bread every Saturday, and chase them to pay.”",
                title: "Weekly orders that charge themselves",
                body: "A loaf a week, a box a month. UPI Autopay or card renews on its own, each renewal makes its invoice, and a failed payment is retried and shown to you.",
                shot: "r-subdetail",
                alt: "Priya's weekly loaf: next charge, upcoming collections and changes",
            },
            {
                feature: "billing",
                pain: "“Making GST invoices by hand takes my Sunday.”",
                title: "Invoices make themselves",
                body: "Every order and renewal gets a numbered GST invoice. See what's owed, and write one by hand for a café that orders in bulk.",
                shot: "s-billing",
                alt: "Invoices: each order's GST invoice, paid or due, with a café's bulk order in draft",
            },
            {
                feature: "insights",
                pain: "“I only find out how the month went when I count the till.”",
                title: "Know how the week went, for each location",
                body: "Takings, orders and average order against the weeks before, your best week, and how much came from the counter and how much from your site.",
                shot: "s-insights",
                alt: "Insights: four weeks of takings, twelve weeks of bars, and Hill Road against Online",
            },
        ],
        pricing: {
            title: "Pricing for shops",
            featured: "grow",
            fit: "For a shop, that means stock across the counter and your site, weekly orders that charge themselves, and GST invoices.",
            second: "pro",
        },
        faq: "shops-counter-online",
        closer: "Open tomorrow knowing what to bake.",
    },
    gyms: {
        slug: "gyms",
        name: "Gyms & studios",
        navLine: "Classes, memberships and class packs",
        longName: "Gyms and studios",
        card: {
            name: "Gyms and studios",
            body: "Classes with places, memberships that renew, and a booking page on your site.",
            day: "Start: see today's classes, who's booked and who paid at the desk.",
            uses: "Bookings · Subscriptions · Class packs · Website",
            link: "See Saroh for gyms",
        },
        headline: "Classes, members and payments, without the paper diary.",
        sub: "For gyms, yoga and dance studios, and personal trainers. Members book on your site, packs and memberships count themselves down, and renewals are charged on time.",
        hero: {
            shot: "g-site",
            alt: "Pulse Fitness's own site on Saroh: today's classes, Book a class and memberships",
        },
        heroNote:
            "Pulse Fitness, a gym in Koramangala with trainers, classes and memberships.",
        changeTitle:
            "The problems every studio knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I find out someone hasn't paid when they're already on the mat.”",
                title: "See who owes, and today's sessions, first thing",
                body: "Overdue memberships, renewals that failed and today's sessions with who's booked, each with the button to fix it.",
                shot: "g-home",
                alt: "Pulse Fitness's Home: overdue memberships, a failed renewal and today's sessions",
            },
            {
                feature: "bookings",
                label: "Bookings · Your booking page",
                pain: "“Half my evening goes on WhatsApp, finding people a slot.”",
                title: "Members book themselves, into real free times",
                body: "Your booking page shows only the times your trainers are free. Members pick, pay or use a credit, and get a reminder.",
                shot: "g-book",
                alt: "Pulse Fitness's booking page with services, courses and a summary",
            },
            {
                feature: "bookings",
                label: "Bookings · Your week",
                pain: "“I never know how full the 7am class is until people turn up.”",
                title: "Every trainer's week, by the hour",
                body: "Personal training and classes side by side, with places left, who's paid and who's a no-show.",
                shot: "g-bookings",
                alt: "Pulse Fitness's week: sessions and classes for each trainer by the hour",
            },
            {
                feature: "bookings",
                label: "Bookings · Class packs and courses",
                pain: "“Tracking who has classes left in their pack is a notebook of tally marks.”",
                title: "Class packs and courses that count themselves",
                body: "Sell 5 or 10 classes. Credits are used as members book and expire when you say. Six-week courses show who's paid and who's behind.",
                shot: "g-packs",
                alt: "Class packs at Pulse: sold, still to use and expiring",
            },
            {
                feature: "customers",
                pain: "“A member tells me about her knee, and next week I've forgotten.”",
                title: "Every member on one page",
                body: "Classes left, membership, course, next booking and notes from the trainers, in one record.",
                shot: "g-customer",
                alt: "Farah Khan at Pulse: her course, classes left, membership and next booking",
            },
            {
                feature: "subscriptions",
                pain: "“Chasing monthly fees is the worst part of the job.”",
                title: "Memberships that renew on their own",
                body: "UPI Autopay or card, charged on the day. Failed payments are retried and shown on the dashboard.",
                shot: "g-subs",
                alt: "Memberships at Pulse with their next charge",
            },
            {
                feature: "billing",
                pain: "“I can't tell who's paid for what.”",
                title: "Every payment has its invoice",
                body: "Sessions, packs and memberships each make an invoice. Overdue ones are flagged with a reminder ready.",
                shot: "g-billing",
                alt: "Pulse Fitness's invoices with four overdue",
            },
        ],
        pricing: {
            title: "Pricing for gyms and studios",
            featured: "grow",
            fit: "For a studio, that means class packs, courses and memberships that renew themselves.",
            second: "free",
        },
        faq: "gyms-pack-and-membership",
        closer: "Fill tomorrow's 7am class.",
    },
    clinics: {
        slug: "clinics",
        name: "Clinics",
        navLine: "Appointments, treatments and patient notes",
        longName: "Clinics",
        card: {
            name: "Clinics and practitioners",
            body: "Appointments, treatments over several visits, patient notes kept to the right people.",
            day: "Start: check today's patients and their flags before the first one arrives.",
            uses: "Bookings · Patients · Bills of supply · Website",
            link: "See Saroh for clinics",
        },
        headline: "Appointments, treatments and patient notes, kept straight.",
        sub: "For dental, physio, skin and dietician practices. Patients book online and tell you what you need to know, treatments run over several visits, and medical notes are seen only by those who should.",
        hero: {
            shot: "d-site",
            alt: "Kavi Dental's own site on Saroh: free times today and Book an appointment",
        },
        heroNote: "Kavi Dental, a clinic in Indiranagar with two dentists.",
        changeTitle:
            "The problems every clinic knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I learn about a patient's blood thinners when they're already in the chair.”",
                title: "Today's patients, with their flags",
                body: "Who's coming, with which dentist and chair, and anything the team must check first, before the first patient arrives.",
                shot: "d-home",
                alt: "Kavi Dental's Home: today's patients with medical and allergy flags",
            },
            {
                feature: "bookings",
                pain: "“The phone rings all morning with people asking for a time.”",
                title: "Patients book themselves, and tell you what matters",
                body: "Only real free times are shown. Patients choose the clinic or a video call, pay a deposit, and answer “Anything we should know?”.",
                shot: "d-book",
                alt: "Kavi Dental's booking page with check-ups, a root canal over three visits and a video consult",
            },
            {
                feature: "orders",
                pain: "“A root canal is three visits, and I lose track of which one they're on.”",
                title: "Treatments tracked visit by visit",
                body: "One treatment, all its visits: what's done, what's today and what's still to book, with the dentist and chair for each.",
                shot: "d-order",
                alt: "A root canal at Kavi Dental: visit 1 attended, visit 2 today, visit 3 to book",
            },
            {
                feature: "customers",
                label: "Customers · Patient notes",
                pain: "“Notes from the phone end up on a sticky note.”",
                title: "Notes reach the patient's record",
                body: "What a patient writes when booking is matched to them. Label it, mark it sensitive, and it shows on every booking.",
                shot: "d-customer",
                alt: "Rahul Verma's page with a note from the booking page about a new tablet",
            },
            {
                feature: "customers",
                label: "Customers · Medical notes",
                pain: "“Anyone at the desk can read a patient's medical history.”",
                title: "Medical notes for the right people only",
                body: "Allergies and access needs show wherever a patient's name appears. Medical notes only show to dentists and owners.",
                shot: "d-customers",
                alt: "Kavi Dental's patients with medical and allergy tags",
            },
            {
                feature: "billing",
                pain: "“Healthcare doesn't charge GST, and my invoices get it wrong.”",
                title: "Bills of supply, one per treatment",
                body: "Each treatment makes one bill for all its visits, marked GST-exempt. What's overdue is flagged.",
                shot: "d-billing",
                alt: "Kavi Dental's bills of supply with one overdue",
            },
        ],
        pricing: {
            title: "Pricing for clinics",
            featured: "grow",
            fit: "For a clinic, that means treatments over several visits, patient notes kept to the right people, and bills of supply.",
            second: "pro",
        },
        faq: "clinics-medical-notes",
        closer: "Know every patient before they sit down.",
    },
};

/** The solutions in the menu's order. */
export const solutionList: Solution[] = SOLUTION_SLUGS.map((s) => solutions[s]);

export const solutionHref = (slug: SolutionSlug) => `/solutions/${slug}`;

export function isSolutionSlug(value: string): value is SolutionSlug {
    return (SOLUTION_SLUGS as readonly string[]).includes(value);
}

/**
 * A segment as the page draws it: its label (the design's sub-label, or the
 * feature's name) and whether it carries "See {feature} →". Within each
 * area only the FIRST segment links to the feature page, so gyms' three
 * Bookings segments show the link once.
 */
export interface SegmentView extends SolutionSegment {
    label: string;
    /** The feature's name, for "See {name} →". */
    featureName: string;
    /** True on the first segment of its area: it shows "See {name} →". */
    seeLink: boolean;
}

export function segmentViews(
    segments: SolutionSegment[],
    featureName: (slug: FeatureSlug) => string,
): SegmentView[] {
    const seen = new Set<FeatureSlug>();
    return segments.map((seg) => {
        const first = !seen.has(seg.feature);
        seen.add(seg.feature);
        const name = featureName(seg.feature);
        return {
            ...seg,
            label: seg.label ?? name,
            featureName: name,
            seeLink: first,
        };
    });
}
