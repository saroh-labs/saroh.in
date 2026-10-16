jest.mock("@saroh/database", () => ({
    prisma: {
        product: { findMany: jest.fn(), findUnique: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import {
    firstFreePath,
    freePath,
    PATH_MAX,
    pathCandidate,
    pathHolder,
    pathTakenMessage,
} from "./product-path";

/**
 * A product's path (16 Oct 2026): a new product made from a taken name gets
 * the first free number, and a typed path that is taken is refused naming
 * who has it and a free one. Pure, and with a jest-mocked Prisma.
 */
describe("product paths", () => {
    const findMany = prisma.product.findMany as unknown as jest.Mock;
    const findUnique = prisma.product.findUnique as unknown as jest.Mock;

    beforeEach(() => {
        findMany.mockReset();
        findUnique.mockReset();
    });

    it("numbers from 2, and keeps a long path within the limit", () => {
        expect(pathCandidate("packing-tape", 1)).toBe("packing-tape");
        expect(pathCandidate("packing-tape", 2)).toBe("packing-tape-2");
        const long = "a".repeat(PATH_MAX);
        const second = pathCandidate(long, 2);
        expect(second).toHaveLength(PATH_MAX);
        expect(second.endsWith("-2")).toBe(true);
    });

    it("takes the first path nobody has", () => {
        expect(firstFreePath("packing-tape", new Set())).toBe("packing-tape");
        expect(
            firstFreePath(
                "packing-tape",
                new Set(["packing-tape", "packing-tape-2"]),
            ),
        ).toBe("packing-tape-3");
    });

    it("reads the business's paths near the name once", async () => {
        findMany.mockResolvedValue([
            { slug: "packing-tape" },
            { slug: "packing-tape-brown" },
        ]);
        await expect(freePath("org-1", "packing-tape")).resolves.toBe(
            "packing-tape-2",
        );
        expect(findMany).toHaveBeenCalledTimes(1);
        expect(findMany.mock.calls[0][0]).toMatchObject({
            where: {
                organizationId: "org-1",
                slug: { startsWith: "packing-tape" },
            },
        });
    });

    it("names who has a path and a free one, or nothing when it is free", async () => {
        findUnique.mockResolvedValue({ id: "p1", name: "Packing Tape" });
        findMany.mockResolvedValue([{ slug: "packing-tape" }]);
        await expect(pathHolder("org-1", "packing-tape")).resolves.toEqual({
            id: "p1",
            name: "Packing Tape",
            free: "packing-tape-2",
        });
        // The product being edited never holds its own path against itself.
        await expect(
            pathHolder("org-1", "packing-tape", "p1"),
        ).resolves.toBeNull();
        findUnique.mockResolvedValue(null);
        await expect(pathHolder("org-1", "new-thing")).resolves.toBeNull();
    });

    it("says the refusal in the merchant's words, never 'slug'", () => {
        const said = pathTakenMessage("Packing Tape", "packing-tape-2");
        expect(said).toBe(
            "Packing Tape already uses this path. Try packing-tape-2.",
        );
        expect(said).not.toMatch(/slug/i);
    });
});
