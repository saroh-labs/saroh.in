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

    it("stamps consent, expiresAt and a salted visitorHash — and NEVER the raw IP", async () => {
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
        expect(data.consent).toBe("granted");
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

    it("dedupeKey replay is a no-op: P2002 → returns the existing row, one write", async () => {
        const service = new AnalyticsService();
        siteFindUnique.mockResolvedValue(SITE);
        // The create loses to the unique on (organizationId, dedupeKey)...
        eventCreate.mockRejectedValue({ code: "P2002" });
        // ...and the re-read finds the winner.
        eventFindFirst.mockResolvedValue({ id: "evt_existing" });

        const res = await service.ingestPublic(
            "site_1",
            { ...viewInput, dedupeKey: "dk_1" },
            "203.0.113.7",
        );

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
