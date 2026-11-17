import type { TradePage } from "./types";

/**
 * Creative and professional work, sold by the hour, the day or the project.
 * Saroh books the call or the shoot, keeps the client and writes the
 * invoice. It doesn't send a price for a client to agree before the work,
 * so no page here says it does.
 */
export const WORK: TradePage[] = [
    {
        slug: "photographers",
        name: "Photographers",
        bar: "Photographer",
        longName: "Photographers",
        group: "work",
        way: "appointments",
        at: "10:00",
        moment: "A family shoot at 10 in the park, and Saturday's wedding fully paid.",
        searchWords:
            "photographer photography wedding photographer portraits headshots",
        phrase: "photography booking software",
        seoTitle: "Photography booking software for photographers",
        seoDescription:
            "Photography booking software: clients book a shoot into your free dates, every shoot's details on file, and an invoice for each booking.",
        headline: "Shoots booked, clients remembered, every one invoiced.",
        sub: "Photography booking software for portrait, family, headshot and wedding photographers. Clients book a shoot into your free times, the details of each one are on their page, and the invoice is written the day you book it.",
        home: {
            label: "A photographer's Home in Saroh at 9 am, an example: a client's note about a shoot, an overdue wedding invoice and today's shoots",
            clock: "9:04",
            place: "Photography · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Nina O. left a note when booking",
                    line: "10:00 · “two kids, one dog, park by the lake”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Grace and Tom",
                    line: "Invoice 0052 · wedding, second half",
                    warn: true,
                },
            ],
            today: [
                { at: "10:00", line: "Family shoot · Nina O., 60 min" },
                { at: "13:00", line: "Headshots · Lark & Co., 2 hr" },
                { at: "17:30", line: "Wedding call · Ade and Jo" },
            ],
        },
        changeTitle:
            "The problems every photographer knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Two couples asked for the same Saturday in the same week.”",
                title: "One diary, and a date can't be taken twice",
                body: "A headshot, a family shoot and a wedding each have their own length. Your booking page shows only the times you're free.",
            },
            {
                feature: "customers",
                pain: "“I can't remember the names of the bride's parents for the group shots.”",
                title: "Every shoot's details on the client's page",
                body: "What they wrote when booking, your notes from the call and every past shoot, in one place.",
            },
            {
                feature: "billing",
                pain: "“A wedding is paid in two halves, and I chase the second one in a panic.”",
                title: "An invoice for each part, and what's still owed",
                body: "Write a numbered invoice for each half, in your currency. Record what's paid, and Home lists what's overdue.",
            },
            {
                feature: "website",
                pain: "“My portfolio lives on Instagram, and my prices live in my DMs.”",
                title: "Your portfolio and prices on your own site",
                body: "A gallery of your work, each shoot with its price and length, and a booking page with your free times.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Headshots", detail: "60 min" },
                { name: "Family shoot", detail: "90 min" },
                { name: "Wedding, full day", detail: "10 hr" },
                { name: "Planning call", detail: "30 min" },
            ],
        },
        faq: [
            {
                q: "Can a client book a wedding a year ahead?",
                a: "Yes. Book the date as soon as they're sure, and that time can't be taken again.",
            },
            {
                q: "Can I show my portfolio?",
                a: "Yes. Your site can have a gallery of your work beside your services and booking page.",
            },
        ],
        closer: "Fill next season's Saturdays.",
        related: ["makeup-artists", "event-planners", "graphic-designers"],
        templates: "photographer",
    },
    {
        slug: "graphic-designers",
        name: "Graphic designers",
        bar: "Designer",
        longName: "Graphic designers",
        group: "work",
        way: "appointments",
        at: "09:30",
        moment: "A first call at 9:30 for a café's new logo, and two invoices out.",
        searchWords:
            "graphic designer brand designer logo design illustrator freelance",
        phrase: "invoicing software for graphic designers",
        seoTitle: "Invoicing software for graphic designers",
        seoDescription:
            "Invoicing software for graphic designers: numbered invoices in your currency, clients and their projects in one place, and first calls booked online.",
        headline: "Calls booked, projects tracked, invoices paid.",
        sub: "Invoicing software for graphic designers who work for themselves. New clients book a first call into your free times, every client's projects and notes sit on one page, and each invoice is numbered and followed until it's paid.",
        home: {
            label: "A designer's Home in Saroh at 9 am, an example: an overdue invoice, a follow-up with a new client and today's calls",
            clock: "9:01",
            place: "Studio · Tuesday",
            needs: [
                {
                    icon: "doc",
                    title: "Overdue from Fern Studio",
                    line: "Invoice 0047 · 30 days",
                    warn: true,
                },
                {
                    icon: "customer",
                    title: "Follow up with Ben C.",
                    line: "Asked about a menu design",
                },
            ],
            today: [
                { at: "09:30", line: "First call · Hilltop Café" },
                { at: "14:00", line: "Review call · Fern Studio" },
            ],
        },
        changeTitle:
            "The problems every freelance designer knows, and what Saroh does about each.",
        problems: [
            {
                feature: "billing",
                pain: "“I make every invoice from last month's, and the numbers jump.”",
                title: "Invoices numbered in order",
                body: "Write an invoice in your currency, with your own tax line and number. Record what's paid, and the overdue ones are listed on Home.",
            },
            {
                feature: "bookings",
                pain: "“Finding a time for a first call takes six emails.”",
                title: "First calls book themselves",
                body: "Your booking page shows your free times for a video call. The client picks one, and it's in your diary.",
            },
            {
                feature: "customers",
                pain: "“The brief is in an email thread I can't find.”",
                title: "Every client's notes in one place",
                body: "What they wrote when booking, your notes from each call and every invoice, on the client's page.",
            },
            {
                feature: "website",
                pain: "“My portfolio site doesn't bring in any enquiries.”",
                title: "Your work, and a way to reach you",
                body: "Your portfolio as a gallery, your services, and a booking page for first calls, on a site you change yourself.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "First call", detail: "30 min, video" },
                { name: "Logo design", detail: "By the project" },
                { name: "Design day", detail: "8 hr" },
                { name: "Review call", detail: "45 min, video" },
            ],
        },
        faq: [
            {
                q: "Can I invoice by the hour or by the project?",
                a: "Both. Write the lines your way: hours at a rate, or one line for the project.",
            },
            {
                q: "Can clients book a call with me?",
                a: "Yes. Set a call as a video service and clients book into your free times.",
            },
        ],
        closer: "Send this month's invoices before lunch.",
        related: ["web-developers", "photographers", "consultants"],
        templates: "graphic-designer",
    },
    {
        slug: "web-developers",
        name: "Web developers",
        bar: "Developer",
        longName: "Web developers",
        group: "work",
        way: "appointments",
        at: "11:00",
        moment: "A scoping call at 11, and the monthly hosting invoices to send.",
        searchWords: "web developer freelance developer web designer wordpress",
        phrase: "invoicing software for web developers",
        seoTitle: "Invoicing software for web developers",
        seoDescription:
            "Invoicing software for freelance web developers: numbered invoices for each stage and each month, clients in one place, and calls booked.",
        headline: "Every stage and every month, invoiced on time.",
        sub: "Invoicing software for web developers who freelance. Each stage of a build and each month of care gets a numbered invoice, every client's notes sit on one page, and new clients book a scoping call into your free times.",
        home: {
            label: "A web developer's Home in Saroh at 10:30 am, an example: two overdue invoices and today's calls",
            clock: "10:30",
            place: "Freelance development · Tuesday",
            needs: [
                {
                    icon: "doc",
                    title: "Overdue from Bright Path Ltd",
                    line: "Invoice 0133 · build, stage 2",
                    warn: true,
                },
                {
                    icon: "doc",
                    title: "Overdue from Mora Café",
                    line: "Invoice 0129 · October care",
                },
            ],
            today: [
                { at: "11:00", line: "Scoping call · Juno Yoga" },
                { at: "15:00", line: "Handover call · Bright Path" },
            ],
        },
        changeTitle:
            "The problems every freelance developer knows, and what Saroh does about each.",
        problems: [
            {
                feature: "billing",
                pain: "“I forget to invoice the monthly care plans until a client asks.”",
                title: "Every month's invoice, numbered",
                body: "Write a numbered invoice for each client's month of care, or for each stage of a build. Home lists what's overdue.",
            },
            {
                feature: "bookings",
                pain: "“New leads want a call, and I'm deep in someone else's code.”",
                title: "Scoping calls book themselves",
                body: "Your booking page shows your free times for a video call, so the call is booked while you work.",
            },
            {
                feature: "customers",
                pain: "“The client's brief is in a chat from two years ago.”",
                title: "Each client's notes in one place",
                body: "Their projects, your notes and every invoice, on the client's page.",
            },
            {
                feature: "website",
                pain: "“Clients find me by word of mouth and can't see what I've built.”",
                title: "Your work, and a way to book you",
                body: "A page of your projects, a booking page for scoping calls, and a form that brings each enquiry into your contacts.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Scoping call", detail: "45 min, video" },
                { name: "Development day", detail: "8 hr" },
                { name: "Website care", detail: "Monthly" },
                { name: "Support hour", detail: "60 min" },
            ],
        },
        faq: [
            {
                q: "Can I invoice the same clients every month?",
                a: "Yes. Write each month's numbered invoice and record the payment when it lands.",
            },
            {
                q: "Can I bring my client list with me?",
                a: "Yes. Import your customers from a CSV. You can export your data any time, one CSV per table.",
            },
        ],
        closer: "Invoice the whole month in one sitting.",
        related: ["graphic-designers", "consultants", "photographers"],
        templates: "web-developer",
    },
    {
        slug: "consultants",
        name: "Consultants",
        bar: "Consultant",
        longName: "Consultants",
        group: "work",
        way: "appointments",
        at: "09:00",
        moment: "Two client calls before lunch, and last month's hours to invoice.",
        searchWords:
            "consultant coach business coach advisor freelance consultant",
        phrase: "booking and invoicing software for consultants",
        seoTitle: "Booking and invoicing software for consultants",
        seoDescription:
            "Booking and invoicing software for consultants and coaches: clients book calls in your free times, notes from every session, invoices by the hour.",
        headline: "Calls booked, hours invoiced, notes kept.",
        sub: "Booking and invoicing software for consultants and coaches who work alone. Clients book a call or a session into your free times, your notes from each one are on their page, and the month's hours become one numbered invoice.",
        home: {
            label: "A consultant's Home in Saroh at 8:45 am, an example: an overdue invoice, a client's note before a call and today's sessions",
            clock: "8:45",
            place: "Consulting · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Amir H. left a note when booking",
                    line: "10:00 · “board meeting moved, need the plan”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Northgate Ltd",
                    line: "Invoice 0021 · October, 12 hours",
                    warn: true,
                },
            ],
            today: [
                { at: "10:00", line: "Strategy call · Amir H., video" },
                { at: "11:30", line: "Coaching · Lisa P., 60 min" },
                { at: "16:00", line: "Discovery call · new client" },
            ],
        },
        changeTitle:
            "The problems every consultant knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Scheduling a call takes longer than the call.”",
                title: "Clients book their own calls",
                body: "Your booking page shows your free times, in person or by video. A first call and a full session each have their own length.",
            },
            {
                feature: "customers",
                pain: "“I go into each call trying to remember where we left it.”",
                title: "Your notes from every session",
                body: "What they wrote when booking, your notes from each call and every invoice, on the client's page.",
            },
            {
                feature: "billing",
                pain: "“Adding up last month's hours takes an afternoon.”",
                title: "The month's hours on one invoice",
                body: "Write a numbered invoice with the hours at your rate, in your currency, with your own tax line. Home lists what's overdue.",
            },
            {
                feature: "website",
                pain: "“People find me on LinkedIn and then have no way to book.”",
                title: "A site with a way to book you",
                body: "What you do, who you help and a booking page with your free times, on your own site.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Discovery call", detail: "30 min, video" },
                { name: "Strategy session", detail: "90 min" },
                { name: "Coaching session", detail: "60 min" },
                { name: "Workshop day", detail: "6 hr" },
            ],
        },
        faq: [
            {
                q: "Can I invoice by the hour?",
                a: "Yes. Write a line for the hours at your rate, then add your own tax line if you charge one.",
            },
            {
                q: "Can clients choose a call or a meeting?",
                a: "Yes. Set a session as in person, by video or either, and the client chooses when they book.",
            },
        ],
        closer: "Start the month with last month invoiced.",
        related: ["web-developers", "graphic-designers", "counsellors"],
        templates: "consultant",
    },
    {
        slug: "event-planners",
        name: "Event planners",
        bar: "Event planner",
        longName: "Event planners",
        group: "work",
        way: "appointments",
        at: "14:00",
        moment: "A venue visit at 2 with a couple, and their second invoice to write.",
        searchWords:
            "event planner wedding planner party planner events organiser",
        phrase: "event planner software",
        seoTitle: "Event planner software for weddings and parties",
        seoDescription:
            "Event planner software: planning meetings booked online, every client's event notes in one place, and an invoice for each stage of the planning.",
        headline: "Every event's notes, meetings and invoices together.",
        sub: "Event planner software for wedding, party and corporate planners. Couples and clients book a planning meeting into your free times, every detail of their event sits on one page, and each stage of the planning gets its numbered invoice.",
        home: {
            label: "An event planner's Home in Saroh at 9:30 am, an example: a couple's note before a venue visit, an overdue invoice and today's meetings",
            clock: "9:30",
            place: "Event planning · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Sophie and Max left a note",
                    line: "14:00 · “guest list now 120”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Halden & Co.",
                    line: "Invoice 0035 · summer party, stage 2",
                    warn: true,
                },
            ],
            today: [
                { at: "11:00", line: "Planning call · Halden & Co." },
                { at: "14:00", line: "Venue visit · Sophie and Max" },
                { at: "17:30", line: "First meeting · Dee's 40th" },
            ],
        },
        changeTitle:
            "The problems every event planner knows, and what Saroh does about each.",
        problems: [
            {
                feature: "customers",
                pain: "“The guest count, the menu and the colours are in three different chats.”",
                title: "Every event's details on one page",
                body: "What they wrote when booking, your notes from each meeting and every invoice, on the client's page.",
            },
            {
                feature: "bookings",
                pain: "“Finding a time for a couple to meet takes a week of messages.”",
                title: "Planning meetings book themselves",
                body: "Your booking page shows your free times, in person or on a call. A first meeting and a venue visit each have their own length.",
            },
            {
                feature: "billing",
                pain: "“A wedding is paid in stages over a year, and I lose track.”",
                title: "An invoice for each stage",
                body: "Write a numbered invoice for each stage of the planning, in your currency. Record each payment, and Home lists what's overdue.",
            },
            {
                feature: "website",
                pain: "“Couples want to see events I've run before they get in touch.”",
                title: "Your events on your own site",
                body: "A gallery of events you've planned, what you offer, and a form that brings each enquiry into your contacts.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "First meeting", detail: "60 min" },
                { name: "Planning call", detail: "45 min, video" },
                { name: "Venue visit", detail: "2 hr" },
                { name: "On-the-day coordination", detail: "10 hr" },
            ],
        },
        faq: [
            {
                q: "Can I invoice an event in stages?",
                a: "Yes. Write a numbered invoice for each stage, and record each payment when it arrives.",
            },
            {
                q: "Can I keep every detail of an event in one place?",
                a: "Yes. The client's page holds your notes, their bookings and every invoice together.",
            },
        ],
        closer: "Walk into every meeting knowing the whole event.",
        related: ["photographers", "makeup-artists", "florists"],
        templates: "event-planner",
    },
];
