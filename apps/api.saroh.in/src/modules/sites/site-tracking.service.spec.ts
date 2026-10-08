// DB-free unit tests for a site's "Search and tracking" section (DEC-108,
// #892). The database package and the plan meter are mocked.
//
// What is pinned: only public ids are kept and a secret is refused without
// being repeated; absent leaves a value alone and null removes it; adding or
// turning on a tracker is the plan's to allow, changing or removing one never
// is; and a site Saroh switched off takes no new tracker.
jest.mock("@saroh/database", () => {
    const client = {
        site: { findFirst: jest.fn() },
        siteVerification: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        siteTracker: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        siteTrackingSettings: { findFirst: jest.fn(), upsert: jest.fn() },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(client)),
    };
    return { prisma: client };
});

const assertIncluded = jest.fn();
jest.mock("../billing/metering.service", () => ({
    planMeter: {
        assertIncluded: (...args: unknown[]) =>
            assertIncluded(...args) as unknown,
    },
}));

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    parseSiteTrackingInput,
    SiteTrackingService,
} from "./site-tracking.service";

const db = prisma as unknown as {
    site: { findFirst: jest.Mock };
    siteVerification: Record<"findMany" | "upsert" | "deleteMany", jest.Mock>;
    siteTracker: Record<"findMany" | "upsert" | "deleteMany", jest.Mock>;
    siteTrackingSettings: Record<"findFirst" | "upsert", jest.Mock>;
};

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = { ...OWNER, userId: "u_2", role: "MEMBER" };
const SITE = "site_1";
const GA4 = "G-ABC1234";
const PHC = "phc_abcdefghijklmnopqrstuvwxyz0123";

const service = new SiteTrackingService();

/** The 400 a save is refused with. */
async function refusal(body: unknown): Promise<Record<string, unknown>> {
    const err = await service.save(OWNER, SITE, body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).getResponse() as Record<
        string,
        unknown
    >;
}

beforeEach(() => {
    jest.clearAllMocks();
    db.site.findFirst.mockResolvedValue({
        id: SITE,
        currentPublicationId: null,
    });
    db.siteVerification.findMany.mockResolvedValue([]);
    db.siteTracker.findMany.mockResolvedValue([]);
    db.siteTrackingSettings.findFirst.mockResolvedValue(null);
    assertIncluded.mockResolvedValue(undefined);
});

describe("SiteTrackingService.save: only public ids, never secrets", () => {
    it("stores a verification code and a tracker id", async () => {
        await service.save(OWNER, SITE, {
            verifications: { google: "abcDEF123_-ghiJKL456mnoPQR" },
            trackers: { ga4: { id: ` ${GA4} ` } },
        });
        expect(db.siteVerification.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: {
                    siteId: SITE,
                    organizationId: "org_1",
                    service: "google",
                    code: "abcDEF123_-ghiJKL456mnoPQR",
                },
            }),
        );
        expect(db.siteTracker.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    kind: "ga4",
                    trackerId: GA4,
                    enabled: true,
                }) as unknown,
            }),
        );
    });

    it("refuses a secret as one, and never repeats it", async () => {
        const secret = "phx_privatepersonalkey0123456789abcdef";
        const body = await refusal({
            trackers: { posthog: { id: secret, region: "eu" } },
        });
        expect(body).toMatchObject({
            field: "trackers.posthog",
            problem: "secret",
        });
        expect(JSON.stringify(body)).not.toContain(secret);
        expect(db.siteTracker.upsert).not.toHaveBeenCalled();
    });

    it("refuses Google Tag Manager", async () => {
        expect(
            await refusal({ trackers: { ga4: { id: "GTM-ABC123" } } }),
        ).toMatchObject({
            problem: "tag-manager",
        });
    });

    it("refuses markup, URLs and anything else that could run", async () => {
        for (const id of [
            'G-ABC" onload="x',
            "https://evil.example/x.js",
            "<script>",
        ]) {
            const body = await refusal({ trackers: { ga4: { id } } });
            expect(body).toMatchObject({ problem: "format" });
            expect(JSON.stringify(body)).not.toContain(id);
        }
        expect(
            await refusal({
                verifications: { google: '<meta name="x" content="y">' },
            }),
        ).toMatchObject({ field: "verifications.google", problem: "format" });
    });

    it("refuses a tool, field or region the section doesn't know", async () => {
        expect(
            await refusal({ trackers: { gtm: { id: "GTM-1" } } }),
        ).toMatchObject({
            field: "trackers.gtm",
        });
        expect(await refusal({ script: "<script>" })).toMatchObject({
            field: "script",
        });
        expect(
            await refusal({ trackers: { ga4: { id: GA4, src: "https://x" } } }),
        ).toMatchObject({ field: "trackers.ga4.src" });
        expect(
            await refusal({
                trackers: { posthog: { id: PHC, region: "custom.example" } },
            }),
        ).toMatchObject({ field: "trackers.posthog.region" });
        expect(
            await refusal({ trackers: { ga4: { id: GA4, region: "eu" } } }),
        ).toMatchObject({ field: "trackers.ga4.region" });
    });

    it("keeps only an https privacy page", async () => {
        expect(
            await refusal({ privacyUrl: "http://rye.in/privacy" }),
        ).toMatchObject({
            field: "privacyUrl",
        });
        expect(
            await refusal({ privacyUrl: "javascript:alert(1)" }),
        ).toMatchObject({
            field: "privacyUrl",
        });
        await service.save(OWNER, SITE, {
            privacyUrl: "https://rye.in/privacy",
        });
        expect(db.siteTrackingSettings.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: { privacyUrl: "https://rye.in/privacy" },
            }),
        );
    });
});

describe("SiteTrackingService.save: absent vs null", () => {
    it("removes what is sent as null and leaves the rest alone", async () => {
        await service.save(OWNER, SITE, {
            verifications: { bing: null },
            trackers: { clarity: null },
        });
        expect(db.siteVerification.deleteMany).toHaveBeenCalledWith({
            where: { siteId: SITE, organizationId: "org_1", service: "bing" },
        });
        expect(db.siteTracker.deleteMany).toHaveBeenCalledWith({
            where: { siteId: SITE, organizationId: "org_1", kind: "clarity" },
        });
        expect(db.siteVerification.upsert).not.toHaveBeenCalled();
        expect(db.siteTrackingSettings.upsert).not.toHaveBeenCalled();
    });

    it("keeps a tracker's on/off as it was when a save doesn't say", async () => {
        db.siteTracker.findMany.mockResolvedValue([
            { kind: "ga4", enabled: false },
        ]);
        await service.save(OWNER, SITE, { trackers: { ga4: { id: GA4 } } });
        const [call] = db.siteTracker.upsert.mock.calls[0] as [
            { update: Record<string, unknown> },
        ];
        expect("enabled" in call.update).toBe(false);
    });
});

describe("SiteTrackingService.save: the plan and Saroh's switch-off", () => {
    it("asks the plan when a tracker is added", async () => {
        await service.save(OWNER, SITE, { trackers: { ga4: { id: GA4 } } });
        expect(assertIncluded).toHaveBeenCalledWith("org_1", "site-trackers");
    });

    it("asks the plan when one is turned back on", async () => {
        db.siteTracker.findMany.mockResolvedValue([
            { kind: "ga4", enabled: false },
        ]);
        await service.save(OWNER, SITE, {
            trackers: { ga4: { id: GA4, enabled: true } },
        });
        expect(assertIncluded).toHaveBeenCalledTimes(1);
    });

    it("never asks to change, turn off or remove one, or to save a code", async () => {
        db.siteTracker.findMany.mockResolvedValue([
            { kind: "ga4", enabled: true },
        ]);
        await service.save(OWNER, SITE, {
            verifications: { google: "abcDEF123_-ghiJKL456mnoPQR" },
            trackers: { ga4: { id: "G-NEW9999" }, clarity: null },
        });
        await service.save(OWNER, SITE, {
            trackers: { ga4: { id: GA4, enabled: false } },
        });
        expect(assertIncluded).not.toHaveBeenCalled();
    });

    it("passes the plan's refusal on, and writes nothing", async () => {
        assertIncluded.mockRejectedValue(
            new ForbiddenException("MODULE_LOCKED"),
        );
        await expect(
            service.save(OWNER, SITE, { trackers: { ga4: { id: GA4 } } }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.siteTracker.upsert).not.toHaveBeenCalled();
    });

    it("takes no new tracker on a site Saroh switched off", async () => {
        db.siteTrackingSettings.findFirst.mockResolvedValue({
            switchedOffAt: new Date(),
            privacyUrl: null,
        });
        const err = await service
            .save(OWNER, SITE, { trackers: { ga4: { id: GA4 } } })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
            code: "TRACKERS_SWITCHED_OFF",
        });
        expect(db.siteTracker.upsert).not.toHaveBeenCalled();
        // Removing one still works.
        await service.save(OWNER, SITE, { trackers: { ga4: null } });
        expect(db.siteTracker.deleteMany).toHaveBeenCalled();
    });
});

describe("SiteTrackingService: access", () => {
    it("needs site:update to save", async () => {
        await expect(
            service.save(MEMBER, SITE, { trackers: { ga4: { id: GA4 } } }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("is a 404 for a site outside the business", async () => {
        db.site.findFirst.mockResolvedValue(null);
        await expect(service.read(OWNER, SITE)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("reads codes, trackers in the list's order, and the switch-off", async () => {
        db.siteVerification.findMany.mockResolvedValue([
            { service: "bing", code: "0123456789ABCDEF0123456789ABCDEF" },
        ]);
        db.siteTracker.findMany.mockResolvedValue([
            {
                kind: "umami",
                trackerId: "94db1cb1-74f4-4a40-ad6c-962362670409",
                region: null,
                enabled: true,
            },
            { kind: "ga4", trackerId: GA4, region: null, enabled: false },
        ]);
        db.siteTrackingSettings.findFirst.mockResolvedValue({
            privacyUrl: null,
            switchedOffAt: new Date(),
        });
        const view = await service.read(OWNER, SITE);
        expect(view.verifications).toEqual({
            google: null,
            bing: "0123456789ABCDEF0123456789ABCDEF",
            meta: null,
            pinterest: null,
        });
        expect(view.trackers.map((t) => t.kind)).toEqual(["ga4", "umami"]);
        expect(view.switchedOff).toBe(true);
        // Nothing about who switched it off, or why, reaches the business.
        expect(JSON.stringify(view)).not.toMatch(/staff|reason/i);
    });
});

describe("parseSiteTrackingInput", () => {
    it("reads an empty save as changing nothing", () => {
        expect(parseSiteTrackingInput({})).toEqual({
            verifications: {},
            trackers: {},
            privacyUrl: undefined,
        });
    });
});
