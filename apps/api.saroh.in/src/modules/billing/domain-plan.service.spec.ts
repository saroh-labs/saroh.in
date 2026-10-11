/**
 * Where a business's own domain stands against its plan (DEC-139), as the
 * service reads it. The database, the plan read and the flag are stubs;
 * every plan and domain is made up.
 */
const subscriptionFindUnique = jest.fn();
const overrideFindMany = jest.fn();
const noticeFindUnique = jest.fn();
const domainFindMany = jest.fn();

jest.mock("@saroh/database", () => ({
    prisma: {
        subscription: {
            findUnique: (...a: unknown[]) =>
                subscriptionFindUnique(...a) as unknown,
        },
        entitlementOverride: {
            findMany: (...a: unknown[]) => overrideFindMany(...a) as unknown,
        },
        customerNotice: {
            findUnique: (...a: unknown[]) => noticeFindUnique(...a) as unknown,
        },
        domain: {
            findMany: (...a: unknown[]) => domainFindMany(...a) as unknown,
        },
    },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));
const termEndingOf = jest.fn();
jest.mock("./term-ending", () => ({
    termEndingOf: (...a: unknown[]) => termEndingOf(...a) as unknown,
}));

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { CatalogueAccessService } from "./catalogue-access.service";
import { DOMAIN_ENDED_KIND } from "./domain-plan";
import { DomainPlanService } from "./domain-plan.service";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-15T10:00:00.000Z");
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

let enforced = true;
/** What the plan reads at a time: with a domain until `domainUntil`. */
let domainUntil: Date | null = null;
let planOverride: { id: string; planKey: string; expiresAt: Date } | null =
    null;

const CATALOG = {
    plans: [
        { id: "free", name: "Plan A", pricePaise: 0 },
        { id: "b", name: "Plan B", pricePaise: 22_200 },
    ],
};

const resolve = jest.fn(async (_org: string, when: Date = NOW) => ({
    source: "catalogue",
    catalog: CATALOG,
    planOverride,
    entitlements: {
        customDomain:
            domainUntil === null || when.getTime() < domainUntil.getTime(),
    },
}));
const access = { resolve } as unknown as CatalogueAccessService;
const isEnabled = jest.fn(async () => enforced);
const flags = { isEnabled } as unknown as FeatureFlagService;

function service() {
    return new DomainPlanService(access, flags);
}

beforeEach(() => {
    jest.clearAllMocks();
    enforced = true;
    domainUntil = null;
    planOverride = null;
    subscriptionFindUnique.mockResolvedValue(null);
    overrideFindMany.mockResolvedValue([]);
    noticeFindUnique.mockResolvedValue(null);
    domainFindMany.mockResolvedValue([]);
    termEndingOf.mockResolvedValue(null);
});

describe("DomainPlanService (DEC-139)", () => {
    it("reads nothing but the switch while plan enforcement is off", async () => {
        enforced = false;
        domainUntil = at(-30);
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "included",
        });
        expect(resolve).not.toHaveBeenCalled();
        expect(noticeFindUnique).not.toHaveBeenCalled();
    });

    it("is included on a plan with a domain and nothing ending", async () => {
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "included",
        });
    });

    it("is ending when a plan given until a date ends without a domain", async () => {
        planOverride = { id: "ov_1", planKey: "b", expiresAt: at(7) };
        domainUntil = at(7);
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "ending",
            endsAt: at(7),
            stopsAt: at(10),
        });
        // Read as the business will be at that end.
        expect(resolve).toHaveBeenCalledWith("org_1", at(7));
    });

    it("says nothing of an end the next plan also covers", async () => {
        planOverride = { id: "ov_1", planKey: "b", expiresAt: at(7) };
        // It has since paid for a plan with a domain.
        domainUntil = null;
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "included",
        });
    });

    it("says nothing of an end more than 30 days off", async () => {
        planOverride = { id: "ov_1", planKey: "b", expiresAt: at(45) };
        domainUntil = at(45);
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "included",
        });
    });

    it("is ending when a move the business chose takes the domain away", async () => {
        subscriptionFindUnique.mockResolvedValue({
            id: "sub_1",
            status: "ACTIVE",
            pendingFrom: at(12),
        });
        domainUntil = at(12);
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "ending",
            endsAt: at(12),
            stopsAt: at(15),
        });
    });

    it("is ending when a term nobody paid for again runs out", async () => {
        subscriptionFindUnique.mockResolvedValue({
            id: "sub_1",
            status: "ACTIVE",
            pendingFrom: null,
        });
        termEndingOf.mockResolvedValue({ term: { endsAt: at(20) } });
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "ending",
            endsAt: at(20),
            stopsAt: at(23),
        });
    });

    it("keeps the domain past a term's end while a paid plan given to it still stands", async () => {
        subscriptionFindUnique.mockResolvedValue({
            id: "sub_1",
            status: "ACTIVE",
            pendingFrom: null,
        });
        termEndingOf.mockResolvedValue({ term: { endsAt: at(20) } });
        overrideFindMany.mockResolvedValue([
            {
                id: "ov_2",
                kind: "plan",
                key: "plan",
                moduleKey: null,
                value: null,
                planKey: "b",
                createdAt: at(-5),
                expiresAt: null,
                revokedAt: null,
            },
        ]);
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "included",
        });
        // Asked for the overrides that stand at the term's end.
        expect(overrideFindMany.mock.calls[0][0]).toMatchObject({
            where: {
                organizationId: "org_1",
                kind: "plan",
                OR: [{ expiresAt: null }, { expiresAt: { gt: at(20) } }],
            },
        });
    });

    it("takes the first of several ends", async () => {
        planOverride = { id: "ov_1", planKey: "b", expiresAt: at(9) };
        subscriptionFindUnique.mockResolvedValue({
            id: "sub_1",
            status: "ACTIVE",
            pendingFrom: at(4),
        });
        domainUntil = at(4);
        const plan = await service().stateOf("org_1", NOW);
        expect(plan).toMatchObject({ state: "ending", endsAt: at(4) });
    });

    it("is in its 3 days once the plan has no domain, counted from the stored clock", async () => {
        domainUntil = at(-1);
        noticeFindUnique.mockResolvedValue({
            createdAt: at(-1),
            kind: DOMAIN_ENDED_KIND,
        });
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "grace",
            endedAt: at(-1),
            stopsAt: at(2),
        });
        expect(noticeFindUnique.mock.calls[0][0]).toMatchObject({
            where: {
                organizationId_eventKey: {
                    organizationId: "org_1",
                    eventKey: "domain-plan-ended",
                },
            },
        });
        // No end is looked for once the plan has ended.
        expect(subscriptionFindUnique).not.toHaveBeenCalled();
    });

    it("is paused 3 days after the clock, and never on another kind's claim", async () => {
        domainUntil = at(-5);
        noticeFindUnique.mockResolvedValue({
            createdAt: at(-3),
            kind: DOMAIN_ENDED_KIND,
        });
        await expect(service().stateOf("org_1", NOW)).resolves.toEqual({
            state: "paused",
            since: NOW,
        });
        noticeFindUnique.mockResolvedValue({
            createdAt: at(-30),
            kind: "SOMETHING_ELSE",
        });
        await expect(service().stateOf("org_1", NOW)).resolves.toMatchObject({
            state: "grace",
        });
    });

    it("lists the connected domains with each website's Saroh address", async () => {
        domainFindMany.mockResolvedValue([
            {
                hostname: "shop.example.com",
                siteId: "site_1",
                site: { subdomain: "yourshop", deletedAt: null },
            },
            {
                hostname: "old.example.com",
                siteId: "site_2",
                site: { subdomain: "gone", deletedAt: at(-2) },
            },
        ]);
        const standing = await service().standing("org_1", NOW);
        expect(standing).toEqual({
            enforced: true,
            plan: { state: "included" },
            domains: [
                {
                    hostname: "shop.example.com",
                    siteId: "site_1",
                    subdomain: "yourshop",
                },
            ],
        });
        // Only this business's verified domains that serve a website.
        expect(domainFindMany.mock.calls[0][0]).toMatchObject({
            where: {
                organizationId: "org_1",
                status: "VERIFIED",
                siteId: { not: null },
            },
        });
    });
});

describe("DomainPlanService.paused: what the public reads ask", () => {
    it("is true only once the 3 days are up", async () => {
        domainUntil = at(-5);
        noticeFindUnique.mockResolvedValue({
            createdAt: at(-1),
            kind: DOMAIN_ENDED_KIND,
        });
        await expect(service().paused("org_1", NOW)).resolves.toBe(false);
        noticeFindUnique.mockResolvedValue({
            createdAt: at(-4),
            kind: DOMAIN_ENDED_KIND,
        });
        await expect(service().paused("org_1", NOW)).resolves.toBe(true);
    });

    it("reuses its answer for a business, until forgotten", async () => {
        const svc = service();
        domainUntil = at(-5);
        noticeFindUnique.mockResolvedValue({
            createdAt: at(-4),
            kind: DOMAIN_ENDED_KIND,
        });
        await expect(svc.paused("org_1", NOW)).resolves.toBe(true);
        // Back on a plan with a domain: at once, once the answer is dropped.
        domainUntil = null;
        await expect(svc.paused("org_1", NOW)).resolves.toBe(true);
        svc.forget("org_1");
        await expect(svc.paused("org_1", NOW)).resolves.toBe(false);
        expect(isEnabled).toHaveBeenCalledTimes(2);
    });

    it("pauses nothing when the plan can't be read, and doesn't keep that answer", async () => {
        const svc = service();
        resolve.mockRejectedValueOnce(new Error("down"));
        domainUntil = at(-5);
        noticeFindUnique.mockResolvedValue({
            createdAt: at(-4),
            kind: DOMAIN_ENDED_KIND,
        });
        await expect(svc.paused("org_1", NOW)).resolves.toBe(false);
        await expect(svc.paused("org_1", NOW)).resolves.toBe(true);
    });

    it("gives no standing, rather than throw, when it can't be read", async () => {
        resolve.mockRejectedValueOnce(new Error("down"));
        await expect(
            service().standingOrNull("org_1", NOW),
        ).resolves.toBeNull();
    });
});
