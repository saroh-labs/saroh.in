/**
 * The host a site is primarily served at (`primary-host.ts`). The database
 * is mocked; every host is made up.
 */
const findFirst = jest.fn();

jest.mock("@saroh/database", () => ({
    prisma: { domain: { findFirst: (...a: unknown[]) => findFirst(...a) } },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));
jest.mock("./site-origin", () => ({ rendererHost: () => "saroh.app" }));

import { primaryHostOf } from "./primary-host";

const SITE = { id: "site_1", organizationId: "org_1", subdomain: "rye" };

beforeEach(() => findFirst.mockReset());

describe("a site's primary host", () => {
    it("is its verified custom domain when it has one, the oldest first", async () => {
        findFirst.mockResolvedValue({ hostname: " WWW.RyeBakery.in " });
        await expect(primaryHostOf(SITE)).resolves.toBe("www.ryebakery.in");
        expect(findFirst.mock.calls[0][0]).toMatchObject({
            where: {
                organizationId: "org_1",
                siteId: "site_1",
                status: "VERIFIED",
            },
            orderBy: { verifiedAt: "asc" },
        });
    });

    it("is its Saroh address with no verified domain", async () => {
        findFirst.mockResolvedValue(null);
        await expect(primaryHostOf(SITE)).resolves.toBe("rye.saroh.app");
    });

    it("is nothing with neither", async () => {
        findFirst.mockResolvedValue(null);
        await expect(
            primaryHostOf({ ...SITE, subdomain: null }),
        ).resolves.toBeNull();
    });

    it("falls back to the Saroh address when the read fails: it always serves the site", async () => {
        findFirst.mockRejectedValue(new Error("down"));
        await expect(primaryHostOf(SITE)).resolves.toBe("rye.saroh.app");
    });
});
