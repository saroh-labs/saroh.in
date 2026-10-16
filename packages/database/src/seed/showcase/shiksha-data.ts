import type { SeedSite } from "../data";
import type { ShowcaseCourse, ShowcaseService } from "./data";
import type { DemoImage } from "./demo-content";
import { demoAsset } from "./demo-content";
import { SA_PHOTOS } from "./shiksha-photos";
import type {
    BusinessSpec,
    PlanSpec,
    ProductSpec,
    QrSpec,
    StaffSpec,
} from "./vertical";
import { block } from "./vertical";

/**
 * Shiksha Academy — a NEET/JEE coaching centre on Gopalpura Bypass, Jaipur,
 * with a Class 9–10 foundation programme and Spoken English / IELTS. The
 * fixtures `shiksha.ts` turns into rows: the business, its faculty and their
 * hours, batches and classes, courses, monthly fee plans, the shop, the site.
 *
 * How a coaching centre maps onto Saroh today:
 * - a BATCH is a class-style service with its capacity and weekly times, so
 *   the site's timetable reads it; nobody books a batch session — students
 *   are on it through a fee plan or an instalment schedule;
 * - the free DEMO CLASS and the COUNSELLING CALL are bookable services;
 * - COURSES (crash course, IELTS, Spoken English) are the courses model:
 *   dated sessions, enrolments, an invoice on enrolment;
 * - MONTHLY FEES are subscription plans; the yearly programme's FOUR
 *   INSTALMENTS are invoices raised by hand each quarter — there is no
 *   instalment plan;
 * - each STUDENT is the contact; the PARENT is written on the student's
 *   record as a note — there is no parent login or linked contact.
 */

export const SA_KEY = "sa";
export const SA_SLUG = "shiksha-academy";
export const SA_NAME = "Shiksha Academy";
/** Commercial training and coaching (GST, 18%). */
export const SA_SAC = "999293";

const asset = (file: string, alt: string): DemoImage => ({
    url: demoAsset(SA_SLUG, file),
    alt,
    width: 1600,
    height: 1000,
    creditName: null,
    creditUrl: null,
});

export const SA_DRAWN = {
    timetable: asset(
        "timetable-neet-11.png",
        "Weekly timetable of the NEET Foundation Class 11 morning batch",
    ),
    results: asset(
        "results-2026.png",
        "Shiksha Academy results 2026: NEET and JEE Main toppers",
    ),
    fees: asset(
        "fee-instalments.png",
        "The ₹96,000 yearly programme fee in four instalments of ₹24,000",
    ),
    tests: asset(
        "test-calendar.png",
        "Sunday test and Major Test calendar, October to December 2026",
    ),
    admissions: asset(
        "admissions-steps.png",
        "Admissions in four steps: enquiry, counselling call, demo class, admission",
    ),
    ielts: asset(
        "ielts-weekend.png",
        "New IELTS weekend batch from 14 November",
    ),
};

/** Study material covers, drawn: subject × medium. */
const cover = (kind: "module" | "tests", subject: string, medium: string) =>
    asset(
        `${kind === "module" ? "module" : "tests"}-${subject.toLowerCase()}-${medium.toLowerCase()}.png`,
        `${kind === "module" ? "Study module" : "Sunday Test Series book"} cover — ${subject}, ${medium} medium`,
    );

export const SA_SPEC: BusinessSpec = {
    key: SA_KEY,
    slug: SA_SLUG,
    name: SA_NAME,
    legalName: "Shiksha Academy Education Services LLP",
    type: "llp",
    gst: { state: "08", pan: "ADQFS4821K", prefix: "SA" },
    address: {
        line1: "3rd floor, Laxmi Complex, Gopalpura Bypass",
        city: "Jaipur",
        postalCode: "302018",
    },
    printedAddress:
        "3rd floor, Laxmi Complex, Gopalpura Bypass, Jaipur 302018, Rajasthan",
    phone: "+911414007720",
    contactEmail: "shiksha.academy@example.com",
    modules: [
        "APPOINTMENTS",
        "CRM",
        "WEBSITE",
        "PAYMENTS",
        "COURSES",
        "COMMERCE",
        "INSIGHTS",
    ],
    team: [
        { first: "Vikram", last: "Choudhary", role: "ADMIN" },
        { first: "Kavita", last: "Saini", role: "MEMBER" },
    ],
    paymentProvider: "RAZORPAY",
    createdDaysAgo: 420,
    storefront: {
        name: "Shiksha Academy front desk",
        description:
            "Study modules, test-series books, uniforms and lab coats, at the front desk.",
        address: "3rd floor, Laxmi Complex, Gopalpura Bypass, Jaipur 302018",
        hours: [
            { day: "MON", open: "07:00", close: "20:30", closed: false },
            { day: "TUE", open: "07:00", close: "20:30", closed: false },
            { day: "WED", open: "07:00", close: "20:30", closed: false },
            { day: "THU", open: "07:00", close: "20:30", closed: false },
            { day: "FRI", open: "07:00", close: "20:30", closed: false },
            { day: "SAT", open: "07:00", close: "20:30", closed: false },
            { day: "SUN", open: "09:00", close: "13:00", closed: false },
        ],
    },
    bookingRules: {
        bookAheadDays: 21,
        latestBookingMinutes: 120,
        freeCancelHours: 6,
    },
};

const MON_SAT = [1, 2, 3, 4, 5, 6] as const;

/** The services, and for each its GST, whether the booking page shows it and who takes it. */
export const SA_SERVICES: readonly (ShowcaseService & {
    sac: string;
    shown: boolean;
})[] = [
    {
        name: "NEET Foundation — Class 11 Morning Batch",
        description:
            "Physics, Chemistry and Biology for NEET, from the Class 11 NCERT up. Monday to Saturday mornings, before school; 40 seats. Start with a free demo class.",
        minutes: 180,
        capacity: 40,
        priceCents: null,
        rules: [{ days: MON_SAT, from: "07:00", to: "10:00" }],
        weight: 0,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "NEET — Class 12 Evening Batch",
        description:
            "The second year of the NEET programme: the Class 12 syllabus, then full-length revision from January. Monday to Saturday evenings; 40 seats.",
        minutes: 180,
        capacity: 40,
        priceCents: null,
        rules: [{ days: MON_SAT, from: "16:00", to: "19:00" }],
        weight: 0,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "JEE Foundation — Class 11 Evening Batch",
        description:
            "Physics, Chemistry and Mathematics for JEE Main and Advanced, built on the Class 11 NCERT. Monday to Saturday evenings; 40 seats.",
        minutes: 180,
        capacity: 40,
        priceCents: null,
        rules: [{ days: MON_SAT, from: "16:00", to: "19:00" }],
        weight: 0,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "Class 9–10 Foundation (weekends)",
        description:
            "Science and Mathematics beyond the school syllabus, with Olympiad and NTSE practice. Saturday and Sunday mornings; 30 seats.",
        minutes: 180,
        capacity: 30,
        priceCents: null,
        rules: [{ days: [0, 6], from: "09:00", to: "12:00" }],
        weight: 0,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "JEE Main crash course class",
        description:
            "The class the 12-week JEE Main Crash Course is taught in: chapter-wise revision and a timed paper every Saturday.",
        minutes: 120,
        capacity: 40,
        priceCents: null,
        rules: [
            { days: [2, 4], from: "19:00", to: "21:00" },
            { days: [6], from: "17:00", to: "19:00" },
        ],
        weight: 0,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "IELTS weekend class",
        description:
            "Listening, Reading, Writing and Speaking for the Academic and General Training tests, with a mock test every fortnight. Saturday and Sunday mornings.",
        minutes: 120,
        capacity: 20,
        priceCents: null,
        rules: [{ days: [0, 6], from: "10:00", to: "12:00" }],
        weight: 0,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "Spoken English class",
        description:
            "Ninety minutes of speaking practice in a small group: introductions, interviews, presentations. Monday, Wednesday and Friday evenings.",
        minutes: 90,
        capacity: 25,
        priceCents: null,
        rules: [{ days: [1, 3, 5], from: "19:00", to: "20:30" }],
        weight: 0,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "Free demo class",
        description:
            "Sixty minutes in a real class with Vikram sir — a Physics topic, a short test and the answers — then a word with the counsellor. Parents are welcome.",
        minutes: 60,
        capacity: 15,
        priceCents: null,
        rules: [
            { days: [6], from: "16:00", to: "17:00" },
            { days: [0], from: "11:00", to: "12:00" },
        ],
        weight: 5,
        sac: SA_SAC,
        shown: true,
    },
    {
        name: "Admissions counselling call",
        description:
            "Thirty minutes with Kavita, our admissions counsellor: which batch fits, fees and instalments, the scholarship test. On the phone or at the centre.",
        minutes: 30,
        capacity: 1,
        priceCents: null,
        rules: [
            { days: MON_SAT, from: "11:00", to: "13:00" },
            { days: MON_SAT, from: "17:00", to: "19:00" },
        ],
        weight: 4,
        sac: SA_SAC,
        shown: true,
    },
];

export const SA_SERVICE = {
    neet11: 0,
    neet12: 1,
    jee11: 2,
    foundation: 3,
    crash: 4,
    ielts: 5,
    spoken: 6,
    demo: 7,
    counselling: 8,
} as const;

/** Faculty on the diary with their weekly hours; Vikram and Kavita sign in. */
export const SA_STAFF: readonly StaffSpec[] = [
    {
        key: "vikram",
        name: "Vikram Choudhary",
        title: "Director · Physics",
        login: "vikram",
        services: [SA_SERVICE.crash, SA_SERVICE.demo],
        hours: [
            { days: [1, 3, 5], from: "10:00", to: "14:00" },
            { days: [2, 4], from: "15:00", to: "21:00" },
            { days: [6], from: "15:00", to: "19:00" },
            { days: [0], from: "10:00", to: "13:00" },
        ],
    },
    {
        key: "neha",
        name: "Neha Agarwal",
        title: "Biology",
        services: [SA_SERVICE.neet11],
        hours: [{ days: MON_SAT, from: "07:00", to: "12:00" }],
    },
    {
        key: "saurabh",
        name: "Saurabh Jain",
        title: "Chemistry",
        services: [SA_SERVICE.neet12],
        hours: [{ days: MON_SAT, from: "13:00", to: "19:00" }],
    },
    {
        key: "amit",
        name: "Amit Meena",
        title: "Mathematics",
        services: [SA_SERVICE.jee11],
        hours: [{ days: MON_SAT, from: "14:00", to: "19:30" }],
    },
    {
        key: "priya",
        name: "Priya Rathore",
        title: "English & IELTS",
        services: [SA_SERVICE.ielts, SA_SERVICE.spoken],
        hours: [
            { days: [1, 3, 5], from: "16:00", to: "20:30" },
            { days: [0, 6], from: "09:30", to: "13:00" },
        ],
    },
    {
        key: "farhan",
        name: "Farhan Qureshi",
        title: "Physics & Maths · Foundation",
        services: [SA_SERVICE.foundation],
        hours: [
            { days: [2, 4], from: "14:00", to: "18:00" },
            { days: [0, 6], from: "08:30", to: "12:30" },
        ],
    },
    {
        key: "kavita",
        name: "Kavita Saini",
        title: "Admissions counsellor",
        login: "kavita",
        services: [SA_SERVICE.counselling],
        hours: [
            { days: MON_SAT, from: "10:30", to: "13:30" },
            { days: MON_SAT, from: "16:30", to: "19:30" },
        ],
    },
];

export const SA_COURSES: readonly ShowcaseCourse[] = [
    {
        name: "JEE Main Crash Course — 12 weeks",
        description:
            "Thirty-six classes before the January attempt: every high-weightage chapter revised, a timed paper each Saturday and its solutions the same evening.",
        service: SA_SERVICE.crash,
        pricePaise: 1_800_000,
        seats: 36,
        status: "OPEN",
        firstDay: -44,
        schedule: [
            { day: 2, at: "19:00" },
            { day: 4, at: "19:00" },
            { day: 6, at: "17:00" },
        ],
        sessions: 36,
        enrolled: 27,
        lateJoiners: 2,
        cancelled: 1,
    },
    {
        name: "IELTS — 8 weeks (weekend batch)",
        description:
            "Sixteen weekend classes and four full mock tests, for Academic and General Training. Starts after the Diwali break.",
        service: SA_SERVICE.ielts,
        pricePaise: 1_400_000,
        seats: 16,
        status: "OPEN",
        firstDay: 30,
        schedule: [
            { day: 6, at: "10:00" },
            { day: 0, at: "10:00" },
        ],
        sessions: 16,
        enrolled: 9,
    },
    {
        name: "Spoken English — 6 weeks",
        description:
            "Eighteen evening classes of speaking practice, ending with a mock interview recorded on video.",
        service: SA_SERVICE.spoken,
        pricePaise: 650_000,
        seats: 20,
        status: "CLOSED",
        firstDay: -80,
        schedule: [
            { day: 1, at: "19:00" },
            { day: 3, at: "19:00" },
            { day: 5, at: "19:00" },
        ],
        sessions: 18,
        enrolled: 18,
        cancelled: 1,
    },
    {
        name: "Spoken English — 6 weeks (December batch)",
        description: "The next Spoken English batch. Dates being fixed.",
        service: SA_SERVICE.spoken,
        pricePaise: 650_000,
        seats: 20,
        status: "DRAFT",
        firstDay: 48,
        schedule: [
            { day: 1, at: "19:00" },
            { day: 3, at: "19:00" },
            { day: 5, at: "19:00" },
        ],
        sessions: 18,
        enrolled: 0,
    },
];

/** Monthly fee plans: the families who pay month by month. */
export const SA_PLANS: readonly PlanSpec[] = [
    {
        name: "Class 11–12 classroom programme — monthly fee",
        description:
            "NEET or JEE classroom programme, paid month by month: classes, study modules for the month and the Sunday tests.",
        interval: "MONTH",
        pricePaise: 850_000,
        sac: SA_SAC,
    },
    {
        name: "Class 9–10 Foundation — monthly fee",
        description:
            "Weekend Science and Mathematics with Olympiad practice, paid monthly.",
        interval: "MONTH",
        pricePaise: 350_000,
        sac: SA_SAC,
    },
    {
        name: "Spoken English — monthly fee",
        description: "Three evening classes a week, paid monthly.",
        interval: "MONTH",
        pricePaise: 250_000,
        sac: SA_SAC,
    },
    {
        name: "Sunday Test Series — monthly",
        description:
            "For students studying elsewhere or on their own: every Sunday test and the monthly Major Test, with rank and analysis.",
        interval: "MONTH",
        pricePaise: 120_000,
        sac: SA_SAC,
    },
];

/** The yearly programme, paid in four instalments raised each quarter. */
export const SA_PROGRAMME = {
    name: "Two-year NEET/JEE classroom programme",
    yearlyPaise: 9_600_000,
    instalmentPaise: 2_400_000,
    registrationPaise: 200_000,
    /** Calendar months (0 = January) an instalment falls in. */
    months: [3, 6, 9, 0],
    dueDay: 10,
};

export const SA_CATEGORIES = [
    { key: "study-material", name: "Study material" },
    { key: "uniform", name: "Uniform & lab" },
    { key: "practice", name: "Practice & stationery" },
];

const SUBJECTS = ["Physics", "Chemistry", "Biology", "Mathematics"] as const;
const MEDIUMS = ["English", "Hindi"] as const;
const bySubjectAndMedium = <T>(make: (s: string, m: string) => T): T[] =>
    SUBJECTS.flatMap((s) => MEDIUMS.map((m) => make(s, m)));
const sizes = (
    prefix: string,
    list: readonly string[],
    stock: readonly number[],
) =>
    list.map((title, k) => ({
        title,
        sku: `${prefix}-${title}`,
        onHand: stock[k] ?? 10,
        warnAt: 4,
    }));

export const SA_PRODUCTS: readonly ProductSpec[] = [
    {
        slug: "study-module",
        name: "Study module — one subject",
        category: "study-material",
        description:
            "The printed theory and solved examples Shiksha's faculty teach from, one subject per module, in English or Hindi medium. Revised every April for the latest NCERT and NTA syllabus.\n\nEvery chapter ends with NCERT-level questions, previous-year NEET and JEE questions, and a self-check sheet. Enrolled students get the modules with their fees; this is for replacements and for students studying on their own.",
        keyPoints: [
            "Theory, solved examples and previous-year questions, chapter by chapter",
            "Written and revised by our faculty for 2026–27",
            "English or Hindi medium",
        ],
        price: "1250.00",
        hsn: "4901",
        gstRate: 0,
        images: bySubjectAndMedium((s, m) => cover("module", s, m)),
        option: "Subject · Medium",
        variants: bySubjectAndMedium((s, m) => ({
            title: `${s} · ${m}`,
            sku: `SM-${s.slice(0, 3).toUpperCase()}-${m.slice(0, 2).toUpperCase()}`,
            onHand: s === "Mathematics" && m === "Hindi" ? 3 : 18 + s.length,
            warnAt: 5,
        })),
        weight: 5,
        qty: [1, 1],
    },
    {
        slug: "sunday-test-series-book",
        name: "Sunday Test Series book",
        category: "study-material",
        description:
            "Twenty full-length chapter tests in the NEET/JEE pattern for one subject, with an answer key and detailed solutions at the back. The same papers our students sit on Sundays, for practice at home.",
        keyPoints: [
            "20 chapter tests with an answer key",
            "Detailed solutions for every question",
            "English or Hindi medium",
        ],
        price: "650.00",
        hsn: "4901",
        gstRate: 0,
        images: bySubjectAndMedium((s, m) => cover("tests", s, m)),
        option: "Subject · Medium",
        variants: bySubjectAndMedium((s, m) => ({
            title: `${s} · ${m}`,
            sku: `TS-${s.slice(0, 3).toUpperCase()}-${m.slice(0, 2).toUpperCase()}`,
            onHand: s === "Biology" && m === "English" ? 0 : 14 + s.length,
            warnAt: 4,
        })),
        weight: 4,
        qty: [1, 2],
    },
    {
        slug: "academy-t-shirt-navy",
        name: "Academy T-shirt — navy",
        category: "uniform",
        description:
            "The navy uniform T-shirt worn Monday to Friday: 180 GSM cotton, the academy crest on the chest, printed name strip on the back.",
        keyPoints: ["100% cotton, 180 GSM", "Crest on the chest", "S to XXL"],
        price: "449.00",
        hsn: "6109",
        gstRate: 5,
        images: [
            asset("tshirt-navy.png", "Navy Shiksha Academy T-shirt, front"),
        ],
        option: "Size",
        variants: sizes(
            "TS-NV",
            ["S", "M", "L", "XL", "XXL"],
            [8, 22, 19, 9, 2],
        ),
        weight: 3,
        qty: [1, 2],
        materials: "100% combed cotton, 180 GSM.",
        howToUse: "Machine wash cold, inside out. Do not iron the print.",
    },
    {
        slug: "academy-t-shirt-white",
        name: "Academy T-shirt — white",
        category: "uniform",
        description:
            "The white T-shirt worn for Saturday tests and events: 180 GSM cotton with the crest in navy.",
        keyPoints: ["100% cotton, 180 GSM", "Navy crest", "S to XXL"],
        price: "449.00",
        hsn: "6109",
        gstRate: 5,
        images: [
            asset("tshirt-white.png", "White Shiksha Academy T-shirt, front"),
        ],
        option: "Size",
        variants: sizes(
            "TS-WH",
            ["S", "M", "L", "XL", "XXL"],
            [6, 15, 14, 7, 3],
        ),
        weight: 2,
        qty: [1, 1],
        materials: "100% combed cotton, 180 GSM.",
        howToUse: "Machine wash cold, inside out. Do not iron the print.",
    },
    {
        slug: "lab-coat",
        name: "Lab coat",
        category: "uniform",
        description:
            "A full-sleeve white lab coat for the chemistry and biology practicals, with the academy crest on the pocket. Required from the first practical.",
        keyPoints: [
            "Poly-cotton, full sleeves",
            "Crest on the pocket",
            "S to XL",
        ],
        price: "549.00",
        hsn: "6211",
        gstRate: 5,
        images: [
            asset("lab-coat.png", "White lab coat with the academy crest"),
        ],
        option: "Size",
        variants: sizes("LC", ["S", "M", "L", "XL"], [7, 12, 9, 4]),
        weight: 1.5,
        qty: [1, 1],
    },
    {
        slug: "omr-practice-pack",
        name: "OMR practice pack — 50 sheets",
        category: "practice",
        description:
            "Fifty OMR answer sheets in the NEET layout (200 questions, four options) for practice at home. Filling bubbles cleanly under time is a skill; this is how it is practised.",
        keyPoints: ["50 sheets, NEET layout", "200 questions per sheet"],
        price: "199.00",
        hsn: "4820",
        gstRate: 0,
        images: [asset("omr-pack.png", "A pack of 50 NEET-pattern OMR sheets")],
        stock: { onHand: 64, warnAt: 15 },
        weight: 3,
        qty: [1, 3],
    },
    {
        slug: "formula-handbook",
        name: "Physics & Maths formula handbook",
        category: "practice",
        description:
            "Every formula from Class 11 and 12 Physics and Mathematics on 120 pocket-sized pages, chapter by chapter, with the units and the traps.",
        keyPoints: ["120 pages, pocket size", "Class 11 and 12 together"],
        price: "299.00",
        hsn: "4901",
        gstRate: 0,
        images: [
            asset("formula-handbook.png", "Physics and Maths formula handbook"),
        ],
        stock: { onHand: 41, warnAt: 10 },
        weight: 2,
        qty: [1, 1],
    },
    {
        slug: "notebook-pack",
        name: "Notebook pack — 5 long books",
        category: "practice",
        description:
            "Five 200-page long books, ruled, with the academy timetable printed inside the cover.",
        keyPoints: ["5 × 200 pages", "Timetable inside the cover"],
        price: "240.00",
        hsn: "4820",
        gstRate: 0,
        images: [SA_PHOTOS.notebook],
        stock: { onHand: 80, warnAt: 20 },
        weight: 2,
        qty: [1, 2],
    },
];

export const SA_QR: readonly QrSpec[] = [
    {
        key: "admissions-flyer",
        code: "k7rw",
        targetKind: "PAGE",
        page: 5,
        place: "FLYER",
        placeNote:
            "Admissions 2027–28 flyer, handed out at schools in Malviya Nagar and Mansarovar",
        label: "Scan for admissions 2027–28",
        color: "#1d3a6b",
        createdDaysAgo: 18,
        perDay: 9,
    },
    {
        key: "demo-standee",
        code: "h4px",
        targetKind: "BOOK",
        place: "COUNTER",
        placeNote: "Standee at the reception",
        label: "Book a free demo class",
        color: "#1d3a6b",
        createdDaysAgo: 120,
        perDay: 3,
    },
    {
        key: "shop-counter",
        code: "t9mb",
        targetKind: "SHOP",
        place: "COUNTER",
        placeNote: "Study material counter",
        label: "Order study material",
        color: "#c2410c",
        createdDaysAgo: 120,
        perDay: 2,
    },
];

// --- People --------------------------------------------------------------

export const SA_NAMES = {
    first: [
        "Aarav",
        "Aditya",
        "Ananya",
        "Arjun",
        "Bhavya",
        "Chirag",
        "Deepika",
        "Devansh",
        "Divya",
        "Garima",
        "Harsh",
        "Ishaan",
        "Ishita",
        "Jatin",
        "Kavya",
        "Khushi",
        "Kunal",
        "Lakshya",
        "Manan",
        "Mansi",
        "Naman",
        "Nandini",
        "Nikita",
        "Pallavi",
        "Pranav",
        "Priyanshi",
        "Rahul",
        "Riya",
        "Rohit",
        "Sakshi",
        "Sanya",
        "Shivam",
        "Shreya",
        "Simran",
        "Sneha",
        "Tanishq",
        "Tanya",
        "Utkarsh",
        "Vaibhav",
        "Vanshika",
        "Yash",
        "Yuvraj",
        "Ayaan",
        "Anushka",
        "Kritika",
        "Dhruv",
        "Muskan",
        "Aakash",
        "Vidhi",
        "Lokesh",
        "Hemant",
        "Payal",
    ],
    last: [
        "Sharma",
        "Agarwal",
        "Jain",
        "Meena",
        "Choudhary",
        "Saini",
        "Gupta",
        "Khandelwal",
        "Rathore",
        "Shekhawat",
        "Singh",
        "Mathur",
        "Joshi",
        "Kumawat",
        "Gurjar",
        "Yadav",
        "Bansal",
        "Goyal",
        "Maheshwari",
        "Sethi",
        "Verma",
        "Soni",
        "Bhatia",
        "Purohit",
        "Vyas",
        "Mittal",
        "Pareek",
        "Rajawat",
        "Tak",
        "Bairwa",
    ],
};

export const SA_PARENT_NAMES = {
    father: [
        "Rakesh",
        "Suresh",
        "Mahesh",
        "Anil",
        "Sanjay",
        "Rajendra",
        "Vinod",
        "Pradeep",
        "Ashok",
        "Manoj",
        "Dinesh",
        "Ramesh",
        "Mukesh",
        "Sunil",
        "Pankaj",
        "Naresh",
        "Girish",
        "Hemraj",
    ],
    mother: [
        "Sunita",
        "Kavita",
        "Rekha",
        "Anita",
        "Meena",
        "Seema",
        "Pooja",
        "Neelam",
        "Sangeeta",
        "Mamta",
        "Renu",
        "Sarita",
        "Usha",
        "Manju",
    ],
};

/** Programme an enquiry is about, and what a joining is worth (paise). */
export const SA_LEADS: readonly {
    title: string;
    value: number;
    course: string;
}[] = [
    {
        title: "NEET 2027–28 — Class 11 admission",
        value: 9_600_000,
        course: "NEET Class 11",
    },
    {
        title: "JEE 2027–28 — Class 11 admission",
        value: 9_600_000,
        course: "JEE Class 11",
    },
    {
        title: "Class 9 Foundation — 2027",
        value: 4_200_000,
        course: "Class 9–10 Foundation",
    },
    {
        title: "JEE Main Crash Course",
        value: 1_800_000,
        course: "JEE Main Crash Course",
    },
    { title: "IELTS weekend batch", value: 1_400_000, course: "IELTS" },
    {
        title: "Spoken English — December batch",
        value: 650_000,
        course: "Spoken English",
    },
    {
        title: "NEET repeater — Class 12 pass-outs",
        value: 9_600_000,
        course: "NEET repeater",
    },
];

export const SA_PIPELINE = {
    name: "Admissions 2027–28",
    stages: ["Enquiry", "Counselling call", "Demo class attended", "Admitted"],
};

export const SA_TIMELINE = {
    notes: [
        "Parent asked about hostel — shared the list of verified PGs in Triveni Nagar.",
        "Father wants to see the Class 11 timetable before deciding. Sent it on WhatsApp.",
        "Scored 91% in Class 10 boards — eligible for the 25% scholarship test.",
        "Mother asked whether the morning batch clashes with school. It doesn't; school is from 12:30.",
        "Comparing us with a Kota institute. Concern is distance; she would stay in Jaipur with us.",
        "Wants Hindi-medium modules for Chemistry only. Confirmed we have both.",
        "Came to the Saturday demo class with his father. Liked the doubt session.",
        "Asked about paying in four instalments instead of monthly — sent the schedule.",
        "Dropped a year after NEET 2026 (512). Wants the repeater batch.",
        "Working professional, needs IELTS band 7 for Canada PR by March.",
        "Not interested any more — joined the school's own coaching.",
    ],
    tasks: [
        "Call parent back about fee instalments",
        "Book the Saturday demo class",
        "Send the batch timetable on WhatsApp",
        "Share the scholarship test date",
        "Follow up after the demo class",
        "Collect Class 10 marksheet and photos",
    ],
};

export const SA_ENQUIRY_FIELDS = [
    { name: "name", label: "Student's name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Parent's phone", type: "tel", required: true },
    { name: "course", label: "Class / course", type: "text", required: true },
    {
        name: "message",
        label: "Anything we should know?",
        type: "textarea",
    },
] as const;

/** What families write in the admissions form. */
export const SA_ENQUIRIES: readonly string[] = [
    "My daughter is in Class 10 at St. Xavier's. We want the NEET morning batch from April. Is there a scholarship test?",
    "Do you have a hostel or a PG tie-up? We are from Dausa.",
    "Can my son join the JEE crash course midway? He is in Class 12 at Kendriya Vidyalaya.",
    "Please share the fee structure for the two-year NEET programme and the instalment dates.",
    "Is the IELTS batch for Academic or General Training? I need band 7 for nursing in the UK.",
    "We want to attend a demo class this Saturday with both parents.",
    "My son scored 89% in Class 10. Which batch, JEE or NEET? He likes Maths more.",
    "Does the Class 9 foundation cover NTSE and Olympiads?",
    "Is Hindi medium study material available for all subjects?",
    "What are the timings of the Spoken English batch? I work till 6.",
    "My daughter is a NEET 2026 dropper (538). Do you have a repeater batch?",
    "Can we pay monthly instead of the yearly fee?",
    "Is there transport from Vaishali Nagar?",
    "Kindly call after 7 pm, I am at the shop till then.",
    "How many students in one batch? We want individual attention.",
    "Do you give test results to parents?",
];

// --- The site --------------------------------------------------------------

const hero = (
    heading: string,
    subheading: string,
    image?: DemoImage,
    cta?: { label: string; href: string },
) =>
    block("hero", {
        heading,
        subheading,
        ...(image
            ? {
                  image: {
                      src: image.url,
                      alt: image.alt,
                      width: image.width,
                      height: image.height,
                  },
              }
            : {}),
        ...(cta ? { cta: { ...cta, style: "primary" } } : {}),
    });

const img = (image: DemoImage) => ({
    src: image.url,
    alt: image.alt,
    width: image.width,
    height: image.height,
});

const text = (
    value: string,
    image: DemoImage,
    imageSide: "left" | "right" | "above",
) => block("richText", { format: "html", value, image: img(image), imageSide });

export const SA_FOOTER =
    "Shiksha Academy · 3rd floor, Laxmi Complex, Gopalpura Bypass, Jaipur 302018 · +91 141 400 7720 · Mon–Sat 7 am to 8:30 pm";

export const SA_SITE: SeedSite = {
    slug: SA_SLUG,
    name: SA_NAME,
    subdomain: SA_SLUG,
    published: true,
    createdDaysAgo: 380,
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                hero(
                    "NEET and JEE coaching in Jaipur, in batches of forty",
                    "Classroom programmes for Class 11 and 12, a weekend foundation for Class 9 and 10, and Spoken English and IELTS. Sit in on a free demo class before you decide.",
                    SA_PHOTOS.hero,
                    { label: "Book a free demo class", href: "/demo" },
                ),
                block("features", {
                    variant: "facts",
                    heading: "Shiksha in numbers",
                    items: [
                        {
                            value: "40",
                            title: "seats in a batch",
                            body: "Never more. Every student is known by name.",
                        },
                        {
                            value: "47",
                            title: "above 550 in NEET 2026",
                            body: "Of 112 students who sat the exam.",
                        },
                        {
                            value: "99.71",
                            title: "percentile in JEE Main 2026",
                            body: "Kunal Agarwal, our highest this year.",
                        },
                        {
                            value: "Every Sunday",
                            title: "a test in the exam pattern",
                            body: "With OMR sheets, ranks and analysis.",
                        },
                    ],
                }),
                {
                    type: "servicesList",
                    services: [0, 1, 2, 3],
                    content: {
                        heading: "Batches",
                        intro: "Each batch has its own faculty and a fixed timetable for the year.",
                    },
                },
                block("testimonials", {
                    heading: "What families say",
                    items: [
                        {
                            quote: "The Sunday tests made the difference. By March she had sat thirty full papers and the real exam felt like another Sunday.",
                            name: "Rekha Sharma",
                            role: "Mother of Ananya, NEET 2026 (682)",
                        },
                        {
                            quote: "Vikram sir answers doubts on the same day. My son stopped being afraid of Physics in the first month.",
                            name: "Mahesh Kumawat",
                            role: "Father of Mohit, NEET 2026",
                        },
                        {
                            quote: "Small batch, and Kavita ma'am calls me every month about attendance and marks. As a parent that is what I needed.",
                            name: "Seema Jain",
                            role: "Mother of a Class 11 JEE student",
                        },
                    ],
                }),
                block("productGrid", {
                    title: "Study material and uniform",
                    count: 4,
                }),
                block("journal", { title: "News and articles", count: 3 }),
                {
                    type: "cta",
                    content: {
                        label: "Talk to our counsellor",
                        href: "/admissions",
                        style: "primary",
                    },
                },
            ],
        },
        {
            path: "/courses",
            title: "Courses",
            sections: [
                hero(
                    "Courses and fees",
                    "The two-year programme for NEET and JEE, short courses that start and finish on fixed dates, and monthly fees for families who prefer them.",
                    SA_PHOTOS.classroom,
                ),
                text(
                    "<h2>Two-year NEET/JEE classroom programme</h2><p>₹96,000 a year, all-inclusive of study modules and the Sunday test series, payable in four instalments of ₹24,000 due on 10 April, 10 July, 10 October and 10 January. A ₹2,000 registration fee is paid at admission. Fees include 18% GST.</p><h2>JEE Main Crash Course — 12 weeks</h2><p>Thirty-six classes before the January attempt, Tuesday and Thursday evenings and Saturdays. ₹18,000.</p><h2>IELTS — 8 weeks</h2><p>Weekend mornings from 14 November, sixteen classes and four mock tests. ₹14,000.</p><h2>Spoken English — 6 weeks</h2><p>Monday, Wednesday and Friday evenings. ₹6,500. The December batch opens soon.</p>",
                    SA_DRAWN.fees,
                    "right",
                ),
                block("plans", {
                    title: "Monthly fees",
                    intro: "Pay month by month instead of the yearly instalments. Cancel before the next month begins.",
                    highlight: "first",
                }),
                {
                    type: "servicesList",
                    services: [4, 5, 6],
                    content: { heading: "Course classes", showPrices: false },
                },
            ],
        },
        {
            path: "/batches",
            title: "Batches & timetable",
            sections: [
                hero(
                    "Batches and this week's timetable",
                    "Morning batches finish before school; evening batches start after it. Weekend batches for Class 9 and 10, IELTS and the crash course.",
                ),
                block("timetable", {
                    variant: "grid",
                    title: "This week",
                    intro: "Times are fixed for the year. A change is announced a week ahead.",
                    showTrainer: true,
                    showPlacesLeft: false,
                }),
                text(
                    "<h2>A week in the NEET Class 11 morning batch</h2><p>Three hours a morning, six days a week, before school: two subjects a day and thirty minutes of doubt-clearing. Sunday is test day.</p>",
                    SA_DRAWN.timetable,
                    "above",
                ),
                {
                    type: "faq",
                    content: {
                        heading: "About batches",
                        items: [
                            {
                                question: "Can my child change batch?",
                                answer: "Once, free, in the first month — for example from the evening to the morning batch if school timings change.",
                            },
                            {
                                question: "What if a class is missed?",
                                answer: "The class notes are in the module, and the faculty take doubts after class. Missing three classes in a row, we call the parent.",
                            },
                            {
                                question: "When are the tests?",
                                answer: "Every Sunday at 9 am, and a full-length Major Test on the last Sunday of the month.",
                            },
                        ],
                    },
                },
            ],
        },
        {
            path: "/results",
            title: "Results",
            sections: [
                hero(
                    "Results 2026",
                    "Forty-seven of our 112 NEET students scored above 550. Here are a few of them, in their own words.",
                    SA_PHOTOS.celebration,
                ),
                block("projects", {
                    variant: "cards",
                    title: "Toppers 2026",
                    items: [
                        {
                            title: "Ananya Sharma — NEET 682/720",
                            summary:
                                "Two-year NEET programme, morning batch. Now at SMS Medical College, Jaipur.",
                            image: img(SA_PHOTOS.studying),
                            year: "2026",
                        },
                        {
                            title: "Kunal Agarwal — JEE Main 99.71 percentile",
                            summary:
                                "JEE evening batch and the crash course. Now at NIT Trichy, Computer Science.",
                            image: img(SA_PHOTOS.whiteboard),
                            year: "2026",
                        },
                        {
                            title: "Mohit Kumawat — NEET 664/720",
                            summary:
                                "Joined in Class 11 from a Hindi-medium school; wrote NEET in English.",
                            image: img(SA_PHOTOS.selfStudy),
                            year: "2026",
                        },
                        {
                            title: "Ritika Jain — JEE Main 99.12 percentile",
                            summary:
                                "Evening batch. Topped our Major Tests five months running.",
                            image: img(SA_PHOTOS.notebook),
                            year: "2026",
                        },
                        {
                            title: "Sneha Choudhary — NEET 651/720",
                            summary:
                                "Repeater batch: 498 in 2025, 651 in 2026.",
                            image: img(SA_PHOTOS.exam),
                            year: "2026",
                        },
                        {
                            title: "Simran Kaur — IELTS band 8.0",
                            summary:
                                "Eight-week IELTS course, General Training. Now a nurse in Manchester.",
                            image: img(SA_PHOTOS.english),
                            year: "2026",
                        },
                    ],
                }),
                text(
                    "<h2>The full list</h2><p>NEET 2026: Ananya Sharma 682, Mohit Kumawat 664, Sneha Choudhary 651, Aditya Saini 640. JEE Main 2026: Kunal Agarwal 99.71, Ritika Jain 99.12, Harsh Meena 98.64 percentile. IELTS: Simran Kaur 8.0, Arjun Rathi 7.5.</p>",
                    SA_DRAWN.results,
                    "above",
                ),
            ],
        },
        {
            path: "/faculty",
            title: "Faculty",
            sections: [
                block("person", {
                    variant: "team",
                    title: "Who teaches at Shiksha",
                    name: "Vikram Choudhary",
                    role: "Director · Physics",
                    bio: "Taught Physics in Kota for nine years before starting Shiksha in Jaipur in 2014, so students would not have to leave home at sixteen.",
                    image: img(SA_PHOTOS.whiteboard),
                    people: [
                        {
                            name: "Neha Agarwal",
                            role: "Biology",
                            bio: "M.Sc. Botany, University of Rajasthan. Twelve years teaching NEET Biology, NCERT line by line.",
                        },
                        {
                            name: "Saurabh Jain",
                            role: "Chemistry",
                            bio: "B.Tech, MNIT Jaipur. Organic chemistry as stories, not lists.",
                        },
                        {
                            name: "Amit Meena",
                            role: "Mathematics",
                            bio: "M.Sc. Mathematics. Runs the JEE problem-solving hour every Saturday.",
                        },
                        {
                            name: "Priya Rathore",
                            role: "English & IELTS",
                            bio: "CELTA-certified. Seven years preparing students for IELTS and interviews.",
                        },
                        {
                            name: "Farhan Qureshi",
                            role: "Physics & Maths · Foundation",
                            bio: "Teaches Class 9 and 10 at weekends; Olympiad mentor.",
                        },
                        {
                            name: "Kavita Saini",
                            role: "Admissions counsellor",
                            bio: "The first person families speak to, and the one who calls about attendance.",
                        },
                    ],
                }),
            ],
        },
        {
            path: "/admissions",
            title: "Admissions",
            sections: [
                hero(
                    "Admissions 2027–28 are open",
                    "Four steps: tell us about your child, talk to our counsellor, sit in on a demo class, then admission. Early-bird ₹5,000 off the first instalment until 30 November.",
                    SA_PHOTOS.parents,
                ),
                text(
                    "<h2>How admission works</h2><ol><li>Send the enquiry below, or call +91 141 400 7720.</li><li>Kavita calls you back within a day for a 30-minute counselling call.</li><li>Sit in on a free demo class on Saturday or Sunday.</li><li>Admission: the form, Class 10 marksheet, two photos and the ₹2,000 registration fee.</li></ol>",
                    SA_DRAWN.admissions,
                    "right",
                ),
                {
                    type: "enquiry",
                    form: {
                        name: "Admissions enquiry",
                        fields: SA_ENQUIRY_FIELDS,
                    },
                    content: {
                        title: "Admissions enquiry",
                        description:
                            "Our counsellor calls the number you give within one working day.",
                        submitLabel: "Send enquiry",
                        successMessage:
                            "Thank you. Kavita will call you within one working day.",
                    },
                },
                {
                    type: "booking",
                    service: SA_SERVICE.counselling,
                    content: {
                        title: "Or book a counselling call",
                        description:
                            "Thirty minutes, on the phone or at the centre.",
                        submitLabel: "Book the call",
                        successMessage:
                            "Booked. Kavita will call you at that time.",
                    },
                },
            ],
        },
        {
            path: "/demo",
            title: "Free demo class",
            sections: [
                hero(
                    "Sit in on a free demo class",
                    "Sixty minutes in a real class with Vikram sir on Saturday afternoon or Sunday morning. Parents are welcome to stay.",
                    SA_PHOTOS.group,
                ),
                {
                    type: "booking",
                    service: SA_SERVICE.demo,
                    content: {
                        title: "Book a demo class",
                        description:
                            "Bring a notebook and a pen. Fifteen places in each class.",
                        submitLabel: "Book my place",
                        successMessage:
                            "Booked. See you at the centre — third floor, Laxmi Complex.",
                    },
                },
            ],
        },
        {
            path: "/journal",
            title: "Journal",
            sections: [
                block("journal", {
                    variant: "archive",
                    title: "News, help and articles",
                    groupByYear: false,
                    showTotal: true,
                }),
            ],
        },
        {
            path: "/contact",
            title: "Contact",
            sections: [
                hero(
                    "Visit the centre",
                    "Third floor, Laxmi Complex, on Gopalpura Bypass near the Gopalpura flyover. Parking in the basement.",
                    SA_PHOTOS.jaipur,
                ),
                block("visitUs", {
                    title: "Find us",
                    showMap: true,
                    showHours: true,
                }),
                {
                    type: "faq",
                    content: {
                        heading: "Before you visit",
                        items: [
                            {
                                question: "Do you have a hostel?",
                                answer: "No. We keep a list of verified PGs in Gopalpura and Triveni Nagar, and one girls' PG run by a parent. Ask at the front desk.",
                            },
                            {
                                question:
                                    "Can parents see attendance and marks?",
                                answer: "Kavita sends attendance and test marks to parents on WhatsApp every month, and we meet parents on the second Saturday.",
                            },
                        ],
                    },
                },
            ],
        },
    ],
};

export const SA_PATHS = [
    { path: "/", weight: 0.3 },
    { path: "/courses", weight: 0.14 },
    { path: "/batches", weight: 0.1 },
    { path: "/results", weight: 0.12 },
    { path: "/admissions", weight: 0.1 },
    { path: "/demo", weight: 0.06 },
    { path: "/faculty", weight: 0.04 },
    { path: "/blog", weight: 0.07 },
    { path: "/shop", weight: 0.05 },
    { path: "/contact", weight: 0.02 },
];
