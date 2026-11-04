import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublishedPage } from "@/components/published-page";
import type * as ModulePages from "@/lib/module-pages";
import { dontCachePage } from "@/lib/page-cache/site-rules";
import { BookingFlow, BookingUnavailable } from "@saroh/site-blocks";

import BookPage, { generateMetadata } from "./page";

/**
 * What a plain `/book` draws for a site with a published Book page. The
 * merchant's live site that "came up empty": `/book?service=` opened, and
 * `/book` showed its title and intro over nothing, because the page's stored
 * list named services no longer offered while the flow read what is offered.
 */

const OFFERED = [
    {
        id: "svc_new",
        name: "Personal training",
        description: null,
        durationMinutes: 60,
        priceCents: 150000,
        currency: "INR",
        gst: null,
    },
    {
        id: "svc_newer",
        name: "Assessment",
        description: null,
        durationMinutes: 30,
        priceCents: null,
        currency: null,
        gst: null,
    },
];

const site = vi.hoisted((): { resolved: unknown; lookup: unknown } => ({
    resolved: null,
    lookup: { ok: true },
}));

const LIST_OF_GONE = {
    type: "servicesList",
    contractVersion: 1,
    content: { heading: "Services", serviceIds: ["svc_deleted"] },
};
const INTRO = { type: "richText", contractVersion: 1, content: {} };
const bookPage = (sections: unknown[]) => ({
    path: "/book",
    title: "Book",
    kind: "BOOK",
    isHome: false,
    sections,
});

vi.mock("@/components/published-page", () => ({ PublishedPage: vi.fn() }));
vi.mock("@/components/visit-step", () => ({ VisitStep: vi.fn() }));
vi.mock("@saroh/site-blocks", () => ({
    BookingFlow: vi.fn(),
    BookingUnavailable: vi.fn(),
    ModulePageUnavailable: vi.fn(),
    MoveClass: vi.fn(),
    initialDateOf: () => null,
    initialTimeOf: () => null,
    lookOf: () => undefined,
    modulePageTopOf: () => null,
    parseStepUrl: () => ({ step: null, staff: null, ref: null }),
    reachOf: () => null,
}));
vi.mock("@/lib/account-area", () => ({
    accountAreaOn: () => false,
    getBooking: vi.fn(),
    getMyBooking: vi.fn(),
}));
vi.mock("@/lib/api-url", () => ({ publicApiUrl: () => "https://api.test" }));
vi.mock("@/lib/booking-page", () => ({
    getBookingPage: vi.fn(() => Promise.resolve(site.lookup)),
    getBookingVisit: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/catalogue", () => ({
    getCatalogue: vi.fn(() => Promise.resolve({ ok: false })),
}));
vi.mock("@/lib/customer-session", () => ({
    getSignedInCustomer: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/module-pages", async (importOriginal) => ({
    ...(await importOriginal<typeof ModulePages>()),
}));
vi.mock("@/lib/page-cache/site-rules", () => ({
    dontCachePage: vi.fn(),
    showsServicesOffered: vi.fn(),
}));
vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(site.resolved)),
    siteOriginFor: () => "https://rye.test",
}));
vi.mock("@/lib/service-json-ld", () => ({ serviceJsonLdScript: () => null }));
vi.mock("@/lib/sign-in", () => ({
    getSignInOptions: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/site-contact", () => ({
    getSiteContact: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/site-footer", () => ({
    getFooterFacts: vi.fn(() => Promise.resolve(null)),
    soldByFor: () => null,
}));
vi.mock("@/lib/site-meta", () => ({
    bookDescription: () => undefined,
    canonical: () => ({}),
}));
vi.mock("@/lib/test-metadata", () => ({
    shareable: (_resolved: unknown, metadata: unknown) => metadata,
}));
vi.mock("../account/actions", () => ({
    requestPhoneSignInCode: vi.fn(),
    requestSignInCode: vi.fn(),
    signOut: vi.fn(),
    verifyPhoneSignInCode: vi.fn(),
    verifySignInCode: vi.fn(),
}));
vi.mock("../account/bookings/actions", () => ({ moveBooking: vi.fn() }));
vi.mock("./actions", () => ({
    bookSignedIn: vi.fn(),
    creditFor: vi.fn(),
    findMyBooking: vi.fn(),
    joinWaitlist: vi.fn(),
    leaveWaitlist: vi.fn(),
    waitlistFor: vi.fn(),
}));

const params = Promise.resolve({ domain: "rye.saroh.test" });
interface Drawn {
    type: unknown;
    props: Record<string, unknown>;
}
const open = async (query = {}) =>
    (await BookPage({
        params,
        searchParams: Promise.resolve(query),
    })) as unknown as Drawn;

function siteWith(sections: unknown[]) {
    site.resolved = {
        siteId: "site_1",
        mode: "live",
        modules: { BOOK: "on" },
        snapshot: {
            site: { name: "Rye & Co." },
            pages: [bookPage(sections)],
        },
    };
}

function offering(services: unknown[], open_ = true) {
    site.lookup = {
        ok: true,
        page: { businessName: "Rye & Co.", open: open_, services },
    };
}

/** The server's answer for the plain address: one element, or a fragment. */
function drawn(element: Drawn): Drawn {
    const children = element.props.children;
    return Array.isArray(children) ? (children.at(-1) as Drawn) : element;
}

describe("/book on a site with a published Book page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        siteWith([INTRO, LIST_OF_GONE]);
        offering(OFFERED);
    });

    it("offers what the flow offers when every listed service is gone", async () => {
        const element = await open();
        expect(element.type).toBe(PublishedPage);
        const lists = element.props.serviceLists as unknown[];
        expect(lists[1]).toEqual({ services: OFFERED, moreHref: null });
    });

    it("offers it when the page was published with no list at all", async () => {
        siteWith([INTRO]);
        const element = await open();
        expect(element.type).toBe(PublishedPage);
        const page = element.props.page as { sections: { type: string }[] };
        expect(page.sections.map((s) => s.type)).toEqual([
            "richText",
            "servicesList",
        ]);
        const lists = element.props.serviceLists as unknown[];
        expect(lists[1]).toEqual({ services: OFFERED, moreHref: null });
    });

    it("says it in words when nothing is offered: the flow's closed card", async () => {
        offering([]);
        const element = await open();
        expect(drawn(element).type).toBe(BookingFlow);
    });

    it("says it in words while Appointments is closed", async () => {
        offering(OFFERED, false);
        const element = await open();
        expect(drawn(element).type).toBe(BookingFlow);
    });

    it("never keeps a failed read, and says that in words too", async () => {
        site.lookup = { ok: false, reason: "unavailable" };
        const element = await open();
        expect(drawn(element).type).toBe(BookingUnavailable);
        expect(dontCachePage).toHaveBeenCalled();
    });

    it("still goes straight into the flow on a deep link", async () => {
        const element = await open({ service: "svc_new" });
        expect(drawn(element).type).toBe(BookingFlow);
    });
});

describe("/book in search", () => {
    const robots = async () =>
        (await generateMetadata({ params }))?.robots ?? null;

    beforeEach(() => {
        siteWith([INTRO, LIST_OF_GONE]);
        offering(OFFERED);
    });

    it("is indexed while a Book page has something to offer", async () => {
        expect(await robots()).toBeNull();
    });

    it("is kept out while it says nothing can be booked", async () => {
        offering([]);
        expect(await robots()).toEqual({ index: false, follow: true });
        site.lookup = { ok: false, reason: "unavailable" };
        expect(await robots()).toEqual({ index: false, follow: true });
    });
});
