/**
 * The business page's usage (UX-089, owner 8 Oct): locations are places
 * customers visit, counted by metering's own rule, so an online-only
 * storefront is 0 of them and says why.
 */
const store = { count: jest.fn() };
jest.mock("@saroh/database", () => ({ prisma: { store } }));

import { catalogueUsage, usageNote } from "./catalogue-usage";

/** Storefronts by kind: a `SHOP` one is a place customers visit. */
function storefronts(kinds: ("SHOP" | "ONLINE" | null)[]) {
    store.count.mockImplementation(
        async ({ where }: { where: { settings?: { kind: string } } }) =>
            where.settings
                ? kinds.filter((k) => k === where.settings?.kind).length
                : kinds.length,
    );
}

beforeEach(() => store.count.mockReset());

describe("catalogueUsage", () => {
    it("counts an online-only storefront as no location", async () => {
        storefronts(["ONLINE"]);
        expect(await catalogueUsage("org", ["locations"])).toEqual({
            usage: { locations: 0 },
            storefronts: 1,
        });
    });

    it("counts only the places customers visit", async () => {
        storefronts(["SHOP", "ONLINE", "SHOP", null]);
        expect(await catalogueUsage("org", ["locations"])).toEqual({
            usage: { locations: 2 },
            storefronts: 4,
        });
    });

    it("reads metering's rule: not deleted, and settings that say SHOP", async () => {
        storefronts([]);
        await catalogueUsage("org", ["locations"]);
        expect(store.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org",
                deletedAt: null,
                settings: { kind: "SHOP" },
            },
        });
    });

    it("leaves a row metering doesn't count out, so it reads as not measured", async () => {
        storefronts([]);
        const { usage } = await catalogueUsage("org", ["invoicing"]);
        expect(usage).toEqual({});
    });
});

describe("usageNote", () => {
    it("says a business with only online storefronts sells online only", () => {
        expect(usageNote("locations", 0, 2)).toBe("online-only");
    });

    it("says nothing once a place customers visit counts", () => {
        expect(usageNote("locations", 1, 2)).toBeNull();
    });

    it("says nothing for a business with no storefront at all", () => {
        expect(usageNote("locations", 0, 0)).toBeNull();
    });

    it("says nothing for another row at 0", () => {
        expect(usageNote("products", 0, 2)).toBeNull();
    });
});
