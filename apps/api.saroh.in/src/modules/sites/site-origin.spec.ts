/**
 * Where a business's own site lives (siteOriginOf): its custom domain, else
 * its address on the renderer's apex in the renderer's own scheme. The
 * database and the plan read are stubs; every host is made up.
 */
const siteFindFirst = jest.fn();
const domainFindFirst = jest.fn();
const env: { NODE_ENV: string; RENDERER_URL?: string } = {
    NODE_ENV: "production",
};

jest.mock("@saroh/database", () => ({
    prisma: {
        site: {
            findFirst: (...a: unknown[]) => siteFindFirst(...a) as unknown,
        },
        domain: {
            findFirst: (...a: unknown[]) => domainFindFirst(...a) as unknown,
        },
    },
}));
jest.mock("../../env", () => ({ env }));
jest.mock("../billing/domain-plan.service", () => ({
    domainPlan: { paused: () => Promise.resolve(false) },
}));

import { siteOriginOf } from "./site-origin";

beforeEach(() => {
    jest.clearAllMocks();
    env.RENDERER_URL = "https://saroh.app";
    siteFindFirst.mockResolvedValue({ id: "site_1", subdomain: "yourshop" });
    domainFindFirst.mockResolvedValue(null);
});

describe("siteOriginOf", () => {
    it("is the business's verified custom domain, on https", async () => {
        domainFindFirst.mockResolvedValue({ hostname: "shop.example.com" });
        await expect(siteOriginOf("org_1")).resolves.toBe(
            "https://shop.example.com",
        );
    });

    it("is <address>.saroh.app on https without one", async () => {
        await expect(siteOriginOf("org_1")).resolves.toBe(
            "https://yourshop.saroh.app",
        );
    });

    it("keeps a plain-http renderer's scheme (the e2e stack)", async () => {
        env.RENDERER_URL = "http://localhost:3005";
        await expect(siteOriginOf("org_1")).resolves.toBe(
            "http://yourshop.localhost:3005",
        );
    });

    it("is null with no published site", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(siteOriginOf("org_1")).resolves.toBeNull();
    });
});
