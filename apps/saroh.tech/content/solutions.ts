/**
 * The four solution pages for a business outside India, after
 * apps/saroh.in/content/solutions.ts. Segments on subscriptions, deposits,
 * pay links, reminders and saroh.in's tax words are gone or reworded, and each
 * line traces to the private claims ledger.
 */
import type { Solution, SolutionSlug } from "@saroh/marketing/content-types";
import { SOLUTION_SLUGS } from "@saroh/marketing/content-types";

/** The day this module's words last changed: its pages' `updated`. */
export const UPDATED = "2026-11-04";

export const solutions: Record<SolutionSlug, Solution> = {
    shops: {
        slug: "shops",
        phrase: "order and stock software for shops",
        seoTitle: "Order and stock software for shops and bakeries",
        seoDescription:
            "Order and stock software for shops and bakeries: counter orders, stock for each location and numbered invoices in one place.",
        name: "Shops",
        navLine: "Orders at the counter, stock and invoices",
        longName: "Shops and bakeries",
        card: {
            name: "Shops and bakeries",
            body: "Sell at the counter, with stock that stays right and orders that don't get lost.",
            day: "Start: send the morning's orders, check stock, see what's owed.",
            uses: "Products · Orders · Billing · Website",
            link: "See Saroh for shops",
        },
        headline: "Sell at the counter, and keep it all in one place.",
        sub: "Order and stock software for shops, bakeries, cafés, boutiques and anyone with shelves to fill. Your orders, your stock and your invoices stay in step, so nothing gets lost between the chat, the notebook and the till.",
        hero: {
            shot: "p-products",
        },
        heroNote: "Shown with Thistlewick Bakery, a demo bakery.",
        changeTitle:
            "The problems every shop knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I open up and don't know what to do first.”",
                title: "One list of what needs you this morning",
                body: "Late orders, sizes short for orders and what's overdue, most urgent first. Mark an order sent right from the list.",
                shot: "s-home",
            },
            {
                feature: "products",
                pain: "“The price on the shelf says one thing and the invoice says another.”",
                title: "Change a price once, and the next order uses it.",
                body: "Orders already placed keep the price agreed. Stock drops as orders go out, and the list shows what to restock before customers notice.",
                shot: "p-products",
            },
            {
                feature: "orders",
                pain: "“Orders come in by chat, by phone and at the counter, and one always slips.”",
                title: "Every order in one list, late ones flagged",
                body: "Take each order at the counter, paid at pick-up or recorded by hand, and follow it to done.",
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
                feature: "billing",
                pain: "“Writing invoices by hand takes my Sunday.”",
                title: "Numbered invoices, in your currency",
                body: "Make an invoice from an order, or write one for a café that orders in bulk, with your own tax line. See what's owed, and record what's paid.",
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
        },
        faq: "shops-counter-online",
        closer: "Open tomorrow knowing what to bake.",
    },
    salons: {
        slug: "salons",
        phrase: "salon booking software",
        seoTitle: "Salon booking software for salons and barbers",
        seoDescription:
            "Salon booking software for salons, barbers and spas: online booking into your free times, your hours, client records and numbered invoices.",
        name: "Salons",
        navLine: "Appointments, clients and your prices",
        longName: "Salons and barbers",
        card: {
            name: "Salons and barbers",
            body: "Your appointments, a page for every client, and a site with your services and prices.",
            day: "Start: see today's appointments and who's coming.",
            uses: "Bookings · Customers · Billing · Website",
            link: "See Saroh for salons",
        },
        headline: "Appointments, clients and prices, in one place.",
        sub: "Salon booking software for salons, barbers and spas. Clients book a real free time themselves, and your site shows your services and prices.",
        hero: { shot: "l-site" },
        heroNote: "Shown with Larkspur & Vane, a demo salon.",
        changeTitle:
            "The problems every salon knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I find out who's coming when they walk in.”",
                title: "Today's appointments, first thing",
                shot: "l-home",
                body: "Who's booked and at what time. An allergy, or anything else you should know, is beside their name.",
            },
            {
                feature: "bookings",
                label: "Bookings · Your booking page",
                pain: "“My evening goes on messages, finding people a time.”",
                title: "Clients book themselves, into your free times",
                shot: "l-book",
                body: "Your booking page shows only the times you're free. A client picks the service and a time.",
            },
            {
                feature: "bookings",
                label: "Bookings · Your hours",
                pain: "“Different hours each day, days off, one paper diary.”",
                title: "Your hours and time off",
                shot: "l-team",
                body: "Set when you work, add time off, and mark the days the salon is closed. Say how long each service runs and the break after it, and only those times are offered.",
            },
            {
                feature: "bookings",
                label: "Bookings · Who came",
                pain: "“People book a Saturday afternoon and don't turn up.”",
                title: "See who keeps not coming",
                shot: "l-bookings",
                body: "Mark who came and who didn't, and no-shows are counted on the client's page.",
            },
            {
                feature: "bookings",
                label: "Bookings · Treatments over several visits",
                pain: "“A colour correction takes three visits, and I keep count on paper.”",
                title: "Treatments over several visits",
                shot: "l-bookings",
                body: "With Sell turned on, a treatment can be three visits of an hour. The client books the first, and you book the rest.",
            },
            {
                feature: "customers",
                pain: "“She told me about the allergy last time, and I forgot.”",
                title: "Know every client before they sit down",
                shot: "l-customer",
                body: "Their visits, what they've spent, their no-shows and your notes on one page. Allergies show on their bookings and on today's list.",
            },
            {
                feature: "billing",
                pain: "“A client asks for a proper invoice, and I write it on paper.”",
                title: "A numbered invoice when they ask",
                shot: "l-invoice",
                body: "Write an invoice in your currency, with your own tax line and number. Record the payment, and it becomes a receipt.",
            },
            {
                feature: "website",
                pain: "“My price list is a photo on Instagram, and it's always out of date.”",
                title: "A site with your services and prices",
                shot: "l-site",
                body: "Your site lists each service with how long it takes and its price, read from the same list clients book from, so a new price shows without touching the page. Your opening hours and how to reach you are read the same way.",
            },
        ],
        pricing: {
            title: "Pricing for salons",
        },
        faq: "salons-choose-stylist",
        closer: "Know tomorrow's bookings before you open.",
    },
    gyms: {
        slug: "gyms",
        phrase: "gym and yoga studio management software",
        seoTitle: "Gym and yoga studio management software",
        seoDescription:
            "Gym and yoga studio management software: class bookings with places, courses and numbered invoices, for coaches too.",
        name: "Gyms & studios",
        navLine: "Classes, courses and members",
        longName: "Gyms and studios",
        card: {
            name: "Gyms, studios and coaches",
            body: "Classes with places, courses, and a booking page on your site.",
            day: "Start: see today's classes and who's booked.",
            uses: "Bookings · Customers · Billing · Website",
            link: "See Saroh for gyms",
        },
        headline: "Classes, members and courses, without the paper diary.",
        sub: "Gym and yoga studio management software, for dance studios, coaches and personal trainers too. Members book on your site, and each class shows its places left.",
        hero: {
            shot: "g-site",
        },
        heroNote: "Shown with Ironvale Fitness, a demo gym.",
        changeTitle:
            "The problems every studio knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I find out someone hasn't paid when they're already on the mat.”",
                title: "See who owes, and today's sessions, first thing",
                body: "Overdue invoices and today's sessions with who's booked.",
                shot: "g-home",
            },
            {
                feature: "bookings",
                label: "Bookings · Your booking page",
                pain: "“Half my evening goes on messages, finding people a time.”",
                title: "Members book themselves, into real free times",
                body: "Your booking page shows only the times you're free.",
                shot: "g-book",
            },
            {
                feature: "bookings",
                label: "Bookings · Your week",
                pain: "“I never know how full the 7am class is until people turn up.”",
                title: "Your week, by the hour",
                body: "Personal training and classes side by side. Open a class to see places left.",
                shot: "g-bookings",
            },
            {
                feature: "bookings",
                label: "Bookings · Classes and courses",
                pain: "“Tracking who's on which course is a notebook of tally marks.”",
                title: "Classes and courses",
                body: "Set how many places a class has. Courses run for several weeks: enrol people and see who's paid.",
                shot: "g-courses",
            },
            {
                feature: "customers",
                pain: "“A member tells me about her knee, and next week I've forgotten.”",
                title: "Every member on one page",
                body: "Their next booking, the classes they've been to and your notes, on one page.",
                shot: "g-customer",
            },
            {
                feature: "billing",
                pain: "“I can't tell who's paid for what.”",
                title: "See what's paid and what's overdue",
                body: "Write a numbered invoice in your currency, and record what's paid. Overdue ones are listed.",
                shot: "g-billing",
            },
        ],
        pricing: {
            title: "Pricing for gyms and studios",
        },
        faq: "gyms-pack-and-membership",
        closer: "Fill tomorrow's 7am class.",
    },
    clinics: {
        slug: "clinics",
        phrase: "clinic appointment and patient booking software",
        seoTitle: "Clinic appointment and patient booking software",
        seoDescription:
            "Clinic appointment and patient booking software: online booking, treatments over several visits and medical notes kept to you.",
        name: "Clinics",
        navLine: "Appointments, treatments and patient notes",
        longName: "Clinics",
        card: {
            name: "Clinics and practitioners",
            body: "Appointments, treatments over several visits, patient notes kept to you.",
            day: "Start: check today's patients and their flags before the first one arrives.",
            uses: "Bookings · Patients · Billing · Website",
            link: "See Saroh for clinics",
        },
        headline: "Appointments, treatments and patient notes, kept straight.",
        sub: "Clinic appointment and patient booking software for dental, physio, skin and dietician practices. Patients book online and tell you what you need to know, treatments run over several visits, and medical notes stay with you.",
        hero: {
            shot: "d-site",
        },
        heroNote: "Shown with Wrenfield Dental, a demo clinic.",
        changeTitle:
            "The problems every clinic knows, and what Saroh does about each.",
        segments: [
            {
                feature: "dashboard",
                pain: "“I learn about a patient's blood thinners when they're already in the chair.”",
                title: "Today's patients, with their flags",
                body: "Who's coming, and anything you must check first, before the first patient arrives.",
                shot: "d-home",
            },
            {
                feature: "bookings",
                pain: "“The phone rings all morning with people asking for a time.”",
                title: "Patients book themselves, and tell you what matters",
                body: "Only real free times are shown. Patients choose the clinic or a video call, and answer “Anything we should know?”.",
                shot: "d-book",
            },
            {
                feature: "orders",
                pain: "“A course of treatment is three visits, and I lose track of which one they're on.”",
                title: "Treatments tracked visit by visit",
                body: "One treatment, all its visits: what's done, what's today and what's still to book.",
                shot: "d-order",
            },
            {
                feature: "customers",
                label: "Customers · Patient notes",
                pain: "“Notes from the phone end up on a sticky note.”",
                title: "Notes reach the patient's record",
                body: "What a patient writes when booking is matched to them. Label it, mark it sensitive, and you see it when you open the booking.",
                shot: "d-customer",
            },
            {
                feature: "customers",
                label: "Customers · Medical notes",
                pain: "“A patient's medical history sits in a folder anyone could open.”",
                title: "Medical notes kept to you",
                body: "Allergies and access needs show on a patient's bookings and today's list. Medical notes only show to you.",
                shot: "d-customers",
            },
            {
                feature: "billing",
                pain: "“Every invoice is a new document, and the numbers get out of order.”",
                title: "Numbered invoices for your treatments",
                body: "Write an invoice in your currency, numbered in order. Add your own tax line if you charge one, and leave it off if you don't. What's overdue is listed.",
                shot: "d-billing",
            },
        ],
        pricing: {
            title: "Pricing for clinics",
        },
        faq: "clinics-medical-notes",
        closer: "Know every patient before they sit down.",
    },
};

/** The solutions in the menu's order. */
export const solutionList: Solution[] = SOLUTION_SLUGS.map((s) => solutions[s]);

export const solutionHref = (slug: SolutionSlug) => `/solutions/${slug}`;
