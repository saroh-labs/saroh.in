/**
 * What a live site's head carries (DEC-108, #893): verification codes on
 * every plan; the merchant's own trackers only while the plan includes them,
 * failing CLOSED on any doubt; and nothing but public values, ever.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        site: { findFirst: jest.fn() },
        siteVerification: { findMany: jest.fn() },
        siteTracker: { findMany: jest.fn() },
        siteTrackingSettings: { findFirst: jest.fn() },
    },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));

import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    BusinessAccess,
    CatalogueAccessService,
} from "../billing/catalogue-access.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PublicHeadService, trackersIncluded } from "./public-head.service";

const db = prisma as unknown as {
    site: { findFirst: jest.Mock };
    siteVerification: { findMany: jest.Mock };
    siteTracker: { findMany: jest.Mock };
    siteTrackingSettings: { findFirst: jest.Mock };
};

const GOOGLE = "abcDEF123_-ghiJKL456mnoPQR";
const GA4 = "G-ABC1234";
const VISITOR = "visitor-hash";

/** A business on the catalogue with the trackers row on or off. */
function plan(on: boolean): BusinessAccess {
    return {
        source: "catalogue",
        modules: [{ moduleId: "site-trackers", state: on ? "on" : "locked" }],
    } as unknown as BusinessAccess;
}

function service(
    access: BusinessAccess | Error,
    limits: { codes?: number; trackers?: number } = {},
) {
    const resolve =
        access instanceof Error
            ? jest.fn().mockRejectedValue(access)
            : jest.fn().mockResolvedValue(access);
    return new PublicHeadService(
        { resolve } as unknown as CatalogueAccessService,
        new FixedWindowRateLimiter(limits.codes ?? 1_000),
        new FixedWindowRateLimiter(limits.trackers ?? 1_000),
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    db.site.findFirst.mockResolvedValue({ organizationId: "org_1" });
    db.siteVerification.findMany.mockResolvedValue([
        { service: "google", code: GOOGLE },
    ]);
    db.siteTracker.findMany.mockResolvedValue([
        { kind: "ga4", trackerId: GA4, region: null },
    ]);
    db.siteTrackingSettings.findFirst.mockResolvedValue({
        privacyUrl: "https://rye.in/privacy",
        switchedOffAt: null,
    });
});

describe("PublicHeadService", () => {
    it("serves codes and trackers on a plan that includes them", async () => {
        await expect(
            service(plan(true)).read("site_1", VISITOR),
        ).resolves.toEqual({
            verifications: [{ service: "google", code: GOOGLE }],
            trackers: [{ kind: "ga4", id: GA4, region: null }],
            privacyUrl: "https://rye.in/privacy",
        });
        // Only the trackers that are on are ever read.
        expect(db.siteTracker.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    siteId: "site_1",
                    organizationId: "org_1",
                    enabled: true,
                },
            }),
        );
    });

    it("serves codes but no trackers on a plan without them", async () => {
        const head = await service(plan(false)).read("site_1", VISITOR);
        expect(head.verifications).toHaveLength(1);
        expect(head.trackers).toEqual([]);
        expect(head.privacyUrl).toBeNull();
    });

    it("fails closed: a legacy plan, an unread plan, or a catalogue without the row", async () => {
        const legacy = {
            source: "legacy",
            reason: "no-plan",
        } as unknown as BusinessAccess;
        const noRow = {
            source: "catalogue",
            modules: [],
        } as unknown as BusinessAccess;
        for (const access of [legacy, noRow, new Error("catalogue down")]) {
            const head = await service(access).read("site_1", VISITOR);
            expect(head.trackers).toEqual([]);
            expect(head.verifications).toHaveLength(1);
        }
    });

    it("serves no trackers on a site Saroh switched off, whatever the plan", async () => {
        db.siteTrackingSettings.findFirst.mockResolvedValue({
            privacyUrl: null,
            switchedOffAt: new Date(),
        });
        const head = await service(plan(true)).read("site_1", VISITOR);
        expect(head.trackers).toEqual([]);
        expect(head.verifications).toHaveLength(1);
    });

    it("keeps the codes when the tracker window is spent or the visitor unnamed", async () => {
        const svc = service(plan(true), { trackers: 1 });
        expect((await svc.read("site_1", VISITOR)).trackers).toHaveLength(1);
        const second = await svc.read("site_1", VISITOR);
        expect(second.trackers).toEqual([]);
        expect(second.verifications).toHaveLength(1);

        const unnamed = await service(plan(true)).read("site_1", undefined);
        expect(unnamed.trackers).toEqual([]);
        expect(unnamed.verifications).toHaveLength(1);
    });

    it("re-checks what it stored and drops a bad row", async () => {
        db.siteVerification.findMany.mockResolvedValue([
            { service: "google", code: '"><script>' },
            { service: "yandex", code: "abc" },
        ]);
        db.siteTracker.findMany.mockResolvedValue([
            { kind: "ga4", trackerId: "GTM-ABC123", region: null },
            { kind: "gtm", trackerId: "GTM-ABC123", region: null },
            {
                kind: "posthog",
                trackerId: "phc_abcdefghijklmnopqrstuvwxyz0123",
                region: "custom",
            },
            { kind: "clarity", trackerId: "3t0wlogvdz", region: null },
        ]);
        const head = await service(plan(true)).read("site_1", VISITOR);
        expect(head.verifications).toEqual([]);
        expect(head.trackers).toEqual([
            { kind: "clarity", id: "3t0wlogvdz", region: null },
        ]);
    });

    it("never reads or returns anything but public values", async () => {
        const head = await service(plan(true)).read("site_1", VISITOR);
        expect(Object.keys(head).sort()).toEqual([
            "privacyUrl",
            "trackers",
            "verifications",
        ]);
        // The site lookup asks only for its business, nothing else about it.
        expect(db.site.findFirst).toHaveBeenCalledWith({
            where: { id: "site_1", deletedAt: null },
            select: { organizationId: true },
        });
        expect(JSON.stringify(head)).not.toMatch(
            /org_1|secret|webhook|switchedOff/i,
        );
    });

    it("is a 404 for a deleted or unknown site, and a 429 past the code window", async () => {
        db.site.findFirst.mockResolvedValueOnce(null);
        await expect(
            service(plan(true)).read("nope", VISITOR),
        ).rejects.toBeInstanceOf(NotFoundException);
        const svc = service(plan(true), { codes: 1 });
        await svc.read("site_1", VISITOR);
        const err = await svc.read("site_1", VISITOR).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(429);
    });
});

describe("trackersIncluded", () => {
    it("is on only for a catalogue plan with the row on", () => {
        expect(trackersIncluded(plan(true))).toBe(true);
        expect(trackersIncluded(plan(false))).toBe(false);
    });
});
