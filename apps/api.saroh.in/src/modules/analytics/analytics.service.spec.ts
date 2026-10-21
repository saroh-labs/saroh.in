// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
// The real Prisma namespace is kept for the JSON / filter casts in the service.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            site: { findUnique: jest.fn() },
            analyticsEvent: { create: jest.fn(), findFirst: jest.fn() },
            analyticsDailyAggregate: { findMany: jest.fn() },
        },
    };
});

import { ForbiddenException, HttpException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { AnalyticsService } from "./analytics.service";

const siteFindUnique = prisma.site.findUnique as jest.Mock;
const eventCreate = prisma.analyticsEvent.create as jest.Mock;
const eventFindFirst = prisma.analyticsEvent.findFirst as jest.Mock;
const aggregateFindMany = prisma.analyticsDailyAggregate.findMany as jest.Mock;

const SITE = { id: "site_1", organizationId: "org_SITE" };

const ctx = (role: OrganizationContext["role"]): OrganizationContext => ({
    organizationId: "org_CTX",
    userId: "user_1",
    role,
});

function wireSite() {
    siteFindUnique.mockResolvedValue(SITE);
    eventCreate.mockResolvedValue({ id: "evt_1" });
}

const viewInput = {
    type: "site.view",
    properties: { path: "/pricing" },
};

describe("AnalyticsService.ingestPublic — org derived from the Site", () => {
    beforeEach(() => jest.clearAllMocks());

    it("ISOLATION: stamps the event with site.organizationId, never a client value", async () => {
        const service = new AnalyticsService();
        wireSite();

        await service.ingestPublic("site_1", viewInput, "203.0.113.7");

        expect(eventCreate).toHaveBeenCalledTimes(1);
        const data = eventCreate.mock.calls[0][0].data;
        // The org comes from the Site row — the caller only passed a siteId + IP.
        expect(data.organizationId).toBe("org_SITE");
        expect(data.siteId).toBe("site_1");
    });

    it("404s a missing site (no event written)", async () => {
        const service = new AnalyticsService();
        siteFindUnique.mockResolvedValue(null);

        await expect(
            service.ingestPublic("nope", viewInput, "203.0.113.7"),
        ).rejects.toThrow(/not found/i);
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it("rejects a non-site.view type on the public endpoint (400, nothing written)", async () => {
        const service = new AnalyticsService();
        wireSite();

        let status: number | undefined;
        try {
            await service.ingestPublic(
                "site_1",
                {
                    type: "order.paid",
                    properties: { orderId: "o1", amountCents: 100 },
                },
                "203.0.113.7",
            );
        } catch (err) {
            status = (err as HttpException).getStatus();
        }
        expect(status).toBe(400);
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it("stamps anonymous consent, expiresAt and a salted visitorHash — and NEVER the raw IP", async () => {
        const service = new AnalyticsService();
        wireSite();
        const rawIp = "203.0.113.7";

        const before = Date.now();
        await service.ingestPublic(
            "site_1",
            { ...viewInput, consent: "granted" },
            rawIp,
        );
        const after = Date.now();

        const data = eventCreate.mock.calls[0][0].data;
        // The browser's word on consent is not kept (U15 privacy review).
        expect(data.consent).toBe("anonymous");
        expect(data.receivedAt).toBeInstanceOf(Date);

        // expiresAt is ~400 days out from receivedAt.
        const expiryMs = (data.expiresAt as Date).getTime();
        const lo = before + 400 * 24 * 60 * 60 * 1000;
        const hi = after + 400 * 24 * 60 * 60 * 1000;
        expect(expiryMs).toBeGreaterThanOrEqual(lo);
        expect(expiryMs).toBeLessThanOrEqual(hi);

        // visitorHash is a non-empty hash, and NOWHERE in the stored row is the
        // raw IP present.
        expect(typeof data.visitorHash).toBe("string");
        expect(data.visitorHash).not.toBe(rawIp);
        expect(JSON.stringify(data)).not.toContain(rawIp);
    });

    it("defaults consent to anonymous when the client omits it", async () => {
        const service = new AnalyticsService();
        wireSite();

        await service.ingestPublic("site_1", viewInput, "203.0.113.7");

        expect(eventCreate.mock.calls[0][0].data.consent).toBe("anonymous");
    });

    it("a server-side producer's dedupeKey replay is a no-op: P2002 → returns the existing row, one write", async () => {
        const service = new AnalyticsService();
        // The create loses to the unique on (organizationId, dedupeKey)...
        eventCreate.mockRejectedValue({ code: "P2002" });
        // ...and the re-read finds the winner.
        eventFindFirst.mockResolvedValue({ id: "evt_existing" });

        const res = await service.record({
            organizationId: "org_SITE",
            type: "order.paid",
            properties: { orderId: "o1", amountCents: 100 },
            dedupeKey: "dk_1",
        });

        expect(res).toEqual({ id: "evt_existing", deduped: true });
        expect(eventCreate).toHaveBeenCalledTimes(1);
        expect(eventFindFirst).toHaveBeenCalledWith({
            where: { organizationId: "org_SITE", dedupeKey: "dk_1" },
        });
    });

    it("429s once the per-(site, ip) window is exhausted", async () => {
        const service = new AnalyticsService(
            new FixedWindowRateLimiter(2, 60_000),
        );
        wireSite();

        await service.ingestPublic("site_1", viewInput, "same_ip");
        await service.ingestPublic("site_1", viewInput, "same_ip");

        let status: number | undefined;
        try {
            await service.ingestPublic("site_1", viewInput, "same_ip");
        } catch (err) {
            status = (err as HttpException).getStatus();
        }
        expect(status).toBe(429);
        // The 429 short-circuits before a third write.
        expect(eventCreate).toHaveBeenCalledTimes(2);
    });
});

describe("AnalyticsService.ingestPublic — what the visitor's browser says is not kept (U15 privacy review)", () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => jest.useRealTimers());

    it.each(["site.view", "site.visit", "site.looked", "site.started"])(
        "%s ignores the client's dedupeKey, occurredAt and consent",
        async (type) => {
            const service = new AnalyticsService();
            wireSite();
            const properties =
                type === "site.view" ? { path: "/" } : { source: "direct" };

            const before = Date.now();
            await service.ingestPublic(
                "site_1",
                {
                    type,
                    properties,
                    consent: "granted",
                    dedupeKey: "visitor-chosen-id",
                    occurredAt: "2026-01-01T10:11:12.345Z",
                },
                "203.0.113.7",
            );

            const data = eventCreate.mock.calls[0][0].data;
            expect(data.consent).toBe("anonymous");
            expect(data.dedupeKey).toBeNull();
            // The server's time (to the hour for a step), never the client's.
            expect((data.occurredAt as Date).getTime()).toBeGreaterThan(
                before - 60 * 60 * 1000,
            );
            expect(JSON.stringify(data)).not.toContain("visitor-chosen-id");
        },
    );
});

describe("AnalyticsService.record — a visit's steps keep their time to the hour (U15 privacy review)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers({ now: new Date("2026-10-21T14:37:12.345Z") });
    });
    afterEach(() => jest.useRealTimers());

    it.each(["site.visit", "site.looked", "site.started"])(
        "%s is stored at the hour's start, received at its end, with a random id",
        async (type) => {
            const service = new AnalyticsService();
            wireSite();

            await service.ingestPublic(
                "site_1",
                { type, properties: { source: "instagram" } },
                "203.0.113.7",
            );

            const data = eventCreate.mock.calls[0][0].data;
            expect(data.occurredAt).toEqual(
                new Date("2026-10-21T14:00:00.000Z"),
            );
            expect(data.receivedAt).toEqual(
                new Date("2026-10-21T15:00:00.000Z"),
            );
            // Expiry follows the coarse stamp, so it can't give the time away.
            expect(data.expiresAt).toEqual(
                new Date(
                    new Date("2026-10-21T15:00:00.000Z").getTime() +
                        400 * 24 * 60 * 60 * 1000,
                ),
            );
            // Not a cuid (which carries the millisecond): a random UUID.
            expect(data.id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
            );
            expect(data.visitorHash).toBeNull();
        },
    );

    it("keeps the hour's start on the same day, just before midnight", async () => {
        jest.setSystemTime(new Date("2026-10-21T23:59:59.999Z"));
        const service = new AnalyticsService();
        wireSite();

        await service.ingestPublic(
            "site_1",
            { type: "site.visit", properties: { source: "direct" } },
            "203.0.113.7",
        );

        const data = eventCreate.mock.calls[0][0].data;
        expect(data.occurredAt).toEqual(new Date("2026-10-21T23:00:00.000Z"));
    });

    it("a page view keeps its exact time and the database's own id", async () => {
        const service = new AnalyticsService();
        wireSite();

        await service.ingestPublic("site_1", viewInput, "203.0.113.7");

        const data = eventCreate.mock.calls[0][0].data;
        expect(data.occurredAt).toEqual(new Date("2026-10-21T14:37:12.345Z"));
        expect(data.receivedAt).toEqual(new Date("2026-10-21T14:37:12.345Z"));
        expect(data.id).toBeUndefined();
    });
});

describe("AnalyticsService.ingestPublic — the visitor hash changes daily and per site (U15 privacy review)", () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => jest.useRealTimers());

    async function hashAt(at: string, siteId = "site_1", ip = "203.0.113.7") {
        jest.useFakeTimers({ now: new Date(at) });
        siteFindUnique.mockResolvedValue({ ...SITE, id: siteId });
        eventCreate.mockResolvedValue({ id: "evt_1" });
        await new AnalyticsService().ingestPublic(siteId, viewInput, ip);
        const data = eventCreate.mock.calls.at(-1)?.[0].data;
        jest.useRealTimers();
        return data.visitorHash as string;
    }

    it("is one hash all day, so unique visitors a day still count", async () => {
        expect(await hashAt("2026-10-21T00:00:01Z")).toBe(
            await hashAt("2026-10-21T23:59:59Z"),
        );
    });

    it("is another hash the next day, and on another site", async () => {
        const today = await hashAt("2026-10-21T12:00:00Z");
        expect(await hashAt("2026-10-22T12:00:00Z")).not.toBe(today);
        expect(await hashAt("2026-10-21T12:00:00Z", "site_2")).not.toBe(today);
        expect(
            await hashAt("2026-10-21T12:00:00Z", "site_1", "198.51.100.1"),
        ).not.toBe(today);
    });
});

describe("AnalyticsService.getDashboard — org-safe reads", () => {
    beforeEach(() => jest.clearAllMocks());

    it("denies a MEMBER (analytics:read is OWNER/ADMIN-only)", async () => {
        const service = new AnalyticsService();

        await expect(
            service.getDashboard(ctx("MEMBER")),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(aggregateFindMany).not.toHaveBeenCalled();
    });

    it("always filters by ctx.organizationId — a cross-tenant row is impossible", async () => {
        const service = new AnalyticsService();
        aggregateFindMany.mockResolvedValue([]);

        await service.getDashboard(ctx("OWNER"), {
            siteId: "site_1",
            type: "site.view",
        });

        const where = aggregateFindMany.mock.calls[0][0].where;
        expect(where.organizationId).toBe("org_CTX");
        expect(where.siteId).toBe("site_1");
        expect(where.type).toBe("site.view");
    });

    it("allows an ADMIN to read", async () => {
        const service = new AnalyticsService();
        aggregateFindMany.mockResolvedValue([]);

        await expect(service.getDashboard(ctx("ADMIN"))).resolves.toEqual([]);
    });
});
