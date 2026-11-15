import { beforeEach, describe, expect, it, vi } from "vitest";

const switchState = vi.hoisted(() => ({ on: true }));
const reads = vi.hoisted(() => ({ listSites: vi.fn(), getSite: vi.fn() }));
vi.mock("./share-posts-switch", () => ({
    sharePostsOn: () => switchState.on,
}));
vi.mock("@/lib/sites/service", () => ({
    listSites: reads.listSites,
    getSite: reads.getSite,
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(null),
    listAddons: () => Promise.resolve({ status: "unavailable" }),
}));

import { readShareSetup } from "./read";

const WEB = {
    address: "rye",
    origin: "https://rye.example.com",
    platformOrigin: "https://rye.example.com",
    customDomain: null,
    links: { site: "https://rye.example.com", shop: null, book: null },
};

/**
 * Every Share button asks `readShareSetup` (DEC-217): switched off, it is
 * null without reading anything, so no product, service, blog post or
 * booking page draws one.
 */
describe("readShareSetup and the switch", () => {
    beforeEach(() => {
        reads.listSites.mockReset();
        reads.getSite.mockReset();
        reads.listSites.mockResolvedValue([
            { id: "site_1", subdomain: "rye", currentPublicationId: "pub_1" },
        ]);
        reads.getSite.mockResolvedValue(null);
    });

    it("is null while Share is switched off", async () => {
        switchState.on = false;
        await expect(
            readShareSetup({ ...WEB, address: "off" }),
        ).resolves.toBeNull();
        expect(reads.listSites).not.toHaveBeenCalled();
    });

    it("reads the live site while it is on", async () => {
        switchState.on = true;
        await expect(readShareSetup(WEB)).resolves.toMatchObject({
            siteId: "site_1",
            schedule: { tier: "free" },
        });
    });
});
