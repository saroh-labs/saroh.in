"use client";

import { useSyncExternalStore } from "react";

import type {
    RenderedBooking,
    RenderedHours,
    RenderedJournal,
    RenderedPacks,
    RenderedPlans,
    RenderedProductGrid,
    RenderedServicesList,
    RenderedTimetable,
    RenderedVisitUs,
    SectionType,
} from "@saroh/block-contract";
import { blockFixture } from "@saroh/block-contract";

import type { Slot } from "./blocks/booking";
import BookingSection from "./blocks/booking";
import HoursSection from "./blocks/hours";
import type { JournalPost } from "./blocks/journal";
import JournalSection from "./blocks/journal";
import type { PublicPack } from "./blocks/packs";
import PacksSection from "./blocks/packs";
import type { PublicPlan } from "./blocks/plans";
import PlansSection from "./blocks/plans";
import ProductGridSection from "./blocks/product-grid";
import type { PublicService } from "./blocks/services-list";
import ServicesListSection from "./blocks/services-list";
import TimetableSection from "./blocks/timetable";
import type { PublicVisit } from "./blocks/visit-us";
import VisitUsSection from "./blocks/visit-us";
import type { PublicTimetable, TimetableSession } from "./lib/timetable-read";
import type { ShopListingCard } from "./product/shop-listing";
import SectionRenderer from "./section-renderer";

/**
 * Services for previewing `servicesList` anywhere there are no real ones: the
 * catalog and the editor's Add-section picker (#255, #267). One has no price,
 * because that case has to look right too.
 */
export const SAMPLE_SERVICES: PublicService[] = [
    {
        id: "fixture-cut",
        name: "Cut and finish",
        description: "Wash, cut and blow-dry.",
        durationMinutes: 45,
        priceCents: 3800,
        currency: "GBP",
    },
    {
        id: "fixture-colour",
        name: "Full colour",
        description:
            "Root to tip, with a toner. Patch test needed 48 hours before.",
        durationMinutes: 120,
        priceCents: 9500,
        currency: "GBP",
    },
    {
        id: "fixture-consult",
        name: "Consultation",
        description: null,
        durationMinutes: 15,
        priceCents: null,
        currency: null,
    },
];

/**
 * A place for previewing `visitUs` where there is no real one: the catalog and
 * the Add-section picker (G8). The contact fixture's reserved number and
 * address, so a preview never shows a real business's.
 */
export const SAMPLE_VISIT: PublicVisit = {
    source: "storefront",
    storeId: "fixture-shop",
    name: "Riverside",
    address: "Unit 4, Riverside Trade Park\nLeeds LS10 1AB",
    phone: "+44 113 496 0000",
    hours: [
        { day: "MON", open: "07:30", close: "17:00", closed: false },
        { day: "TUE", open: "07:30", close: "17:00", closed: false },
        { day: "WED", open: "07:30", close: "17:00", closed: false },
        { day: "THU", open: "07:30", close: "17:00", closed: false },
        { day: "FRI", open: "07:30", close: "17:00", closed: false },
        { day: "SAT", open: "08:00", close: "12:00", closed: false },
        { day: "SUN", open: "08:00", close: "12:00", closed: true },
    ],
    timezone: "Europe/London",
};

/**
 * Posts for previewing `journal` where there are no real ones: the catalog
 * and the Add-section picker (G10). Dates are fixed, so the picture is the
 * same on every machine; the last has no photo and no excerpt of its own, so
 * those cases look right too.
 */
export const SAMPLE_POSTS: JournalPost[] = [
    {
        title: "Why our sourdough takes two days",
        slug: "two-day-sourdough",
        excerpt:
            "A slow, cold rise is where the flavour comes from. Here is what happens overnight.",
        image: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400'%3E%3Crect width='800' height='400' fill='%23d9cbb5'/%3E%3Cellipse cx='400' cy='230' rx='230' ry='110' fill='%23a8794c'/%3E%3C/svg%3E",
        author: "Asha",
        publishedAt: "2026-09-18T08:00:00.000Z",
    },
    {
        title: "The new rye starter",
        slug: "new-rye-starter",
        excerpt:
            "Six weeks of feeding, and it is finally ready for the counter.",
        image: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400'%3E%3Crect width='800' height='400' fill='%232f2a26'/%3E%3Crect x='300' y='90' width='200' height='240' rx='24' fill='%23e0913a'/%3E%3C/svg%3E",
        author: "Asha",
        publishedAt: "2026-09-04T08:00:00.000Z",
    },
    {
        title: "Opening hours over the festival",
        slug: "festival-hours",
        content:
            "<p>We close early on the Friday and open late on the Saturday. Orders for the weekend close on Thursday at 6pm.</p>",
        publishedAt: "2026-08-28T08:00:00.000Z",
    },
];

/**
 * Plans for previewing `plans` where there are no real ones: the catalog and
 * the Add-section picker (G9). The first is the most chosen, so the
 * highlight's badge shows; the last has no description.
 */
export const SAMPLE_PLANS: PublicPlan[] = [
    {
        id: "sample-weekly",
        name: "Weekly loaf",
        description: "One sourdough every Saturday, collected at the counter.",
        price: "350.00",
        currency: "INR",
        interval: "WEEK",
        mostChosen: true,
    },
    {
        id: "sample-monthly",
        name: "Monthly box",
        description: "Four loaves and a jar of something seasonal.",
        price: "1200.00",
        currency: "INR",
        interval: "MONTH",
        mostChosen: false,
    },
    {
        id: "sample-yearly",
        name: "Bread for a year",
        description: null,
        price: "12000.00",
        currency: "INR",
        interval: "YEAR",
        mostChosen: false,
    },
];

/**
 * Packs for previewing `packs` where there are no real ones: the catalog and
 * the Add-section picker (G20). The first compares with a single class; the
 * second is one-to-one sessions with no single price to compare.
 */
export const SAMPLE_PACKS: PublicPack[] = [
    {
        id: "sample-ten",
        name: "10 classes",
        description: "Any group class, mat or reformer.",
        credits: 10,
        validityDays: 60,
        price: "4500.00",
        currency: "INR",
        kind: "CLASSES",
        singlePrice: "600.00",
    },
    {
        id: "sample-pt",
        name: "5 personal training sessions",
        description: null,
        credits: 5,
        validityDays: 90,
        price: "7500.00",
        currency: "INR",
        kind: "ONE_TO_ONE",
        singlePrice: null,
    },
];

/**
 * Products for previewing `productGrid` where there are none: the catalog
 * and the Add-section picker (G12). One comes in sizes and one has sold
 * out, so both lines show; none has a photo, so nothing is fetched.
 */
export const SAMPLE_PRODUCTS: ShopListingCard[] = [
    {
        slug: "sourdough",
        name: "Sourdough loaf",
        currency: "INR",
        price: "250.00",
        mrp: null,
        priceFrom: true,
        image: null,
        variantTitles: ["Small", "Large"],
        optionName: "Size",
        blurb: "Slow rye, baked at dawn. Keeps a week.",
        soldOut: false,
    },
    {
        slug: "almond-croissant",
        name: "Almond croissant",
        currency: "INR",
        price: "140.00",
        mrp: null,
        priceFrom: false,
        image: null,
        variantTitles: [],
        blurb: "Twice-baked, with frangipane.",
        soldOut: true,
    },
    {
        slug: "house-blend-beans",
        name: "House blend beans",
        currency: "INR",
        price: "950.00",
        mrp: null,
        priceFrom: false,
        image: null,
        variantTitles: ["250 g"],
        optionName: "Weight",
        blurb: null,
        soldOut: false,
    },
];

/**
 * A week of classes for previewing `timetable` where there are no real ones:
 * the catalog and the Add-section picker (U2). Fixed dates, so the picture
 * is the same on every machine; one class is full and one nearly, so both
 * words show.
 */
const [MON, TUE, WED, , FRI, SAT] = [
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
] as const;
const WEEK_DATES = [MON, TUE, WED, "2026-10-08", FRI, SAT, "2026-10-11"];

function sampleSession(
    date: string,
    time: string,
    name: string,
    staffName: string,
    placesLeft: number,
): TimetableSession {
    return {
        serviceId: `sample-${name.toLowerCase().replace(/\W+/g, "-")}`,
        serviceName: name,
        durationMinutes: 45,
        startAt: `${date}T${time}:00.000Z`,
        date,
        time,
        staffName,
        placesLeft,
        capacity: 12,
    };
}

export const SAMPLE_TIMETABLE: PublicTimetable = {
    timezone: "UTC",
    days: WEEK_DATES,
    sessions: [
        sampleSession(MON, "07:00", "Strength", "Meera", 6),
        sampleSession(MON, "18:30", "Conditioning", "Arjun", 0),
        sampleSession(TUE, "07:00", "Mobility", "Meera", 9),
        sampleSession(WED, "07:00", "Strength", "Meera", 2),
        sampleSession(WED, "18:30", "Conditioning", "Arjun", 5),
        sampleSession(FRI, "07:00", "Strength", "Meera", 7),
        sampleSession(SAT, "09:00", "Open gym", "Arjun", 12),
    ],
};

/**
 * Open times for previewing `booking`: tomorrow and the day after, mornings,
 * in the viewer's own time zone as the block itself would show them.
 */
function sampleSlots(): Slot[] {
    const slots: Slot[] = [];
    for (const day of [1, 2]) {
        for (const hour of [9, 10, 11, 14]) {
            const start = new Date();
            start.setDate(start.getDate() + day);
            start.setHours(hour, 0, 0, 0);
            const end = new Date(start.getTime() + 30 * 60 * 1000);
            slots.push({
                startAt: start.toISOString(),
                endAt: end.toISOString(),
            });
        }
    }
    return slots;
}

/**
 * One block's example content, drawn by the real component (#267).
 *
 * The ONE place a fixture becomes a picture, shared by the catalog and the
 * editor's Add-section picker so the two cannot drift: a picker preview that
 * disagreed with what gets inserted would be worse than none. Renders nothing
 * for a variant the block does not declare.
 *
 * The two blocks that read live data are drawn with samples rather than
 * fetching, because a fixture's ids belong to no real record: `servicesList`
 * with {@link SAMPLE_SERVICES}, `booking` with sample open times. A preview is
 * a picture of the block, and must not show a healthy one as broken because a
 * request it never needed failed.
 */
/** Nothing to subscribe to: the answer only changes once, at hydration. */
const noSubscription = () => () => undefined;

/**
 * False while rendering on the server (and during hydration), true after.
 *
 * The two live-data previews draw what only the VIEWER's machine can know:
 * sample open times formatted in the visitor's time zone, prices in their
 * locale. Rendered on the server they come out in the server's zone and locale
 * and then disagree with the browser's first render, which React reports as a
 * hydration mismatch on the catalog's /preview/booking (review of #267). The
 * live blocks never hit this: they load in an effect, after mount.
 */
function useMounted(): boolean {
    return useSyncExternalStore(
        noSubscription,
        () => true,
        () => false,
    );
}

/**
 * The blocks that read live data, and how each is drawn from sample data
 * instead. ONE list: a block here is both drawn with samples and held until
 * mount, so the two cannot drift apart (review of #267). A new live-data
 * block is one entry.
 */
const LIVE_DATA_PREVIEWS: Partial<
    Record<SectionType, (content: unknown) => React.ReactNode>
> = {
    booking: (content) => (
        <BookingSection
            content={content as RenderedBooking}
            slots={sampleSlots()}
        />
    ),
    servicesList: (content) => (
        <ServicesListSection
            content={content as RenderedServicesList}
            services={SAMPLE_SERVICES}
        />
    ),
    journal: (content) => (
        <JournalSection
            content={content as RenderedJournal}
            feed={{ posts: SAMPLE_POSTS, basePath: "/blog" }}
        />
    ),
    plans: (content) => (
        <PlansSection
            content={content as RenderedPlans}
            feed={{ plans: SAMPLE_PLANS, joinHref: "/contact#enquiry" }}
        />
    ),
    packs: (content) => (
        <PacksSection
            content={content as RenderedPacks}
            feed={{
                packs: SAMPLE_PACKS,
                payOnline: false,
                askHref: "/contact#enquiry",
            }}
        />
    ),
    productGrid: (content) => (
        <ProductGridSection
            content={content as RenderedProductGrid}
            feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
        />
    ),
    visitUs: (content) => (
        <VisitUsSection
            content={content as RenderedVisitUs}
            visit={SAMPLE_VISIT}
        />
    ),
    timetable: (content) => (
        <TimetableSection
            content={content as RenderedTimetable}
            timetable={SAMPLE_TIMETABLE}
            bookHref="/book"
        />
    ),
    hours: (content) => (
        <HoursSection content={content as RenderedHours} visit={SAMPLE_VISIT} />
    ),
};

export function BlockFixturePreview({
    type,
    variant,
}: {
    type: SectionType;
    variant: string;
}) {
    const mounted = useMounted();
    const content = blockFixture(type, variant);
    if (!content) return null;
    const live = LIVE_DATA_PREVIEWS[type];
    if (live) return mounted ? live(content) : null;
    return <SectionRenderer section={{ type, content }} />;
}
