import { id } from "../helpers";
import { gstin } from "./bakery";
import { SHOWCASE_KEY } from "./data";

/**
 * Kavi Dental's fixed facts (E29): the clinic as the Book Kavi Dental and
 * Customer Site designs draw it, and as `saroh-fixtures.js` names its
 * dentists, services and patients. Structure only; the diary, the invoices
 * and everything dated are planned in `clinic-plan.ts`.
 */

export const KAVI_KEY = "kavi";

/** A seeded Kavi Dental id: `seed_sc_kavi_<parts>`. */
export const kaviId = (...parts: (string | number)[]) =>
    id(SHOWCASE_KEY, KAVI_KEY, ...parts);

export const KAVI_NAME = "Kavi Dental";

export const KAVI = {
    key: KAVI_KEY,
    name: KAVI_NAME,
    orgId: kaviId("org"),
    slug: "kavi-dental",
    /** The one storefront, with nothing listed: E9's treatment orders go here. */
    storeId: kaviId("store"),
    siteSlug: "kavi-dental",
    prefix: kaviId(""),
} as const;

/** Healthcare is exempt: every service and invoice line is 0%, SAC 9993. */
export const KAVI_SAC = "9993";

/** The business's GST standing (BusinessProfile). */
export const KAVI_GST = {
    state: "29",
    pan: "AAKFK7719M",
    prefix: "KD",
} as const;

export const KAVI_GSTIN = gstin(KAVI_GST.state, KAVI_GST.pan);

/** The registered address, as the designs give it, and as invoices print it. */
export const KAVI_ADDRESS = {
    addressLine1: "12th Main",
    addressLine2: "Indiranagar",
    city: "Bengaluru",
    postalCode: "560038",
} as const;
export const KAVI_ADDRESS_PRINTED =
    "12th Main, Indiranagar, Bengaluru 560038, Karnataka";

/** The desk's number (Book Kavi Dental: "Call +91 80 4099 2210"). */
export const KAVI_PHONE = "+91 80 4099 2210";
/** The same number as the business profile stores it (E.164, DEC-053). */
export const KAVI_PHONE_E164 = "+918040992210";

/** Open 9am–7pm Monday to Saturday, and Sunday mornings. */
export const KAVI_OPENING_HOURS = [
    { day: "MON", open: "09:00", close: "19:00", closed: false },
    { day: "TUE", open: "09:00", close: "19:00", closed: false },
    { day: "WED", open: "09:00", close: "19:00", closed: false },
    { day: "THU", open: "09:00", close: "19:00", closed: false },
    { day: "FRI", open: "09:00", close: "19:00", closed: false },
    { day: "SAT", open: "09:00", close: "19:00", closed: false },
    { day: "SUN", open: "10:00", close: "13:00", closed: false },
] as const;

/** 24 hours to cancel for free; four weeks ahead; two hours before at the latest. */
export const KAVI_RULES = {
    bookAheadDays: 28,
    latestBookingMinutes: 120,
    freeCancelHours: 24,
} as const;

export const KAVI_MODULES = [
    "APPOINTMENTS",
    "CRM",
    "WEBSITE",
    "PAYMENTS",
    // A treatment is sold as an order (E9, DEC-050): its orders live in
    // Commerce, at the clinic's one storefront.
    "COMMERCE",
] as const;

// --- Services --------------------------------------------------------------------

export interface KaviService {
    name: string;
    description: string;
    minutes: number;
    pricePaise: number;
    visits: number;
    locationType: "IN_PERSON" | "EITHER";
    meetingUrl: string | null;
    depositMode: "NONE" | "PERCENT_50";
    /** On the booking page; the hidden one is booked by the desk. */
    shown: boolean;
    /** Share of the day-to-day diary; 0 = only the scenes below book it. */
    weight: number;
}

/** Indexes into {@link KAVI_SERVICES}. */
export const SVC = {
    checkUp: 0,
    review: 1,
    rootCanal: 2,
    whitening: 3,
    video: 4,
    xray: 5,
} as const;

/**
 * As `saroh-fixtures.js` has them, plus a 20-minute review (so a service
 * under half an hour has a case, E6) and the full-mouth X-ray the desk books
 * (hidden from the booking page). Treatments (more than one visit) are left
 * to their scenes: E9 turns them into orders.
 */
export const KAVI_SERVICES: readonly KaviService[] = [
    {
        name: "Check-up and clean",
        description:
            "We look, clean and explain. Thirty minutes, no surprises — and a written plan and price before any treatment.",
        minutes: 30,
        pricePaise: 120_000,
        visits: 1,
        locationType: "IN_PERSON",
        meetingUrl: null,
        depositMode: "NONE",
        shown: true,
        weight: 55,
    },
    {
        name: "Follow-up review",
        description: "A short visit after treatment to check how it's healing.",
        minutes: 20,
        pricePaise: 50_000,
        visits: 1,
        locationType: "IN_PERSON",
        meetingUrl: null,
        depositMode: "NONE",
        shown: true,
        weight: 20,
    },
    {
        name: "Root canal treatment",
        description:
            "Usually three short visits. Modern anaesthetic means most patients feel pressure, not pain.",
        minutes: 60,
        pricePaise: 1_200_000,
        visits: 3,
        locationType: "IN_PERSON",
        meetingUrl: null,
        depositMode: "PERCENT_50",
        shown: true,
        weight: 0,
    },
    {
        name: "Teeth whitening",
        description:
            "Two visits, some sensitivity for a day or two. We'll tell you if it's not right for your teeth.",
        minutes: 45,
        pricePaise: 850_000,
        visits: 2,
        locationType: "IN_PERSON",
        meetingUrl: null,
        depositMode: "NONE",
        shown: true,
        weight: 0,
    },
    {
        name: "Video consultation",
        description:
            "Talk it through with a dentist first — at the clinic or by video.",
        minutes: 20,
        pricePaise: 60_000,
        visits: 1,
        locationType: "EITHER",
        meetingUrl: "https://meet.jit.si/kavi-dental-consultation",
        depositMode: "NONE",
        shown: true,
        weight: 12,
    },
    {
        name: "X-ray, full mouth (OPG)",
        description: "Booked by the desk when a dentist asks for one.",
        minutes: 15,
        pricePaise: 90_000,
        visits: 1,
        locationType: "IN_PERSON",
        meetingUrl: null,
        depositMode: "NONE",
        shown: false,
        weight: 13,
    },
];

// --- The dentists ------------------------------------------------------------------

export interface Window {
    /** 0 = Sunday … 6 = Saturday. */
    days: readonly number[];
    from: string;
    to: string;
}

export interface Dentist {
    key: string;
    name: string;
    title: string;
    services: readonly number[];
    hours: readonly Window[];
}

/**
 * The fixtures' two dentists and their weeks. Dr. Pillai's evenings end at
 * 19:00, when the clinic closes, rather than the fixture's 20:00.
 */
export const KAVI_DENTISTS: readonly Dentist[] = [
    {
        key: "rao",
        name: "Dr. Meenakshi Rao",
        title: "Dentist",
        services: [SVC.checkUp, SVC.review, SVC.rootCanal, SVC.video, SVC.xray],
        hours: [
            { days: [1, 2, 4, 5], from: "09:00", to: "13:00" },
            { days: [1, 2, 4, 5], from: "16:00", to: "19:00" },
            { days: [3, 6], from: "09:00", to: "13:00" },
        ],
    },
    {
        key: "pillai",
        name: "Dr. Arun Pillai",
        title: "Dentist",
        services: [SVC.checkUp, SVC.review, SVC.whitening, SVC.video, SVC.xray],
        hours: [
            { days: [1, 3, 5, 6], from: "10:00", to: "14:00" },
            { days: [1, 3, 5, 6], from: "17:00", to: "19:00" },
            { days: [2], from: "10:00", to: "14:00" },
            { days: [0], from: "10:00", to: "13:00" },
        ],
    },
];

/** Indexes into {@link KAVI_DENTISTS}. */
export const DR = { rao: 0, pillai: 1 } as const;

/** Who works the desk: a Member. */
export const KAVI_DESK = {
    first: "Divya",
    last: "Kamath",
    role: "MEMBER",
} as const;

// --- Patients -----------------------------------------------------------------------

export interface AttentionFixture {
    kind: "ALLERGY" | "MEDICAL" | "ACCESS";
    label: string;
    detail: string;
    sensitive: boolean;
}

export interface PatientFixture {
    key: string;
    first: string;
    last: string;
    email: string;
    phone: string;
    attention: readonly AttentionFixture[];
}

/** The four patients the designs name, with their Needs attention entries. */
export const KAVI_PATIENTS: readonly PatientFixture[] = [
    {
        key: "rahul",
        first: "Rahul",
        last: "Verma",
        email: "rahul.verma@example.in",
        phone: "+91 98451 22019",
        attention: [
            {
                kind: "MEDICAL",
                label: "Blood thinners",
                detail: "Takes warfarin. Check before any extraction or deep cleaning",
                sensitive: true,
            },
            {
                kind: "ALLERGY",
                label: "Latex",
                detail: "Allergic to latex. Use nitrile gloves",
                sensitive: false,
            },
        ],
    },
    {
        key: "farah",
        first: "Farah",
        last: "Khan",
        email: "farah.k@example.in",
        phone: "+91 99001 45566",
        attention: [
            {
                kind: "MEDICAL",
                label: "Pregnant",
                detail: "Second trimester. No X-rays; ask before any medication",
                sensitive: true,
            },
        ],
    },
    {
        key: "vikram",
        first: "Vikram",
        last: "Rao",
        email: "vikram.rao@example.in",
        phone: "+91 98860 77120",
        attention: [],
    },
    {
        key: "leela",
        first: "Leela",
        last: "Menon",
        email: "leela.m@example.in",
        phone: "+91 97400 31188",
        attention: [
            {
                kind: "ACCESS",
                label: "Anxious patient",
                detail: "Explain each step before starting; offer breaks",
                sensitive: false,
            },
        ],
    },
];

/** Indexes into {@link KAVI_PATIENTS}. */
export const PT = { rahul: 0, farah: 1, vikram: 2, leela: 3 } as const;

/** What Rahul wrote in "Anything we should know?", still waiting for the team. */
export const RAHUL_BOOKING_NOTE =
    "Started a new BP tablet (amlodipine) last month. Still on warfarin.";

/** Everyone else on the list: generated, like every showcase business's. */
export const GENERATED_PATIENTS = 110;

/**
 * Diwali (Lakshmi Puja) by year. The clinic closes from the day before to
 * two days after. A year missing here stops the seed rather than guess.
 */
export const DIWALI: readonly string[] = [
    "2025-10-20",
    "2026-11-08",
    "2027-10-29",
    "2028-10-17",
    "2029-11-05",
    "2030-10-26",
];

// --- The website -----------------------------------------------------------------

export const KAVI_SITE_COPY = {
    kicker: "Dental care in Indiranagar",
    title: "Calm, careful dentistry.",
    text: "Check-ups, root canals and whitening with two dentists who explain every step. Video consults if you can't come in.",
    hours: "Mon–Sat 9am–7pm · Sun 10am–1pm",
    address: "12th Main, Indiranagar, Bengaluru 560038",
} as const;
