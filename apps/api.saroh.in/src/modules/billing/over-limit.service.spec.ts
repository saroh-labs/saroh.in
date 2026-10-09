const tables: Record<string, Record<string, jest.Mock>> = {};

/**
 * The client the service reads: only the tables a pause is measured from.
 * Anything else — invoices, orders, contacts, payments — throws, so these
 * tests also prove a move down never reads (let alone touches) them.
 */
const fakePrisma = new Proxy(
    {},
    {
        get(_t, name: string) {
            const table = tables[name];
            if (!table) throw new Error(`over-limit read ${name}`);
            return table;
        },
    },
);

jest.mock("@saroh/database", () => ({ prisma: fakePrisma }));

import type { ModuleAccess } from "@saroh/pricing-catalog";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { CatalogueAccessService } from "./catalogue-access.service";
import { moveDownClaimKey, UNCAPPED } from "./over-limit";
import { OverLimitService } from "./over-limit.service";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T10:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function row(moduleId: string, limit: number | null): ModuleAccess {
    return {
        moduleId,
        state: "on",
        inc: true,
        off: "locked",
        text: "",
        limit,
        per: "",
        soft: false,
        name: moduleId,
        what: "",
        override: "",
        upgradeTo: "",
        upgradePlanId: "",
        upgradePricePaise: 0,
        upgradeUncapped: false,
        plan: "Free",
        planId: "free",
    };
}

const LOW = [
    row("members", 2),
    row("reviewers", 1),
    row("products", 2),
    row("blog", 1),
    row("locations", 1),
    row("sites", 1),
];
const HIGH = LOW.map((m) => ({ ...m, limit: null }));

const LOW_LIMITS = {
    ...UNCAPPED,
    teamMembers: 2,
    reviewers: 1,
    products: 2,
    blogPosts: 1,
    shopLocations: 1,
    sites: 1,
};

let enforced = true;
let modules: ModuleAccess[] = LOW;
let source: "catalogue" | "legacy" = "catalogue";
let claim: { createdAt: Date; kind: string } | null = null;

const access = {
    resolve: jest.fn(async () =>
        source === "catalogue"
            ? { source, modules, planName: "Free" }
            : { source, reason: "no-plan" },
    ),
} as unknown as CatalogueAccessService;
const flags = {
    isEnabled: jest.fn(async () => enforced),
} as unknown as FeatureFlagService;

function seed() {
    tables.membership = {
        findMany: jest.fn(async () => [
            member("m-owner", "OWNER", 9),
            member("m-early", "ADMIN", 8),
            member("m-late", "MEMBER", 2),
        ]),
    };
    tables.staffMember = { findMany: jest.fn(async () => []) };
    tables.organizationInvitation = { findMany: jest.fn(async () => []) };
    tables.organizationRole = { findMany: jest.fn(async () => []) };
    tables.product = {
        count: jest.fn(async () => 5),
        findFirst: jest.fn(async () => ({ id: "p4", createdAt: ago(4) })),
    };
    tables.post = {
        count: jest.fn(async () => 1),
        findFirst: jest.fn(async () => null),
    };
    tables.store = {
        findMany: jest.fn(async () => [
            { id: "s1", name: "Main Street", createdAt: ago(100) },
            { id: "s2", name: "Hill Road", createdAt: ago(50) },
        ]),
    };
    tables.site = {
        findMany: jest.fn(async () => [
            { id: "site1", name: "Rye", createdAt: ago(100) },
        ]),
    };
    tables.customerNotice = {
        findUnique: jest.fn(async () => claim),
    };
}

function member(id: string, role: string, daysAgo: number) {
    return {
        id,
        role,
        extraActions: [],
        createdAt: ago(daysAgo),
        staffMember: null,
        user: { name: id, email: `${id}@example.com` },
    };
}

function service() {
    return new OverLimitService(access, flags);
}

beforeEach(() => {
    enforced = true;
    modules = LOW;
    source = "catalogue";
    claim = null;
    seed();
});

describe("OverLimitService (#800)", () => {
    it("pauses nothing with PLAN_ENFORCEMENT off", async () => {
        enforced = false;
        const svc = service();
        await expect(svc.standing("org", NOW)).resolves.toBeNull();
        await expect(svc.pausedNow("org", NOW)).resolves.toBeNull();
    });

    it("pauses nothing for a business the catalogue doesn't reach", async () => {
        source = "legacy";
        await expect(service().pausedNow("org", NOW)).resolves.toBeNull();
    });

    it("over its limits but not told: nothing pauses yet", async () => {
        const s = await service().standing("org", NOW);
        expect(s?.over).toBe(true);
        expect(s?.toldAt).toBeNull();
        expect(s?.paused).toBe(false);
        await expect(service().pausedNow("org", NOW)).resolves.toBeNull();
    });

    it("told 6 days ago: still nothing; 7 days: paused", async () => {
        claim = { createdAt: ago(6), kind: "MOVE_DOWN" };
        expect((await service().standing("org", NOW))?.paused).toBe(false);

        claim = { createdAt: ago(7), kind: "MOVE_DOWN" };
        const p = await service().pausedNow("org", NOW);
        expect(p).not.toBeNull();
        expect([...(p?.memberIds ?? [])]).toEqual(["m-late"]);
        expect(p?.products).toEqual({ id: "p4", createdAt: ago(4) });
        expect(p?.posts).toBeNull();
        expect([...(p?.storeIds ?? [])]).toEqual(["s2"]);
        expect(p?.siteIds.size).toBe(0);
        expect(tables.customerNotice.findUnique).toHaveBeenCalledWith({
            where: {
                organizationId_eventKey: {
                    organizationId: "org",
                    eventKey: moveDownClaimKey(LOW_LIMITS),
                },
            },
            select: { createdAt: true, kind: true },
        });
    });

    it("restores everything the moment the plan reads higher: nothing stored to undo", async () => {
        claim = { createdAt: ago(30), kind: "MOVE_DOWN" };
        expect(await service().pausedNow("org", NOW)).not.toBeNull();
        modules = HIGH;
        const s = await service().standing("org", NOW);
        expect(s?.over).toBe(false);
        await expect(service().pausedNow("org", NOW)).resolves.toBeNull();
    });

    it("keeps the owner whatever the limit", async () => {
        claim = { createdAt: ago(30), kind: "MOVE_DOWN" };
        modules = LOW.map((m) =>
            m.moduleId === "members" ? { ...m, limit: 0 } : m,
        );
        const p = await service().pausedNow("org", NOW);
        expect([...(p?.memberIds ?? [])].sort()).toEqual(["m-early", "m-late"]);
    });

    it("reads no invoices, orders, customers or payments (the proxy throws)", async () => {
        claim = { createdAt: ago(30), kind: "MOVE_DOWN" };
        await expect(service().standing("org", NOW)).resolves.not.toBeNull();
    });

    it("fails open: a plan it can't read pauses nothing", async () => {
        (access.resolve as jest.Mock).mockRejectedValueOnce(new Error("down"));
        await expect(service().pausedNow("org", NOW)).resolves.toBeNull();
    });

    it("previews what a later plan would pause, for a notice", async () => {
        const m = await service().previewAt(
            "org",
            new Date(NOW.getTime() + DAY),
        );
        expect(m?.people.map((p) => p.label)).toEqual(["m-late"]);
        expect(m?.products.count).toBe(3);
        expect(m?.locations.map((l) => l.name)).toEqual(["Hill Road"]);
    });
});
