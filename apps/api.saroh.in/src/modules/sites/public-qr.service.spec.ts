// DB-free unit tests of a QR code's scan. The database package is mocked;
// `public-qr.db.spec.ts` proves the count itself against Postgres.
//
// What is pinned: an unknown code is a 404 and everything else forwards; a
// retired code and a missing target go home; a link preview, a headers-only
// request and a burst past the limit forward without counting; and the
// business on the count is the code's own.
jest.mock("@saroh/database", () => ({
    prisma: {
        site: { findFirst: jest.fn() },
        qrCode: { findFirst: jest.fn() },
        product: { findFirst: jest.fn() },
        page: { findFirst: jest.fn() },
        publication: { count: jest.fn() },
        $executeRaw: jest.fn(),
    },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));

import { NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import {
    countsAsPerson,
    PublicQrService,
    QR_UNCOUNTED_AGENTS,
    scanDay,
} from "./public-qr.service";

const db = prisma as unknown as {
    site: { findFirst: jest.Mock };
    qrCode: { findFirst: jest.Mock };
    product: { findFirst: jest.Mock };
    page: { findFirst: jest.Mock };
    publication: { count: jest.Mock };
    $executeRaw: jest.Mock;
};
const inOrg = runInOrgContext as unknown as jest.Mock;

const SITE = "site_1";
const VISITOR = "visitor-hash";
const PHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const NOW = new Date("2026-10-10T18:30:00.000Z");

function code(over: Record<string, unknown> = {}) {
    return {
        id: "qr_1",
        organizationId: "org_1",
        targetKind: "BOOK",
        targetRef: null,
        retiredAt: null,
        ...over,
    };
}

function service(limit = 1_000) {
    return new PublicQrService(new FixedWindowRateLimiter(limit, 60_000));
}

/** The values the count statement was given, in order. */
function counted(call = 0): unknown[] {
    return (db.$executeRaw.mock.calls[call] as unknown[]).slice(1);
}

beforeEach(() => {
    jest.clearAllMocks();
    db.site.findFirst.mockResolvedValue({
        id: SITE,
        organizationId: "org_1",
        storefrontId: "store_1",
        currentPublicationId: "pub_1",
    });
    db.qrCode.findFirst.mockResolvedValue(code());
    db.$executeRaw.mockResolvedValue(1);
});

describe("PublicQrService.scan", () => {
    it("forwards to the target and adds one to today's count", async () => {
        const result = await service().scan(
            SITE,
            "h7c",
            VISITOR,
            { userAgent: PHONE },
            NOW,
        );
        expect(result).toEqual({ kind: "path", path: "/book", counted: true });
        expect(db.$executeRaw).toHaveBeenCalledTimes(1);
        // The code, the business from the code's own row, and the UTC day.
        expect(counted()).toEqual(["qr_1", "org_1", "2026-10-10"]);
        const sql = (
            db.$executeRaw.mock.calls[0] as [readonly string[]]
        )[0].join("?");
        expect(sql).toContain('ON CONFLICT ("qrCodeId", "day")');
        expect(sql).toContain('"count" = "QrScanDay"."count" + 1');
    });

    it("reads the code inside its own business, by site and id", async () => {
        await service().scan(SITE, " H7C ", VISITOR, { userAgent: PHONE });
        expect(inOrg).toHaveBeenCalledWith("org_1", expect.any(Function));
        expect(db.qrCode.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { siteId: SITE, organizationId: "org_1", code: "h7c" },
            }),
        );
    });

    it("counts a second scan again", async () => {
        const s = service();
        await s.scan(SITE, "h7c", VISITOR, { userAgent: PHONE }, NOW);
        await s.scan(SITE, "h7c", VISITOR, { userAgent: PHONE }, NOW);
        expect(db.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it("is a 404 for a code the site doesn't have, a malformed one, or no site", async () => {
        db.qrCode.findFirst.mockResolvedValue(null);
        await expect(
            service().scan(SITE, "zzz", VISITOR, { userAgent: PHONE }),
        ).rejects.toBeInstanceOf(NotFoundException);

        for (const bad of ["", "h7", "toolong1", "h/7", "../x", "h7c?x=1"]) {
            await expect(
                service().scan(SITE, bad, VISITOR, { userAgent: PHONE }),
            ).rejects.toBeInstanceOf(NotFoundException);
        }

        db.site.findFirst.mockResolvedValue(null);
        await expect(
            service().scan("site_gone", "h7c", VISITOR, { userAgent: PHONE }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it("sends a retired code home and never counts it", async () => {
        db.qrCode.findFirst.mockResolvedValue(code({ retiredAt: NOW }));
        expect(
            await service().scan(SITE, "h7c", VISITOR, { userAgent: PHONE }),
        ).toEqual({ kind: "home", counted: false });
        expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it("sends a code whose product is gone home, and still counts the scan", async () => {
        db.qrCode.findFirst.mockResolvedValue(
            code({ targetKind: "PRODUCT", targetRef: "prod_gone" }),
        );
        db.product.findFirst.mockResolvedValue(null);
        expect(
            await service().scan(SITE, "h7c", VISITOR, { userAgent: PHONE }),
        ).toEqual({ kind: "home", counted: true });
    });

    it("opens a product at the address it has now", async () => {
        db.qrCode.findFirst.mockResolvedValue(
            code({ targetKind: "PRODUCT", targetRef: "prod_1" }),
        );
        db.product.findFirst.mockResolvedValue({
            id: "prod_1",
            name: "Rye loaf",
            slug: "rye-sourdough",
        });
        expect(
            await service().scan(SITE, "h7c", VISITOR, { userAgent: PHONE }),
        ).toMatchObject({ kind: "path", path: "/shop/rye-sourdough" });
    });

    it("stops counting a burst from one address at the limit, and still forwards", async () => {
        const s = service(2);
        const results = [];
        for (let i = 0; i < 4; i++) {
            results.push(
                await s.scan(SITE, "h7c", VISITOR, { userAgent: PHONE }),
            );
        }
        expect(results.map((r) => r.counted)).toEqual([
            true,
            true,
            false,
            false,
        ]);
        expect(results.every((r) => r.kind === "path")).toBe(true);
        expect(db.$executeRaw).toHaveBeenCalledTimes(2);
        // Another visitor is counted on their own.
        expect(
            (await s.scan(SITE, "h7c", "someone-else", { userAgent: PHONE }))
                .counted,
        ).toBe(true);
    });

    it("forwards a link preview, a script and a headers-only request without counting", async () => {
        const s = service();
        for (const input of [
            { userAgent: "WhatsApp/2.23.20.0" },
            { userAgent: "facebookexternalhit/1.1" },
            { userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" },
            { userAgent: "curl/8.7.1" },
            { userAgent: "" },
            {},
            { userAgent: PHONE, head: true },
        ]) {
            expect(await s.scan(SITE, "h7c", VISITOR, input)).toEqual({
                kind: "path",
                path: "/book",
                counted: false,
            });
        }
        expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it("doesn't spend the visitor's limit on what it wouldn't count", async () => {
        const s = service(1);
        await s.scan(SITE, "h7c", VISITOR, { userAgent: "curl/8.7.1" });
        await s.scan(SITE, "h7c", VISITOR, { userAgent: PHONE, head: true });
        expect(
            (await s.scan(SITE, "h7c", VISITOR, { userAgent: PHONE })).counted,
        ).toBe(true);
    });

    it("still forwards when the count can't be written", async () => {
        db.$executeRaw.mockRejectedValue(new Error("database is down"));
        expect(
            await service().scan(SITE, "h7c", VISITOR, { userAgent: PHONE }),
        ).toEqual({ kind: "path", path: "/book", counted: false });
    });
});

describe("countsAsPerson", () => {
    it("counts browsers, and a phone whose model happens to end in bot", () => {
        expect(countsAsPerson(PHONE)).toBe(true);
        expect(
            countsAsPerson(
                "Mozilla/5.0 (Linux; Android 13; CUBOT NOTE 21) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
            ),
        ).toBe(true);
    });

    it("leaves out each named fetcher, in any case", () => {
        for (const word of QR_UNCOUNTED_AGENTS) {
            expect(countsAsPerson(`Something ${word.toUpperCase()}1.0`)).toBe(
                false,
            );
        }
        expect(countsAsPerson(undefined)).toBe(false);
        expect(countsAsPerson("   ")).toBe(false);
    });
});

describe("scanDay", () => {
    it("is the UTC day", () => {
        expect(scanDay(new Date("2026-10-10T23:59:59.999Z"))).toBe(
            "2026-10-10",
        );
        expect(scanDay(new Date("2026-10-11T00:00:00.000Z"))).toBe(
            "2026-10-11",
        );
    });
});
