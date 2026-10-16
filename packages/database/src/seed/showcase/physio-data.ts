import type {
    DsBusiness,
    DsClient,
    DsEnquiry,
    DsScene,
    DsService,
    DsStaff,
} from "./diary-shop-types";
import {
    MOTION_CATEGORIES,
    MOTION_CONDITIONS_IMAGES,
    MOTION_GALLERY,
    MOTION_OPTIONS,
    MOTION_PRODUCTS,
    MOTION_SERVICE_IMAGES,
} from "./physio-catalog";
import { MOTION_POSTS } from "./physio-posts";

/**
 * Stride Physio: a physiotherapy clinic on CMH Road, Indiranagar, owned by
 * `demo@saroh.dev` (as Dr. Ananya Krishnan, on the diary) with Dr. Rohit
 * Menon and Shruti Gowda on the desk as a Member. Healthcare is exempt and
 * the clinic is not GST-registered: plain receipts, INV-0001….
 *
 * Its story is the physio's pain point: people come for an assessment and a
 * few follow-ups, and many stop after the third. The diary shows courses of
 * visits of every length (most ending at three), six-session knee
 * programmes sold as one order (some finished, some running, some stopped
 * at visit 3), packs of 6 and 10, a monthly plan the desk books, home visits
 * with travel time either side, video follow-ups, and patients whose notes
 * the team must see first — after ACL surgery, diabetic, a pacemaker (no
 * electrotherapy), on blood thinners, pregnant. Data only.
 */

const photo = (key: string) => {
    const p = MOTION_SERVICE_IMAGES[key] as
        (typeof MOTION_SERVICE_IMAGES)[string] | undefined;
    return p ? { image: p } : {};
};

const svc = (
    s: Omit<DsService, "locationType" | "meetingUrl" | "visits" | "shown"> &
        Partial<
            Pick<DsService, "locationType" | "meetingUrl" | "visits" | "shown">
        >,
): DsService => ({
    visits: 1,
    locationType: "IN_PERSON",
    meetingUrl: null,
    shown: true,
    ...photo(s.key),
    ...s,
});

export const MOTION_SERVICES: readonly DsService[] = [
    svc({
        key: "assessment",
        name: "First assessment",
        group: "At the clinic",
        description:
            "An hour with a physio: your story, a full examination, what we think is going on, and a plan with exercises to start at home. Bring any scans and reports.",
        minutes: 60,
        pricePaise: 160_000,
        depositMode: "NONE",
        weight: 2,
    }),
    svc({
        key: "followup",
        name: "Follow-up session",
        group: "At the clinic",
        description:
            "Hands-on treatment and exercise progression, reviewing how the plan is going.",
        minutes: 45,
        pricePaise: 100_000,
        depositMode: "NONE",
        weight: 6,
    }),
    svc({
        key: "sports-rehab",
        name: "Sports injury rehab",
        group: "At the clinic",
        description:
            "Longer sessions for runners, cricketers and gym-goers getting back to their sport: strength, control and return-to-play testing.",
        minutes: 60,
        pricePaise: 140_000,
        depositMode: "NONE",
        weight: 3,
    }),
    svc({
        key: "postop-rehab",
        name: "Post-surgery rehab",
        group: "At the clinic",
        description:
            "Rehab after a knee or shoulder replacement, ACL reconstruction or fracture fixation, following your surgeon's protocol.",
        minutes: 60,
        pricePaise: 140_000,
        depositMode: "NONE",
        weight: 3,
    }),
    svc({
        key: "home-visit",
        name: "Home visit",
        group: "At home or online",
        description:
            "An hour with Dr. Rohit at home, within about 4 km of the clinic. Booked through the desk so we can plan the travel.",
        minutes: 60,
        buffer: 20,
        pricePaise: 220_000,
        depositMode: "NONE",
        shown: false,
        weight: 1.5,
    }),
    svc({
        key: "online-followup",
        name: "Online follow-up (video)",
        group: "At home or online",
        description:
            "A 30-minute video session to review your exercises, for people who have had an assessment in person. The link comes with your confirmation.",
        minutes: 30,
        pricePaise: 70_000,
        depositMode: "NONE",
        locationType: "ONLINE",
        meetingUrl: "https://meet.jit.si/stride-physio-follow-up",
        weight: 1.5,
    }),
    svc({
        key: "dry-needling",
        name: "Dry needling",
        group: "At the clinic",
        description:
            "Fine needles into tight muscle, with Dr. Ananya, only after an assessment and with your written consent.",
        minutes: 30,
        pricePaise: 120_000,
        depositMode: "NONE",
        weight: 1.5,
    }),
    svc({
        key: "knee-programme",
        name: "Knee rehab programme (6 sessions)",
        group: "Programmes",
        description:
            "Six 45-minute sessions over three to four weeks for knee osteoarthritis, after an assessment: strength, walking and stairs, measured at the start and the end. Paid upfront.",
        minutes: 45,
        visits: 6,
        pricePaise: 600_000,
        depositMode: "NONE",
        weight: 0,
    }),
    svc({
        key: "taping",
        name: "Kinesio taping",
        group: "At the clinic",
        description: "Taping added by your physio during a session.",
        minutes: 15,
        pricePaise: 40_000,
        depositMode: "NONE",
        shown: false,
        weight: 0.6,
    }),
];

export const MOTION_STAFF: readonly DsStaff[] = [
    {
        key: "ananya",
        name: "Dr. Ananya Krishnan (PT)",
        title: "Founder · sports physiotherapist",
        bio: "MPT (Sports), eleven years in practice. Treats runners, cricketers and desk workers, and runs most mornings herself.",
        services: [
            "assessment",
            "followup",
            "sports-rehab",
            "postop-rehab",
            "online-followup",
            "dry-needling",
            "knee-programme",
            "taping",
        ],
        hours: [
            { days: [1, 2, 3, 4, 5], from: "07:30", to: "13:00" },
            { days: [1, 3, 5], from: "16:00", to: "20:00" },
            { days: [6], from: "08:00", to: "14:00" },
        ],
    },
    {
        key: "rohit",
        name: "Dr. Rohit Menon (PT)",
        title: "Orthopaedic physiotherapist",
        bio: "MPT (Orthopaedics). Rehab after knee and shoulder surgery, back pain, and the clinic's home visits.",
        services: [
            "assessment",
            "followup",
            "postop-rehab",
            "sports-rehab",
            "home-visit",
            "online-followup",
            "knee-programme",
            "taping",
        ],
        hours: [
            { days: [1, 2, 3, 4, 5], from: "09:00", to: "13:00" },
            { days: [2, 4], from: "14:00", to: "16:00" },
            { days: [1, 2, 3, 4, 5], from: "16:00", to: "20:00" },
            { days: [6], from: "08:00", to: "14:00" },
        ],
    },
];

export const MOTION_CLIENTS: readonly DsClient[] = [
    {
        key: "vikram",
        first: "Vikram",
        last: "Shetty",
        phone: "+91 00000 00066",
        gender: "m",
        attention: [
            {
                kind: "MEDICAL",
                label: "Post-ACL reconstruction (6 weeks)",
                detail: "Right knee, hamstring graft. Surgeon's protocol: no pivoting or jumping before month 4; brace for walking until week 8.",
                sensitive: true,
            },
        ],
        notes: [
            "Week 6: full extension, flexion 115°. Starting single-leg work. Wants to play five-a-side again by March — set expectations.",
        ],
    },
    {
        key: "lakshmi",
        first: "Lakshmi",
        last: "Iyengar",
        phone: "+91 00000 00024",
        gender: "f",
        attention: [
            {
                kind: "MEDICAL",
                label: "Diabetic",
                detail: "Type 2, on metformin. If dizzy or sweaty, stop and check her sugar; slow-healing skin — no strong tape.",
                sensitive: true,
            },
        ],
        notes: [
            "Both knees, worse on the left. Walks to the clinic from Defence Colony.",
        ],
    },
    {
        key: "george",
        first: "George",
        last: "Mathew",
        phone: "+91 00000 00081",
        gender: "m",
        attention: [
            {
                kind: "MEDICAL",
                label: "Pacemaker — no IFT or TENS",
                detail: "Pacemaker since 2021. No electrotherapy of any kind; no dry needling near the chest wall.",
                sensitive: true,
            },
        ],
        notes: [],
    },
    {
        key: "priya",
        first: "Priya",
        last: "Hegde",
        phone: "+91 00000 00091",
        gender: "f",
        attention: [],
        notes: [
            "Left ankle inversion sprain at a trail run in Nandi Hills. Hop test 80% of the other side — not ready for trails yet.",
        ],
    },
    {
        key: "arjun",
        first: "Arjun",
        last: "Kamath",
        phone: "+91 00000 00040",
        gender: "m",
        attention: [],
        notes: [
            "Desk neck; works from home in Whitefield. Prefers video follow-ups in the evening.",
        ],
    },
    {
        key: "sushila",
        first: "Sushila",
        last: "Rao",
        phone: "+91 00000 00070",
        gender: "f",
        attention: [
            {
                kind: "ACCESS",
                label: "Home visits: 3rd floor, no lift",
                detail: "Flat 3B, Jeevan Bima Nagar. Ring her son first on +91 00000 00071; parking inside the gate.",
                sensitive: false,
            },
            {
                kind: "MEDICAL",
                label: "Blood thinners",
                detail: "On apixaban after her knee replacement. Bruises easily; no deep soft-tissue work.",
                sensitive: true,
            },
        ],
        notes: [
            "Right total knee replacement on 18 Sep. Walker indoors, stick outside.",
        ],
    },
    {
        key: "farhan",
        first: "Farhan",
        last: "Ahmed",
        phone: "+91 00000 00014",
        gender: "m",
        attention: [],
        notes: [
            "Fast bowler, club cricket. Low back pain after long spells — screen for a stress injury, refer for a scan if night pain.",
        ],
    },
    {
        key: "neha",
        first: "Neha",
        last: "Varma",
        phone: "+91 00000 00109",
        gender: "f",
        attention: [],
        notes: [],
    },
    {
        key: "anil",
        first: "Anil",
        last: "Reddy",
        phone: "+91 00000 00077",
        gender: "m",
        attention: [],
        notes: [
            "Stopped after the third session for his back — said it felt better. Shruti to call: the plan was six, and the strength work is what keeps it away.",
        ],
    },
    {
        key: "meera",
        first: "Meera",
        last: "Nair",
        phone: "+91 00000 00035",
        gender: "f",
        attention: [
            {
                kind: "OTHER",
                label: "Dry needling consent signed",
                detail: "Consent for dry needling to the right upper trapezius and shoulder, signed at her assessment.",
                sensitive: false,
            },
        ],
        notes: [
            "Frozen shoulder, right, about five months in. Moving better at night.",
        ],
    },
];

export const MOTION_SCENES: readonly DsScene[] = [
    {
        key: "vikram_rehab_1",
        client: "vikram",
        service: "postop-rehab",
        staff: ["rohit"],
        day: -12,
        from: "09:00",
        madeDaysBefore: 3,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "vikram_rehab_2",
        client: "vikram",
        service: "postop-rehab",
        staff: ["rohit"],
        day: -5,
        from: "09:00",
        madeDaysBefore: 6,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "vikram_rehab_3",
        client: "vikram",
        service: "postop-rehab",
        staff: ["rohit"],
        day: 2,
        from: "09:00",
        madeDaysBefore: 6,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "lakshmi_followup",
        client: "lakshmi",
        service: "followup",
        staff: ["ananya"],
        day: 1,
        from: "10:00",
        madeDaysBefore: 4,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "george_followup",
        client: "george",
        service: "followup",
        staff: ["rohit"],
        day: -3,
        from: "17:00",
        madeDaysBefore: 5,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "george_yesterday",
        client: "george",
        service: "followup",
        staff: ["rohit"],
        day: -1,
        from: "17:00",
        madeDaysBefore: 2,
        by: "desk",
        pay: "DESK",
        outcome: "UNMARKED",
    },
    {
        key: "priya_rehab",
        client: "priya",
        service: "sports-rehab",
        staff: ["ananya"],
        day: -2,
        from: "07:30",
        madeDaysBefore: 4,
        by: "client",
        pay: "PAID",
    },
    {
        key: "priya_next",
        client: "priya",
        service: "sports-rehab",
        staff: ["ananya"],
        day: 4,
        from: "07:30",
        madeDaysBefore: 2,
        by: "client",
        pay: "PAID",
    },
    {
        key: "arjun_video",
        client: "arjun",
        service: "online-followup",
        staff: ["ananya"],
        day: 0,
        from: "18:00",
        spanDays: 5,
        madeDaysBefore: 2,
        by: "client",
        pay: "PAID",
    },
    {
        key: "sushila_home_1",
        client: "sushila",
        service: "home-visit",
        staff: ["rohit"],
        day: -6,
        from: "14:00",
        madeDaysBefore: 3,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "sushila_home_2",
        client: "sushila",
        service: "home-visit",
        staff: ["rohit"],
        day: 1,
        from: "14:00",
        spanDays: 5,
        madeDaysBefore: 5,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "farhan_assessment",
        client: "farhan",
        service: "assessment",
        staff: ["ananya"],
        day: 3,
        from: "08:00",
        madeDaysBefore: 1,
        by: "client",
        pay: "DESK",
    },
    {
        key: "neha_assessment",
        client: "neha",
        service: "assessment",
        staff: ["ananya"],
        day: 2,
        from: "11:00",
        madeDaysBefore: 1,
        by: "client",
        pay: "PAID",
        note: {
            text: "I'm seven months pregnant and have lower back and hip pain, worse at night. Is it safe to do exercises now?",
            label: "Pregnant (7 months)",
            kind: "MEDICAL",
        },
    },
    {
        key: "meera_needling",
        client: "meera",
        service: "dry-needling",
        staff: ["ananya"],
        day: -4,
        from: "11:00",
        madeDaysBefore: 3,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "meera_noshow",
        client: "meera",
        service: "followup",
        staff: ["ananya"],
        day: -9,
        from: "08:00",
        madeDaysBefore: 3,
        by: "client",
        pay: "DESK",
        outcome: "NO_SHOW",
    },
    {
        key: "anil_1",
        client: "anil",
        service: "assessment",
        staff: ["rohit"],
        day: -40,
        from: "17:00",
        madeDaysBefore: 2,
        by: "client",
        pay: "PAID",
    },
    {
        key: "anil_2",
        client: "anil",
        service: "followup",
        staff: ["rohit"],
        day: -36,
        from: "17:00",
        madeDaysBefore: 4,
        by: "desk",
        pay: "DESK",
    },
    {
        key: "anil_3",
        client: "anil",
        service: "followup",
        staff: ["rohit"],
        day: -32,
        from: "17:00",
        madeDaysBefore: 4,
        by: "desk",
        pay: "DESK",
    },
];

const ask = (
    daysAgo: number,
    first: string,
    last: string,
    phone: string,
    area: string,
    message: string,
): DsEnquiry => ({
    daysAgo,
    client: null,
    first,
    last,
    phone,
    message,
    extra: { area },
});

export const MOTION_ENQUIRIES: readonly DsEnquiry[] = [
    ask(
        84,
        "Ramesh",
        "Prasad",
        "+91 00000 00067",
        "Domlur",
        "My father (78) had a fall and fractured his wrist. Plaster comes off next week. Can someone come home for the rehab?",
    ),
    ask(
        79,
        "Divya",
        "Srinivasan",
        "+91 00000 00095",
        "Indiranagar",
        "Training for my first half marathon and my right knee hurts on the outside after 12 km. Should I book an assessment or rest first?",
    ),
    ask(
        71,
        "Sudeep",
        "Gowda",
        "+91 00000 00033",
        "HAL 2nd Stage",
        "Do you treat sciatica? Pain down my left leg for three weeks, worse sitting.",
    ),
    ask(
        66,
        "Maria",
        "D'Souza",
        "+91 00000 00082",
        "CV Raman Nagar",
        "Knee replacement scheduled for 2 October. Can I start prehab with you before the surgery?",
    ),
    ask(
        60,
        "Kiran",
        "Naidu",
        "+91 00000 00019",
        "Old Airport Road",
        "Is your clinic accessible by wheelchair? My mother uses one.",
    ),
    ask(
        55,
        "Shreya",
        "Menon",
        "+91 00000 00103",
        "Indiranagar",
        "I work on a laptop all day and have constant neck pain and headaches. Can you help with posture?",
    ),
    ask(
        49,
        "Naveen",
        "Patil",
        "+91 00000 00062",
        "Jeevan Bima Nagar",
        "Do you give receipts I can submit to my company's health reimbursement?",
    ),
    ask(
        44,
        "Aisha",
        "Khan",
        "+91 00000 00028",
        "Domlur",
        "Frozen shoulder for 4 months. Does dry needling help? I'm a bit scared of needles.",
    ),
    ask(
        38,
        "Rohan",
        "Joshi",
        "+91 00000 00038",
        "Indiranagar",
        "ACL surgery done at Manipal two weeks ago. Surgeon gave a protocol. When should I start physio?",
    ),
    ask(
        33,
        "Varsha",
        "Kulkarni",
        "+91 00000 00075",
        "HAL 2nd Stage",
        "Can you do Saturday appointments for my son, 14, who has heel pain from football?",
    ),
    ask(
        27,
        "Girish",
        "Bhat",
        "+91 00000 00104",
        "Whitefield",
        "Too far for regular visits. Do you do online follow-ups after one assessment in person?",
    ),
    ask(
        22,
        "Pooja",
        "Reddy",
        "+91 00000 00018",
        "Indiranagar",
        "Pregnant (6 months) with pelvic girdle pain. Do you treat pregnant women?",
    ),
    ask(
        18,
        "Siddharth",
        "Rao",
        "+91 00000 00085",
        "Domlur",
        "Cricket season starts next month. Do you do screening for fast bowlers?",
    ),
    ask(
        13,
        "Fatima",
        "Sheikh",
        "+91 00000 00042",
        "CV Raman Nagar",
        "How much is a home visit and how soon can someone come? My mother had a hip fracture fixed.",
    ),
    ask(
        9,
        "Abhishek",
        "Agarwal",
        "+91 00000 00108",
        "Indiranagar",
        "Lower back pain after deadlifts. Gym says rest; I'd rather get it checked. Free this week?",
    ),
    ask(
        5,
        "Sindhu",
        "Murthy",
        "+91 00000 00073",
        "Old Airport Road",
        "Do you have packs of sessions? My physio plan is twice a week for a month.",
    ),
    ask(
        2,
        "Vivek",
        "Thomas",
        "+91 00000 00016",
        "Indiranagar",
        "Ankle sprain playing badminton yesterday. Swollen. Should I come in now or wait?",
    ),
];

const WOMEN = [
    "Ananya",
    "Akshata",
    "Bhavya",
    "Chaitra",
    "Deepa",
    "Divya",
    "Harini",
    "Kavya",
    "Keerthana",
    "Lakshmi",
    "Meghana",
    "Nandini",
    "Pooja",
    "Priya",
    "Rashmi",
    "Sahana",
    "Shreya",
    "Shwetha",
    "Sindhu",
    "Sneha",
    "Spoorthi",
    "Swathi",
    "Varsha",
    "Vidya",
    "Aisha",
    "Fatima",
    "Neha",
    "Riya",
    "Tanvi",
    "Aditi",
    "Ishita",
    "Maria",
    "Sarah",
    "Divyashree",
    "Gayathri",
    "Jyothi",
    "Usha",
    "Radha",
];
const MEN = [
    "Abhishek",
    "Aditya",
    "Arjun",
    "Arvind",
    "Ashwin",
    "Chandan",
    "Darshan",
    "Girish",
    "Harsha",
    "Karthik",
    "Kiran",
    "Manjunath",
    "Naveen",
    "Nikhil",
    "Pradeep",
    "Prashanth",
    "Rahul",
    "Rakesh",
    "Rohan",
    "Sachin",
    "Santosh",
    "Siddharth",
    "Srinivas",
    "Sudeep",
    "Suresh",
    "Varun",
    "Vinay",
    "Vivek",
    "Imran",
    "Faisal",
    "Joseph",
    "Anirudh",
    "Ganesh",
    "Lokesh",
    "Ravi",
    "Prakash",
];
const LAST = [
    "Agarwal",
    "Ahmed",
    "Bhat",
    "Chandra",
    "D'Souza",
    "Desai",
    "Fernandes",
    "George",
    "Gowda",
    "Hegde",
    "Iyengar",
    "Iyer",
    "Jain",
    "Joshi",
    "Kamath",
    "Khan",
    "Krishnan",
    "Kulkarni",
    "Mathew",
    "Menon",
    "Murthy",
    "Nair",
    "Naidu",
    "Oommen",
    "Patil",
    "Pillai",
    "Prasad",
    "Rao",
    "Reddy",
    "Shetty",
    "Singh",
    "Srinivasan",
    "Thomas",
    "Upadhyay",
    "Varma",
    "Yadav",
    "Lobo",
    "Eapen",
    "Bhandary",
];

/** Bengaluru's year at a physio: injuries after the monsoon running season, quieter over the holidays. */
function motionSeason(iso: string): number {
    const md = iso.slice(5);
    if (md >= "12-20" || md <= "01-02") return 0.8;
    if (md >= "10-01" && md <= "12-19") return 1.1;
    if (md >= "06-01" && md <= "08-31") return 0.95;
    return 1;
}

const PHONE = "+91 00000 00008";
const ADDRESS = "2nd floor, 418 CMH Road, Indiranagar, Bengaluru 560038";
const img = (p: {
    url: string;
    alt: string;
    width: number;
    height: number;
}) => ({
    src: p.url,
    alt: p.alt,
    width: p.width,
    height: p.height,
});

export const MOTION: DsBusiness = {
    key: "mp",
    name: "Stride Physio",
    slug: "stride-physio",
    legalName: "Stride Physiotherapy LLP",
    contactEmail: "stridephysio@example.com",
    phoneE164: "+910000000008",
    phoneDisplay: PHONE,
    address: {
        addressLine1: "2nd floor, 418 CMH Road",
        addressLine2: "Indiranagar",
        city: "Bengaluru",
        postalCode: "560038",
    },
    addressPrinted:
        "2nd floor, 418 CMH Road, Indiranagar, Bengaluru 560038, Karnataka",
    storeAddress: ADDRESS,
    storeDescription:
        "Physiotherapy in Indiranagar, and the supports and bands your plan needs.",
    gst: null,
    sac: "9993",
    modules: [
        "APPOINTMENTS",
        "CRM",
        "WEBSITE",
        "PAYMENTS",
        "COMMERCE",
        "INSIGHTS",
    ],
    sinceDays: 330,
    openingHours: [
        { day: "MON", open: "07:30", close: "20:00", closed: false },
        { day: "TUE", open: "07:30", close: "20:00", closed: false },
        { day: "WED", open: "07:30", close: "20:00", closed: false },
        { day: "THU", open: "07:30", close: "20:00", closed: false },
        { day: "FRI", open: "07:30", close: "20:00", closed: false },
        { day: "SAT", open: "08:00", close: "14:00", closed: false },
        { day: "SUN", open: "08:00", close: "14:00", closed: true },
    ],
    rules: {
        bookAheadDays: 21,
        latestBookingMinutes: 180,
        freeCancelHours: 12,
    },
    services: MOTION_SERVICES,
    staff: MOTION_STAFF,
    ownerStaff: "ananya",
    desk: { first: "Shruti", last: "Gowda", staff: null },
    dayOff: {
        staff: ["rohit", "ananya"],
        reason: "At a sports physiotherapy workshop in Mysuru",
    },
    closures: [
        { from: "2025-10-20", days: 1, reason: "Closed for Deepavali" },
        { from: "2026-11-08", days: 1, reason: "Closed for Deepavali" },
        { from: "2027-10-29", days: 1, reason: "Closed for Deepavali" },
    ],
    packs: [
        {
            key: "six",
            name: "6 sessions",
            description:
                "Six follow-up, sports rehab or post-surgery sessions, to use within 60 days.",
            credits: 6,
            validityDays: 60,
            pricePaise: 540_000,
            services: ["followup", "sports-rehab", "postop-rehab"],
            sold: 18,
            cadenceDays: [3, 6],
        },
        {
            key: "ten",
            name: "10 sessions",
            description:
                "Ten follow-up, sports rehab or post-surgery sessions, to use within 120 days.",
            credits: 10,
            validityDays: 120,
            pricePaise: 850_000,
            services: ["followup", "sports-rehab", "postop-rehab"],
            sold: 10,
            cadenceDays: [3, 8],
        },
    ],
    plans: [
        {
            key: "keep-moving",
            name: "Keep Moving plan",
            description:
                "Two sessions a month for long-term back, neck or knee pain: a regular check-in and an updated programme. Booked through the desk; stop any time before the next month.",
            pricePaise: 190_000,
            classesPerMonth: 2,
            services: ["followup", "online-followup"],
            active: 50,
            ended: 48,
        },
    ],
    scenes: MOTION_SCENES,
    courses: {
        first: "assessment",
        then: ["followup", "followup", "sports-rehab", "postop-rehab"],
        perWeek: 6,
        lengths: [
            { visits: 1, weight: 12 },
            { visits: 2, weight: 14 },
            { visits: 3, weight: 30 },
            { visits: 4, weight: 10 },
            { visits: 5, weight: 8 },
            { visits: 6, weight: 10 },
            { visits: 8, weight: 8 },
            { visits: 10, weight: 4 },
        ],
        everyDays: [3, 7],
    },
    treatments: {
        service: "knee-programme",
        count: 12,
        everyDays: [3, 5],
        dropAfterThird: 0.35,
    },
    clients: MOTION_CLIENTS,
    generatedClients: 70,
    womenShare: 0.55,
    names: { women: WOMEN, men: MEN, last: LAST },
    diary: {
        pastShare: 0.08,
        aheadShare: 0.04,
        weekday: [0, 1.05, 1, 1, 1, 0.95, 0.9],
        noShow: 0.06,
        cancel: 0.07,
        lateShare: 0.35,
        online: 0.5,
        payNow: 0.3,
        paidAtDesk: 0.97,
        season: motionSeason,
    },
    counter: { perDay: 1.4, clientShare: 0.85 },
    categories: MOTION_CATEGORIES,
    options: MOTION_OPTIONS,
    products: MOTION_PRODUCTS,
    postCategories: { help: "Help", news: "News", articles: "Articles" },
    posts: MOTION_POSTS,
    enquiries: MOTION_ENQUIRIES,
    site: {
        createdDaysAgo: 320,
        footer: `Stride Physio · ${ADDRESS} · Mon–Fri 7:30–1 and 4–8, Sat 8–2 · ${PHONE}`,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading:
                                "Physiotherapy that gets you moving again, and keeps you there.",
                            subheading:
                                "Two physios in Indiranagar for knees, backs, necks, sports injuries and rehab after surgery. An hour-long first assessment, a plan you understand, and exercises you can do at home.",
                            cta: {
                                label: "Book an assessment",
                                href: "/book",
                                style: "primary",
                            },
                            image: img(MOTION_SERVICE_IMAGES.assessment),
                            onToday: true,
                        },
                    },
                    {
                        type: "servicesList",
                        services: [
                            "assessment",
                            "followup",
                            "sports-rehab",
                            "postop-rehab",
                            "online-followup",
                            "knee-programme",
                        ],
                        content: {
                            heading: "How we can help",
                            intro: "Healthcare is GST-exempt: the price you see is what you pay.",
                            showPrices: true,
                            showDescriptions: true,
                            buttonLabel: "Book",
                        },
                    },
                    {
                        type: "features",
                        content: {
                            heading: "What happens at your first visit",
                            columns: 2,
                            items: [
                                {
                                    title: "We listen first",
                                    body: "Your story, your goals, what makes it better and worse. Bring any scans and reports.",
                                },
                                {
                                    title: "A full examination",
                                    body: "How you move, where it hurts, strength and balance — so the plan fits you, not a diagnosis on paper.",
                                },
                                {
                                    title: "A plan you understand",
                                    body: "What we think is going on, how many sessions it usually takes, and what you'll do at home.",
                                },
                                {
                                    title: "Exercises from day one",
                                    body: "Two or three to start, on a sheet and in a short video, so you're not guessing at home.",
                                },
                            ],
                        },
                    },
                    {
                        type: "gallery",
                        content: {
                            layout: "grid",
                            images: MOTION_GALLERY.map(img),
                        },
                    },
                    {
                        type: "testimonials",
                        content: {
                            heading: "From our patients",
                            items: [
                                {
                                    quote: "Six weeks after my ACL surgery I was walking without the brace. Rohit made every session feel like progress.",
                                    name: "Vikram S.",
                                },
                                {
                                    quote: "Ananya fixed my running form, not just my knee. First 10K without pain in two years.",
                                    name: "Divya S.",
                                },
                                {
                                    quote: "Home visits after my mother's knee replacement saved us so many auto rides.",
                                    name: "Ramesh P.",
                                },
                            ],
                        },
                    },
                    {
                        type: "journal",
                        content: {
                            variant: "lead",
                            title: "Exercises, tips and news",
                            count: 3,
                            showExcerpts: true,
                            showImages: true,
                        },
                    },
                ],
            },
            {
                path: "/conditions",
                title: "Conditions we treat",
                sections: [
                    {
                        type: "projects",
                        content: {
                            title: "Conditions we treat",
                            items: [
                                {
                                    image: img(MOTION_CONDITIONS_IMAGES.knee),
                                    title: "Knee pain and osteoarthritis",
                                    summary:
                                        "Pain on stairs, stiffness after sitting, a knee that swells after walks. Strength and walking programmes, including our six-session knee programme.",
                                },
                                {
                                    image: img(MOTION_CONDITIONS_IMAGES.desk),
                                    title: "Neck and back pain",
                                    summary:
                                        "Desk neck, low back pain, sciatica. Movement, strength and changes to how you sit and work — not just a massage.",
                                },
                                {
                                    image: img(MOTION_CONDITIONS_IMAGES.sport),
                                    title: "Sports and running injuries",
                                    summary:
                                        "Runner's knee, Achilles and plantar heel pain, ankle sprains, shoulder pain in bowlers and swimmers, with return-to-sport testing.",
                                },
                                {
                                    image: img(
                                        MOTION_CONDITIONS_IMAGES.surgery,
                                    ),
                                    title: "Rehab after surgery",
                                    summary:
                                        "Knee and shoulder replacements, ACL reconstruction, fracture fixation — following your surgeon's protocol, at the clinic or at home.",
                                },
                            ],
                        },
                    },
                    {
                        type: "faq",
                        content: {
                            heading: "When to see a doctor first",
                            items: [
                                {
                                    question:
                                        "Should I see a doctor before a physio?",
                                    answer: "You don't need a referral. But see a doctor first if you have numbness in the groin, trouble passing urine, fever with back pain, chest pain, or an injury where you couldn't put weight on the leg at all.",
                                },
                                {
                                    question: "Do you treat pregnant women?",
                                    answer: "Yes — back and pelvic girdle pain are common in pregnancy. Tell us when you book; we adapt positions and exercises.",
                                },
                                {
                                    question:
                                        "I have a pacemaker. Is physio safe?",
                                    answer: "Yes. Tell us when you book: we don't use electrotherapy (IFT, TENS) with a pacemaker, and it's noted on your file.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/treatments",
                title: "Treatments & prices",
                sections: [
                    {
                        type: "servicesList",
                        services: [
                            "assessment",
                            "followup",
                            "sports-rehab",
                            "postop-rehab",
                            "dry-needling",
                            "knee-programme",
                        ],
                        content: {
                            heading: "At the clinic",
                            showPrices: true,
                            showDescriptions: true,
                            layout: "list",
                            buttonLabel: "Book",
                        },
                    },
                    {
                        type: "servicesList",
                        services: ["online-followup", "home-visit"],
                        content: {
                            heading: "At home or online",
                            intro: "Home visits are within about 4 km — Indiranagar, Domlur, HAL 2nd Stage, Jeevan Bima Nagar, CV Raman Nagar and Old Airport Road. Call the desk to book one.",
                            showPrices: true,
                            showDescriptions: true,
                            layout: "list",
                        },
                    },
                    {
                        type: "packs",
                        content: {
                            title: "Session packs",
                            showDescriptions: true,
                        },
                    },
                    {
                        type: "richText",
                        content: {
                            format: "html",
                            value: `<h2>The Keep Moving plan</h2><p>Two sessions a month for ₹1,900, for long-term back, neck or knee pain: a regular check-in and an updated programme. Ask the desk on ${PHONE}; stop any time before the next month.</p>`,
                        },
                    },
                ],
            },
            {
                path: "/team",
                title: "Team",
                sections: [
                    {
                        type: "person",
                        content: {
                            variant: "team",
                            title: "Your physios",
                            name: MOTION_STAFF[0].name,
                            role: MOTION_STAFF[0].title,
                            bio: MOTION_STAFF[0].bio,
                            people: [
                                {
                                    name: MOTION_STAFF[1].name,
                                    role: MOTION_STAFF[1].title,
                                    bio: MOTION_STAFF[1].bio,
                                },
                                {
                                    name: "Shruti Gowda",
                                    role: "Front desk",
                                    bio: "Bookings, packs, receipts and home-visit scheduling. The voice on the phone and WhatsApp.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/journal",
                title: "Exercises & tips",
                sections: [
                    {
                        type: "journal",
                        content: {
                            variant: "archive",
                            title: "Exercises, tips and news",
                            showExcerpts: true,
                            showImages: true,
                            archiveLimit: 24,
                        },
                    },
                ],
            },
            {
                path: "/contact",
                title: "Contact",
                sections: [
                    {
                        type: "contact",
                        content: {
                            heading: "Find the clinic",
                            intro: "Two minutes from Indiranagar metro (Purple Line). Lift in the building; two-wheeler parking in the basement.",
                            address: ADDRESS,
                            hours: "Mon–Fri 7:30 am – 1 pm and 4 pm – 8 pm · Sat 8 am – 2 pm · Sun closed",
                            phone: PHONE,
                            whatsapp: PHONE,
                            email: "stridephysio@example.com",
                        },
                    },
                    {
                        type: "enquiry",
                        form: {
                            name: "Ask a physio",
                            fields: [
                                {
                                    name: "name",
                                    label: "Your name",
                                    type: "text",
                                    required: true,
                                },
                                {
                                    name: "email",
                                    label: "Email",
                                    type: "email",
                                    required: true,
                                },
                                { name: "phone", label: "Phone", type: "tel" },
                                {
                                    name: "area",
                                    label: "Where you live",
                                    type: "text",
                                },
                                {
                                    name: "message",
                                    label: "What's going on?",
                                    type: "textarea",
                                    required: true,
                                },
                            ],
                        },
                        content: {
                            title: "Ask a physio",
                            description:
                                "Not sure what to book? Tell us what's going on and Shruti will reply with a suggestion, usually the same day.",
                            submitLabel: "Send",
                            successMessage:
                                "Thank you — we'll reply by email or WhatsApp, usually the same day.",
                        },
                    },
                ],
            },
        ],
    },
    analytics: {
        base: 110,
        growth: 0.3,
        weekend: 0.6,
        paths: [
            { path: "/", weight: 0.3 },
            { path: "/treatments", weight: 0.16 },
            { path: "/conditions", weight: 0.12 },
            { path: "/book", weight: 0.1 },
            { path: "/journal", weight: 0.1 },
            { path: "/team", weight: 0.04 },
            { path: "/contact", weight: 0.06 },
        ],
    },
};
