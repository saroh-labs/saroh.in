import type { TradePage } from "./types";

/**
 * Trades that go to the customer's home. Saroh books the visit, keeps the
 * customer and writes the invoice. It doesn't price a job before it's done,
 * so no page here says it does.
 */
export const HOME_SERVICES: TradePage[] = [
    {
        slug: "plumbers",
        name: "Plumbers",
        bar: "Plumber",
        longName: "Plumbers",
        group: "home",
        way: "appointments",
        at: "07:30",
        moment: "A leaking tap at 8, a boiler service at 10, and yesterday's invoice still open.",
        searchWords: "plumber plumbing heating boiler gas engineer leak",
        phrase: "plumber booking and invoicing software",
        seoTitle: "Plumber booking and invoicing software",
        seoDescription:
            "Plumber booking and invoicing software: customers book a visit, every job's address and notes on file, and invoices with labour and parts.",
        headline: "Every call-out booked, every job invoiced.",
        sub: "Plumber booking and invoicing software for plumbers and heating engineers who work alone. Customers book a visit on your site, each home's address and boiler notes are on file, and the invoice with labour and parts is written before you leave.",
        home: {
            label: "A plumber's Home in Saroh at 7:15 am, an example: a follow-up from a website enquiry, an overdue invoice and today's visits",
            clock: "7:15",
            place: "Plumbing · Tuesday",
            needs: [
                {
                    icon: "doc",
                    title: "Overdue from Mr and Mrs Patel",
                    line: "Invoice 0158 · new radiator",
                    warn: true,
                },
                {
                    icon: "customer",
                    title: "Follow up with Kate D.",
                    line: "Asked through your site about a new shower",
                },
            ],
            today: [
                { at: "08:00", line: "Leaking tap · 14 Elm Road" },
                { at: "10:00", line: "Boiler service · Rosa M." },
                { at: "14:00", line: "Radiator valves · Tom H." },
            ],
        },
        changeTitle:
            "The problems every plumber knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“I'm under a sink when the phone rings with the next job.”",
                title: "Customers book a visit while you work",
                body: "Your booking page shows only your free times, at the length each job takes. Set a break after each visit for driving between homes.",
            },
            {
                feature: "customers",
                pain: "“I go back to a house and can't remember what boiler they have.”",
                title: "Every home's details on file",
                body: "The address, the boiler, where the stopcock is and every past visit, on the customer's page.",
            },
            {
                feature: "billing",
                pain: "“I write the invoice on a Sunday night from memory.”",
                title: "Labour and parts on one invoice",
                body: "Write a numbered invoice with a line for the hours and one for each part, in your currency, with your own tax line. Record what's paid on the doorstep.",
            },
            {
                feature: "website",
                pain: "“People find me on the van, then can't find a way to reach me.”",
                title: "A site that brings in the work",
                body: "Your site shows what you do and where, with a booking page. A form adds each enquiry to your contacts as a lead.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Call-out", detail: "60 min" },
                { name: "Boiler service", detail: "90 min" },
                { name: "Tap or toilet repair", detail: "60 min" },
                { name: "Survey for a new bathroom", detail: "45 min" },
            ],
        },
        faq: [
            {
                q: "Can I put parts on an invoice?",
                a: "Yes. Write a line for each part and one for the labour, then add your own tax line if you charge one.",
            },
            {
                q: "Can I keep notes about a customer's home?",
                a: "Yes. Write them on the customer's page: the boiler, the access, the dog. They're there next time you visit.",
            },
        ],
        closer: "Know tomorrow's jobs before you load the van.",
        related: ["electricians", "contractors", "landscapers"],
        templates: "plumber",
    },
    {
        slug: "electricians",
        name: "Electricians",
        bar: "Electrician",
        longName: "Electricians",
        group: "home",
        way: "appointments",
        at: "08:00",
        moment: "A fuse box check at 8, sockets at 11, and a rewire to invoice by evening.",
        searchWords:
            "electrician electrical contractor sparky rewiring lighting",
        phrase: "electrician booking and invoicing software",
        seoTitle: "Electrician booking and invoicing software",
        seoDescription:
            "Electrician booking and invoicing software: visits booked online, notes on each property's wiring and invoices with labour and materials.",
        headline: "Jobs booked, properties remembered, invoices done.",
        sub: "Electrician booking and invoicing software for electricians who run their own jobs. Customers book an inspection or a repair into your free times, every property's notes are kept, and each job's invoice lists the labour and the materials.",
        home: {
            label: "An electrician's Home in Saroh at 7:30 am, an example: an overdue invoice for a rewire, a website enquiry to follow up and today's jobs",
            clock: "7:32",
            place: "Electrical · Tuesday",
            needs: [
                {
                    icon: "doc",
                    title: "Overdue from Lena F.",
                    line: "Invoice 0094 · kitchen rewire, stage 2",
                    warn: true,
                },
                {
                    icon: "customer",
                    title: "Follow up with Adam S.",
                    line: "Asked about an EV charger",
                },
            ],
            today: [
                { at: "08:00", line: "Inspection · 3 Mill Lane" },
                { at: "11:00", line: "Extra sockets · Priti B." },
                { at: "14:30", line: "Outside lights · Joe K." },
            ],
        },
        changeTitle:
            "The problems every electrician knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Customers call while I'm up a ladder with the power off.”",
                title: "Customers book into your free times",
                body: "An inspection, a repair and a fitting each have their own length. Your booking page shows only the times that fit.",
            },
            {
                feature: "customers",
                pain: "“I go back to a house and have to trace the circuits all over again.”",
                title: "Notes on every property",
                body: "What you found, what you fitted and when, on the customer's page with every past visit.",
            },
            {
                feature: "billing",
                pain: "“A rewire is paid in stages, and I lose track of which stage is paid.”",
                title: "An invoice for each stage",
                body: "Write a numbered invoice for each stage of the job, with labour and materials. Record what's paid, and Home lists what's overdue.",
            },
            {
                feature: "insights",
                pain: "“I don't know if the website brings in any work.”",
                title: "See where the work comes from",
                body: "Insights counts your site's visits and enquiries beside your paid bookings, week by week.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Electrical inspection", detail: "2 hr" },
                { name: "Fault finding", detail: "60 min" },
                { name: "Extra socket", detail: "60 min" },
                { name: "Light fitting", detail: "45 min" },
            ],
        },
        faq: [
            {
                q: "Can I invoice a big job in stages?",
                a: "Yes. Write a numbered invoice for each stage, and record each payment as it comes.",
            },
            {
                q: "Can I add materials to an invoice?",
                a: "Yes. Write a line for each item and one for the labour, with your own tax line if you charge one.",
            },
        ],
        closer: "Know every job's address before the first coffee.",
        related: ["plumbers", "contractors", "cleaners"],
        templates: "electrician",
    },
    {
        slug: "contractors",
        name: "Contractors",
        bar: "Contractor",
        longName: "Contractors",
        group: "home",
        way: "appointments",
        at: "07:00",
        moment: "A site visit at 7 for a new kitchen, and stage two is due today.",
        searchWords:
            "contractor builder renovation handyman carpenter decorator",
        phrase: "contractor invoicing software",
        seoTitle: "Contractor invoicing software for small builders",
        seoDescription:
            "Contractor invoicing software for builders and handymen: site visits booked, every client's job notes kept, and an invoice for each stage.",
        headline: "Site visits, stage invoices and every client's job.",
        sub: "Contractor invoicing software for small builders, carpenters, decorators and handymen. Clients book a site visit into your free times, each job's notes sit on the client's page, and every stage gets a numbered invoice.",
        home: {
            label: "A contractor's Home in Saroh at 6:45 am, an example: a stage invoice overdue, a follow-up from the website and today's site visits",
            clock: "6:45",
            place: "Building work · Tuesday",
            needs: [
                {
                    icon: "doc",
                    title: "Overdue from the Novak family",
                    line: "Invoice 0061 · kitchen, stage 1",
                    warn: true,
                },
                {
                    icon: "customer",
                    title: "Follow up with Owen G.",
                    line: "Asked about a loft conversion",
                },
            ],
            today: [
                { at: "07:00", line: "Site visit · new kitchen, Sara T." },
                { at: "09:00", line: "Novak kitchen · day 6" },
                { at: "16:00", line: "Site visit · fence, Ray D." },
            ],
        },
        changeTitle:
            "The problems every contractor knows, and what Saroh does about each.",
        problems: [
            {
                feature: "billing",
                pain: "“The job is paid in three stages, and I forget to ask for the second.”",
                title: "A numbered invoice for each stage",
                body: "Write an invoice for each stage, with labour and materials, in your currency. Record what's paid, and Home lists what's overdue.",
            },
            {
                feature: "bookings",
                pain: "“I lose evenings arranging site visits by phone.”",
                title: "Clients book a site visit themselves",
                body: "Your booking page offers site visits in your free times. Set a break after each for travel.",
            },
            {
                feature: "customers",
                pain: "“The measurements are on a scrap of paper in the van.”",
                title: "Every job's notes on the client's page",
                body: "Measurements, what they chose, the access and every visit, on one page.",
            },
            {
                feature: "website",
                pain: "“People want to see work I've done before they call.”",
                title: "Your finished work on your own site",
                body: "A page of your projects with photos, and a form that brings each enquiry into your contacts to follow up.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Site visit", detail: "45 min" },
                { name: "Day rate", detail: "8 hr" },
                { name: "Half-day rate", detail: "4 hr" },
                { name: "Small repair", detail: "2 hr" },
            ],
        },
        faq: [
            {
                q: "Can I invoice a job in stages?",
                a: "Yes. Write a numbered invoice for each stage, and record each payment when it lands.",
            },
            {
                q: "Can I run a crew in Saroh?",
                a: "Not today. Saroh is for one person running their business, with one sign-in and one calendar.",
            },
        ],
        closer: "Send every stage's invoice the day it's done.",
        related: ["plumbers", "electricians", "landscapers"],
        templates: "contractor",
    },
    {
        slug: "cleaners",
        name: "Cleaners",
        bar: "Cleaner",
        longName: "Cleaners",
        group: "home",
        way: "appointments",
        at: "08:30",
        moment: "Three homes today, and the key for the second is under the pot.",
        searchWords: "cleaner cleaning service house cleaning domestic cleaner",
        phrase: "cleaning booking software",
        seoTitle: "Cleaning booking software for home cleaners",
        seoDescription:
            "Cleaning booking software for home and office cleaners: customers book a clean, each home's access notes on file, and a monthly invoice.",
        headline: "Every clean booked, every key remembered.",
        sub: "Cleaning booking software for home and office cleaners. Customers book a regular or a one-off clean into your free times, how to get in and what to leave alone is noted for each home, and each customer gets one invoice a month.",
        home: {
            label: "A cleaner's Home in Saroh at 8 am, an example: an overdue monthly invoice, a note from a customer and today's three homes",
            clock: "8:02",
            place: "Home cleaning · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Claire N. left a note when booking",
                    line: "11:30 · “skip the study this week”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Dr Hughes",
                    line: "Invoice 0115 · October cleans",
                    warn: true,
                },
            ],
            today: [
                { at: "08:30", line: "Regular clean · Jenny W., 3 hr" },
                { at: "11:30", line: "Regular clean · Claire N., 2 hr" },
                { at: "15:00", line: "End of tenancy · Flat 4B, 4 hr" },
            ],
        },
        changeTitle:
            "The problems every cleaner knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“New customers want a time, and I'm cleaning when they call.”",
                title: "Customers book a clean in your free times",
                body: "A regular clean, a deep clean and an end of tenancy each take their own time. Set a break after each for travel.",
            },
            {
                feature: "customers",
                pain: "“Where's the key, what's the alarm code, which room do I skip?”",
                title: "Each home's notes, in one place",
                body: "How to get in, the pets, what not to touch and every past clean, on the customer's page. Mark the alarm code sensitive.",
            },
            {
                feature: "billing",
                pain: "“I invoice twenty homes at the end of every month.”",
                title: "One invoice a month for each customer",
                body: "Write a numbered invoice for the month's cleans, in your currency. Record what's paid, and Home lists what's overdue.",
            },
            {
                feature: "bookings",
                label: "Bookings · Who came",
                pain: "“I turn up and nobody's in to open the door.”",
                title: "Count the wasted trips",
                body: "Mark a clean that couldn't happen as a no-show. It's counted on the customer's page.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Regular clean", detail: "2 hr" },
                { name: "Deep clean", detail: "5 hr" },
                { name: "End of tenancy", detail: "4 hr" },
                { name: "Office clean", detail: "3 hr" },
            ],
        },
        faq: [
            {
                q: "Can I keep a customer's key and alarm notes safe?",
                a: "Yes. Write them on the customer's page and mark the note sensitive.",
            },
            {
                q: "Can I bill a customer once a month?",
                a: "Yes. Write one numbered invoice for the month's cleans and record the payment when it comes.",
            },
        ],
        closer: "Know every door you'll open tomorrow.",
        related: ["landscapers", "plumbers", "event-planners"],
        templates: "cleaner",
    },
    {
        slug: "landscapers",
        name: "Landscapers",
        bar: "Landscaper",
        longName: "Landscapers",
        group: "home",
        way: "appointments",
        at: "08:00",
        moment: "A lawn cut at 8, a hedge at 10, and a garden design visit after lunch.",
        searchWords:
            "landscaper gardener garden maintenance lawn care tree surgeon",
        phrase: "landscaping booking software",
        seoTitle: "Landscaping booking software for gardeners",
        seoDescription:
            "Landscaping booking software for gardeners and landscapers: visits booked, each garden's notes kept, and an invoice per job or per month.",
        headline: "Every garden on the round, every visit invoiced.",
        sub: "Landscaping booking software for gardeners and landscapers. Customers book a garden visit into your free times, each garden's notes and past visits are on file, and maintenance is invoiced by the month.",
        home: {
            label: "A gardener's Home in Saroh at 7:30 am, an example: an overdue invoice, a website enquiry about a new patio and today's gardens",
            clock: "7:31",
            place: "Garden care · Tuesday",
            needs: [
                {
                    icon: "doc",
                    title: "Overdue from Mrs Fenwick",
                    line: "Invoice 0076 · October maintenance",
                    warn: true,
                },
                {
                    icon: "customer",
                    title: "Follow up with Raj M.",
                    line: "Asked through your site about a patio",
                },
            ],
            today: [
                { at: "08:00", line: "Lawn and edges · The Oaks" },
                { at: "10:00", line: "Hedge cutting · Paul A." },
                { at: "13:30", line: "Design visit · Hilda S." },
            ],
        },
        changeTitle:
            "The problems every landscaper knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Spring arrives and the phone doesn't stop.”",
                title: "Customers book a visit themselves",
                body: "A lawn cut, a hedge and a design visit each have their own length. Your booking page shows only your free times.",
            },
            {
                feature: "customers",
                pain: "“Which bed has the bulbs, and where does the gate key live?”",
                title: "Every garden's notes on file",
                body: "What's planted, the access, the green waste and every past visit, on the customer's page.",
            },
            {
                feature: "billing",
                pain: "“Monthly maintenance customers pay late, and I don't notice for weeks.”",
                title: "Monthly invoices, and what's overdue",
                body: "Write a numbered invoice for the month's visits. Record what's paid, and Home lists the overdue ones first thing.",
            },
            {
                feature: "website",
                pain: "“People want to see gardens I've done before they ask.”",
                title: "Your gardens on your own site",
                body: "A page of your projects with photos, your services, and a form that brings each enquiry into your contacts.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Lawn and edges", detail: "60 min" },
                { name: "Hedge cutting", detail: "2 hr" },
                { name: "Garden tidy", detail: "3 hr" },
                { name: "Design visit", detail: "60 min" },
            ],
        },
        faq: [
            {
                q: "Can I invoice maintenance by the month?",
                a: "Yes. Write one numbered invoice for the month's visits and record the payment when it arrives.",
            },
            {
                q: "Can I block out rainy days?",
                a: "Yes. Add time off or mark a day closed, and those times aren't offered.",
            },
        ],
        closer: "Know tomorrow's round before you hitch the trailer.",
        related: ["cleaners", "contractors", "plumbers"],
        templates: "landscaper",
    },
];
