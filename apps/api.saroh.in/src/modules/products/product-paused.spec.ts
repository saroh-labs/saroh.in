// A product past the plan's limit after a move to a lower plan is read-only
// (#800). DB-free: Prisma and the over-limit read are mocked.
jest.mock("@saroh/database", () => ({
    prisma: { product: { findFirst: jest.fn() } },
}));
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: jest.fn() },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PausedNow } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { PAUSED_BY_PLAN } from "../billing/paused-errors";
import { assertProductEditable, onlyTakesOffSale } from "./product-paused";

const findFirst = prisma.product.findFirst as jest.Mock;
const pausedNow = overLimit.pausedNow as jest.Mock;

const CUT = { createdAt: new Date("2026-06-01T00:00:00Z"), id: "p_m" };

function paused(products: PausedNow["products"]): PausedNow {
    return {
        organizationId: "org_1",
        since: new Date("2026-10-01T00:00:00Z"),
        memberIds: new Set(),
        invitationIds: new Set(),
        diaryIds: new Set(),
        products,
        posts: null,
        storeIds: new Set(),
        siteIds: new Set(),
    };
}

beforeEach(() => {
    findFirst.mockReset();
    pausedNow.mockReset();
});

describe("assertProductEditable (#800)", () => {
    it("refuses an edit to a product older than the cut, in the business's words", async () => {
        pausedNow.mockResolvedValue(paused(CUT));
        findFirst.mockResolvedValue({
            id: "p_old",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            status: "PUBLISHED",
        });
        const err = await assertProductEditable("org_1", "p_old", {
            name: "New name",
        }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
            message: string;
            details: { code: string; kind: string };
        };
        expect(body.details).toEqual({ code: PAUSED_BY_PLAN, kind: "product" });
        expect(body.message).toBe(
            "This product is paused. Your plan includes fewer products than you have, so your oldest are hidden from your site and read-only. Choose a plan in Plan and billing to bring it back.",
        );
    });

    it("lets a kept product (the cut itself, or newer) be edited", async () => {
        pausedNow.mockResolvedValue(paused(CUT));
        findFirst.mockResolvedValue({ ...CUT, status: "PUBLISHED" });
        await expect(
            assertProductEditable("org_1", "p_m", { name: "x" }),
        ).resolves.toBeUndefined();
        findFirst.mockResolvedValue({
            id: "p_new",
            createdAt: new Date("2026-09-01T00:00:00Z"),
            status: "DRAFT",
        });
        await expect(
            assertProductEditable("org_1", "p_new", { name: "x" }),
        ).resolves.toBeUndefined();
    });

    it("lets a paused product be taken off sale (archived or drafted) without reading anything", async () => {
        pausedNow.mockResolvedValue(paused("all"));
        await expect(
            assertProductEditable("org_1", "p_old", { status: "ARCHIVED" }),
        ).resolves.toBeUndefined();
        await expect(
            assertProductEditable("org_1", "p_old", { status: "DRAFT" }),
        ).resolves.toBeUndefined();
        expect(pausedNow).not.toHaveBeenCalled();
    });

    it("never pauses an archived product: it isn't counted", async () => {
        pausedNow.mockResolvedValue(paused("all"));
        findFirst.mockResolvedValue({
            id: "p_a",
            createdAt: new Date("2020-01-01T00:00:00Z"),
            status: "ARCHIVED",
        });
        await expect(
            assertProductEditable("org_1", "p_a", { status: "PUBLISHED" }),
        ).resolves.toBeUndefined();
    });

    it("refuses nothing when nothing is paused (enforcement off, off the catalogue, under the limit)", async () => {
        pausedNow.mockResolvedValue(null);
        await expect(
            assertProductEditable("org_1", "p_old", { name: "x" }),
        ).resolves.toBeUndefined();
        expect(findFirst).not.toHaveBeenCalled();
    });

    it("with a limit of none kept, every counted product is read-only", async () => {
        pausedNow.mockResolvedValue(paused("all"));
        findFirst.mockResolvedValue({
            id: "p_x",
            createdAt: new Date(),
            status: "PUBLISHED",
        });
        await expect(
            assertProductEditable("org_1", "p_x", { price: "10" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("onlyTakesOffSale", () => {
    it("is a save that sets nothing but a status off the site", () => {
        expect(onlyTakesOffSale({ status: "ARCHIVED" })).toBe(true);
        expect(onlyTakesOffSale({ status: "DRAFT", name: undefined })).toBe(
            true,
        );
        expect(onlyTakesOffSale({ status: "PUBLISHED" })).toBe(false);
        expect(onlyTakesOffSale({ status: "ARCHIVED", name: "x" })).toBe(false);
        expect(onlyTakesOffSale(undefined)).toBe(false);
        expect(onlyTakesOffSale({})).toBe(false);
    });
});
