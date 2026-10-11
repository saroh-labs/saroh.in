/**
 * A domain its plan has paused (DEC-139), as the site reads see it: its
 * host answers a 404 that names the Saroh address, and every place that
 * picks the site's address picks the Saroh one. The database and the plan
 * read are stubs; every host is made up.
 */
const siteFindFirst = jest.fn();
const domainFindFirst = jest.fn();
const reservationFindUnique = jest.fn();
const paused = jest.fn();

jest.mock("@saroh/database", () => ({
    prisma: {
        site: {
            findFirst: (...a: unknown[]) => siteFindFirst(...a) as unknown,
        },
        domain: {
            findFirst: (...a: unknown[]) => domainFindFirst(...a) as unknown,
        },
        addressReservation: {
            findUnique: (...a: unknown[]) =>
                reservationFindUnique(...a) as unknown,
        },
    },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));
jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));
jest.mock("../billing/domain-plan.service", () => ({
    domainPlan: { paused: (...a: unknown[]) => paused(...a) as unknown },
}));

import { NotFoundException } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { DOMAIN_PAUSED_REASON, domainPausedHere } from "./domain-paused";
import { primaryHostOf } from "./primary-host";
import { siteMovedTo } from "./site-moved";
import { siteOriginOf } from "./site-origin";

const DOMAIN = { organizationId: "org_1", siteId: "site_1" };
const ONLINE = { organization: { lifecycleStatus: "ACTIVE" } };

beforeEach(() => {
    jest.clearAllMocks();
    paused.mockResolvedValue(true);
    siteFindFirst.mockResolvedValue({ subdomain: "yourshop", ...ONLINE });
    domainFindFirst.mockResolvedValue({ hostname: "shop.example.com" });
});

describe("a paused domain's host (DEC-139)", () => {
    it("answers a 404 that names the site's Saroh address, and nothing else", async () => {
        const refusal = await domainPausedHere(DOMAIN);
        expect(refusal).toBeInstanceOf(NotFoundException);
        expect(refusal?.getResponse()).toEqual({
            message: "This domain isn't showing a site right now",
            details: {
                reason: DOMAIN_PAUSED_REASON,
                to: "https://yourshop.saroh.app",
            },
        });
        // The site is the domain's own, in its own business.
        expect(paused).toHaveBeenCalledWith("org_1");
        expect(siteFindFirst.mock.calls[0][0]).toMatchObject({
            where: {
                id: "site_1",
                organizationId: "org_1",
                deletedAt: null,
            },
        });
    });

    it("is nothing while the plan includes a domain, or nothing is enforced", async () => {
        paused.mockResolvedValue(false);
        await expect(domainPausedHere(DOMAIN)).resolves.toBeNull();
        expect(siteFindFirst).not.toHaveBeenCalled();
    });

    it("sends nobody anywhere when there is no Saroh address, or the business is offline", async () => {
        siteFindFirst.mockResolvedValue({ subdomain: null, ...ONLINE });
        await expect(domainPausedHere(DOMAIN)).resolves.toBeNull();
        siteFindFirst.mockResolvedValue(null);
        await expect(domainPausedHere(DOMAIN)).resolves.toBeNull();
        siteFindFirst.mockResolvedValue({
            subdomain: "yourshop",
            organization: { lifecycleStatus: "DELETED" },
        });
        await expect(domainPausedHere(DOMAIN)).resolves.toBeNull();
    });
});

describe("the site's address while its domain is paused (DEC-139)", () => {
    const SITE = {
        id: "site_1",
        organizationId: "org_1",
        subdomain: "yourshop",
    };

    it("is the Saroh address as the canonical host, and the domain again at once after", async () => {
        await expect(primaryHostOf(SITE)).resolves.toBe("yourshop.saroh.app");
        paused.mockResolvedValue(false);
        await expect(primaryHostOf(SITE)).resolves.toBe("shop.example.com");
    });

    it("stays the domain when the site has no Saroh address to fall back on", async () => {
        await expect(primaryHostOf({ ...SITE, subdomain: null })).resolves.toBe(
            "shop.example.com",
        );
    });

    it("is the Saroh address in the links Saroh builds", async () => {
        siteFindFirst.mockResolvedValue({
            id: "site_1",
            subdomain: "yourshop",
        });
        await expect(siteOriginOf("org_1")).resolves.toBe(
            "https://yourshop.saroh.app",
        );
        paused.mockResolvedValue(false);
        await expect(siteOriginOf("org_1")).resolves.toBe(
            "https://shop.example.com",
        );
    });

    it("never asks about the plan for a site with no domain of its own", async () => {
        siteFindFirst.mockResolvedValue({
            id: "site_1",
            subdomain: "yourshop",
        });
        domainFindFirst.mockResolvedValue(null);
        await expect(siteOriginOf("org_1")).resolves.toBe(
            "https://yourshop.saroh.app",
        );
        await expect(primaryHostOf(SITE)).resolves.toBe("yourshop.saroh.app");
        expect(paused).not.toHaveBeenCalled();
    });

    it("forwards an old address to the Saroh address, not through the paused domain", async () => {
        reservationFindUnique.mockResolvedValue({
            redirectUntil: new Date(Date.now() + 86_400_000),
            site: {
                id: "site_1",
                organizationId: "org_1",
                subdomain: "yourshop",
                deletedAt: null,
                ...ONLINE,
            },
        });
        const limiter = new FixedWindowRateLimiter(100);
        await expect(
            siteMovedTo("oldshop", "visitor", { limiter }),
        ).resolves.toEqual({ to: "https://yourshop.saroh.app" });
        paused.mockResolvedValue(false);
        await expect(
            siteMovedTo("oldshop", "visitor", { limiter }),
        ).resolves.toEqual({ to: "https://shop.example.com" });
    });
});
