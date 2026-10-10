// DB-free unit tests for a site's QR codes. The database package, the plan
// meter and the module gates are mocked; `qr-codes.db.spec.ts` proves the
// same against Postgres.
//
// What is pinned: a code's link is on the Saroh address and never changes;
// a target is checked against what the site has; only going branded asks
// the plan; a colour too light to scan is refused; another business's site
// or code is a 404; and a code is retired, never deleted.
const mockEnv: Record<string, string | undefined> = {
    NODE_ENV: "test",
    RENDERER_URL: "https://saroh.app",
};
jest.mock("../../env", () => ({ env: mockEnv, declaredNodeEnv: "test" }));

jest.mock("@saroh/database", () => {
    const client = {
        site: { findFirst: jest.fn() },
        qrCode: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
            deleteMany: jest.fn(),
        },
        qrScanDay: { groupBy: jest.fn() },
        booking: { groupBy: jest.fn() },
        order: { groupBy: jest.fn() },
        product: { findFirst: jest.fn() },
        page: { findFirst: jest.fn() },
        publication: { count: jest.fn() },
    };
    return { prisma: client };
});

const assertIncluded = jest.fn();
const isIncluded = jest.fn();
jest.mock("../billing/metering.service", () => ({
    planMeter: {
        assertIncluded: (...args: unknown[]) =>
            assertIncluded(...args) as unknown,
        isIncluded: (...args: unknown[]) => isIncluded(...args) as unknown,
    },
}));

const modulePageState = jest.fn();
jest.mock("./module-pages", () => ({
    modulePageState: (...args: unknown[]) =>
        modulePageState(...args) as unknown,
}));

const effectiveStorefront = jest.fn();
jest.mock("./sells-from", () => ({
    effectiveStorefront: (...args: unknown[]) =>
        effectiveStorefront(...args) as unknown,
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { realOrderWhere } from "../orders/open-orders";
import { QR_CODES_PER_SITE_MAX, QrCodesService } from "./qr-codes.service";
import { recentSince } from "./qr-codes.view";
import { QR_CODE_ATTEMPTS, QR_CODE_SHAPE } from "./qr-target";

type Mocks<K extends string> = Record<K, jest.Mock>;
const db = prisma as unknown as {
    site: Mocks<"findFirst">;
    qrCode: Mocks<
        | "findMany"
        | "findFirst"
        | "count"
        | "create"
        | "updateMany"
        | "delete"
        | "deleteMany"
    >;
    qrScanDay: Mocks<"groupBy">;
    booking: Mocks<"groupBy">;
    order: Mocks<"groupBy">;
    product: Mocks<"findFirst">;
    page: Mocks<"findFirst">;
    publication: Mocks<"count">;
};

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = { ...OWNER, userId: "u_2", role: "MEMBER" };
const SITE = "site_1";
const AT = new Date("2026-10-10T09:00:00.000Z");

function row(over: Record<string, unknown> = {}) {
    return {
        id: "qr_1",
        code: "h7c",
        targetKind: "BOOK",
        targetRef: null,
        place: "COUNTER",
        placeNote: null,
        label: "Scan to book",
        style: "PLAIN",
        color: "#1c1c1a",
        retiredAt: null,
        createdAt: AT,
        updatedAt: AT,
        ...over,
    };
}

const service = new QrCodesService();

/** What a write was refused with: its status class and `details`. */
async function refusal(
    work: Promise<unknown>,
    kind: new (...args: never[]) => Error,
): Promise<{ field?: string; reason?: string }> {
    const err = await work.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(kind);
    const body = (err as BadRequestException).getResponse() as {
        details?: { field?: string; reason?: string };
    };
    return body.details ?? {};
}

beforeEach(() => {
    jest.resetAllMocks();
    db.site.findFirst.mockResolvedValue({
        id: SITE,
        organizationId: "org_1",
        subdomain: "northwind",
        storefrontId: "store_1",
        currentPublicationId: "pub_1",
    });
    db.qrCode.findMany.mockResolvedValue([]);
    db.qrCode.count.mockResolvedValue(0);
    db.qrCode.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve(row(data)),
    );
    db.qrCode.updateMany.mockResolvedValue({ count: 1 });
    db.qrScanDay.groupBy.mockResolvedValue([]);
    db.booking.groupBy.mockResolvedValue([]);
    db.order.groupBy.mockResolvedValue([]);
    assertIncluded.mockResolvedValue(undefined);
    isIncluded.mockResolvedValue(true);
    modulePageState.mockResolvedValue({ state: "on" });
    effectiveStorefront.mockResolvedValue({ id: "store_1", name: "Online" });
});

describe("QrCodesService.create", () => {
    it("makes a plain code for the booking page, with its short link and no scans", async () => {
        const made = await service.create(OWNER, SITE, {
            targetKind: "BOOK",
            place: "COUNTER",
            label: "Scan to book",
        });
        const data = (
            db.qrCode.create.mock.calls[0] as [
                { data: Record<string, unknown> },
            ]
        )[0].data;
        expect(data).toMatchObject({
            siteId: SITE,
            organizationId: "org_1",
            targetKind: "BOOK",
            targetRef: null,
            place: "COUNTER",
            placeNote: null,
            label: "Scan to book",
            style: "PLAIN",
            color: "#1c1c1a",
        });
        expect(data.code).toMatch(QR_CODE_SHAPE);
        expect(made).toMatchObject({
            code: data.code,
            // The Saroh address, never a custom domain.
            link: `https://northwind.saroh.app/q/${String(data.code)}`,
            target: {
                kind: "BOOK",
                ref: null,
                name: "Booking page",
                path: "/book",
                missing: false,
            },
            retired: false,
            scans: { total: 0, last7Days: 0 },
            bookings: 0,
            orders: 0,
        });
        // A plain code never asks the plan.
        expect(assertIncluded).not.toHaveBeenCalled();
    });

    it("allows two codes for the same page and place (two counters)", async () => {
        const first = await service.create(OWNER, SITE, {
            targetKind: "BOOK",
            place: "COUNTER",
        });
        const second = await service.create(OWNER, SITE, {
            targetKind: "BOOK",
            place: "COUNTER",
        });
        expect(db.qrCode.create).toHaveBeenCalledTimes(2);
        expect(first.target.kind).toBe(second.target.kind);
    });

    it("tries another id when one is taken, a little longer each few tries", async () => {
        const taken = Object.assign(new Error("taken"), { code: "P2002" });
        db.qrCode.create
            .mockRejectedValueOnce(taken)
            .mockRejectedValueOnce(taken)
            .mockRejectedValueOnce(taken)
            .mockImplementationOnce(
                ({ data }: { data: Record<string, unknown> }) =>
                    Promise.resolve(row(data)),
            );
        const made = await service.create(OWNER, SITE, {
            targetKind: "SITE",
            place: "CARD",
        });
        expect(db.qrCode.create).toHaveBeenCalledTimes(4);
        expect(made.code).toHaveLength(4);
    });

    it("gives up politely when no id is free, and lets any other failure through", async () => {
        db.qrCode.create.mockRejectedValue(
            Object.assign(new Error("taken"), { code: "P2002" }),
        );
        expect(
            await refusal(
                service.create(OWNER, SITE, {
                    targetKind: "SITE",
                    place: "CARD",
                }),
                ConflictException,
            ),
        ).toEqual({ reason: "no-free-code" });
        expect(db.qrCode.create).toHaveBeenCalledTimes(QR_CODE_ATTEMPTS);

        db.qrCode.create.mockRejectedValue(new Error("database is down"));
        await expect(
            service.create(OWNER, SITE, { targetKind: "SITE", place: "CARD" }),
        ).rejects.toThrow("database is down");
    });

    it("refuses a site that already holds as many codes as it can", async () => {
        db.qrCode.count.mockResolvedValue(QR_CODES_PER_SITE_MAX);
        expect(
            await refusal(
                service.create(OWNER, SITE, {
                    targetKind: "SITE",
                    place: "CARD",
                }),
                ConflictException,
            ),
        ).toEqual({ reason: "too-many" });
        expect(db.qrCode.create).not.toHaveBeenCalled();
    });
});

describe("QrCodesService: what a code may open", () => {
    const create = (targetKind: string, targetRef?: string) =>
        service.create(OWNER, SITE, {
            targetKind: targetKind as never,
            targetRef,
            place: "OTHER",
        });

    it("refuses the shop, or a product, while the shop isn't open to the business", async () => {
        modulePageState.mockResolvedValue({ state: "unavailable" });
        for (const work of [create("SHOP"), create("PRODUCT", "prod_1")]) {
            expect(await refusal(work, BadRequestException)).toEqual({
                field: "target",
                reason: "shop-closed",
            });
        }
        expect(db.product.findFirst).not.toHaveBeenCalled();
    });

    it("refuses the shop while the site sells from no location", async () => {
        effectiveStorefront.mockResolvedValue(null);
        expect(await refusal(create("SHOP"), BadRequestException)).toEqual({
            field: "target",
            reason: "shop-closed",
        });
    });

    it("refuses a product that isn't published in the site's shop, or names none", async () => {
        db.product.findFirst.mockResolvedValue(null);
        for (const work of [create("PRODUCT", "prod_x"), create("PRODUCT")]) {
            expect(await refusal(work, BadRequestException)).toEqual({
                field: "target",
                reason: "product-missing",
            });
        }
        expect(db.qrCode.create).not.toHaveBeenCalled();
    });

    it("takes a published product, by its id", async () => {
        db.product.findFirst.mockResolvedValue({
            id: "prod_1",
            name: "Rye loaf",
            slug: "rye-loaf",
        });
        const made = await create("PRODUCT", "prod_1");
        expect(made.target).toEqual({
            kind: "PRODUCT",
            ref: "prod_1",
            name: "Rye loaf",
            path: "/shop/rye-loaf",
            missing: false,
        });
    });

    it("refuses a page that isn't on the published site", async () => {
        db.page.findFirst.mockResolvedValue(null);
        expect(
            await refusal(create("PAGE", "page_x"), BadRequestException),
        ).toEqual({ field: "target", reason: "page-missing" });
        db.page.findFirst.mockResolvedValue({
            id: "page_1",
            title: "Menu",
            path: "/menu",
        });
        db.publication.count.mockResolvedValue(0);
        expect(
            await refusal(create("PAGE", "page_1"), BadRequestException),
        ).toEqual({ field: "target", reason: "page-missing" });
    });

    it("refuses the booking page while bookings aren't open", async () => {
        modulePageState.mockResolvedValue({
            state: "off",
            module: "Appointments",
        });
        expect(await refusal(create("BOOK"), BadRequestException)).toEqual({
            field: "target",
            reason: "booking-closed",
        });
    });

    it("refuses a reference on a target that takes none", async () => {
        expect(
            await refusal(create("SITE", "prod_1"), BadRequestException),
        ).toEqual({ field: "target", reason: "unknown" });
    });
});

describe("QrCodesService: the plan and the colour", () => {
    const locked = () =>
        new ForbiddenException({
            message: "Not in your plan",
            details: { code: "MODULE_LOCKED", moduleId: "qr-branding" },
        });

    it("asks the plan for a branded code, and passes its refusal on", async () => {
        await service.create(OWNER, SITE, {
            targetKind: "SITE",
            place: "CARD",
            style: "BRANDED",
            color: "#0b5d3b",
        });
        expect(assertIncluded).toHaveBeenCalledWith("org_1", "qr-branding");

        assertIncluded.mockRejectedValue(locked());
        db.qrCode.create.mockClear();
        const err = await service
            .create(OWNER, SITE, {
                targetKind: "SITE",
                place: "CARD",
                style: "BRANDED",
            })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
            details: { code: "MODULE_LOCKED" },
        });
        expect(db.qrCode.create).not.toHaveBeenCalled();
    });

    it("asks the plan when a plain code goes branded, never for one that already is", async () => {
        db.qrCode.findFirst.mockResolvedValue(row());
        await service.update(OWNER, SITE, "qr_1", { style: "BRANDED" });
        expect(assertIncluded).toHaveBeenCalledTimes(1);

        // Made while on a paid plan: still re-pointed and recoloured after.
        assertIncluded.mockClear();
        assertIncluded.mockRejectedValue(locked());
        db.qrCode.findFirst.mockResolvedValue(row({ style: "BRANDED" }));
        await expect(
            service.update(OWNER, SITE, "qr_1", {
                style: "BRANDED",
                targetKind: "SITE",
                color: "#0b5d3b",
            }),
        ).resolves.toMatchObject({ style: "BRANDED" });
        expect(assertIncluded).not.toHaveBeenCalled();
        // And going back to plain is never the plan's business.
        await service.update(OWNER, SITE, "qr_1", { style: "PLAIN" });
        expect(assertIncluded).not.toHaveBeenCalled();
    });

    it("refuses a colour too light to scan, with a plain reason", async () => {
        const err = await service
            .create(OWNER, SITE, {
                targetKind: "SITE",
                place: "CARD",
                color: "#f0a92b",
            })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toEqual({
            message:
                "That colour is too light for a phone to scan. Pick a darker one.",
            details: { field: "color", reason: "too-light" },
        });
        db.qrCode.findFirst.mockResolvedValue(row());
        expect(
            await refusal(
                service.update(OWNER, SITE, "qr_1", { color: "#ffffff" }),
                BadRequestException,
            ),
        ).toEqual({ field: "color", reason: "too-light" });
        expect(db.qrCode.create).not.toHaveBeenCalled();
        expect(db.qrCode.updateMany).not.toHaveBeenCalled();
    });
});

describe("QrCodesService.update", () => {
    it("re-points a code and leaves its id and link alone", async () => {
        db.qrCode.findFirst
            .mockResolvedValueOnce(row())
            .mockResolvedValueOnce(row({ targetKind: "SHOP" }));
        const changed = await service.update(OWNER, SITE, "qr_1", {
            targetKind: "SHOP",
        });
        expect(db.qrCode.updateMany).toHaveBeenCalledWith({
            where: { id: "qr_1", siteId: SITE, organizationId: "org_1" },
            data: { targetKind: "SHOP", targetRef: null },
        });
        expect(changed).toMatchObject({
            id: "qr_1",
            code: "h7c",
            link: "https://northwind.saroh.app/q/h7c",
            target: { kind: "SHOP", path: "/shop" },
        });
    });

    it("changes only what was sent; null clears a note or a label", async () => {
        db.qrCode.findFirst.mockResolvedValue(row());
        await service.update(OWNER, SITE, "qr_1", {
            place: "MIRROR",
            placeNote: "By the till",
            label: null,
        });
        expect(db.qrCode.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    place: "MIRROR",
                    placeNote: "By the till",
                    label: null,
                },
            }),
        );
        expect(modulePageState).not.toHaveBeenCalled();
    });

    it("refuses a change to a retired code", async () => {
        db.qrCode.findFirst.mockResolvedValue(row({ retiredAt: AT }));
        expect(
            await refusal(
                service.update(OWNER, SITE, "qr_1", { place: "CARD" }),
                ConflictException,
            ),
        ).toEqual({ reason: "retired" });
        expect(db.qrCode.updateMany).not.toHaveBeenCalled();
    });
});

describe("QrCodesService.retire", () => {
    it("marks the code retired and deletes nothing", async () => {
        db.qrCode.findFirst
            .mockResolvedValueOnce(row())
            .mockResolvedValueOnce(row({ retiredAt: AT }));
        const retired = await service.retire(OWNER, SITE, "qr_1");
        expect(db.qrCode.updateMany).toHaveBeenCalledWith({
            where: {
                id: "qr_1",
                siteId: SITE,
                organizationId: "org_1",
                retiredAt: null,
            },
            data: { retiredAt: expect.any(Date) as Date },
        });
        expect(db.qrCode.delete).not.toHaveBeenCalled();
        expect(db.qrCode.deleteMany).not.toHaveBeenCalled();
        expect(retired).toMatchObject({
            retired: true,
            retiredAt: AT.toISOString(),
        });
    });

    it("changes nothing for a code already retired", async () => {
        db.qrCode.findFirst.mockResolvedValue(row({ retiredAt: AT }));
        await service.retire(OWNER, SITE, "qr_1");
        expect(db.qrCode.updateMany).not.toHaveBeenCalled();
    });
});

describe("QrCodesService: who may, and whose", () => {
    it("lets a member read the list and refuses them every write", async () => {
        await expect(service.list(MEMBER, SITE)).resolves.toMatchObject({
            codes: [],
        });
        for (const work of [
            service.create(MEMBER, SITE, { targetKind: "SITE", place: "CARD" }),
            service.update(MEMBER, SITE, "qr_1", { place: "CARD" }),
            service.retire(MEMBER, SITE, "qr_1"),
        ]) {
            await expect(work).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(db.qrCode.create).not.toHaveBeenCalled();
        expect(db.qrCode.updateMany).not.toHaveBeenCalled();
    });

    it("answers 404 for another business's site", async () => {
        db.site.findFirst.mockResolvedValue(null);
        for (const work of [
            service.list(OWNER, "site_other"),
            service.create(OWNER, "site_other", {
                targetKind: "SITE",
                place: "CARD",
            }),
            service.retire(OWNER, "site_other", "qr_1"),
        ]) {
            await expect(work).rejects.toBeInstanceOf(NotFoundException);
        }
        expect(db.site.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: "site_other",
                    organizationId: "org_1",
                }) as unknown,
            }),
        );
    });

    it("answers 404 for a code of another site or business", async () => {
        db.qrCode.findFirst.mockResolvedValue(null);
        await expect(
            service.update(OWNER, SITE, "qr_other", { place: "CARD" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.retire(OWNER, SITE, "qr_other"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.qrCode.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: "qr_other",
                    siteId: SITE,
                    organizationId: "org_1",
                },
            }),
        );
        expect(db.qrCode.updateMany).not.toHaveBeenCalled();
    });
});

describe("QrCodesService.list", () => {
    it("counts each code's scans, all time and the last seven days", async () => {
        db.qrCode.findMany.mockResolvedValue([
            row(),
            row({ id: "qr_2", code: "k9d", retiredAt: AT }),
        ]);
        db.qrScanDay.groupBy
            .mockResolvedValueOnce([
                { qrCodeId: "qr_1", _sum: { count: 41 } },
                { qrCodeId: "qr_2", _sum: { count: 3 } },
            ])
            .mockResolvedValueOnce([{ qrCodeId: "qr_1", _sum: { count: 9 } }]);
        const view = await service.list(OWNER, SITE);
        expect(view).toMatchObject({
            origin: "https://northwind.saroh.app",
            live: true,
            included: true,
        });
        expect(view.codes.map((c) => [c.code, c.scans, c.retired])).toEqual([
            ["h7c", { total: 41, last7Days: 9 }, false],
            ["k9d", { total: 3, last7Days: 0 }, true],
        ]);
        // Both reads stay inside the business and the codes listed.
        for (const call of db.qrScanDay.groupBy.mock.calls) {
            expect(
                (call as [{ where: Record<string, unknown> }])[0].where,
            ).toMatchObject({
                organizationId: "org_1",
                qrCodeId: { in: ["qr_1", "qr_2"] },
            });
        }
    });

    it("counts bookings and orders by the code's row id", async () => {
        db.qrCode.findMany.mockResolvedValue([row()]);
        db.booking.groupBy.mockResolvedValue([
            { sourceCode: "qr_1", _count: { _all: 2 } },
        ]);
        db.order.groupBy.mockResolvedValue([
            { sourceCode: "qr_1", _count: { _all: 5 } },
        ]);
        const view = await service.list(OWNER, SITE);
        expect(view.codes[0]).toMatchObject({ bookings: 2, orders: 5 });
        // Bookings that stand, as Home counts them: never a cancelled one
        // or an unpaid hold.
        expect(db.booking.groupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    sourceCode: { in: ["qr_1"] },
                    status: "CONFIRMED",
                },
            }),
        );
        // Real orders, as the Orders list counts them: never a checkout
        // started and left unpaid.
        expect(db.order.groupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    sourceCode: { in: ["qr_1"] },
                    ...realOrderWhere(),
                },
            }),
        );
    });

    it("reads 0 for a code nothing was booked or ordered from", async () => {
        db.qrCode.findMany.mockResolvedValue([row()]);
        db.booking.groupBy.mockResolvedValue([]);
        db.order.groupBy.mockResolvedValue([]);
        const view = await service.list(OWNER, SITE);
        expect(view.codes[0]).toMatchObject({ bookings: 0, orders: 0 });
    });

    it("says when the plan leaves the counts out, and still sends them", async () => {
        isIncluded.mockResolvedValue(false);
        db.qrCode.findMany.mockResolvedValue([row()]);
        db.qrScanDay.groupBy.mockResolvedValue([
            { qrCodeId: "qr_1", _sum: { count: 4 } },
        ]);
        const view = await service.list(OWNER, SITE);
        expect(isIncluded).toHaveBeenCalledWith("org_1", "qr-branding");
        expect(view.included).toBe(false);
        expect(view.codes[0]?.scans.total).toBe(4);
    });

    it("marks a code whose product is gone, and has no link without an address", async () => {
        db.site.findFirst.mockResolvedValue({
            id: SITE,
            organizationId: "org_1",
            subdomain: null,
            storefrontId: "store_1",
            currentPublicationId: null,
        });
        db.qrCode.findMany.mockResolvedValue([
            row({ targetKind: "PRODUCT", targetRef: "prod_gone" }),
        ]);
        db.product.findFirst.mockResolvedValue(null);
        const view = await service.list(OWNER, SITE);
        expect(view).toMatchObject({ origin: null, live: false });
        expect(view.codes[0]).toMatchObject({
            link: null,
            target: { kind: "PRODUCT", path: null, missing: true },
        });
    });

    it("asks for no counts when there are no codes", async () => {
        const view = await service.list(OWNER, SITE);
        expect(view.codes).toEqual([]);
        expect(db.qrScanDay.groupBy).not.toHaveBeenCalled();
        expect(db.booking.groupBy).not.toHaveBeenCalled();
    });
});

describe("recentSince", () => {
    it("is UTC midnight six days before today, so the window is seven days", () => {
        expect(recentSince(new Date("2026-10-10T23:59:00.000Z"))).toEqual(
            new Date("2026-10-04T00:00:00.000Z"),
        );
        expect(recentSince(new Date("2026-03-02T00:00:00.000Z"))).toEqual(
            new Date("2026-02-24T00:00:00.000Z"),
        );
    });
});
