/**
 * A site's QR codes against a real Postgres: the short id's uniqueness per
 * site, targets checked against real products and published pages, the
 * scan sums, retiring, and that another business reaches none of it.
 *
 * The module gates (is the shop open, is booking on) are stubbed on: their
 * own specs cover them, and here they would only hide what is being proved.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("./module-pages", () => ({
    modulePageState: jest.fn().mockResolvedValue({ state: "on" }),
}));

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import { QrCodesService } from "./qr-codes.service";
import { recentSince } from "./qr-codes.view";
import { QR_CODE_SHAPE } from "./qr-target";

const codes = new QrCodesService();

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

interface Business {
    organizationId: string;
    siteId: string;
    storeId: string;
    address: string;
    owner: OrganizationContext;
}

/** A business with an owner, a storefront and a site that sells from it. */
async function business(): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("qr-org") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("qr-owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const store = await prisma.store.create({
        data: {
            name: "Hill Road",
            slug: uniq("qr-store"),
            organizationId: org.id,
        },
    });
    const address = uniq("qr-rye").toLowerCase();
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye & Co.",
            slug: uniq("qr-site"),
            subdomain: address,
            storefrontId: store.id,
        },
    });
    return {
        organizationId: org.id,
        siteId: site.id,
        storeId: store.id,
        address,
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
    };
}

/** A product of the business, listed at its storefront unless told not to. */
async function product(
    b: Business,
    name: string,
    over: { status?: string; listed?: boolean } = {},
): Promise<{ id: string; slug: string }> {
    const p = await prisma.product.create({
        data: {
            organizationId: b.organizationId,
            name,
            slug: uniq("qr-loaf"),
            price: "300.00",
            currency: "INR",
            status: over.status ?? "PUBLISHED",
        },
    });
    if (over.listed !== false) {
        await prisma.productListing.create({
            data: {
                organizationId: b.organizationId,
                storeId: b.storeId,
                productId: p.id,
            },
        });
    }
    return { id: p.id, slug: p.slug };
}

/** A free-form page of the site's draft. */
async function page(b: Business, path: string, title: string) {
    return prisma.page.create({
        data: {
            siteId: b.siteId,
            organizationId: b.organizationId,
            path,
            title,
        },
    });
}

/** Publish the site with exactly these page addresses. */
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

async function refusal(work: Promise<unknown>) {
    const err = await work.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    return (
        (err as BadRequestException).getResponse() as {
            details: { field: string; reason: string };
        }
    ).details;
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("a site's QR codes (DB)", () => {
    it("makes a plain code for the booking page and lists it with its link and no scans", async () => {
        const b = await business();
        const made = await codes.create(b.owner, b.siteId, {
            targetKind: "BOOK",
            place: "COUNTER",
            label: "Scan to book",
        });
        expect(made.code).toMatch(QR_CODE_SHAPE);
        expect(made.link).toMatch(
            new RegExp(`^https://${b.address}\\.[a-z.]+/q/${made.code}$`),
        );

        const view = await codes.list(b.owner, b.siteId);
        expect(view.included).toBe(true);
        expect(view.live).toBe(false);
        expect(view.codes).toHaveLength(1);
        expect(view.codes[0]).toMatchObject({
            id: made.id,
            code: made.code,
            link: made.link,
            target: { kind: "BOOK", name: "Booking page", path: "/book" },
            place: "COUNTER",
            label: "Scan to book",
            style: "PLAIN",
            color: "#1c1c1a",
            retired: false,
            scans: { total: 0, last7Days: 0 },
            bookings: 0,
            orders: 0,
        });
    });

    it("gives two codes for the same page and place their own ids", async () => {
        const b = await business();
        const input = { targetKind: "BOOK", place: "COUNTER" } as const;
        const first = await codes.create(b.owner, b.siteId, input);
        const second = await codes.create(b.owner, b.siteId, input);
        expect(second.id).not.toBe(first.id);
        expect(second.code).not.toBe(first.code);
    });

    it("keeps an id unique within a site, and free on another", async () => {
        const a = await business();
        const b = await business();
        const row = (x: Business) => ({
            siteId: x.siteId,
            organizationId: x.organizationId,
            code: "h7c",
            targetKind: "SITE",
            place: "CARD",
            color: "#1c1c1a",
        });
        await prisma.qrCode.create({ data: row(a) });
        await prisma.qrCode.create({ data: row(b) });
        await expect(prisma.qrCode.create({ data: row(a) })).rejects.toThrow(
            /Unique constraint/,
        );
    });

    it("re-points a code without changing its id or its link", async () => {
        const b = await business();
        const loaf = await product(b, "Rye loaf");
        const made = await codes.create(b.owner, b.siteId, {
            targetKind: "SHOP",
            place: "FLYER",
        });
        const changed = await codes.update(b.owner, b.siteId, made.id, {
            targetKind: "PRODUCT",
            targetRef: loaf.id,
            place: "MIRROR",
        });
        expect(changed).toMatchObject({
            id: made.id,
            code: made.code,
            link: made.link,
            place: "MIRROR",
            target: {
                kind: "PRODUCT",
                ref: loaf.id,
                name: "Rye loaf",
                path: `/shop/${loaf.slug}`,
                missing: false,
            },
        });
    });

    it("takes only a product that is published in the site's shop", async () => {
        const b = await business();
        const other = await business();
        const theirs = await product(other, "Their loaf");
        const draft = await product(b, "Draft loaf", { status: "DRAFT" });
        const unlisted = await product(b, "Elsewhere", { listed: false });
        for (const ref of [theirs.id, draft.id, unlisted.id, "prod_nope"]) {
            expect(
                await refusal(
                    codes.create(b.owner, b.siteId, {
                        targetKind: "PRODUCT",
                        targetRef: ref,
                        place: "OTHER",
                    }),
                ),
            ).toEqual({ field: "target", reason: "product-missing" });
        }
        expect(await prisma.qrCode.count({ where: { siteId: b.siteId } })).toBe(
            0,
        );
    });

    it("refuses the shop for a site that sells from a closed location", async () => {
        const b = await business();
        await prisma.store.update({
            where: { id: b.storeId },
            data: { deletedAt: new Date() },
        });
        expect(
            await refusal(
                codes.create(b.owner, b.siteId, {
                    targetKind: "SHOP",
                    place: "OTHER",
                }),
            ),
        ).toEqual({ field: "target", reason: "shop-closed" });
    });

    it("takes a page only once the published site holds it", async () => {
        const b = await business();
        const other = await business();
        const menu = await page(b, "/menu", "Menu");
        const theirs = await page(other, "/menu", "Their menu");
        await publish(other, ["/", "/menu"]);
        const create = (targetRef: string) =>
            codes.create(b.owner, b.siteId, {
                targetKind: "PAGE",
                targetRef,
                place: "CARD",
            });

        // Never published.
        expect(await refusal(create(menu.id))).toEqual({
            field: "target",
            reason: "page-missing",
        });
        // Published, but without this page.
        await publish(b, ["/", "/about"]);
        expect(await refusal(create(menu.id))).toEqual({
            field: "target",
            reason: "page-missing",
        });
        // Another business's page is never this site's.
        expect(await refusal(create(theirs.id))).toEqual({
            field: "target",
            reason: "page-missing",
        });

        await publish(b, ["/", "/about", "/menu"]);
        const made = await create(menu.id);
        expect(made.target).toEqual({
            kind: "PAGE",
            ref: menu.id,
            name: "Menu",
            path: "/menu",
            missing: false,
        });
        expect((await codes.list(b.owner, b.siteId)).live).toBe(true);

        // Hidden since: the list says the code has nowhere to go.
        await prisma.page.update({
            where: { id: menu.id },
            data: { hidden: true },
        });
        const listed = (await codes.list(b.owner, b.siteId)).codes[0];
        expect(listed?.target).toMatchObject({ path: null, missing: true });
    });

    it("sums a code's scans, all time and over the last seven days", async () => {
        const b = await business();
        const made = await codes.create(b.owner, b.siteId, {
            targetKind: "SITE",
            place: "COUNTER",
        });
        const quiet = await codes.create(b.owner, b.siteId, {
            targetKind: "SITE",
            place: "CARD",
        });
        const since = recentSince(new Date());
        const dayBefore = new Date(since);
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
        const today = new Date(new Date().toISOString().slice(0, 10));
        for (const [day, count] of [
            [today, 4],
            [since, 2],
            [dayBefore, 30],
        ] as const) {
            await prisma.qrScanDay.create({
                data: {
                    qrCodeId: made.id,
                    organizationId: b.organizationId,
                    day,
                    count,
                },
            });
        }
        const view = await codes.list(b.owner, b.siteId);
        const scans = new Map(view.codes.map((c) => [c.id, c.scans]));
        expect(scans.get(made.id)).toEqual({ total: 36, last7Days: 6 });
        expect(scans.get(quiet.id)).toEqual({ total: 0, last7Days: 0 });
    });

    it("retires a code and keeps its scans", async () => {
        const b = await business();
        const made = await codes.create(b.owner, b.siteId, {
            targetKind: "SITE",
            place: "COUNTER",
        });
        await prisma.qrScanDay.create({
            data: {
                qrCodeId: made.id,
                organizationId: b.organizationId,
                day: new Date("2026-10-01"),
                count: 7,
            },
        });
        const retired = await codes.retire(b.owner, b.siteId, made.id);
        expect(retired.retired).toBe(true);
        expect(retired.retiredAt).not.toBeNull();
        expect(retired.scans.total).toBe(7);
        expect(
            await prisma.qrScanDay.count({ where: { qrCodeId: made.id } }),
        ).toBe(1);
        // Still listed, and retiring it again changes nothing.
        const again = await codes.retire(b.owner, b.siteId, made.id);
        expect(again.retiredAt).toBe(retired.retiredAt);
        expect((await codes.list(b.owner, b.siteId)).codes).toHaveLength(1);
    });

    it("answers 404 for another business's site or code", async () => {
        const a = await business();
        const b = await business();
        const theirs = await codes.create(b.owner, b.siteId, {
            targetKind: "SITE",
            place: "COUNTER",
        });
        for (const work of [
            codes.list(a.owner, b.siteId),
            codes.create(a.owner, b.siteId, {
                targetKind: "SITE",
                place: "CARD",
            }),
            codes.update(a.owner, b.siteId, theirs.id, { place: "CARD" }),
            codes.retire(a.owner, b.siteId, theirs.id),
            // Their code named on a's own site.
            codes.update(a.owner, a.siteId, theirs.id, { place: "CARD" }),
            codes.retire(a.owner, a.siteId, theirs.id),
        ]) {
            await expect(work).rejects.toBeInstanceOf(NotFoundException);
        }
        const untouched = await prisma.qrCode.findUniqueOrThrow({
            where: { id: theirs.id },
        });
        expect(untouched).toMatchObject({ place: "COUNTER", retiredAt: null });
    });
});

const describeRls = isRlsTestMode() ? describe : describe.skip;

// RLS mode builds the schema from the migrations, so only there do the
// policies and the migration's CHECKs exist (a normal run uses `db push`).
describeRls("row-level security and CHECKs on the QR tables", () => {
    it("another business reads neither its codes nor its scan rows", async () => {
        const a = await business();
        const b = await business();
        for (const owner of [a, b]) {
            const row = await prisma.qrCode.create({
                data: {
                    siteId: owner.siteId,
                    organizationId: owner.organizationId,
                    code: "h7c",
                    targetKind: "SITE",
                    place: "CARD",
                    color: "#1c1c1a",
                },
            });
            await prisma.qrScanDay.create({
                data: {
                    qrCodeId: row.id,
                    organizationId: owner.organizationId,
                    day: new Date("2026-10-01"),
                    count: 1,
                },
            });
        }
        const both = {
            organizationId: { in: [a.organizationId, b.organizationId] },
        };
        for (const count of [
            () => prisma.qrCode.count({ where: both }),
            () => prisma.qrScanDay.count({ where: both }),
        ]) {
            expect(await runInOrgContext(a.organizationId, count)).toBe(1);
            expect(await runInOrgContext(b.organizationId, count)).toBe(1);
            expect(await runInOrgContext("org_does_not_exist", count)).toBe(0);
            expect(await count()).toBe(2);
        }
    });

    it("refuses a row outside the lists the API writes", async () => {
        const b = await business();
        const good = {
            siteId: b.siteId,
            organizationId: b.organizationId,
            code: "k9d",
            targetKind: "SITE",
            place: "CARD",
            color: "#1c1c1a",
        };
        for (const bad of [
            { code: "K9D" },
            { code: "k9" },
            { targetKind: "OFFER" },
            { targetKind: "PRODUCT" },
            { targetRef: "prod_1" },
            { place: "WINDOW" },
            { style: "FANCY" },
            { color: "#FFF" },
        ]) {
            await expect(
                prisma.qrCode.create({ data: { ...good, ...bad } }),
            ).rejects.toThrow(/check constraint|_check/);
        }
    });
});
