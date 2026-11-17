import type { TradePage } from "./types";

/**
 * Health beyond the lead "clinics" page. Medical notes stay with the one
 * person who runs the practice. No claims of reminders, or of treatments
 * over several visits, which need Sell turned on.
 */
export const HEALTH: TradePage[] = [
    {
        slug: "dental-clinics",
        name: "Dental clinics",
        bar: "Dental",
        longName: "Dentists",
        group: "health",
        way: "appointments",
        at: "08:30",
        moment: "A check-up at 8:30, and the patient takes blood thinners.",
        searchWords: "dentist dental practice dental surgery hygienist teeth",
        phrase: "dental appointment software",
        seoTitle: "Dental appointment software for small practices",
        seoDescription:
            "Dental appointment software: patients book check-ups and hygiene visits online, medical flags before they're in the chair, and numbered invoices.",
        headline: "Check-ups booked, and every flag before the chair.",
        sub: "Dental appointment software for small and single-chair practices. Patients book a check-up or a hygiene visit into your real free times, their medical flags show before they sit down, and every treatment gets a numbered invoice.",
        home: {
            label: "A dentist's Home in Saroh at 8 am, an example: a patient on blood thinners before a check-up, an overdue invoice and the morning's appointments",
            clock: "8:01",
            place: "Dental practice · Tuesday",
            needs: [
                {
                    icon: "warn",
                    title: "Takes blood thinners",
                    line: "Gareth O. · 08:30 · Check-up",
                    warn: true,
                },
                {
                    icon: "doc",
                    title: "Overdue from Helen W.",
                    line: "Invoice 0310 · filling",
                },
            ],
            today: [
                { at: "08:30", line: "Gareth O. · Check-up, 20 min" },
                { at: "09:00", line: "Ama D. · Hygiene, 40 min" },
                { at: "10:00", line: "Lucy V. · Filling, 45 min" },
            ],
        },
        changeTitle:
            "The problems every dental practice knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Reception spends the morning on the phone finding times.”",
                title: "Patients book check-ups themselves",
                body: "Your booking page shows only real free times, at the length each visit takes. A check-up, a hygiene visit and a filling each have their own.",
            },
            {
                feature: "customers",
                label: "Customers · Medical flags",
                pain: "“I learn about the blood thinners when the patient's already in the chair.”",
                title: "Flags before they sit down",
                body: "Allergies, medicines and access needs show on their bookings and today's list. Medical notes only show to you.",
            },
            {
                feature: "customers",
                label: "Customers · Notes from booking",
                pain: "“The patient mentioned a sore tooth on the phone, and it never reached me.”",
                title: "What they write reaches their record",
                body: "Patients answer “Anything we should know?” when they book. Read it, mark it sensitive, and you see it when you open the booking.",
            },
            {
                feature: "billing",
                pain: "“Every treatment needs an invoice for the patient's insurer.”",
                title: "A numbered invoice for every treatment",
                body: "Write an invoice in your currency, numbered in order. Record the payment, and it becomes a receipt the patient can claim with.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Check-up", detail: "20 min" },
                { name: "Hygiene visit", detail: "40 min" },
                { name: "Filling", detail: "45 min" },
                { name: "Emergency visit", detail: "30 min" },
            ],
        },
        faq: [
            {
                q: "Can patients choose what they're booking for?",
                a: "Yes. Each visit is a service with its own length. Patients pick one and see only the times that fit.",
            },
            {
                q: "Can I bring my patient list across?",
                a: "Yes. Import your patients from a CSV, each phone number with its country code.",
            },
        ],
        closer: "Know every patient's flags before the first check-up.",
        related: ["clinics", "dermatology-clinics", "physiotherapists"],
    },
    {
        slug: "dermatology-clinics",
        name: "Skin clinics",
        bar: "Skin clinic",
        longName: "Skin clinics",
        group: "health",
        way: "appointments",
        at: "10:00",
        moment: "A consultation at 10, and the patient has sent a note about her rash.",
        searchWords: "dermatologist dermatology skin clinic aesthetics acne",
        phrase: "skin clinic booking software",
        seoTitle: "Skin clinic booking software for dermatology",
        seoDescription:
            "Skin clinic booking software for dermatology and aesthetics: consultations online or in clinic, notes kept to you, and invoices per treatment.",
        headline: "Consultations, treatments and notes kept private.",
        sub: "Skin clinic booking software for dermatology and aesthetics practices. Patients book a consultation in clinic or on a video call, tell you what's wrong before they come, and your notes on their skin stay with you.",
        home: {
            label: "A skin clinic's Home in Saroh at 9:30 am, an example: a patient's note about a rash, an allergy flag before a peel and today's appointments",
            clock: "9:32",
            place: "Skin clinic · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Farah Z. left a note when booking",
                    line: "10:00 · “rash on both hands, 3 weeks”",
                },
                {
                    icon: "warn",
                    title: "Allergy: salicylic acid",
                    line: "Beth M. · 14:00 · Chemical peel",
                    warn: true,
                },
            ],
            today: [
                { at: "10:00", line: "Farah Z. · Consultation, 30 min" },
                { at: "11:30", line: "Kai L. · Follow-up, video call" },
                { at: "14:00", line: "Beth M. · Chemical peel, 45 min" },
            ],
        },
        changeTitle:
            "The problems every skin clinic knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · In clinic or by video",
                pain: "“Half my follow-ups only need a look on camera.”",
                title: "In clinic or on a video call",
                body: "Set a service as in person, by video or either, and the patient chooses when they book. Only real free times are shown.",
            },
            {
                feature: "customers",
                label: "Customers · Notes from booking",
                pain: "“Patients describe the problem on the phone, and it's lost by the appointment.”",
                title: "What they write reaches their record",
                body: "Patients answer “Anything we should know?” when they book. Label it, mark it sensitive, and you see it when you open the booking.",
            },
            {
                feature: "customers",
                label: "Customers · Allergies",
                pain: "“An allergy to an acid matters before a peel, not after.”",
                title: "Allergies on every booking",
                body: "Note it on the patient once. It shows on their bookings and on today's list, before you start.",
            },
            {
                feature: "billing",
                pain: "“Aesthetic treatments and consultations are billed differently.”",
                title: "Invoices with your own tax line",
                body: "Write a numbered invoice in your currency. Add your own tax line where a treatment carries one, and leave it off where it doesn't.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Consultation", detail: "30 min" },
                { name: "Follow-up, video", detail: "15 min" },
                { name: "Chemical peel", detail: "45 min" },
                { name: "Mole check", detail: "20 min" },
            ],
        },
        faq: [
            {
                q: "Can patients see me on a video call?",
                a: "Yes. Set a service as in person, by video or either, and the patient chooses when they book.",
            },
            {
                q: "Who can read a patient's skin notes?",
                a: "You do. Mark a note sensitive and it stays on their record. Allergies show on their bookings so you can take care.",
            },
        ],
        closer: "Know what every patient wrote before they arrive.",
        related: ["clinics", "spas", "dental-clinics"],
    },
    {
        slug: "physiotherapists",
        name: "Physiotherapists",
        bar: "Physio",
        longName: "Physiotherapists",
        group: "health",
        way: "appointments",
        at: "08:00",
        moment: "A new patient at 8 with a knee injury, and her note about it is already in.",
        searchWords:
            "physio physiotherapy physical therapy sports injury rehab",
        phrase: "physiotherapy booking software",
        seoTitle: "Physiotherapy booking software for physios",
        seoDescription:
            "Physiotherapy booking software: new and follow-up appointments online, what the patient wrote before they arrive, and invoices for insurers.",
        headline: "New patients, follow-ups and every injury's history.",
        sub: "Physiotherapy booking software for physios in a clinic or on home visits. Patients book a first assessment or a follow-up into your free times, tell you about the injury when they book, and your notes follow them from visit to visit.",
        home: {
            label: "A physio's Home in Saroh at 7:40 am, an example: a new patient's note about her knee, an overdue invoice and the morning's appointments",
            clock: "7:40",
            place: "Physio clinic · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Hana Y. left a note when booking",
                    line: "08:00 · “twisted knee playing netball”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Rob E.",
                    line: "Invoice 0207 · 3 follow-ups",
                },
            ],
            today: [
                { at: "08:00", line: "Hana Y. · First assessment, 60 min" },
                { at: "09:15", line: "Rob E. · Follow-up, 30 min" },
                { at: "10:00", line: "Ian S. · Follow-up, video call" },
            ],
        },
        changeTitle:
            "The problems every physio knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“A first assessment takes an hour, but people book it in half-hour gaps.”",
                title: "Each appointment at its real length",
                body: "A first assessment and a follow-up each have their own length and the break after. Patients only see the times that fit.",
            },
            {
                feature: "customers",
                pain: "“The patient tells me the history again every time, because I can't find my notes.”",
                title: "Every visit's notes on one page",
                body: "Their bookings, what they wrote when booking and your notes, together. Medical notes only show to you.",
            },
            {
                feature: "bookings",
                label: "Bookings · Home visits and video",
                pain: "“Some patients can't get to the clinic.”",
                title: "In clinic, at home or on a call",
                body: "Set a follow-up as in person, by video or either, and the patient chooses. Leave a longer break after a home visit for travel.",
            },
            {
                feature: "billing",
                pain: "“Insurers want an invoice for every treatment, numbered.”",
                title: "Numbered invoices for insurers",
                body: "Write an invoice in your currency, numbered in order. Record the payment and it becomes a receipt the patient can claim with.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "First assessment", detail: "60 min" },
                { name: "Follow-up", detail: "30 min" },
                { name: "Sports massage", detail: "45 min" },
                { name: "Video follow-up", detail: "20 min" },
            ],
        },
        faq: [
            {
                q: "Can I see patients by video?",
                a: "Yes. Set a service as in person, by video or either, and the patient chooses when they book.",
            },
            {
                q: "Can I see what a patient wrote before the first visit?",
                a: "Yes. What they answer when booking reaches their record, and you see it when you open the booking.",
            },
        ],
        closer: "Know every patient's injury before they walk in.",
        related: ["clinics", "personal-trainers", "spas"],
    },
    {
        slug: "dietitians",
        name: "Dietitians",
        bar: "Dietitian",
        longName: "Dietitians",
        group: "health",
        way: "appointments",
        at: "11:00",
        moment: "A first consultation at 11 by video, and her food diary note is in.",
        searchWords: "dietitian dietician nutritionist nutrition diet coach",
        phrase: "dietitian booking software",
        seoTitle: "Dietitian booking software for nutritionists",
        seoDescription:
            "Dietitian booking software for dietitians and nutritionists: consultations by video or in person, notes on every client, numbered invoices.",
        headline: "Consultations, check-ins and every client's notes.",
        sub: "Dietitian booking software for dietitians and nutritionists. Clients book a first consultation or a check-in by video or in person, their notes and history sit on one page, and each consultation is invoiced.",
        home: {
            label: "A dietitian's Home in Saroh at 10:30 am, an example: a new client's note about her diet, an overdue invoice and today's consultations",
            clock: "10:30",
            place: "Nutrition practice · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Saba K. left a note when booking",
                    line: "11:00 · “coeliac, newly diagnosed”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Glen R.",
                    line: "Invoice 0048 · 4 check-ins",
                },
            ],
            today: [
                { at: "11:00", line: "Saba K. · First consultation, video" },
                { at: "13:00", line: "Glen R. · Check-in, 30 min" },
                { at: "15:30", line: "Moira T. · Check-in, video" },
            ],
        },
        changeTitle:
            "The problems every dietitian knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · Video or in person",
                pain: "“Most check-ins are a call, but I still paste the link into a chat.”",
                title: "By video or in person, their choice",
                body: "Set a consultation as in person, by video or either. The client picks when they book, in your free times.",
            },
            {
                feature: "customers",
                pain: "“Each client's notes are in a different notebook.”",
                title: "Every client on one page",
                body: "Their consultations, what they wrote when booking and your notes, in one place. Medical notes only show to you.",
            },
            {
                feature: "billing",
                pain: "“Clients want an invoice to claim back from their insurer.”",
                title: "A numbered invoice for each consultation",
                body: "Write an invoice in your currency, or one for a month of check-ins. Record what's paid, and see what's overdue.",
            },
            {
                feature: "website",
                pain: "“People want to know how I work before they book.”",
                title: "A clear page about your practice",
                body: "Your site lists each consultation with its length and price, and its booking page shows your free times.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "First consultation", detail: "60 min" },
                { name: "Check-in", detail: "30 min" },
                { name: "Check-in, video", detail: "20 min" },
                { name: "Meal plan review", detail: "45 min" },
            ],
        },
        faq: [
            {
                q: "Can clients book a video consultation?",
                a: "Yes. Set a consultation as in person, by video or either, and the client chooses when they book.",
            },
            {
                q: "Who can read a client's medical notes?",
                a: "You do. Allergies and access needs show on their bookings and today's list, so you can take care.",
            },
        ],
        closer: "Start tomorrow with every client's notes in one place.",
        related: ["clinics", "personal-trainers", "counsellors"],
    },
    {
        slug: "counsellors",
        name: "Counsellors",
        bar: "Counsellor",
        longName: "Counsellors",
        group: "health",
        way: "appointments",
        at: "09:00",
        moment: "A first session at 9, online, and nothing to chase by message.",
        searchWords: "counsellor counselor therapist psychotherapist therapy",
        phrase: "counselling booking software",
        seoTitle: "Counselling booking software for therapists",
        seoDescription:
            "Counselling booking software for counsellors and therapists: clients book sessions in the room or online, and session notes stay private.",
        headline: "Sessions booked quietly, notes kept private.",
        sub: "Counselling booking software for counsellors, therapists and psychotherapists in private practice. Clients book a session in the room or online without a single message, and what they share stays in notes only you can read.",
        home: {
            label: "A counsellor's Home in Saroh at 8:30 am, an example: a follow-up with someone who asked about sessions, and the day's appointments",
            clock: "8:30",
            place: "Private practice · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Follow up with Jamie L.",
                    line: "Asked about evening sessions",
                },
            ],
            today: [
                { at: "09:00", line: "A.R. · First session, online" },
                { at: "11:00", line: "M.K. · Session, 50 min" },
                { at: "17:00", line: "D.S. · Session, online" },
            ],
        },
        changeTitle:
            "The problems every counsellor knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Fixing a time takes ten messages, and some clients find that hard.”",
                title: "Clients book their own session",
                body: "Your booking page shows only your free times. A client picks one without having to write to you first.",
            },
            {
                feature: "bookings",
                label: "Bookings · The room or online",
                pain: "“Some clients come in, some only talk from home.”",
                title: "The room or a call, their choice",
                body: "Set a session as in person, by video or either, and the client chooses when they book.",
            },
            {
                feature: "customers",
                label: "Customers · Private notes",
                pain: "“What a client shares has to stay private.”",
                title: "Notes only you can read",
                body: "Saroh is for one person running their practice. Mark a note sensitive and it stays on the client's record, for you alone.",
            },
            {
                feature: "billing",
                pain: "“Asking for the fee at the end of a session is hard.”",
                title: "An invoice, not a conversation",
                body: "Write a numbered invoice for the month's sessions, in your currency. Record what's paid, and see what's overdue.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "First session", detail: "50 min" },
                { name: "Session", detail: "50 min" },
                { name: "Session, online", detail: "50 min" },
                { name: "Couples session", detail: "80 min" },
            ],
        },
        faq: [
            {
                q: "Can clients book an online session?",
                a: "Yes. Set a session as in person, by video or either, and the client chooses when they book.",
            },
            {
                q: "Who can read my session notes?",
                a: "You do. Saroh is for one person running their practice, and a note marked sensitive stays on the client's record.",
            },
        ],
        closer: "Open tomorrow with every session already booked.",
        related: ["clinics", "dietitians", "consultants"],
    },
];
