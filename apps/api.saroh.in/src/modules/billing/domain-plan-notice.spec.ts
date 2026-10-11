/**
 * The billing sweep's step for a business's own domain (DEC-139): who is
 * told what, once, and when the 3-day clock starts. The database is a small
 * in-memory stand-in for the claims; every domain is made up.
 */
interface Claim {
    id: string;
    organizationId: string;
    eventKey: string;
    kind: string;
    createdAt: Date;
    notificationId?: string;
}

let claims: Claim[] = [];
let notifications: { organizationId: string; title: string; body: string }[] =
    [];
let jobs: { type: string; payload: Record<string, unknown> }[] = [];
let connected: { organizationId: string }[] = [];
let n = 0;

const customerNotice = {
    findMany: jest.fn(
        async ({
            where,
        }: {
            where: { organizationId?: string; kind: { in: string[] } };
        }) =>
            claims.filter(
                (c) =>
                    where.kind.in.includes(c.kind) &&
                    (!where.organizationId ||
                        c.organizationId === where.organizationId),
            ),
    ),
    createMany: jest.fn(
        async ({ data }: { data: Omit<Claim, "id" | "createdAt">[] }) => {
            let count = 0;
            for (const d of data) {
                if (
                    claims.some(
                        (c) =>
                            c.organizationId === d.organizationId &&
                            c.eventKey === d.eventKey,
                    )
                ) {
                    continue;
                }
                claims.push({ createdAt: NOW, ...d, id: `c${++n}` });
                count += 1;
            }
            return { count };
        },
    ),
    deleteMany: jest.fn(
        async ({ where }: { where: { id: { in: string[] } } }) => {
            const before = claims.length;
            claims = claims.filter((c) => !where.id.in.includes(c.id));
            return { count: before - claims.length };
        },
    ),
    updateMany: jest.fn(async () => ({ count: 1 })),
};
const tx = {
    customerNotice,
    notification: {
        create: jest.fn(
            async ({
                data,
            }: {
                data: { organizationId: string; title: string; body: string };
            }) => {
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
                data: { type: string; payload: Record<string, unknown> };
            }) => {
                jobs.push(data);
                return {};
            },
        ),
    },
    site: { findMany: jest.fn(async () => [{ id: "site_1" }]) },
};

jest.mock("@saroh/database", () => ({
    prisma: {
        domain: { findMany: jest.fn(async () => connected) },
        customerNotice,
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
}));
jest.mock("../bookings/staff-availability", () => ({
    businessTimezone: jest.fn(async () => "Asia/Kolkata"),
}));
jest.mock("../sites/site-origin", () => ({
    rendererHost: () => "saroh.app",
}));
jest.mock("../../env", () => ({ env: { SITE_PAGE_CACHE: "on" } }));
jest.mock("./domain-plan.service", () => ({ domainPlan: {} }));

import type { DomainPlanState } from "./domain-plan";
import {
    DOMAIN_ENDED_KEY,
    DOMAIN_ENDED_KIND,
    DOMAIN_PAUSED_KIND,
    DOMAIN_TOLD_KIND,
    domainPausedKey,
    domainToldKey,
} from "./domain-plan";
import {
    claimDomainToldInTx,
    domainEndedFor,
    domainEndingFor,
    sarohAddressOf,
    sweepDomains,
} from "./domain-plan-notice";
import type { DomainPlanService, DomainStanding } from "./domain-plan.service";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-15T10:00:00.000Z");
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const logger = { error: jest.fn() };

const DOMAIN = {
    hostname: "shop.example.com",
    siteId: "site_1",
    subdomain: "yourshop",
};

let standing: DomainStanding;
const forget = jest.fn();
const svc = {
    standing: jest.fn(async () => standing),
    standingOrNull: jest.fn(async () => standing),
    forget,
} as unknown as DomainPlanService;

function stands(plan: DomainPlanState, enforced = true) {
    standing = { enforced, plan, domains: [DOMAIN] };
}

function claim(kind: string, eventKey: string, createdAt: Date = NOW) {
    claims.push({
        id: `c${++n}`,
        organizationId: "org_1",
        eventKey,
        kind,
        createdAt,
    });
}

const emails = () =>
    jobs.filter((j) => j.type === "billing.email").map((j) => j.payload);
const revalidations = () =>
    jobs.filter((j) => j.type === "site.pages.revalidate");

beforeEach(() => {
    jest.clearAllMocks();
    claims = [];
    notifications = [];
    jobs = [];
    connected = [{ organizationId: "org_1" }];
    stands({ state: "included" });
});

describe("the sweep's domain step (DEC-139)", () => {
    it("says nothing, and writes nothing, while the plan includes a domain", async () => {
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(0);
        expect(claims).toEqual([]);
        expect(notifications).toEqual([]);
        expect(jobs).toEqual([]);
    });

    it("says nothing while plan enforcement is off", async () => {
        stands({ state: "included" }, false);
        await sweepDomains(NOW, logger, svc);
        expect(notifications).toEqual([]);
        expect(jobs).toEqual([]);
    });

    it("tells an end ahead itself when the plan's own notice didn't, once per stage", async () => {
        stands({ state: "ending", endsAt: at(7), stopsAt: at(10) });
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(1);
        expect(notifications).toEqual([
            expect.objectContaining({
                organizationId: "org_1",
                title: "Your domain stops showing your site on 25 Nov 2026",
            }),
        ]);
        expect(notifications[0].body).toContain(
            "visitors are sent to yourshop.saroh.app",
        );
        expect(emails()).toEqual([
            {
                kind: "DOMAIN",
                organizationId: "org_1",
                eventKey: domainToldKey(at(7), 7),
                mode: "ending",
                hostnames: ["shop.example.com"],
                stopsOn: "25 Nov 2026",
                address: "yourshop.saroh.app",
            },
        ]);
        // The same hour again: nothing more.
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(0);
        expect(notifications).toHaveLength(1);
    });

    it("stays quiet when the plan's own notice carried the line", async () => {
        stands({ state: "ending", endsAt: at(7), stopsAt: at(10) });
        // The stand-in holds only what the claim writes.
        await claimDomainToldInTx(tx as never, "org_1", at(7), 7);
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(0);
        expect(notifications).toEqual([]);
        expect(emails()).toEqual([]);
    });

    it("starts the clock and tells a plan that ended at once, within the hour", async () => {
        stands({ state: "grace", endedAt: NOW, stopsAt: at(3) });
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(1);
        expect(claims).toEqual([
            expect.objectContaining({
                eventKey: DOMAIN_ENDED_KEY,
                kind: DOMAIN_ENDED_KIND,
                createdAt: NOW,
            }),
        ]);
        expect(notifications[0].body).toContain(
            "shop.example.com shows your site until 18 Nov 2026",
        );
        expect(emails()).toEqual([
            expect.objectContaining({
                kind: "DOMAIN",
                mode: "ended",
                stopsOn: "18 Nov 2026",
            }),
        ]);
        expect(forget).toHaveBeenCalledWith("org_1");
        // Nothing paused yet, and nothing redrawn.
        expect(revalidations()).toEqual([]);
        // The next hour says nothing more.
        stands({ state: "grace", endedAt: NOW, stopsAt: at(3) });
        await expect(
            sweepDomains(new Date(NOW.getTime() + 3_600_000), logger, svc),
        ).resolves.toBe(0);
        expect(notifications).toHaveLength(1);
    });

    it("starts the clock at the end it told ahead, with no second notice", async () => {
        const end = new Date(NOW.getTime() - 20 * 60_000);
        claim(DOMAIN_TOLD_KIND, domainToldKey(end, 30));
        claim(DOMAIN_TOLD_KIND, domainToldKey(end, 1));
        stands({ state: "grace", endedAt: NOW, stopsAt: at(3) });
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(0);
        expect(
            claims.find((c) => c.kind === DOMAIN_ENDED_KIND)?.createdAt,
        ).toEqual(end);
        expect(notifications).toEqual([]);
        expect(emails()).toEqual([]);
    });

    it("says the domain is paused when the 3 days are up, once, and has the pages drawn again", async () => {
        claim(DOMAIN_ENDED_KIND, DOMAIN_ENDED_KEY, at(-3));
        stands({ state: "paused", since: NOW });
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(1);
        expect(notifications).toEqual([
            expect.objectContaining({ title: "Your domain is paused" }),
        ]);
        expect(emails()).toEqual([
            expect.objectContaining({
                kind: "DOMAIN",
                mode: "paused",
                eventKey: domainPausedKey(at(-3)),
                address: "yourshop.saroh.app",
            }),
        ]);
        expect(revalidations()).toEqual([
            expect.objectContaining({
                payload: { cause: "domain", siteIds: ["site_1"] },
            }),
        ]);
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(0);
        expect(notifications).toHaveLength(1);
    });

    it("is not paused a moment before the 3 days are up", async () => {
        claim(
            DOMAIN_ENDED_KIND,
            DOMAIN_ENDED_KEY,
            new Date(at(-3).getTime() + 1),
        );
        stands({ state: "grace", endedAt: at(-3), stopsAt: NOW });
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(0);
        expect(notifications).toEqual([]);
    });

    it("clears every claim once the plan includes a domain again, and has the pages drawn again", async () => {
        claim(DOMAIN_TOLD_KIND, domainToldKey(at(-9), 7));
        claim(DOMAIN_ENDED_KIND, DOMAIN_ENDED_KEY, at(-9));
        claim(DOMAIN_PAUSED_KIND, domainPausedKey(at(-9)));
        stands({ state: "included" });
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(0);
        expect(claims).toEqual([]);
        expect(revalidations()).toHaveLength(1);
        expect(forget).toHaveBeenCalledWith("org_1");
        // Nothing is said about coming back: the domain just works.
        expect(notifications).toEqual([]);
    });

    it("clears the claims of a business that removed its domain, or left enforcement", async () => {
        connected = [];
        claim(DOMAIN_ENDED_KIND, DOMAIN_ENDED_KEY, at(-1));
        standing = {
            enforced: true,
            plan: { state: "grace", endedAt: at(-1), stopsAt: at(2) },
            domains: [],
        };
        await sweepDomains(NOW, logger, svc);
        expect(claims).toEqual([]);
        expect(notifications).toEqual([]);
    });

    it("keeps the claim for the end still ahead, and drops one for another end", async () => {
        claim(DOMAIN_TOLD_KIND, domainToldKey(at(7), 30));
        claim(DOMAIN_TOLD_KIND, domainToldKey(at(2), 7));
        stands({ state: "ending", endsAt: at(7), stopsAt: at(10) });
        await sweepDomains(NOW, logger, svc);
        expect(claims.map((c) => c.eventKey).sort()).toEqual(
            [domainToldKey(at(7), 30), domainToldKey(at(7), 7)].sort(),
        );
    });

    it("goes on to the next business when one fails", async () => {
        connected = [{ organizationId: "org_0" }, { organizationId: "org_1" }];
        stands({ state: "grace", endedAt: NOW, stopsAt: at(3) });
        (svc.standing as jest.Mock).mockRejectedValueOnce(new Error("down"));
        await expect(sweepDomains(NOW, logger, svc)).resolves.toBe(1);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining("domain_plan_notice_failed org=org_0"),
        );
    });
});

describe("the domain line in the plan's own notices (DEC-139)", () => {
    it("is given for the end that stops the domain, and no other", async () => {
        stands({ state: "ending", endsAt: at(7), stopsAt: at(10) });
        await expect(
            domainEndingFor("org_1", at(7), "Asia/Kolkata", NOW, svc),
        ).resolves.toEqual({
            hostnames: ["shop.example.com"],
            stopsOn: "25 Nov 2026",
            address: "yourshop.saroh.app",
        });
        await expect(
            domainEndingFor("org_1", at(9), "Asia/Kolkata", NOW, svc),
        ).resolves.toBeNull();
    });

    it("is not given with no connected domain, or a plan that keeps it", async () => {
        standing = {
            enforced: true,
            plan: { state: "ending", endsAt: at(7), stopsAt: at(10) },
            domains: [],
        };
        await expect(
            domainEndingFor("org_1", at(7), "Asia/Kolkata", NOW, svc),
        ).resolves.toBeNull();
        stands({ state: "included" });
        await expect(
            domainEndingFor("org_1", at(7), "Asia/Kolkata", NOW, svc),
        ).resolves.toBeNull();
    });

    it("for a move made now, is given only while nothing has started the clock or told the end", async () => {
        stands({ state: "grace", endedAt: NOW, stopsAt: at(3) });
        await expect(
            domainEndedFor("org_1", "Asia/Kolkata", NOW, svc),
        ).resolves.toEqual({
            hostnames: ["shop.example.com"],
            stopsOn: "18 Nov 2026",
            address: "yourshop.saroh.app",
        });
        claim(DOMAIN_ENDED_KIND, DOMAIN_ENDED_KEY);
        await expect(
            domainEndedFor("org_1", "Asia/Kolkata", NOW, svc),
        ).resolves.toBeNull();
        claims = [];
        claim(DOMAIN_TOLD_KIND, domainToldKey(at(-1), 1));
        await expect(
            domainEndedFor("org_1", "Asia/Kolkata", NOW, svc),
        ).resolves.toBeNull();
    });

    it("names one Saroh address only when every domain goes to it", () => {
        expect(sarohAddressOf([DOMAIN])).toBe("yourshop.saroh.app");
        expect(
            sarohAddressOf([DOMAIN, { ...DOMAIN, subdomain: "other" }]),
        ).toBeNull();
        expect(sarohAddressOf([{ ...DOMAIN, subdomain: null }])).toBeNull();
    });
});
