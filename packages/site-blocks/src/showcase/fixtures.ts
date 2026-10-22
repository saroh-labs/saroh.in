import type { TemplateContext } from "@saroh/templates";
import {
    BAKERY_GALLERY_SAMPLE,
    BLOGS_GALLERY_SAMPLE,
    CERAMICS_GALLERY_SAMPLE,
    CLINIC_GALLERY_SAMPLE,
    DEVELOPER_GALLERY_SAMPLE,
    DIETICIAN_GALLERY_SAMPLE,
    GYM_GALLERY_SAMPLE,
    SALON_GALLERY_SAMPLE,
    STUDIO_GALLERY_SAMPLE,
} from "@saroh/templates";
import type { JournalPost } from "../blocks/journal";
import type { PublicToday, PublicTodayItem } from "../blocks/on-today";
import type { PublicPack } from "../blocks/packs";
import type { PublicPlan } from "../blocks/plans";
import type { PublicService } from "../blocks/services-list";
import type { OpeningHoursDay } from "../lib/opening-hours";
import type { PublicVisit } from "../lib/public-visit";
import type { PublicTimetable, TimetableSession } from "../lib/timetable-read";

/**
 * The sample businesses the gallery's renders show (industry templates U14,
 * KTD-6): for each gallery template, the data its bound blocks would read
 * from a real business — breads, pieces, a week of classes, a consultation,
 * posts, hours — taken from the template's design
 * (`saroh-designs/templates/*`), and its footer's line. The design's words
 * for the owner placeholders the gallery fills in are the template's own
 * `*_GALLERY_SAMPLE`, laid over the sections by `@saroh/templates`
 * (`withGallerySample`, `gallery-patches.ts`), which the copy into a draft
 * shares (DEC-182).
 *
 * A PICTURE, NEVER A SITE. Two readers draw it: `/template-renders`
 * (`apps/saroh.app`), which a production deployment never serves
 * (`guard.ts`), and a look's Preview in the editor (DEC-182). Nothing here
 * is ever written to a merchant's site or draft: bound blocks stay bound
 * (KTD-4), so a site made from the template, or given its starter
 * content, reads its own business and shows none of this.
 *
 * Honest by construction: no stock photograph. Every image slot is drawn
 * as its brief — the words saying what the photograph should show — on a
 * tinted ground (`brief-image.ts`); no phone number; and an email only at
 * `example.com`, named for the sample (`sampleEmail`).
 */

/** A product as the gallery shows it: its photograph is still a brief. */
export interface ProductFixture {
    slug: string;
    name: string;
    /** Rupees, as the catalogue sends them ("420.00"). */
    price: string;
    blurb: string | null;
    brief: string;
    soldOut?: boolean;
}

/** A post; its photograph, where the design has one, is a brief too. */
export type PostFixture = Omit<JournalPost, "image"> & { brief?: string };

export interface TemplateFixture {
    /** What the sample business's profile says, beyond its name. */
    context?: Omit<TemplateContext, "organizationName" | "modules">;
    services?: PublicService[];
    visit?: Omit<PublicVisit, "name" | "source" | "storeId" | "timezone">;
    timetable?: PublicTimetable;
    /** The hero's On today panel: today's free times, by who has them. */
    today?: PublicToday;
    posts?: PostFixture[];
    plans?: PublicPlan[];
    packs?: PublicPack[];
    products?: ProductFixture[];
    /** The footer's line, in place of the template's line for the owner. */
    footer?: string;
}

/** India, as the designs are. */
export const FIXTURE_TIME_ZONE = "Asia/Kolkata";

/**
 * The day every render is drawn on: a Tuesday, the first day every sample
 * business is open (the bakery, the studio and the salon shut on Mondays).
 */
export const FIXTURE_DAY = "2026-10-13";

/**
 * The moment every render is drawn at (`SiteFixtures.now`): 10:30 in India
 * on {@link FIXTURE_DAY}, inside every sample business's opening hours. So
 * "Open now" and "Free today" agree, and a capture taken at night reads the
 * same as one taken in the morning. Live sites read the clock.
 */
export const FIXTURE_NOW = `${FIXTURE_DAY}T05:00:00.000Z`;

type Day = OpeningHoursDay["day"];

/** A week of hours from "07:00–15:00"-style rows; days not named are closed. */
function week(open: Partial<Record<Day, [string, string]>>): OpeningHoursDay[] {
    const days: Day[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    return days.map((day) => {
        const hours = open[day];
        return hours
            ? { day, open: hours[0], close: hours[1], closed: false }
            : { day, open: "00:00", close: "00:00", closed: true };
    });
}

/** A post's date at 08:00 in India, fixed so every capture is the same. */
const on = (date: string) => `${date}T02:30:00.000Z`;

// ---------------------------------------------------------------------------
// Bakery — "Rye & Co." (Bakery.dc.html)
// ---------------------------------------------------------------------------

const bakery: TemplateFixture = {
    context: {
        tagline:
            "A small bakery on Hill Road. We mill our own wheat, ferment overnight, and bake what we can sell in a day.",
    },
    products: [
        {
            slug: "country-sourdough",
            name: "Country sourdough",
            price: "420.00",
            blurb: "Twenty-four hour ferment, stone-milled wheat, baked dark.",
            brief: "A whole dark-crusted loaf on brown paper, scored top, side light",
        },
        {
            slug: "seeded-rye",
            name: "Seeded rye",
            price: "390.00",
            blurb: "Sunflower, linseed and a little molasses. Keeps four days.",
            brief: "A dense rye loaf sliced open, seeds visible in the crumb",
        },
        {
            slug: "olive-loaf",
            name: "Olive loaf",
            price: "460.00",
            blurb: "Kalamata and a lot of it. Good with nothing on it.",
            brief: "Torn olive loaf on a wooden board, purple flecks showing",
        },
        {
            slug: "milk-bread",
            name: "Milk bread",
            price: "260.00",
            blurb: "Soft, faintly sweet, gone by nine most days.",
            brief: "A pale pull-apart milk loaf in a tin, steam just visible",
            soldOut: true,
        },
        {
            slug: "cardamom-bun",
            name: "Cardamom bun",
            price: "150.00",
            blurb: "Laminated, twisted, sticky at the edges.",
            brief: "Three cardamom buns on a tray, sugar catching the light",
        },
    ],
    visit: {
        address: "14 Hill Road\nBandra West\nMumbai 400050",
        phone: null,
        hours: week({
            TUE: ["07:00", "15:00"],
            WED: ["07:00", "15:00"],
            THU: ["07:00", "15:00"],
            FRI: ["07:00", "15:00"],
            SAT: ["07:00", "16:00"],
            SUN: ["08:00", "13:00"],
        }),
    },
    posts: [
        {
            title: "Why we bake fewer loaves on Mondays",
            slug: "fewer-loaves-on-mondays",
            excerpt:
                "We used to bake seven days and throw away Tuesday's bread. Closing one day made everything else better, including the bread.",
            publishedAt: on("2026-04-02"),
        },
        {
            title: "Inside the rye starter",
            slug: "inside-the-rye-starter",
            excerpt:
                "It is eleven years old, it lives in a clip-top jar, and it has been to Pune twice. What it actually needs is less than you would think.",
            publishedAt: on("2026-03-18"),
        },
        {
            title: "Notes from this year's wheat",
            slug: "this-years-wheat",
            excerpt:
                "The Khapli we buy came in wetter this season, which changes the hydration and the schedule. Here is what we adjusted.",
            publishedAt: on("2026-02-26"),
        },
    ],
    footer: BAKERY_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Ceramics, the gallery's "Store" — "Kiln" (Ceramics.spec.md)
// ---------------------------------------------------------------------------

const ceramics: TemplateFixture = {
    products: [
        {
            slug: "celadon-dinner-plate",
            name: "Celadon dinner plate",
            price: "2400.00",
            blurb: "Stoneware, 26cm · Reduction fired",
            brief: "One plate lit from the side so the glaze pooling at the rim reads",
        },
        {
            slug: "ash-glazed-mug",
            name: "Ash-glazed mug",
            price: "950.00",
            blurb: "Stoneware, 300ml",
            brief: "Mug from above, handle in profile",
        },
        {
            slug: "serving-bowl",
            name: "Serving bowl",
            price: "3800.00",
            blurb: "Stoneware, 32cm",
            brief: "Shallow bowl straight down, glaze pooling",
            soldOut: true,
        },
        {
            slug: "tumbler-set",
            name: "Tumbler, set of four",
            price: "2900.00",
            blurb: "Stoneware, 220ml each",
            brief: "Four tumblers, uneven heights, one tipped",
        },
        {
            slug: "matte-white-vase",
            name: "Vase, matte white",
            price: "4200.00",
            blurb: "Porcelain, 24cm tall",
            brief: "Tall vase, plain wall, long shadow",
        },
    ],
    footer: CERAMICS_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Gym — "Iron & Oak" (Gym.dc.html)
// ---------------------------------------------------------------------------

/**
 * The seven days from {@link FIXTURE_DAY} (a Tuesday), as the live read
 * sends them, so the timetable never opens on a day already gone. The
 * design's Monday-to-Friday classes keep their weekdays: Monday's fall on
 * the coming Monday, 19 Oct (`GYM_CLASS_DAYS`).
 */
const GYM_WEEK = [
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
];

/** The date each of the design's columns, Monday to Friday, falls on. */
const GYM_CLASS_DAYS = [
    "2026-10-19",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
];

/** One row per time; `fills` is a class that usually fills (a place or two left). */
const GYM_SLOTS: {
    time: string;
    cells: ([name: string, coach: string, fills?: boolean] | null)[];
}[] = [
    {
        time: "06:00",
        cells: [
            ["Strength", "Devika", true],
            ["Conditioning", "Arjun"],
            ["Strength", "Devika", true],
            ["Mobility", "Ritu"],
            ["Strength", "Devika", true],
        ],
    },
    {
        time: "12:30",
        cells: [
            ["Express 30", "Arjun"],
            null,
            ["Express 30", "Arjun"],
            null,
            ["Express 30", "Sameer"],
        ],
    },
    {
        time: "18:30",
        cells: [
            ["Conditioning", "Arjun"],
            ["Strength", "Devika", true],
            ["Boxing", "Sameer", true],
            ["Strength", "Devika", true],
            ["Open gym", "Staffed"],
        ],
    },
];

/** An India time on a date, as the instant the timetable read sends. */
function istInstant(date: string, time: string): string {
    const [h = 0, m = 0] = time.split(":").map(Number) as [number?, number?];
    const minutes = h * 60 + m - 330;
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCMinutes(minutes);
    return d.toISOString();
}

function gymTimetable(): PublicTimetable {
    const sessions: TimetableSession[] = [];
    for (const slot of GYM_SLOTS) {
        slot.cells.forEach((cell, day) => {
            if (!cell) return;
            const [name, coach, fills] = cell;
            const date = GYM_CLASS_DAYS[day] ?? FIXTURE_DAY;
            sessions.push({
                serviceId: `gym-${name.toLowerCase().replace(/\W+/g, "-")}`,
                serviceName: name,
                durationMinutes: name === "Express 30" ? 30 : 60,
                startAt: istInstant(date, slot.time),
                date,
                time: slot.time,
                staffName: coach === "Staffed" ? null : coach,
                // A class that fills has a place or two left; the rest, plenty.
                placesLeft: fills ? 2 : 9,
                capacity: 14,
            });
        });
    }
    sessions.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { timezone: FIXTURE_TIME_ZONE, days: GYM_WEEK, sessions };
}

const gym: TemplateFixture = {
    timetable: gymTimetable(),
    plans: [
        {
            id: "gym-off-peak",
            name: "Off-peak",
            description:
                "Weekdays before 4 pm, all classes in that window, and open gym whenever it is staffed.",
            price: "2400.00",
            currency: "INR",
            interval: "MONTH",
            mostChosen: false,
        },
        {
            id: "gym-full",
            name: "Full",
            description:
                "Every class, every hour, open gym whenever it is staffed, and a guest once a month.",
            price: "3600.00",
            currency: "INR",
            interval: "MONTH",
            mostChosen: true,
        },
    ],
    packs: [
        {
            id: "gym-ten",
            name: "Ten classes",
            description:
                "Any ten classes, no monthly commitment, shareable with one other person.",
            credits: 10,
            validityDays: 180,
            price: "2800.00",
            currency: "INR",
            kind: "CLASSES",
            singlePrice: null,
        },
    ],
    visit: {
        address:
            "Hill Road, Bandra West, Mumbai. Two minutes from the station, above the pharmacy.",
        phone: null,
        hours: week({
            MON: ["05:30", "22:00"],
            TUE: ["05:30", "22:00"],
            WED: ["05:30", "22:00"],
            THU: ["05:30", "22:00"],
            FRI: ["05:30", "22:00"],
            SAT: ["07:00", "18:00"],
            SUN: ["08:00", "14:00"],
        }),
    },
    footer: GYM_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Dietician — "Dr Priya Nair" (Dietician.spec.md)
// ---------------------------------------------------------------------------

const dietician: TemplateFixture = {
    // The consultation is the business's own service; the template lists it
    // only with Appointments on and a service to name.
    context: { serviceIds: ["dietician-first-consultation"] },
    services: [
        {
            id: "dietician-first-consultation",
            name: "First consultation",
            description: "In person in Pune, or by video.",
            durationMinutes: 45,
            priceCents: 250000,
            currency: "INR",
        },
    ],
    visit: {
        address: "Lane 6, Koregaon Park, Pune",
        phone: null,
        hours: week({
            TUE: ["10:00", "17:00"],
            WED: ["10:00", "17:00"],
            THU: ["10:00", "17:00"],
            FRI: ["10:00", "17:00"],
            SAT: ["10:00", "17:00"],
        }),
    },
    posts: [
        {
            title: "Rice is not the enemy, but the plate is",
            slug: "rice-is-not-the-enemy",
            excerpt:
                "What actually changes blood sugar in an Indian meal, and why swapping rice for something else is usually the least effective place to start.",
            publishedAt: on("2026-09-18"),
        },
        {
            title: "What a food diary is for",
            slug: "what-a-food-diary-is-for",
            excerpt:
                "It is not surveillance and it is not a test. A week of honest notes tells us more than any single blood test.",
            publishedAt: on("2026-08-02"),
        },
        {
            title: "On being told to lose weight",
            slug: "on-being-told-to-lose-weight",
            excerpt:
                "Why I ask what you want to be able to do, rather than what you want to weigh.",
            publishedAt: on("2026-06-11"),
        },
    ],
    footer: DIETICIAN_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Blogs (Blogs.spec.md)
// ---------------------------------------------------------------------------

const blogs: TemplateFixture = {
    context: { tagline: "Writing about design practice, mostly" },
    posts: [
        {
            title: "What I got wrong about running a studio",
            slug: "what-i-got-wrong",
            excerpt:
                "Four years in, the things I was most certain about at the start have turned out to be the expensive ones.",
            publishedAt: on("2026-04-02"),
        },
        {
            title: "Charging for the thinking, not the hours",
            slug: "charging-for-the-thinking",
            excerpt:
                "A fixed price forces both sides to agree what the work is before it starts, which is uncomfortable exactly once.",
            publishedAt: on("2026-03-12"),
        },
        {
            title: "A studio of one is still a studio",
            slug: "a-studio-of-one",
            excerpt:
                "On the difference between working alone and being a freelancer, and why the distinction is worth defending to clients.",
            publishedAt: on("2026-02-28"),
        },
        {
            title: "The client who taught me to write briefs",
            slug: "the-client-who-taught-me",
            excerpt:
                "She sent back my proposal with three questions. I have asked every client those questions since.",
            publishedAt: on("2026-02-14"),
        },
        ...(
            [
                ["2026-01-31", "On working slowly in a fast trade"],
                ["2026-01-17", "Notes on saying no without giving a reason"],
                ["2026-01-04", "What I read in 2025"],
                [
                    "2025-12-19",
                    "Designing software people can actually describe",
                ],
                ["2025-11-02", "Notes on boring interfaces"],
                ["2025-08-18", "When navigation becomes architecture"],
                ["2025-05-27", "The brief is the deliverable"],
            ] as const
        ).map(([date, title]) => ({
            title,
            slug: title.toLowerCase().replace(/\W+/g, "-"),
            excerpt: null,
            publishedAt: on(date),
        })),
    ],
    footer: BLOGS_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Studio, the gallery's "Portfolio" — "Studio Neue" (Studio.spec.md)
// ---------------------------------------------------------------------------

const studio: TemplateFixture = {
    footer: STUDIO_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Developer — "Kiran Menon" (Developer.spec.md)
// ---------------------------------------------------------------------------

const developer: TemplateFixture = {
    footer: DEVELOPER_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Salon — "Kesar Salon" (Salon.spec.md, U11)
// ---------------------------------------------------------------------------

/** The day the captures show: a Monday, fixed, so every capture matches. */
const SAMPLE_DAY = FIXTURE_DAY;

/** One free appointment time today, as the public today read sends it. */
function freeAt(
    serviceId: string,
    serviceName: string,
    durationMinutes: number,
    time: string,
    staffName: string,
): PublicTodayItem {
    return {
        kind: "one",
        serviceId,
        serviceName,
        durationMinutes,
        startAt: istInstant(SAMPLE_DAY, time),
        date: SAMPLE_DAY,
        time,
        staffName,
        placesLeft: null,
    };
}

const SALON_HOURS = week({
    TUE: ["10:00", "20:00"],
    WED: ["10:00", "20:00"],
    THU: ["10:00", "20:00"],
    FRI: ["10:00", "20:00"],
    SAT: ["09:00", "21:00"],
    SUN: ["10:00", "18:00"],
});

const salon: TemplateFixture = {
    context: {
        serviceIds: [
            "salon-cut-blow-dry",
            "salon-mens-cut",
            "salon-root-touch-up",
            "salon-global-colour",
            "salon-keratin",
            "salon-bridal-trial",
        ],
    },
    services: [
        {
            id: "salon-cut-blow-dry",
            name: "Haircut and blow-dry",
            description:
                "Wash, cut and finish, with a word on what to ask for next time.",
            durationMinutes: 60,
            priceCents: 120000,
            currency: "INR",
        },
        {
            id: "salon-mens-cut",
            name: "Men's cut",
            description: "Scissor or clipper, with a neck shave.",
            durationMinutes: 30,
            priceCents: 50000,
            currency: "INR",
        },
        {
            id: "salon-root-touch-up",
            name: "Root touch-up",
            description: "Up to two inches of regrowth, one colour.",
            durationMinutes: 75,
            priceCents: 180000,
            currency: "INR",
        },
        {
            id: "salon-global-colour",
            name: "Global colour",
            description: "One colour, roots to ends, shoulder length.",
            durationMinutes: 120,
            priceCents: 380000,
            currency: "INR",
        },
        {
            id: "salon-keratin",
            name: "Keratin smoothing",
            description:
                "For frizz that will not sit down. Lasts about three months.",
            durationMinutes: 150,
            priceCents: 650000,
            currency: "INR",
        },
        {
            id: "salon-bridal-trial",
            name: "Bridal trial",
            description: "Hair and make-up, tried once before the day.",
            durationMinutes: 90,
            priceCents: 250000,
            currency: "INR",
        },
    ],
    today: {
        timezone: FIXTURE_TIME_ZONE,
        date: SAMPLE_DAY,
        appointments: true,
        classes: false,
        items: [
            freeAt(
                "salon-cut-blow-dry",
                "Haircut and blow-dry",
                60,
                "11:30",
                "Meher",
            ),
            freeAt("salon-mens-cut", "Men's cut", 30, "12:00", "Rohit"),
            freeAt(
                "salon-root-touch-up",
                "Root touch-up",
                75,
                "14:15",
                "Meher",
            ),
            freeAt("salon-bridal-trial", "Bridal trial", 90, "16:00", "Tanvi"),
            freeAt("salon-mens-cut", "Men's cut", 30, "18:30", "Rohit"),
        ],
        hours: SALON_HOURS,
        closedDates: [],
    },
    visit: {
        address: "22 Linking Road\nKhar West\nMumbai 400052",
        phone: null,
        hours: SALON_HOURS,
    },
    footer: SALON_GALLERY_SAMPLE.footer,
};

// ---------------------------------------------------------------------------
// Clinic — "Kavi Dental" (Clinic.spec.md, U11; the seeded showcase's data)
// ---------------------------------------------------------------------------

const CLINIC_HOURS = week({
    MON: ["09:00", "19:00"],
    TUE: ["09:00", "19:00"],
    WED: ["09:00", "19:00"],
    THU: ["09:00", "19:00"],
    FRI: ["09:00", "19:00"],
    SAT: ["09:00", "19:00"],
    SUN: ["10:00", "13:00"],
});

const clinic: TemplateFixture = {
    context: {
        serviceIds: [
            "kavi-check-up",
            "kavi-root-canal",
            "kavi-whitening",
            "kavi-video",
            "kavi-review",
        ],
    },
    services: [
        {
            id: "kavi-check-up",
            name: "Check-up and clean",
            description:
                "A look, a clean and an explanation, with a written plan and price before any treatment.",
            durationMinutes: 30,
            priceCents: 120000,
            currency: "INR",
        },
        {
            id: "kavi-root-canal",
            name: "Root canal treatment",
            description: "Usually three visits, priced for all of them.",
            durationMinutes: 60,
            priceCents: 1200000,
            currency: "INR",
        },
        {
            id: "kavi-whitening",
            name: "Teeth whitening",
            description:
                "Two visits. Some sensitivity for a day or two afterwards.",
            durationMinutes: 45,
            priceCents: 850000,
            currency: "INR",
        },
        {
            id: "kavi-video",
            name: "Video consultation",
            description: "Talk it through with a dentist first, by video.",
            durationMinutes: 20,
            priceCents: 60000,
            currency: "INR",
        },
        {
            id: "kavi-review",
            name: "Follow-up review",
            description:
                "A short visit after treatment to see how it is healing.",
            durationMinutes: 20,
            priceCents: 50000,
            currency: "INR",
        },
    ],
    today: {
        timezone: FIXTURE_TIME_ZONE,
        date: SAMPLE_DAY,
        appointments: true,
        classes: false,
        items: [
            freeAt(
                "kavi-check-up",
                "Check-up and clean",
                30,
                "10:30",
                "Dr. Meenakshi Rao",
            ),
            freeAt(
                "kavi-video",
                "Video consultation",
                20,
                "12:20",
                "Dr. Arun Pillai",
            ),
            freeAt(
                "kavi-check-up",
                "Check-up and clean",
                30,
                "16:30",
                "Dr. Meenakshi Rao",
            ),
            freeAt(
                "kavi-review",
                "Follow-up review",
                20,
                "17:40",
                "Dr. Meenakshi Rao",
            ),
        ],
        hours: CLINIC_HOURS,
        closedDates: [],
    },
    visit: {
        address: "12th Main, Indiranagar\nBengaluru 560038",
        phone: null,
        hours: CLINIC_HOURS,
    },
    footer: CLINIC_GALLERY_SAMPLE.footer,
};

/** By template id. A gallery template with no entry renders with none. */
export const TEMPLATE_FIXTURES: Readonly<
    Partial<Record<string, TemplateFixture>>
> = {
    bakery,
    ceramics,
    gym,
    dietician,
    blogs,
    studio,
    developer,
    salon,
    clinic,
};

// ---------------------------------------------------------------------------
// The starter (DEC-141): three businesses, one template
// ---------------------------------------------------------------------------

/**
 * A business the starter is drawn for. The starter is not a gallery
 * template (it has no one sample: it is every business's first site), so
 * its renders are named for the business instead: `starter` is one with
 * nothing switched on, `starter-shop` one that sells, `starter-salon` one
 * that takes bookings.
 *
 *     /template-renders/starter/stone
 *     /template-renders/starter-shop/harbour
 *     /template-renders/starter-salon/clay/about
 *
 * The context is what the API would build for such a business
 * (`buildTemplateContext`): its modules, its services, and the line
 * composed from its own names. Nothing here is the owner's writing, because
 * the point of the starter is what a site looks like before there is any.
 * Not in `/template-renders`' index: the capture script shoots the gallery.
 */
export interface StarterSample {
    name: string;
    context: Omit<TemplateContext, "organizationName">;
    fixture: TemplateFixture;
}

const STARTER_SALON_HOURS = week({
    TUE: ["10:00", "20:00"],
    WED: ["10:00", "20:00"],
    THU: ["10:00", "20:00"],
    FRI: ["10:00", "20:00"],
    SAT: ["09:00", "21:00"],
    SUN: ["10:00", "18:00"],
});

/** A business that has only just signed up: a name, and nothing else. */
const starterPlain: StarterSample = {
    name: "Verma & Rao",
    context: { modules: ["WEBSITE"], serviceIds: [], sells: false },
    fixture: {},
};

/** A shop that delivers: Commerce on, products in three categories. */
const starterShop: StarterSample = {
    name: "Hill Road Pantry",
    context: {
        description: "Pickles, Preserves and Spice blends in Pune",
        contactEmail: "hillroadpantry@example.com",
        modules: ["WEBSITE", "COMMERCE"],
        serviceIds: [],
        sells: true,
        area: "Pune",
    },
    fixture: {
        products: [
            {
                slug: "mango-pickle",
                name: "Raw mango pickle",
                price: "280.00",
                blurb: "Cold-pressed mustard oil, sun-cured for three weeks.",
                brief: "A glass jar of mango pickle, lid off, on a steel plate",
            },
            {
                slug: "lime-pickle",
                name: "Sweet lime pickle",
                price: "260.00",
                blurb: "Jaggery and whole spices. No oil.",
                brief: "A spoon lifting dark lime pickle from an open jar",
            },
            {
                slug: "strawberry-preserve",
                name: "Strawberry preserve",
                price: "340.00",
                blurb: "Mahabaleshwar berries, half the usual sugar.",
                brief: "A jar of red preserve beside a cut strawberry",
            },
            {
                slug: "orange-marmalade",
                name: "Orange marmalade",
                price: "320.00",
                blurb: "Nagpur oranges, thick cut.",
                brief: "Marmalade on buttered toast, the jar behind it",
            },
            {
                slug: "garam-masala",
                name: "Garam masala",
                price: "180.00",
                blurb: "Ground in small lots, every fortnight.",
                brief: "A steel bowl of dark ground spice, whole spices around it",
            },
            {
                slug: "sambar-powder",
                name: "Sambar powder",
                price: "160.00",
                blurb: null,
                brief: "A paper pouch of red-brown powder, folded top",
                soldOut: true,
            },
        ],
    },
};

/** A salon: Bookings on, three services, a place with a week of hours. */
const starterSalon: StarterSample = {
    name: "Meher Hair Studio",
    context: {
        description: "Haircut, Colour and Bridal styling in Bengaluru",
        contactEmail: "meherhairstudio@example.com",
        modules: ["WEBSITE", "CRM", "APPOINTMENTS"],
        serviceIds: ["starter-cut", "starter-colour", "starter-bridal"],
        sells: false,
        area: "Bengaluru",
        hasPlace: true,
        hasHours: true,
    },
    fixture: {
        services: [
            {
                id: "starter-cut",
                name: "Haircut",
                description: "Wash, cut and blow-dry.",
                durationMinutes: 45,
                priceCents: 80000,
                currency: "INR",
            },
            {
                id: "starter-colour",
                name: "Colour",
                description: "Root touch-up or full colour, priced on the day.",
                durationMinutes: 120,
                priceCents: 350000,
                currency: "INR",
            },
            {
                id: "starter-bridal",
                name: "Bridal styling",
                description: null,
                durationMinutes: 180,
                priceCents: null,
                currency: null,
            },
        ],
        today: {
            timezone: FIXTURE_TIME_ZONE,
            date: SAMPLE_DAY,
            appointments: true,
            classes: false,
            items: [
                freeAt("starter-cut", "Haircut", 45, "11:15", "Meher"),
                freeAt("starter-colour", "Colour", 120, "13:00", "Meher"),
                freeAt("starter-cut", "Haircut", 45, "17:30", "Rohit"),
            ],
            hours: STARTER_SALON_HOURS,
            closedDates: [],
        },
        visit: {
            address: "2nd Cross, Indiranagar\nBengaluru 560038",
            phone: null,
            hours: STARTER_SALON_HOURS,
            closedDates: [],
        },
    },
};

/** By render id. See {@link StarterSample}. */
export const STARTER_SAMPLES: Readonly<Partial<Record<string, StarterSample>>> =
    {
        starter: starterPlain,
        "starter-shop": starterShop,
        "starter-salon": starterSalon,
    };
