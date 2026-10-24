/**
 * The four solution pages: three from the Solutions template's `S` and `SUB`
 * data blocks, the Nav's `SOLUTIONS` lines and Home's `kinds` cards, and
 * Salons, written in the same shape on 12 Oct 2026.
 *
 * Each page's `phrase`, `seoTitle` and `seoDescription` are what it says to
 * a search engine (`SearchWords`, `types.ts`): "software for ‹trade›", which
 * the feature pages leave to these. Its `sub` opens with the phrase.
 *
 * Changes from the design's words: "storefront" reads "location"
 * (saroh-product.md), captions name no amounts, claims the product can't
 * back are reworded (`MARKETING_CLAIMS.md`, DEC-075), and each hero note
 * names its business as a demo. Segments carry no caption of their own: the
 * frame reads the captured alt, which says what the screenshot shows. Plan prices and plan
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

/**
 * The day this module's words last changed, the sitemap's `lastmod` for its
 * pages (`lib/site-pages.ts`). Change it with the words:
 * `pnpm check:content-dates` fails a batch that doesn't.
 */
export const UPDATED = "2026-10-12";

export const solutions: Record<SolutionSlug, Solution> = {
    shops: {
        slug: "shops",
        phrase: "billing and stock software for shops",
        seoTitle: "Billing and stock software for shops and bakeries",
        seoDescription:
            "Billing and stock software for shops and bakeries: counter orders, stock for each location and GST invoices in one place.",
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
        sub: "Billing and stock software for shops, bakeries, cafés, boutiques and anyone with shelves to fill. Your site, your orders, your stock and your bills stay in step, so nothing gets lost between the chat, the notebook and the till.",
        hero: {
            shot: "p-site",
        },
        heroNote: "Shown with Rye & Co., a demo bakery.",
        changeTitle:
            "The problems every shop knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I open up and don't know what to do first.”",
                title: "One list of what needs you this morning",
                body: "Late orders, sizes short for orders, a failed renewal and what's due today, most urgent first. Mark an order sent right from the list.",
                shot: "s-home",
            },
            {
                feature: "products",
                pain: "“The price on the site says one thing and the bill says another.”",
                title: "Change a price once, and the next order uses it.",
                body: "Your site and your orders read the same product, and orders already placed keep the price agreed. Stock drops as orders go out, and the list shows what to restock before customers notice.",
                shot: "p-products",
            },
            {
                feature: "orders",
                pain: "“Orders come in on WhatsApp, Instagram and at the counter, and one always slips.”",
                title: "Every order in one list, late ones flagged",
                body: "Site and counter orders land together, with how each one is collected or delivered.",
                shot: "s-orders",
            },
            {
                feature: "customers",
                pain: "“A regular walks in and I can't remember her usual, or her allergy.”",
                title: "Know your regulars before they reach the counter",
                body: "What they usually buy and in which size, how they collect, what they've spent, and allergies shown in red on their orders and tickets.",
                shot: "s-customer",
            },
            {
                feature: "subscriptions",
                pain: "“I have to remember who gets bread every Saturday, and chase them to pay.”",
                title: "Weekly orders, renewed on their day",
                body: "A loaf a week, a box a month. Each renewal makes its invoice, and can be paid on its own by UPI Autopay where you've set it up. A failed payment is shown to you with a new pay link.",
                shot: "r-subdetail",
            },
            {
                feature: "billing",
                pain: "“Making GST invoices by hand takes my Sunday.”",
                title: "Invoices make themselves",
                body: "Every order and renewal gets a numbered GST invoice. See what's owed, and write one by hand for a café that orders in bulk.",
                shot: "s-billing",
            },
            {
                feature: "insights",
                pain: "“I put up a site and never know if anyone looks at it.”",
                title: "See how your site is doing",
                body: "Site views, visitors, enquiries and orders, day by day, and the pages people open most.",
                shot: "s-insights",
            },
        ],
        pricing: {
            title: "Pricing for shops",
            featured: "grow",
            fit: "For a shop, that means stock across your locations, weekly orders that renew on their day, and GST invoices.",
            second: "pro",
        },
        faq: "shops-counter-online",
        closer: "Open tomorrow knowing what to bake.",
    },
    /*
     * Salons (12 Oct 2026): a core booking trade with no page until now.
     * Written in the Solutions template's shape, with no screenshot: no
     * salon has been captured, and a clinic's or a gym's screen beside a
     * salon's words would show the wrong trade. The page opens on its words,
     * and each segment is words alone, until salon shots exist
     * (`e2e/marketing-shots/shots.config.ts`).
     *
     * It says only what a business can do today (claims ledger §16, SA
     * rows). Left out because nothing backs them: reminders before a
     * booking (none exists on any channel), memberships that pay for
     * one-to-one services (a membership pays for classes only; a pack of
     * sessions is what a salon sells), and a client moving or cancelling
     * their own booking or buying a pack online (`SITE_ACCOUNT_AREA`).
     */
    salons: {
        slug: "salons",
        phrase: "salon booking software",
        seoTitle: "Salon booking software for salons and parlours",
        seoDescription:
            "Salon booking software for salons, parlours, barbers and spas: online booking by stylist, deposits, packs of sessions and GST invoices.",
        name: "Salons",
        navLine: "Appointments, stylists and deposits",
        longName: "Salons and parlours",
        card: {
            name: "Salons and parlours",
            body: "Appointments by stylist, deposits at booking, and a site with your services and prices.",
            day: "Start: see today's appointments, who's with whom and who pays at the desk.",
            uses: "Bookings · Packs · Billing · Website",
            link: "See Saroh for salons",
        },
        headline: "Appointments, stylists and deposits, in one place.",
        sub: "Salon booking software for salons, parlours, barbers and spas. Clients book a real free time with the stylist they want, pay a deposit if you ask for one, and your site shows your services and prices.",
        changeTitle:
            "The problems every salon knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I find out who's coming when they walk in.”",
                title: "Today's appointments, first thing",
                body: "Who's booked, at what time and with which stylist, and who pays at the desk. An allergy, or anything else the team should know, is beside their name.",
            },
            {
                feature: "bookings",
                label: "Bookings · Your booking page",
                pain: "“My evening goes on WhatsApp, finding people a time.”",
                title: "Clients book themselves, with the stylist they want",
                body: "Your booking page shows only the times your team is free. A client picks the service, chooses a stylist or Anyone, and can add the booking to their calendar. With your own email provider connected, they get an email when it's booked, moved or cancelled.",
            },
            {
                feature: "bookings",
                label: "Bookings · Your team",
                pain: "“Two stylists, different days off, one paper diary.”",
                title: "Each person's hours and time off",
                body: "Set when each person works, add time off, and mark the days the whole salon is closed. Say who takes each service, how long it runs and the gap after it, and only those times are offered.",
            },
            {
                feature: "bookings",
                label: "Bookings · Deposits",
                pain: "“People book a Saturday afternoon and don't turn up.”",
                title: "Take a deposit when they book",
                body: "Ask for nothing, a quarter, half or the full price at booking, paid into your own Razorpay or Cashfree account. Mark who came and who didn't, and no-shows are counted on the client's page.",
            },
            {
                feature: "bookings",
                label: "Bookings · Packs of sessions",
                pain: "“Regulars ask for a package, and I keep count on paper.”",
                title: "Sell a pack of sessions",
                body: "Five blow-dries or ten sessions at one price, sold at the desk. A credit comes off when the client books, on your booking page or with your team, and goes back if they cancel in time. You set how long a pack lasts.",
            },
            {
                feature: "customers",
                pain: "“She told me about the allergy last time, and I forgot.”",
                title: "Know every client before they sit down",
                body: "Their visits, what they've spent, their no-shows and your team's notes on one page. Allergies show on their bookings and on today's list.",
            },
            {
                feature: "billing",
                pain: "“A client asks for a GST bill, and I write it by hand.”",
                title: "An invoice for every payment",
                body: "A deposit paid online and a payment you take at the desk each get a numbered invoice. Give each service its GST rate and SAC code once, and with your GSTIN in Settings they are tax invoices.",
            },
            {
                feature: "website",
                pain: "“My price list is a photo on Instagram, and it's always out of date.”",
                title: "A site with your services and prices",
                body: "Your site lists each service with how long it takes and its price, read from the same list clients book from, so a new price shows without touching the page. Your opening hours and how to reach you are read the same way.",
            },
        ],
        pricing: {
            title: "Pricing for salons",
            featured: "grow",
            fit: "For a salon, that means deposits at booking, packs of sessions and GST invoices.",
            second: "free",
        },
        faq: "salons-choose-stylist",
        closer: "Know tomorrow's bookings before you open.",
    },
    gyms: {
        slug: "gyms",
        phrase: "gym and yoga studio management software",
        seoTitle: "Gym and yoga studio management software",
        seoDescription:
            "Gym and yoga studio management software: class bookings with places, class packs, memberships that renew and an invoice for each payment.",
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
        sub: "Gym and yoga studio management software, for dance studios and personal trainers too. Members book on your site, packs and memberships count themselves down, and memberships can renew on their own by UPI Autopay.",
        hero: {
            shot: "g-site",
        },
        heroNote: "Shown with Pulse Fitness, a demo gym.",
        changeTitle:
            "The problems every studio knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I find out someone hasn't paid when they're already on the mat.”",
                title: "See who owes, and today's sessions, first thing",
                body: "Overdue memberships, renewals that failed and today's sessions with who's booked, each with the button to fix it.",
                shot: "g-home",
            },
            {
                feature: "bookings",
                label: "Bookings · Your booking page",
                pain: "“Half my evening goes on WhatsApp, finding people a slot.”",
                title: "Members book themselves, into real free times",
                body: "Your booking page shows only the times your trainers are free. Members pick, and pay or use a credit.",
                shot: "g-book",
            },
            {
                feature: "bookings",
                label: "Bookings · Your week",
                pain: "“I never know how full the 7am class is until people turn up.”",
                title: "Each trainer's week, by the hour",
                body: "Personal training and classes side by side. Open a class to see places left and who's paid.",
                shot: "g-bookings",
            },
            {
                feature: "bookings",
                label: "Bookings · Class packs and courses",
                pain: "“Tracking who has classes left in their pack is a notebook of tally marks.”",
                title: "Class packs and courses that count themselves",
                body: "Sell 5 or 10 classes. Credits are used as members book and expire when you say. Courses show who's paid.",
                shot: "g-packs",
            },
            {
                feature: "customers",
                pain: "“A member tells me about her knee, and next week I've forgotten.”",
                title: "Every member on one page",
                body: "Classes left, membership, next booking and notes from the trainers, on one page.",
                shot: "g-customer",
            },
            {
                feature: "subscriptions",
                pain: "“Chasing monthly fees is the worst part of the job.”",
                title: "Memberships that can renew on their own",
                body: "By UPI Autopay where you've set it up on your Razorpay account, or invoiced on the day with a pay link. Failed payments are shown on the dashboard.",
                shot: "g-subs",
            },
            {
                feature: "billing",
                pain: "“I can't tell who's paid for what.”",
                title: "Every payment has its invoice",
                body: "Sessions, packs and memberships each make an invoice. Overdue ones are flagged with a reminder ready.",
                shot: "g-billing",
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
        phrase: "clinic appointment and patient booking software",
        seoTitle: "Clinic appointment and patient booking software",
        seoDescription:
            "Clinic appointment and patient booking software: online booking, treatments over several visits and medical notes for the right people only.",
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
        sub: "Clinic appointment and patient booking software for dental, physio, skin and dietician practices. Patients book online and tell you what you need to know, treatments run over several visits, and medical notes are seen only by those who should.",
        hero: {
            shot: "d-site",
        },
        heroNote: "Shown with Kavi Dental, a demo clinic.",
        changeTitle:
            "The problems every clinic knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I learn about a patient's blood thinners when they're already in the chair.”",
                title: "Today's patients, with their flags",
                body: "Who's coming, with which dentist, and anything the team must check first, before the first patient arrives.",
                shot: "d-home",
            },
            {
                feature: "bookings",
                pain: "“The phone rings all morning with people asking for a time.”",
                title: "Patients book themselves, and tell you what matters",
                body: "Only real free times are shown. Patients choose the clinic or a video call, pay a deposit, and answer “Anything we should know?”.",
                shot: "d-book",
            },
            {
                feature: "orders",
                pain: "“A root canal is three visits, and I lose track of which one they're on.”",
                title: "Treatments tracked visit by visit",
                body: "One treatment, all its visits: what's done, what's today and what's still to book, with the dentist for each.",
                shot: "d-order",
            },
            {
                feature: "customers",
                label: "Customers · Patient notes",
                pain: "“Notes from the phone end up on a sticky note.”",
                title: "Notes reach the patient's record",
                body: "What a patient writes when booking is matched to them. Label it, mark it sensitive, and the team sees it when they open the booking.",
                shot: "d-customer",
            },
            {
                feature: "customers",
                label: "Customers · Medical notes",
                pain: "“Anyone at the desk can read a patient's medical history.”",
                title: "Medical notes for the right people only",
                body: "Allergies and access needs show on a patient's bookings and today's list. Medical notes only show to the owner and anyone you allow.",
                shot: "d-customers",
            },
            {
                feature: "billing",
                pain: "“Healthcare doesn't charge GST, and my invoices get it wrong.”",
                title: "Bills of supply for exempt treatments",
                body: "Each treatment is billed against its visits, on a bill of supply when the service is GST-exempt. What's overdue is flagged.",
                shot: "d-billing",
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
