// Where a pay link lives (DEC-069, plan L7), with the database and the flag
// mocked: the apex while `PAY_LINK_ON_SITE` is off or the business has no
// live site, else the business's own address — its verified custom domain
// first. The real reads run in `public-invoices.service.db.spec.ts` and
// `pay-link-on-site.db.spec.ts`.
jest.mock("../../env", () => ({
    env: { NODE_ENV: "production", RENDERER_URL: "https://saroh.app" },
}));

const isEnabled = jest.fn();
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: jest.fn().mockImplementation(() => ({ isEnabled })),
}));

jest.mock("@saroh/database", () => ({ prisma: {} }));

import { FlagKey } from "../feature-flags/flags";
import {
    orderPayLinkUrl,
    orderPayLinkUrlFor,
    payLinkUrl,
    payLinkUrlFor,
} from "./pay-link-url";

type Site = { id: string; subdomain: string | null } | null;

/** The two reads `siteOriginOf` makes: the live site, then its domain. */
function db(site: Site, hostname: string | null = null) {
    return {
        site: { findFirst: jest.fn().mockResolvedValue(site) },
        domain: {
            findFirst: jest
                .fn()
                .mockResolvedValue(hostname ? { hostname } : null),
        },
    };
}

const RYE = { id: "site_rye", subdomain: "rye" };

beforeEach(() => {
    isEnabled.mockReset();
});

describe("payLinkUrlFor", () => {
    it("is the apex link while the flag is off, reading no site", async () => {
        isEnabled.mockResolvedValue(false);
        const reads = db(RYE);

        await expect(
            payLinkUrlFor("org_rye", "t", reads as never),
        ).resolves.toBe("https://saroh.app/pay/t");
        expect(isEnabled).toHaveBeenCalledWith(
            FlagKey.PAY_LINK_ON_SITE,
            "org_rye",
        );
        expect(reads.site.findFirst).not.toHaveBeenCalled();
    });

    it("is on the business's address when the flag is on and it has a site", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(
            payLinkUrlFor("org_rye", "t", db(RYE) as never),
        ).resolves.toBe("https://rye.saroh.app/pay/t");
    });

    it("is on the verified custom domain when there is one", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(
            payLinkUrlFor("org_rye", "t", db(RYE, "shop.rye.in") as never),
        ).resolves.toBe("https://shop.rye.in/pay/t");
    });

    it("falls back to the apex when the business has no live site", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(
            payLinkUrlFor("org_rye", "t", db(null) as never),
        ).resolves.toBe("https://saroh.app/pay/t");
    });

    it("falls back to the apex when the live site has no address", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(
            payLinkUrlFor(
                "org_rye",
                "t",
                db({ id: "site_rye", subdomain: null }) as never,
            ),
        ).resolves.toBe("https://saroh.app/pay/t");
    });

    it("asks only for the business's own published, undeleted site", async () => {
        isEnabled.mockResolvedValue(true);
        const reads = db(RYE);
        await payLinkUrlFor("org_rye", "t", reads as never);
        expect(reads.site.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_rye",
                    deletedAt: null,
                    currentPublicationId: { not: null },
                },
            }),
        );
    });
});

describe("orderPayLinkUrlFor", () => {
    it("is the apex order link while the flag is off", async () => {
        isEnabled.mockResolvedValue(false);
        await expect(
            orderPayLinkUrlFor("org_rye", "t", db(RYE) as never),
        ).resolves.toBe("https://saroh.app/pay/o/t");
    });

    it("is /pay/o/<token> on the business's address when on", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(
            orderPayLinkUrlFor("org_rye", "t", db(RYE) as never),
        ).resolves.toBe("https://rye.saroh.app/pay/o/t");
        await expect(
            orderPayLinkUrlFor("org_rye", "t", db(RYE, "shop.rye.in") as never),
        ).resolves.toBe("https://shop.rye.in/pay/o/t");
    });
});

describe("the apex links links already sent carry", () => {
    it("stay as they were", () => {
        expect(payLinkUrl("t")).toBe("https://saroh.app/pay/t");
        expect(orderPayLinkUrl("t")).toBe("https://saroh.app/pay/o/t");
    });
});
