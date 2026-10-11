/**
 * A QR code's scan against a real Postgres: the count is written, once per
 * scan, on the code's own business and day; scans at the same moment all
 * land; and where the scan forwards follows the product or page as it is
 * now.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { PublicQrService } from "./public-qr.service";

const PHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const VISITOR = "visitor-hash";
const TODAY = new Date("2026-10-10T18:30:00.000Z");
const TOMORROW = new Date("2026-10-11T00:00:01.000Z");

// Generous: these tests scan many times from one "visitor".
const scans = () => new PublicQrService(new FixedWindowRateLimiter(1_000));

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

interface Business {
    organizationId: string;
    siteId: string;
    storeId: string;
}

async function business(): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("scan-org") },
    });
    const store = await prisma.store.create({
        data: {
            name: "Hill Road",
            slug: uniq("scan-store"),
            organizationId: org.id,
        },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye & Co.",
            slug: uniq("scan-site"),
            storefrontId: store.id,
        },
    });
    return { organizationId: org.id, siteId: site.id, storeId: store.id };
}

async function code(
    b: Business,
    over: {
        code?: string;
        targetKind?: string;
        targetRef?: string | null;
        retiredAt?: Date;
    } = {},
) {
    return prisma.qrCode.create({
        data: {
            siteId: b.siteId,
            organizationId: b.organizationId,
            code: over.code ?? "h7c",
            targetKind: over.targetKind ?? "BOOK",
            targetRef: over.targetRef ?? null,
            place: "COUNTER",
            color: "#1c1c1a",
            retiredAt: over.retiredAt ?? null,
        },
    });
}

async function publish(b: Business, paths: string[]): Promise<void> {
    const publication = await prisma.publication.create({
        data: {
            siteId: b.siteId,
            organizationId: b.organizationId,
            templateId: "starter",
            templateVersion: 1,
            snapshot: {
                site: { name: "Rye & Co.", slug: "rye" },
                pages: paths.map((path) => ({
                    path,
                    title: path,
                    isHome: path === "/",
                    sections: [],
                })),
            },
        },
    });
    await prisma.site.update({
        where: { id: b.siteId },
        data: { currentPublicationId: publication.id },
    });
}

const days = (qrCodeId: string) =>
    prisma.qrScanDay.findMany({
        where: { qrCodeId },
        orderBy: { day: "asc" },
    });

afterAll(async () => {
    await prisma.$disconnect();
});

describe("a QR code's scan (DB)", () => {
    it("forwards to the target; one scan is 1 today, a second is 2", async () => {
        const b = await business();
        const row = await code(b);
        const s = scans();
        const input = { userAgent: PHONE };

        expect(await s.scan(b.siteId, "h7c", VISITOR, input, TODAY)).toEqual({
            kind: "path",
            path: "/book",
            counted: true,
        });
        expect(await days(row.id)).toEqual([
            {
                qrCodeId: row.id,
                // From the code's own row, never from the caller.
                organizationId: b.organizationId,
                day: new Date("2026-10-10T00:00:00.000Z"),
                count: 1,
            },
        ]);

        await s.scan(b.siteId, "h7c", VISITOR, input, TODAY);
        expect((await days(row.id)).map((d) => d.count)).toEqual([2]);
    });

    it("starts a new row on a new UTC day", async () => {
        const b = await business();
        const row = await code(b);
        const s = scans();
        await s.scan(b.siteId, "h7c", VISITOR, { userAgent: PHONE }, TODAY);
        await s.scan(b.siteId, "h7c", VISITOR, { userAgent: PHONE }, TOMORROW);
        expect(
            (await days(row.id)).map((d) => [
                d.day.toISOString().slice(0, 10),
                d.count,
            ]),
        ).toEqual([
            ["2026-10-10", 1],
            ["2026-10-11", 1],
        ]);
    });

    it("lands every scan made at the same moment", async () => {
        const b = await business();
        const row = await code(b);
        const s = scans();
        const results = await Promise.all(
            Array.from({ length: 12 }, (_, i) =>
                s.scan(
                    b.siteId,
                    "h7c",
                    `visitor-${i}`,
                    { userAgent: PHONE },
                    TODAY,
                ),
            ),
        );
        expect(results.every((r) => r.counted)).toBe(true);
        expect((await days(row.id)).map((d) => d.count)).toEqual([12]);
    });

    it("stops counting one address at the limit and still forwards", async () => {
        const b = await business();
        const row = await code(b);
        const s = new PublicQrService(new FixedWindowRateLimiter(3));
        const results = [];
        for (let i = 0; i < 5; i++) {
            results.push(
                await s.scan(
                    b.siteId,
                    "h7c",
                    VISITOR,
                    { userAgent: PHONE },
                    TODAY,
                ),
            );
        }
        expect(results.map((r) => r.kind)).toEqual(Array(5).fill("path"));
        expect((await days(row.id)).map((d) => d.count)).toEqual([3]);
    });

    it("counts nothing for a link preview or a headers-only request", async () => {
        const b = await business();
        const row = await code(b);
        const s = scans();
        await s.scan(b.siteId, "h7c", VISITOR, {
            userAgent: "WhatsApp/2.23.20.0",
        });
        await s.scan(b.siteId, "h7c", VISITOR, {
            userAgent: PHONE,
            head: true,
        });
        expect(await days(row.id)).toEqual([]);
    });

    it("sends a retired code home, uncounted", async () => {
        const b = await business();
        const row = await code(b, { retiredAt: new Date() });
        expect(
            await scans().scan(b.siteId, "h7c", VISITOR, { userAgent: PHONE }),
        ).toEqual({ kind: "home", counted: false });
        expect(await days(row.id)).toEqual([]);
    });

    it("is a 404 for an unknown code, and for another site's", async () => {
        const a = await business();
        const b = await business();
        await code(b, { code: "k9d" });
        for (const work of [
            scans().scan(a.siteId, "zzz", VISITOR, { userAgent: PHONE }),
            // b's code asked for on a's site.
            scans().scan(a.siteId, "k9d", VISITOR, { userAgent: PHONE }),
            scans().scan("site_nope", "k9d", VISITOR, { userAgent: PHONE }),
        ]) {
            await expect(work).rejects.toBeInstanceOf(NotFoundException);
        }
        expect(
            await prisma.qrScanDay.count({
                where: {
                    organizationId: {
                        in: [a.organizationId, b.organizationId],
                    },
                },
            }),
        ).toBe(0);
    });

    it("follows a product to its new address, and goes home once it is gone", async () => {
        const b = await business();
        const loaf = await prisma.product.create({
            data: {
                organizationId: b.organizationId,
                name: "Rye loaf",
                slug: uniq("rye-loaf"),
                price: "300.00",
                currency: "INR",
                status: "PUBLISHED",
            },
        });
        await prisma.productListing.create({
            data: {
                organizationId: b.organizationId,
                storeId: b.storeId,
                productId: loaf.id,
            },
        });
        const row = await code(b, {
            targetKind: "PRODUCT",
            targetRef: loaf.id,
        });
        const s = scans();
        const scan = () =>
            s.scan(b.siteId, "h7c", VISITOR, { userAgent: PHONE }, TODAY);

        expect(await scan()).toMatchObject({
            kind: "path",
            path: `/shop/${loaf.slug}`,
        });
        // Renamed: the same paper opens the new address.
        const renamed = uniq("rye-sourdough");
        await prisma.product.update({
            where: { id: loaf.id },
            data: { slug: renamed },
        });
        expect(await scan()).toMatchObject({
            kind: "path",
            path: `/shop/${renamed}`,
        });
        // Unpublished, then deleted: home, and the scan still counts.
        await prisma.product.update({
            where: { id: loaf.id },
            data: { status: "DRAFT" },
        });
        expect(await scan()).toEqual({ kind: "home", counted: true });
        await prisma.productListing.deleteMany({
            where: { productId: loaf.id },
        });
        await prisma.product.delete({ where: { id: loaf.id } });
        expect(await scan()).toEqual({ kind: "home", counted: true });
        expect((await days(row.id)).map((d) => d.count)).toEqual([4]);
    });

    it("follows a page to where the published site has it", async () => {
        const b = await business();
        const menu = await prisma.page.create({
            data: {
                siteId: b.siteId,
                organizationId: b.organizationId,
                path: "/menu",
                title: "Menu",
            },
        });
        await code(b, { targetKind: "PAGE", targetRef: menu.id });
        await publish(b, ["/", "/menu"]);
        const scan = () =>
            scans().scan(b.siteId, "h7c", VISITOR, { userAgent: PHONE });

        expect(await scan()).toMatchObject({ kind: "path", path: "/menu" });
        // Moved in the draft, not published yet: nothing is at the new
        // address, so the scan goes home rather than to a missing page.
        await prisma.page.update({
            where: { id: menu.id },
            data: { path: "/our-menu" },
        });
        expect(await scan()).toMatchObject({ kind: "home" });
        await publish(b, ["/", "/our-menu"]);
        expect(await scan()).toMatchObject({
            kind: "path",
            path: "/our-menu",
        });
    });
});
