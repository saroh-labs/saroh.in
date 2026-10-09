const db: Record<string, unknown> = {};
jest.mock("@saroh/database", () => ({ prisma: db }));
jest.mock("../bookings/staff-availability", () => ({
    businessTimezone: jest.fn(async () => "Asia/Kolkata"),
}));
jest.mock("./term-ending", () => ({ termEndingOf: jest.fn(async () => null) }));
jest.mock("./catalogue-access.service", () => ({
    CatalogueAccessService: class {},
}));

import { paperDay } from "../invoices/invoice-paper-view";
import { parseBillingEmailPayload } from "./billing-email-payload";
import {
    moveDownEmail,
    moveDownNotice,
    planEndingNotice,
    termEndingEmail,
} from "./billing-emails";
import type { CatalogueAccessService } from "./catalogue-access.service";
import {
    clearStaleClaims,
    noticeChosenMoves,
    noticeMovesMade,
} from "./move-down-notice";
import type { PauseMeasure } from "./over-limit";
import { moveDownClaimKey, UNCAPPED } from "./over-limit";
import type { OverLimitService } from "./over-limit.service";
import { termEndingOf as termEndingOfFn } from "./term-ending";

const termEndingOf = termEndingOfFn as unknown as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T04:30:00.000Z");
const plus = (days: number) => new Date(NOW.getTime() + days * DAY);
const day = (d: Date) => paperDay(d.toISOString(), "Asia/Kolkata");
const logger = { error: jest.fn() };

const LIMITS = { ...UNCAPPED, teamMembers: 2, products: 3 };
const MEASURE: PauseMeasure = {
    limits: LIMITS,
    people: [
        {
            id: "m3",
            createdAt: NOW,
            kind: "member",
            label: "Asha",
            owner: false,
            seat: "seat",
        },
    ],
    products: { cut: { id: "p", createdAt: NOW }, count: 2 },
    posts: { cut: null, count: 0 },
    locations: [],
    sites: [],
};

/** A transaction whose claims are a Map: createMany skips a key it has. */
function fakeTx() {
    const claims = new Map<string, { createdAt: Date; kind: string }>();
    const notifications: { title: string; body: string }[] = [];
    const jobs: { payload: Record<string, unknown> }[] = [];
    const tx = {
        customerNotice: {
            createMany: jest.fn(
                async ({
                    data,
                }: {
                    data: { eventKey: string; kind: string }[];
                }) => {
                    let count = 0;
                    for (const d of data) {
                        if (claims.has(d.eventKey)) continue;
                        claims.set(d.eventKey, {
                            createdAt: NOW,
                            kind: d.kind,
                        });
                        count += 1;
                    }
                    return { count };
                },
            ),
            findUnique: jest.fn(
                async ({
                    where,
                }: {
                    where: {
                        organizationId_eventKey: { eventKey: string };
                    };
                }) =>
                    claims.get(where.organizationId_eventKey.eventKey) ?? null,
            ),
            updateMany: jest.fn(async () => ({ count: 1 })),
        },
        notification: {
            create: jest.fn(
                async ({ data }: { data: { title: string; body: string } }) => {
                    notifications.push(data);
                    return { id: `n${notifications.length}` };
                },
            ),
        },
        job: {
            create: jest.fn(
                async ({
                    data,
                }: {
                    data: { payload: Record<string, unknown> };
                }) => {
                    jobs.push(data);
                    return {};
                },
            ),
        },
    };
    db.$transaction = jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));
    return { tx, claims, notifications, jobs };
}

function svc(patch: Partial<Record<keyof OverLimitService, unknown>>) {
    return {
        standing: jest.fn(async () => null),
        previewAt: jest.fn(async () => null),
        forget: jest.fn(),
        ...patch,
    } as unknown as OverLimitService;
}

const access = {
    resolve: jest.fn(async () => ({ source: "catalogue", planName: "Free" })),
} as unknown as CatalogueAccessService;

beforeEach(() => {
    jest.clearAllMocks();
    termEndingOf.mockResolvedValue(null);
});

describe("a move that happened at once (#801): told within the hour, pauses 7 days on", () => {
    it("tells once, names what pauses and the date, and starts the clock", async () => {
        const { claims, notifications, jobs } = fakeTx();
        db.organization = {
            findMany: jest.fn(async () => [{ id: "org" }]),
        };
        const over = svc({
            standing: jest.fn(async () => ({
                limits: LIMITS,
                measure: MEASURE,
                over: true,
                toldAt: null,
                pausesFrom: null,
                paused: false,
            })),
        });

        await expect(noticeMovesMade(NOW, logger, over, access)).resolves.toBe(
            1,
        );
        expect(claims.get(moveDownClaimKey(LIMITS))?.kind).toBe("MOVE_DOWN");
        expect(notifications[0].title).toBe(
            `Some things pause on ${day(plus(7))}`,
        );
        expect(notifications[0].body).toContain("Asha is paused");
        expect(notifications[0].body).toContain(
            "2 products, your oldest, are hidden from your site and read-only.",
        );
        expect(jobs[0].payload).toMatchObject({
            kind: "MOVE_DOWN",
            mode: "now",
            planName: "Free",
            pausesOn: day(plus(7)),
            graceKey: moveDownClaimKey(LIMITS),
        });
    });

    it("says nothing again once told (its grace claim stands)", async () => {
        const { notifications } = fakeTx();
        db.organization = {
            findMany: jest.fn(async () => [{ id: "org" }]),
        };
        const told = svc({
            standing: jest.fn(async () => ({
                limits: LIMITS,
                measure: MEASURE,
                over: true,
                toldAt: NOW,
                pausesFrom: plus(7),
                paused: false,
            })),
        });
        await expect(noticeMovesMade(NOW, logger, told, access)).resolves.toBe(
            0,
        );
        expect(notifications).toHaveLength(0);
    });

    it("says nothing for a business under its limits, or unenforced", async () => {
        fakeTx();
        db.organization = {
            findMany: jest.fn(async () => [{ id: "a" }, { id: "b" }]),
        };
        await expect(
            noticeMovesMade(NOW, logger, svc({}), access),
        ).resolves.toBe(0);
    });
});

describe("a move chosen for the period's end: told 30, 7 and 1 days ahead", () => {
    function chosen(pendingFrom: Date) {
        db.subscription = {
            findMany: jest.fn(async () => [
                {
                    id: "sub",
                    organizationId: "org",
                    pendingFrom,
                    plan: { name: "Grow" },
                    pendingPlan: { name: "Free" },
                },
            ]),
        };
    }

    it("told 7 days ahead: pauses on the move's date", async () => {
        const { notifications, jobs } = fakeTx();
        chosen(plus(7));
        const preview = svc({ previewAt: jest.fn(async () => MEASURE) });
        await expect(noticeChosenMoves(NOW, logger, preview)).resolves.toBe(1);
        expect(notifications[0].body).toContain(
            `Your plan moves to Free on ${day(plus(7))}.`,
        );
        expect(jobs[0].payload).toMatchObject({
            kind: "MOVE_DOWN",
            mode: "scheduled",
            eventKey: `move-down-notice:sub:${plus(7).toISOString()}:7`,
            pausesOn: day(plus(7)),
            movesOn: day(plus(7)),
        });
    });

    it("chosen 2 days before the end: the plan moves then, the pause waits 7 days from the notice", async () => {
        const { jobs } = fakeTx();
        chosen(plus(2));
        const preview = svc({ previewAt: jest.fn(async () => MEASURE) });
        await noticeChosenMoves(NOW, logger, preview);
        expect(jobs[0].payload).toMatchObject({
            movesOn: day(plus(2)),
            pausesOn: day(plus(7)),
        });
    });

    it("leaves a term's end to its own notice, and says nothing when nothing pauses", async () => {
        const { notifications } = fakeTx();
        chosen(plus(7));
        termEndingOf.mockResolvedValueOnce({ stage: 7 });
        const preview = svc({ previewAt: jest.fn(async () => MEASURE) });
        await expect(noticeChosenMoves(NOW, logger, preview)).resolves.toBe(0);
        await expect(noticeChosenMoves(NOW, logger, svc({}))).resolves.toBe(0);
        expect(notifications).toHaveLength(0);
    });
});

describe("clearStaleClaims: moving back up starts again", () => {
    it("drops a claim the business left behind, keeps one it is over", async () => {
        const deleteMany = jest.fn(async () => ({ count: 1 }));
        db.customerNotice = {
            findMany: jest.fn(async () => [
                {
                    id: "old",
                    organizationId: "org",
                    eventKey: moveDownClaimKey({ ...LIMITS, products: 1 }),
                    createdAt: plus(-40),
                },
                {
                    id: "now",
                    organizationId: "org",
                    eventKey: moveDownClaimKey(LIMITS),
                    createdAt: plus(-40),
                },
            ]),
            deleteMany,
        };
        const s = svc({
            standing: jest.fn(async () => ({
                limits: LIMITS,
                over: true,
            })),
        });
        await expect(clearStaleClaims(NOW, logger, s)).resolves.toBe(1);
        expect(deleteMany).toHaveBeenCalledWith({
            where: { id: { in: ["old"] } },
        });
    });
});

describe("the MOVE_DOWN email's payload", () => {
    const good = {
        kind: "MOVE_DOWN",
        organizationId: "org",
        eventKey: "move-down-notice:now:x",
        graceKey: "move-down:x",
        mode: "now",
        planName: "Free",
        nextPlanName: null,
        movesOn: null,
        pausesOn: "27 Nov 2026",
        lines: ["a"],
    };

    it("reads a whole one, and refuses one missing what pauses", () => {
        expect(parseBillingEmailPayload(good)).toEqual(good);
        expect(parseBillingEmailPayload({ ...good, lines: "a" })).toBeNull();
        expect(parseBillingEmailPayload({ ...good, mode: "later" })).toBeNull();
    });

    it("reads a plan-ending one's pauses, and malformed pauses as none", () => {
        const ending = {
            kind: "PLAN_ENDING",
            organizationId: "org",
            overrideId: "ov",
            endsAt: "2026-12-01T00:00:00.000Z",
            stage: 7,
            planName: "Grow",
            nextPlanName: "Free",
            endsOn: "1 Dec 2026",
        };
        expect(
            parseBillingEmailPayload({
                ...ending,
                pauses: { pausesOn: "1 Dec 2026", lines: ["a"] },
            }),
        ).toMatchObject({ pauses: { pausesOn: "1 Dec 2026" } });
        expect(
            parseBillingEmailPayload({ ...ending, pauses: { lines: 1 } }),
        ).toMatchObject({ pauses: null });
    });
});

describe("the words (#801)", () => {
    const lines = [
        "Asha is paused: they can't open the business until you move up again.",
    ];

    it("a move made now says what plan it's on, what pauses and when, and how to keep everything", () => {
        const n = moveDownNotice({
            mode: "now",
            planName: "Free",
            nextPlanName: null,
            movesOn: null,
            pausesOn: "27 Nov 2026",
            lines,
        });
        expect(n.title).toBe("Some things pause on 27 Nov 2026");
        expect(n.body).toBe(
            "Your business is now on the Free plan, and has more than it includes. On 27 Nov 2026, what's over the new plan's limits becomes read-only: Asha is paused: they can't open the business until you move up again. Nothing is deleted. To keep everything, choose or renew a plan in Plan and billing; moving back up restores everything at once.",
        );
        const e = moveDownEmail({
            businessName: "Rye & Co.",
            mode: "scheduled",
            planName: "Grow",
            nextPlanName: "Free",
            movesOn: "25 Nov 2026",
            pausesOn: "27 Nov 2026",
            lines,
            url: "https://app.example.com/settings/billing#change-plan",
        });
        expect(e.subject).toBe("What pauses at Rye & Co. on 27 Nov 2026");
        expect(e.html).toContain(
            "Rye &amp; Co. moves from the Grow plan to the Free plan on 25 Nov 2026.",
        );
        expect(e.html).toContain("Open Plan and billing");
    });

    it("the plan-ending and term-ending notices list the pauses only when there are any", () => {
        const base = {
            planName: "Grow",
            nextPlanName: "Free",
            endsOn: "1 Dec 2026",
        };
        expect(planEndingNotice(base).body).not.toContain("read-only");
        expect(
            planEndingNotice({
                ...base,
                pauses: { pausesOn: "1 Dec 2026", lines },
            }).body,
        ).toContain(
            "On 1 Dec 2026, what's over the new plan's limits becomes read-only: Asha is paused",
        );
        const term = termEndingEmail({
            businessName: "Rye",
            planName: "Grow",
            endsOn: "1 Dec 2026",
            payment: "AUTOPAY",
            price: null,
            payUrl: "https://app.example.com/settings/billing",
            pauses: { pausesOn: "1 Dec 2026", lines },
        });
        expect(term.html).toContain("Asha is paused");
    });
});
