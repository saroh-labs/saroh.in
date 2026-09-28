import { quietLastDay } from "../../../test/home-quiet-db";
import { env } from "../../env";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import type { WaitingThreads } from "../site-accounts/threads.service";
import type { HomeInput } from "./home-model";
import { flattenNeeds } from "./home-needs";
import {
    bookingPageNotes,
    LOW_STAR_MAX,
    lowStarReviews,
    MESSAGE_WAIT_MS,
    quote,
    QUOTE_MAX,
    starsTag,
    unansweredMessages,
    viewerOf,
    waitingTag,
} from "./home-people-sources";
import { HomeService } from "./home.service";

/**
 * Home's people sources from round 2, F2: low-rated reviews without a
 * reply, booking-page notes waiting for staff, and customers waiting on a
 * reply. Mocked Prisma; `home.people-sources.db.spec.ts` runs the queries
 * against Postgres.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-09-27T06:00:00.000Z");
const ZONE = "Asia/Kolkata";
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

const OWNER: HomeInput = { organizationId: "org_1", organizationRole: "OWNER" };
const MEMBER: HomeInput = {
    organizationId: "org_1",
    organizationRole: "MEMBER",
};

describe("the row words", () => {
    it("quotes a customer's words, cut at a word when they run long", () => {
        expect(quote("  Too  dry\nthis time ")).toBe("“Too dry this time”");
        const long = quote("word ".repeat(60));
        expect([...long].length).toBeLessThanOrEqual(QUOTE_MAX + 2);
        expect(long.endsWith("word…”")).toBe(true);
    });

    it("counts stars", () => {
        expect(starsTag(1)).toBe("1 star");
        expect(starsTag(3)).toBe("3 stars");
    });

    it("says how long someone has waited, never 0 h", () => {
        expect(waitingTag(ago(HOUR + 60_000), NOW)).toBe("Waiting · 1 h");
        expect(waitingTag(ago(5 * HOUR), NOW)).toBe("Waiting · 5 h");
        expect(waitingTag(ago(DAY + HOUR), NOW)).toBe("Waiting · 1 day");
        expect(waitingTag(ago(3 * DAY), NOW)).toBe("Waiting · 3 days");
    });
});

function review(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: "rv_1",
        rating: 1,
        body: "The loaf was stale.",
        displayName: "Farah Khan",
        productName: "Sourdough",
        productId: "prod_1",
        storeId: "store_1",
        createdAt: ago(2 * DAY),
        ...over,
    };
}

function reviewDb(rows: ReturnType<typeof review>[], count = rows.length) {
    return {
        productReview: {
            count: jest.fn().mockResolvedValue(count),
            findMany: jest.fn().mockResolvedValue(rows),
        },
    };
}

describe("lowStarReviews", () => {
    it("asks for published reviews at three stars or fewer that nobody has answered, newest first", async () => {
        const db = reviewDb([]);
        await lowStarReviews(db as never, "org_1");
        const args = db.productReview.findMany.mock.calls[0][0];
        expect(args.where).toEqual({
            organizationId: "org_1",
            status: "PUBLISHED",
            rating: { lte: LOW_STAR_MAX },
            reply: null,
        });
        expect(LOW_STAR_MAX).toBe(3);
        expect(args.orderBy[0]).toEqual({ createdAt: "desc" });
        // The count asks the same question the rows do.
        expect(db.productReview.count.mock.calls[0][0].where).toEqual(
            args.where,
        );
    });

    it("gives nothing when every low review has an answer", async () => {
        expect(await lowStarReviews(reviewDb([]) as never, "org_1")).toBeNull();
    });

    it("gives a 1-star review without a reply a row that opens its product's reviews", async () => {
        const action = await lowStarReviews(
            reviewDb([review()]) as never,
            "org_1",
        );
        expect(action).toMatchObject({
            code: "COMMERCE_LOW_STAR_REVIEWS",
            title: "Answer 1 low-rated review",
            count: 1,
            href: "/commerce/products/prod_1?storefront=store_1&tab=reviews",
        });
        const { needs } = flattenNeeds([action!], ZONE);
        expect(needs).toEqual([
            expect.objectContaining({
                id: "COMMERCE_LOW_STAR_REVIEWS:rv_1",
                title: "Farah Khan left 1 star",
                sub: "“The loaf was stale.” · Sourdough · 25 Sep",
                tag: "1 star",
                tone: "info",
                amountMinor: null,
            }),
        ]);
    });

    it("sends a review of a deleted product to the list, and one without words without a quote", async () => {
        const action = await lowStarReviews(
            reviewDb(
                [review({ productId: null, body: null, rating: 2 })],
                7,
            ) as never,
            "org_1",
        );
        expect(action?.title).toBe("Answer 7 low-rated reviews");
        expect(action?.href).toBe("/commerce/products?tab=reviews");
        const { needs, needsTotal } = flattenNeeds([action!], ZONE);
        expect(needs[0]).toMatchObject({
            title: "Farah Khan left 2 stars",
            sub: "Sourdough · 25 Sep",
            href: "/commerce/products?tab=reviews",
        });
        expect(needs[1].title).toBe("6 more low-rated reviews");
        expect(needsTotal).toBe(7);
    });
});

function note(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: "ca_1",
        contactId: "c_rahul",
        detail: "Allergic to latex. Nervous about injections.",
        label: "Allergic to latex",
        createdAt: ago(DAY),
        contact: { firstName: "Rahul", lastName: "Verma", email: "r@x.in" },
        booking: { startAt: ahead(DAY) },
        ...over,
    };
}

function notesDb(opts: {
    soon?: ReturnType<typeof note>[];
    later?: ReturnType<typeof note>[];
    count?: number;
    soonCount?: number;
}) {
    const soon = opts.soon ?? [];
    const later = opts.later ?? [];
    return {
        contactAttention: {
            count: jest.fn((args: { where: Record<string, unknown> }) =>
                Promise.resolve(
                    "booking" in args.where
                        ? (opts.soonCount ?? soon.length)
                        : (opts.count ?? soon.length + later.length),
                ),
            ),
            findMany: jest.fn((args: { where: Record<string, unknown> }) =>
                Promise.resolve("booking" in args.where ? soon : later),
            ),
        },
    };
}

describe("bookingPageNotes", () => {
    const owner = viewerOf(OWNER);

    it("reads nothing for someone who can't add to the record", async () => {
        const db = notesDb({ soon: [note()] });
        expect(
            await bookingPageNotes(db as never, viewerOf(MEMBER), NOW),
        ).toBeNull();
        expect(db.contactAttention.count).not.toHaveBeenCalled();
        expect(db.contactAttention.findMany).not.toHaveBeenCalled();
    });

    it("asks only for suggestions from the booking page on a live record, and counts what it shows", async () => {
        const db = notesDb({});
        await bookingPageNotes(db as never, owner, NOW);
        const [countAll] = db.contactAttention.count.mock.calls[0];
        expect(countAll.where).toEqual({
            organizationId: "org_1",
            source: "BOOKING_PAGE",
            status: "SUGGESTED",
            removedAt: null,
            contact: { mergedIntoId: null },
        });
    });

    it("leaves sensitive notes out of the rows and the count for a role that may not read them", async () => {
        // A role that may add to the record but not read sensitive
        // entries: none ships until C13 splits them, so it is built here
        // by hand to hold the rule in place.
        const db = notesDb({});
        const viewer = {
            ...owner,
            actions: new Set<OrgAction>(["contact:write"]),
        };
        const attention = jest.requireActual(
            "../customer-workspace/attention-read",
        );
        const spy = jest
            .spyOn(attention, "canSeeSensitive")
            .mockReturnValue(false);
        try {
            await bookingPageNotes(db as never, viewer, NOW);
        } finally {
            spy.mockRestore();
        }
        for (const [args] of [
            ...db.contactAttention.count.mock.calls,
            ...db.contactAttention.findMany.mock.calls,
        ]) {
            expect(args.where.sensitive).toBe(false);
        }
    });

    it("tags a note for a visit in the next two days Before their visit, above the rest", async () => {
        const db = notesDb({
            soon: [note()],
            later: [
                note({
                    id: "ca_2",
                    contactId: "c_meera",
                    contact: {
                        firstName: "Meera",
                        lastName: null,
                        email: "m@x.in",
                    },
                    booking: { startAt: ahead(9 * DAY) },
                    detail: "Prefers the morning",
                }),
            ],
        });
        const action = await bookingPageNotes(db as never, owner, NOW);
        expect(action).toMatchObject({
            code: "APPOINTMENTS_BOOKING_NOTES",
            title: "Check 2 notes from the booking page",
            href: "/commerce/customers",
            moduleKey: "APPOINTMENTS",
        });
        // The soon ones were asked for by the visit, confirmed and close.
        const soonWhere = db.contactAttention.findMany.mock.calls[0][0].where;
        expect(soonWhere.booking).toEqual({
            status: "CONFIRMED",
            startAt: { gte: NOW, lte: ahead(2 * DAY) },
        });

        const { needs } = flattenNeeds([action!], ZONE);
        expect(needs.map((n) => [n.title, n.sub, n.tag, n.tone])).toEqual([
            [
                "Rahul Verma left a note when booking",
                "“Allergic to latex. Nervous about injections.”",
                "Before their visit",
                "due",
            ],
            [
                "Meera left a note when booking",
                "“Prefers the morning”",
                "To check",
                "info",
            ],
        ]);
        expect(needs[0].href).toBe("/customers/c_rahul");
    });

    it("never names a placeholder address, and says 'A customer' instead", async () => {
        const db = notesDb({
            soon: [
                note({
                    contact: {
                        firstName: null,
                        lastName: null,
                        email: "account+c_rahul@account.invalid",
                    },
                }),
            ],
        });
        const action = await bookingPageNotes(db as never, owner, NOW);
        expect(action?.evidence?.[0].headline).toBe(
            "A customer left a note when booking",
        );
    });

    it("ranks the N more row with a close visit when it stands for one", async () => {
        const soon = Array.from({ length: 5 }, (_, i) =>
            note({ id: `ca_${i}` }),
        );
        const action = await bookingPageNotes(
            notesDb({ soon, count: 8, soonCount: 6 }) as never,
            owner,
            NOW,
        );
        expect(action?.moreTone).toBe("due");
        const { needs, needsTotal } = flattenNeeds([action!], ZONE);
        expect(needs.at(-1)).toMatchObject({
            title: "3 more notes from the booking page",
            tone: "due",
        });
        expect(needsTotal).toBe(8);
    });
});

function waiting(over: Partial<WaitingThreads> = {}): WaitingThreads {
    return {
        count: 1,
        longWaits: 0,
        threads: [
            {
                contactId: "c_farah",
                name: "Farah Khan",
                since: ago(3 * HOUR),
                lastBody: "Can I move my cleaning to Friday?",
                messages: 1,
            },
        ],
        ...over,
    };
}

describe("unansweredMessages", () => {
    it("gives nothing when nobody is waiting", () => {
        expect(
            unansweredMessages({ count: 0, longWaits: 0, threads: [] }, NOW),
        ).toBeNull();
    });

    it("gives a row per customer waiting, opening their Messages tab", () => {
        const action = unansweredMessages(waiting(), NOW);
        expect(action).toMatchObject({
            code: "CRM_UNANSWERED_MESSAGES",
            title: "Reply to 1 customer",
            href: "/customers/c_farah?tab=msg",
        });
        const { needs } = flattenNeeds([action!], ZONE);
        expect(needs).toEqual([
            expect.objectContaining({
                title: "Farah Khan is waiting for a reply",
                sub: "“Can I move my cleaning to Friday?”",
                tag: "Waiting · 3 h",
                tone: "due",
                href: "/customers/c_farah?tab=msg",
            }),
        ]);
    });

    it("says how many messages wait, and turns bad after a day", () => {
        const action = unansweredMessages(
            waiting({
                count: 4,
                longWaits: 2,
                threads: [
                    {
                        contactId: "c_1",
                        name: null,
                        since: ago(2 * DAY),
                        lastBody: "Hello?",
                        messages: 3,
                    },
                ],
            }),
            NOW,
        );
        const { needs, needsTotal } = flattenNeeds([action!], ZONE);
        expect(needs[0]).toMatchObject({
            title: "A customer is waiting for a reply",
            sub: "“Hello?” · 3 messages",
            tag: "Waiting · 2 days",
            tone: "bad",
        });
        expect(needs[1]).toMatchObject({
            title: "3 more customers waiting for a reply",
            tone: "bad",
            href: "/commerce/customers",
        });
        expect(needsTotal).toBe(4);
    });
});

// ---- HomeService with the F2 sources ------------------------------------

type View = { key: string; readiness: string };
const COMMERCE: View = { key: "COMMERCE", readiness: "ACTIVE" };
const APPOINTMENTS: View = { key: "APPOINTMENTS", readiness: "ACTIVE" };
const PAYMENTS: View = { key: "PAYMENTS", readiness: "ACTIVE" };

function home(
    views: View[],
    opts: {
        reviews?: ReturnType<typeof review>[];
        notes?: ReturnType<typeof note>[];
        waiting?: WaitingThreads | Error;
        overdue?: unknown[];
    } = {},
) {
    const availability = {
        listViews: jest
            .fn()
            .mockResolvedValue(
                views.map((v) => ({ label: v.key, blockers: [], ...v })),
            ),
    } as unknown as ModuleAvailabilityService;
    const empty = () => ({
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
    });
    const db = {
        ...reviewDb(opts.reviews ?? []),
        ...notesDb({ soon: opts.notes ?? [] }),
        order: empty(),
        booking: empty(),
        site: empty(),
        paymentIntent: empty(),
        subscriptionEvent: empty(),
        invoice: {
            ...empty(),
            findMany: jest.fn((args: { where: Record<string, unknown> }) =>
                Promise.resolve(
                    "dueAt" in args.where ? (opts.overdue ?? []) : [],
                ),
            ),
            count: jest.fn().mockResolvedValue((opts.overdue ?? []).length),
        },
        organizationModule: { findFirst: jest.fn().mockResolvedValue(null) },
        storeSettings: {
            aggregate: jest
                .fn()
                .mockResolvedValue({ _max: { pickupLateAfterMinutes: null } }),
        },
        businessProfile: {
            findUnique: jest.fn().mockResolvedValue({ timezone: ZONE }),
        },
    };
    const threads = {
        waitingOnTeam:
            opts.waiting instanceof Error
                ? jest.fn().mockRejectedValue(opts.waiting)
                : jest.fn().mockResolvedValue(
                      opts.waiting ?? {
                          count: 0,
                          longWaits: 0,
                          threads: [],
                      },
                  ),
    };
    return {
        service: new HomeService(
            availability,
            quietLastDay(db) as never,
            undefined,
            threads as never,
        ),
        db,
        threads,
    };
}

describe("HomeService with the F2 sources", () => {
    const original = env.SITE_ACCOUNT_AREA;
    beforeEach(() => {
        env.SITE_ACCOUNT_AREA = "on";
        jest.useFakeTimers({
            now: NOW,
            doNotFake: ["nextTick", "setImmediate"],
        });
    });
    afterEach(() => {
        env.SITE_ACCOUNT_AREA = original;
        jest.useRealTimers();
    });

    it("shows an owner the note, the message and the review, each where the design ranks it", async () => {
        const { service, threads } = home([COMMERCE, APPOINTMENTS, PAYMENTS], {
            reviews: [review()],
            notes: [note()],
            waiting: waiting(),
            overdue: [
                {
                    id: "inv_1",
                    number: "INV-0007",
                    total: "4000",
                    currency: "INR",
                    dueAt: ago(2 * DAY + HOUR),
                    billToName: "Anika Rao",
                    lines: [],
                },
            ],
        });
        const model = await service.build(OWNER);

        expect(model.unavailable).toEqual([]);
        expect(model.needs.map((n) => n.code)).toEqual([
            "APPOINTMENTS_BOOKING_NOTES",
            "CRM_UNANSWERED_MESSAGES",
            "PAYMENTS_OVERDUE_INVOICES",
            "COMMERCE_LOW_STAR_REVIEWS",
        ]);
        expect(threads.waitingOnTeam).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: "org_1" }),
            { now: NOW, olderThanMs: MESSAGE_WAIT_MS, limit: 5 },
        );
    });

    it("gives a Member neither the notes nor the messages, and never reads them", async () => {
        const { service, db, threads } = home([COMMERCE, APPOINTMENTS], {
            reviews: [review()],
            notes: [note()],
            waiting: waiting(),
        });
        const model = await service.build(MEMBER);

        // Reviews are the Member's to read (the org floor).
        expect(model.needs.map((n) => n.code)).toEqual([
            "COMMERCE_LOW_STAR_REVIEWS",
        ]);
        // Not even counted: the notes' table isn't asked.
        expect(model.needsTotal).toBe(1);
        expect(db.contactAttention.count).not.toHaveBeenCalled();
        expect(threads.waitingOnTeam).not.toHaveBeenCalled();
    });

    it("reads no reviews without product-review:read", async () => {
        const { service, db } = home([COMMERCE], { reviews: [review()] });
        const model = await service.build({
            ...OWNER,
            organizationActions: new Set<OrgAction>(["order:read"]),
        });
        expect(model.needs).toEqual([]);
        expect(db.productReview.findMany).not.toHaveBeenCalled();
    });

    it("keeps messages hidden while the account area is off", async () => {
        env.SITE_ACCOUNT_AREA = "off";
        const { service, threads } = home([COMMERCE], { waiting: waiting() });
        const model = await service.build(OWNER);
        expect(threads.waitingOnTeam).not.toHaveBeenCalled();
        expect(model.needs).toEqual([]);
        expect(model.unavailable).toEqual([]);
    });

    it("asks for message:read, not a module", async () => {
        const { service, threads } = home([], { waiting: waiting() });
        const without = await service.build({
            ...OWNER,
            organizationActions: new Set<OrgAction>(["contact:read"]),
        });
        expect(without.needs).toEqual([]);
        expect(threads.waitingOnTeam).not.toHaveBeenCalled();

        const withRead = await service.build({
            ...OWNER,
            organizationActions: new Set<OrgAction>(["message:read"]),
        });
        expect(withRead.needs.map((n) => n.code)).toEqual([
            "CRM_UNANSWERED_MESSAGES",
        ]);
    });

    it("names Messages when they can't be read, and still shows the rest", async () => {
        const { service } = home([COMMERCE], {
            reviews: [review()],
            waiting: new Error("relation is being migrated"),
        });
        const model = await service.build(OWNER);
        expect(model.unavailable).toEqual([
            { moduleKey: "CRM", label: "Messages" },
        ]);
        expect(model.needs.map((n) => n.code)).toEqual([
            "COMMERCE_LOW_STAR_REVIEWS",
        ]);
    });

    it("never shows a module Saroh has switched off (DEC-057): no notes without Appointments, no reviews without Commerce", async () => {
        const { service, db } = home(
            [
                { key: "COMMERCE", readiness: "DISABLED" },
                { key: "APPOINTMENTS", readiness: "DISABLED" },
            ],
            { reviews: [review()], notes: [note()] },
        );
        const model = await service.build(OWNER);
        expect(model.needs).toEqual([]);
        expect(db.productReview.findMany).not.toHaveBeenCalled();
        expect(db.contactAttention.findMany).not.toHaveBeenCalled();
    });

    it("keeps the Reviewer's Home to their sites", async () => {
        const { service, db, threads } = home([COMMERCE, APPOINTMENTS], {
            reviews: [review()],
            notes: [note()],
            waiting: waiting(),
        });
        (db as Record<string, unknown>).siteReviewer = {
            findMany: jest.fn().mockResolvedValue([]),
        };
        const model = await service.build({
            ...OWNER,
            userId: "user_dalia",
            organizationRole: "REVIEWER",
        });
        expect(model.view).toBe("reviewer");
        expect(model.needs).toEqual([]);
        expect(db.productReview.findMany).not.toHaveBeenCalled();
        expect(threads.waitingOnTeam).not.toHaveBeenCalled();
    });
});
