import type { TradePage } from "./types";

/** Beauty beyond the lead "salons" page, each one person's diary (DEC-203). */
export const BEAUTY: TradePage[] = [
    {
        slug: "barbers",
        name: "Barbers",
        bar: "Barber",
        longName: "Barbers",
        group: "beauty",
        way: "appointments",
        at: "09:00",
        moment: "Saturday is full by Thursday, and a walk-in goes in at 2.",
        searchWords: "barber barbershop haircut fade beard trim men's hair",
        phrase: "barber booking software",
        seoTitle: "Barber booking software for regulars and walk-ins",
        seoDescription:
            "Barber booking software: regulars book their own chair, walk-ins go in the same diary, and you remember how every regular likes it.",
        headline: "Regulars book the chair, walk-ins fit around them.",
        sub: "Barber booking software for barbershops run from one chair. Regulars book a free time on your site, walk-ins go in the same diary at the counter, and every cut, beard and fade has its own length.",
        home: {
            label: "A barber's Home in Saroh at 8:50 am, an example: a regular's note before his cut, and today's bookings from 9",
            clock: "8:50",
            place: "Barbershop · Saturday list",
            needs: [
                {
                    icon: "customer",
                    title: "Sam T. left a note when booking",
                    line: "10:30 · Skin fade · “growing the top out”",
                },
            ],
            today: [
                { at: "09:00", line: "Dan O. · Haircut, 30 min" },
                { at: "09:30", line: "Luis M. · Cut and beard, 45 min" },
                { at: "10:30", line: "Sam T. · Skin fade, 40 min" },
            ],
        },
        changeTitle:
            "The problems every barber knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · Your booking page",
                pain: "“I'm cutting hair with one hand and answering messages with the other.”",
                title: "Regulars book their own chair",
                body: "Your booking page shows only the times you're free. A regular picks the cut and the time, and it's in your diary.",
            },
            {
                feature: "bookings",
                label: "Bookings · Walk-ins",
                pain: "“A walk-in sits down just before someone's booking.”",
                title: "Walk-ins go in the same diary",
                body: "Book a walk-in at the counter in a moment. That time is taken, so nobody books over it.",
            },
            {
                feature: "customers",
                pain: "“I can't remember if he's a number two or a three.”",
                title: "Remember how every regular likes it",
                body: "His visits, what he's spent and your notes on one page: the guard, the beard shape, the last time he came.",
            },
            {
                feature: "bookings",
                label: "Bookings · Who came",
                pain: "“The same guy books Saturday at 11 and doesn't turn up.”",
                title: "See who keeps not coming",
                body: "Mark who came and who didn't. No-shows are counted on the customer's page.",
            },
            {
                feature: "website",
                pain: "“People DM me to ask what a fade costs.”",
                title: "Your prices on your own site",
                body: "Your site lists each cut with its length and price, from the same list regulars book from.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Haircut", detail: "30 min" },
                { name: "Skin fade", detail: "40 min" },
                { name: "Beard trim and shape", detail: "20 min" },
                { name: "Cut and beard", detail: "45 min" },
            ],
        },
        faq: [
            {
                q: "Can I add a walk-in at the counter?",
                a: "Yes. Book them in at the counter with the service and the time, and nobody can book that time online.",
            },
            {
                q: "Can I leave a few minutes between cuts?",
                a: "Yes. Set the break after each service, and only the times that fit are offered.",
            },
        ],
        closer: "Know who's in the chair tomorrow before you open.",
        related: ["salons", "tattoo-studios", "spas"],
    },
    {
        slug: "nail-studios",
        name: "Nail studios",
        bar: "Nail studio",
        longName: "Nail technicians",
        group: "beauty",
        way: "appointments",
        at: "10:00",
        moment: "A gel infill is booked for 10, and her allergy is on the list.",
        searchWords: "nails nail salon nail tech manicure pedicure gel acrylic",
        phrase: "nail salon booking software",
        seoTitle: "Nail salon booking software for nail techs",
        seoDescription:
            "Nail salon booking software: clients book a real free time for each set, infill or removal, with allergies and their last colour on file.",
        headline: "Each set, infill and removal at its own length.",
        sub: "Nail salon booking software for nail techs and small studios. A full set, an infill and a removal each take their own time, so clients only see the times that fit, and their last colour is on their page.",
        home: {
            label: "A nail tech's Home in Saroh at 9:40 am, an example: a client's acrylic allergy before her infill, and today's bookings",
            clock: "9:40",
            place: "Nail studio · Tuesday",
            needs: [
                {
                    icon: "warn",
                    title: "Allergy: acrylic monomer",
                    line: "Jade P. · 10:00 · Gel infill",
                    warn: true,
                },
                {
                    icon: "doc",
                    title: "Overdue from Ivy & Co. bridal",
                    line: "Invoice 0031 · 7 days",
                },
            ],
            today: [
                { at: "10:00", line: "Jade P. · Gel infill, 75 min" },
                { at: "12:00", line: "Rosa K. · Removal and manicure" },
                { at: "14:30", line: "Mei L. · Full set, 2 hr" },
            ],
        },
        changeTitle:
            "The problems every nail studio knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Someone books an hour for a full set that takes two.”",
                title: "Each treatment takes its real time",
                body: "Set how long a full set, an infill and a removal take, and the break after. Clients only see the times that fit.",
            },
            {
                feature: "customers",
                pain: "“She reacted to the acrylic last time, and I only remembered halfway through.”",
                title: "Allergies where you'll see them",
                body: "Note it on the client once. It shows on their bookings and on today's list.",
            },
            {
                feature: "customers",
                label: "Customers · Your notes",
                pain: "“She wants the same colour as last time, and I can't find the photo.”",
                title: "Her last colour, on her page",
                body: "Her visits, what she's spent and your notes on one page: the shade, the shape, the length.",
            },
            {
                feature: "bookings",
                label: "Bookings · Who came",
                pain: "“A two-hour booking that doesn't turn up is my whole afternoon.”",
                title: "See who keeps not coming",
                body: "Mark who came and who didn't. No-shows are counted on the client's page, so you know before you take the next booking.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Gel manicure", detail: "45 min" },
                { name: "Full set, acrylic", detail: "2 hr" },
                { name: "Infill", detail: "75 min" },
                { name: "Removal", detail: "30 min" },
            ],
        },
        faq: [
            {
                q: "Can clients tell me about allergies when they book?",
                a: "Yes. They answer “Anything we should know?” when they book, and you add it to their record where you'll see it next time.",
            },
            {
                q: "Can I close the books on my day off?",
                a: "Yes. Set your hours, add time off and mark the days you're closed. Only open times are offered.",
            },
        ],
        closer: "Fill tomorrow with the right sets in the right times.",
        related: ["salons", "makeup-artists", "spas"],
    },
    {
        slug: "spas",
        name: "Spas",
        bar: "Spa",
        longName: "Spas",
        group: "beauty",
        way: "appointments",
        at: "11:00",
        moment: "A 90-minute massage at 11, and her note about her shoulder.",
        searchWords: "spa massage therapist facials day spa wellness",
        phrase: "spa booking software",
        seoTitle: "Spa booking software for massage and facials",
        seoDescription:
            "Spa booking software: massages and facials booked into real free times, health notes kept to you, and an invoice for every treatment.",
        headline: "Calm in the room, and in the diary.",
        sub: "Spa booking software for massage therapists and small day spas. Guests book a massage or a facial into a time that fits it, tell you about an injury or a pregnancy first, and you read it before they're on the table.",
        home: {
            label: "A spa's Home in Saroh at 10:30 am, an example: a guest's note about her shoulder before an 11 am massage, and today's bookings",
            clock: "10:31",
            place: "Day spa · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Anna B. left a note when booking",
                    line: "11:00 · Deep tissue · “sore left shoulder”",
                },
                {
                    icon: "warn",
                    title: "Pregnant, 24 weeks",
                    line: "Clare F. · 15:00 · Facial",
                    warn: true,
                },
            ],
            today: [
                { at: "11:00", line: "Anna B. · Deep tissue, 90 min" },
                { at: "13:30", line: "Tom W. · Hot stone, 60 min" },
                { at: "15:00", line: "Clare F. · Facial, 60 min" },
            ],
        },
        changeTitle:
            "The problems every spa knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“The phone rings during a massage, and I can't answer it.”",
                title: "Guests book while you work",
                body: "Your booking page shows each treatment with its length and only your free times. The booking is in your diary when you come out of the room.",
            },
            {
                feature: "customers",
                label: "Customers · Health notes",
                pain: "“I find out about the injury when they're already on the table.”",
                title: "Their note, read before they arrive",
                body: "Guests answer “Anything we should know?” when they book. Add it to their record, mark it sensitive, and it shows on today's list.",
            },
            {
                feature: "bookings",
                label: "Bookings · Your hours",
                pain: "“I need half an hour between guests to reset the room.”",
                title: "Time to reset the room",
                body: "Set the break after each treatment, and the next booking can't start until the room is ready.",
            },
            {
                feature: "billing",
                pain: "“A guest wants an invoice for their health insurer.”",
                title: "A numbered invoice when they ask",
                body: "Write an invoice in your currency, with your own number and tax line. Record the payment, and it becomes a receipt.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Swedish massage", detail: "60 min" },
                { name: "Deep tissue massage", detail: "90 min" },
                { name: "Hot stone massage", detail: "60 min" },
                { name: "Facial", detail: "60 min" },
            ],
        },
        faq: [
            {
                q: "Who can read a guest's health notes?",
                a: "You do. Mark a note sensitive and it stays on their record, with allergies and access needs shown on their bookings so you can take care.",
            },
            {
                q: "Can a guest book two treatments back to back?",
                a: "They book one, and you book the second straight after it from your diary.",
            },
        ],
        closer: "Know tomorrow's guests, and their notes, tonight.",
        related: ["salons", "nail-studios", "physiotherapists"],
    },
    {
        slug: "makeup-artists",
        name: "Makeup artists",
        bar: "Makeup artist",
        longName: "Makeup artists",
        group: "beauty",
        way: "appointments",
        at: "07:00",
        moment: "A bride at 7 am, and her trial notes are on her page.",
        searchWords: "makeup artist mua bridal makeup wedding makeup",
        phrase: "makeup artist booking software",
        seoTitle: "Makeup artist booking software for bridal work",
        seoDescription:
            "Makeup artist booking software: trials and wedding mornings in one diary, notes from every trial, and invoices for each bride.",
        headline: "Trials, wedding mornings and every bride's notes.",
        sub: "Makeup artist booking software for bridal and event makeup. Trials and wedding mornings go in one diary, the notes from each trial wait for the big day, and every bride gets a numbered invoice.",
        home: {
            label: "A makeup artist's Home in Saroh at 6 am, an example: a wedding morning with the bride's trial notes, and an invoice still owed",
            clock: "6:05",
            place: "Bridal makeup · Saturday",
            needs: [
                {
                    icon: "customer",
                    title: "Ruth C. left a note when booking",
                    line: "07:00 · Bridal · “hair up, veil at 10”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Ruth C.",
                    line: "Invoice 0019 · trial · 9 days",
                    warn: true,
                },
            ],
            today: [
                { at: "07:00", line: "Ruth C. · Bridal makeup, 90 min" },
                { at: "08:45", line: "Ruth's mother · Makeup, 45 min" },
                { at: "14:00", line: "Ana V. · Trial, 2 hr" },
            ],
        },
        changeTitle:
            "The problems every makeup artist knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Wedding dates come in on Instagram, and I nearly booked two on the same morning.”",
                title: "One diary for trials and wedding mornings",
                body: "Each service has its own length. Your booking page shows only free times, so a date can't be booked twice.",
            },
            {
                feature: "customers",
                pain: "“The trial was in March, and I can't remember what we settled on.”",
                title: "Trial notes waiting for the day",
                body: "Write what you used and what she loved on her page. It's there when you open her booking on the morning.",
            },
            {
                feature: "billing",
                pain: "“A wedding is the trial, the bride and her mother, and I invoice it on scraps.”",
                title: "One numbered invoice for the whole wedding",
                body: "Write an invoice with a line for each face, in your currency. Record what's paid, and what's still owed is listed.",
            },
            {
                feature: "website",
                pain: "“Brides want to see my work before they ask about dates.”",
                title: "Your work and your prices on your own site",
                body: "A gallery of your looks, your services and prices, and a form that brings each enquiry into your contacts.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Bridal trial", detail: "2 hr" },
                { name: "Bridal makeup", detail: "90 min" },
                { name: "Bridal party makeup", detail: "45 min" },
                { name: "Event makeup", detail: "60 min" },
            ],
        },
        faq: [
            {
                q: "Can I work at the bride's home?",
                a: "Yes. The booking holds the time in your diary wherever you work. Write the address in your notes on her page.",
            },
            {
                q: "Can I keep notes from the trial?",
                a: "Yes. Notes sit on her page with her bookings, so the trial's notes are there on the day.",
            },
        ],
        closer: "Walk into every wedding morning with the trial's notes.",
        related: ["photographers", "event-planners", "salons"],
        templates: "makeup-artist",
    },
    {
        slug: "tattoo-studios",
        name: "Tattoo studios",
        bar: "Tattoo studio",
        longName: "Tattoo artists",
        group: "beauty",
        way: "appointments",
        at: "12:00",
        moment: "A four-hour sitting starts at noon, the second of five.",
        searchWords: "tattoo artist tattoo shop tattoo parlour piercing",
        phrase: "tattoo booking software",
        seoTitle: "Tattoo booking software for artists and studios",
        seoDescription:
            "Tattoo booking software: long sittings booked into real free times, the idea arriving with the booking, and every client's work on their page.",
        headline: "Long sittings booked, and the idea comes with them.",
        sub: "Tattoo booking software for artists and small studios. Clients book a sitting of the right length, tell you the idea when they book, and a sleeve over five sittings is on one page.",
        home: {
            label: "A tattoo artist's Home in Saroh at 11:30 am, an example: a client's note about the design before a four-hour sitting, and today's bookings",
            clock: "11:30",
            place: "Tattoo studio · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Leo K. left a note when booking",
                    line: "Fri · Consultation · “fine-line swallow, wrist”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Mara J.",
                    line: "Invoice 0088 · sitting 3 of 5",
                    warn: true,
                },
            ],
            today: [
                { at: "12:00", line: "Mara J. · Sleeve sitting, 4 hr" },
                { at: "16:30", line: "Ollie R. · Flash piece, 1 hr" },
                { at: "18:00", line: "Zoe N. · Consultation, 30 min" },
            ],
        },
        changeTitle:
            "The problems every tattoo studio knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Half my day goes on DMs about dates.”",
                title: "Clients book the length the work needs",
                body: "A consultation, a flash piece and a full sitting each have their own length. Your booking page shows only the times that fit.",
            },
            {
                feature: "bookings",
                label: "Bookings · Their idea",
                pain: "“They turn up and the idea is still in their head.”",
                title: "The idea comes with the booking",
                body: "Clients answer “Anything we should know?” when they book: the placement, the size, a reference. You read it before they arrive.",
            },
            {
                feature: "customers",
                pain: "“A sleeve takes five sittings and I track them in a notebook.”",
                title: "Every sitting on the client's page",
                body: "Their bookings, what they've paid and your notes in one place: the inks, the needles, how they healed.",
            },
            {
                feature: "bookings",
                label: "Bookings · Who came",
                pain: "“Someone books four hours and never shows.”",
                title: "See who keeps not coming",
                body: "Mark who came and who didn't. No-shows are counted on the client's page.",
            },
            {
                feature: "website",
                pain: "“People want to see my flash before they book.”",
                title: "Your flash and your work on your own site",
                body: "A gallery of your work beside your booking page, so they book the piece they came for.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Consultation", detail: "30 min" },
                { name: "Flash piece", detail: "1 hr" },
                { name: "Half-day sitting", detail: "4 hr" },
                { name: "Full-day sitting", detail: "7 hr" },
            ],
        },
        faq: [
            {
                q: "Can clients send me their idea when they book?",
                a: "Yes. They answer “Anything we should know?” when they book, and it reaches their record for you to read and keep.",
            },
            {
                q: "Can I book the next sitting from this one?",
                a: "Yes. Book the next sitting into a free time in your diary before they leave.",
            },
        ],
        closer: "Know tomorrow's sittings, and the ideas behind them.",
        related: ["barbers", "makeup-artists", "photographers"],
    },
];
