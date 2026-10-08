/**
 * A site footer's live facts (DEC-101, DEC-102): the business's contact
 * email only when it has one, and "Made with Saroh" with its referral code
 * on Free only.
 */
jest.mock("@saroh/database", () => {
    class PrismaClientKnownRequestError extends Error {
        constructor(
            message: string,
            readonly meta: { code: string },
        ) {
            super(message);
        }
        get code() {
            return this.meta.code;
        }
    }
    return {
        prisma: {
            site: { findFirst: jest.fn() },
            businessProfile: { findUnique: jest.fn() },
            organization: { updateMany: jest.fn(), findUnique: jest.fn() },
        },
        Prisma: { PrismaClientKnownRequestError },
        runInOrgContext: (_org: string, fn: () => unknown) => fn(),
    };
});

import { HttpException, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type {
    BusinessAccess,
    CatalogueAccessService,
} from "../billing/catalogue-access.service";
import { FREE_PLAN_ID } from "../billing/catalogue-access.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { onFree, PublicFooterService } from "./public-footer.service";

const siteFind = prisma.site.findFirst as jest.Mock;
const profileFind = prisma.businessProfile.findUnique as jest.Mock;
const orgUpdate = prisma.organization.updateMany as jest.Mock;
const orgFind = prisma.organization.findUnique as jest.Mock;

/** The access a business resolves to, enough of it for `onFree`. */
function onPlan(planId: string): BusinessAccess {
    return { source: "catalogue", planId } as BusinessAccess;
}

function service(access: BusinessAccess, limit = 1_000) {
    const resolver = {
        resolve: jest.fn().mockResolvedValue(access),
    } as unknown as CatalogueAccessService;
    return new PublicFooterService(resolver, new FixedWindowRateLimiter(limit));
}

function site(referralCode: string | null) {
    siteFind.mockResolvedValue({
        organizationId: "org_1",
        organization: { referralCode },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    profileFind.mockResolvedValue({ contactEmail: null });
});

describe("onFree", () => {
    it("is the catalogue's Free plan, or the free floor", () => {
        expect(onFree(onPlan(FREE_PLAN_ID))).toBe(true);
        expect(
            onFree({ source: "legacy", reason: "no-plan" } as BusinessAccess),
        ).toBe(true);
    });

    it("is not a paid plan, a legacy paid row or an unreadable catalogue", () => {
        expect(onFree(onPlan("paid-plan"))).toBe(false);
        for (const reason of [
            "unmapped-plan",
            "no-catalogue",
            "unknown-plan",
        ]) {
            expect(onFree({ source: "legacy", reason } as BusinessAccess)).toBe(
                false,
            );
        }
    });
});

describe("the footer's credit (DEC-102)", () => {
    it("shows Made with Saroh with the business's code on Free", async () => {
        site("k7m2p9qa");
        const footer = await service(onPlan(FREE_PLAN_ID)).read("site_1", "v");
        expect(footer.credit).toEqual({ referralCode: "k7m2p9qa" });
        expect(orgUpdate).not.toHaveBeenCalled();
    });

    it("shows no Saroh credit on a paid plan, and gives no code", async () => {
        site(null);
        const footer = await service(onPlan("paid-plan")).read("site_1", "v");
        expect(footer.credit).toBeNull();
        expect(orgUpdate).not.toHaveBeenCalled();
    });

    it("gives a Free business its code the first time, only where none is set", async () => {
        site(null);
        orgUpdate.mockResolvedValue({ count: 1 });
        orgFind.mockResolvedValue({ referralCode: "abcd2345" });

        const footer = await service(onPlan(FREE_PLAN_ID)).read("site_1", "v");

        expect(footer.credit).toEqual({ referralCode: "abcd2345" });
        const write = orgUpdate.mock.calls[0][0] as {
            where: unknown;
            data: { referralCode: string };
        };
        expect(write.where).toEqual({ id: "org_1", referralCode: null });
        expect(write.data.referralCode).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    });

    it("tries a fresh code when one is another business's", async () => {
        site(null);
        const clash = new Prisma.PrismaClientKnownRequestError("taken", {
            code: "P2002",
        } as never);
        orgUpdate
            .mockRejectedValueOnce(clash)
            .mockResolvedValueOnce({ count: 1 });
        orgFind.mockResolvedValue({ referralCode: "wxyz6789" });

        const footer = await service(onPlan(FREE_PLAN_ID)).read("site_1", "v");

        expect(orgUpdate).toHaveBeenCalledTimes(2);
        expect(footer.credit).toEqual({ referralCode: "wxyz6789" });
    });
});

describe("the footer's email (DEC-101)", () => {
    it("is the business's contact email when it has added one", async () => {
        site("k7m2p9qa");
        profileFind.mockResolvedValue({ contactEmail: "  hi@rye.example " });
        const footer = await service(onPlan("paid-plan")).read("site_1", "v");
        expect(footer.email).toBe("hi@rye.example");
    });

    it("is null when it hasn't, or only wrote spaces", async () => {
        site("k7m2p9qa");
        profileFind.mockResolvedValueOnce(null);
        const none = await service(onPlan("paid-plan")).read("site_1", "v");
        profileFind.mockResolvedValueOnce({ contactEmail: "  " });
        const blank = await service(onPlan("paid-plan")).read("site_1", "v");
        expect([none.email, blank.email]).toEqual([null, null]);
    });
});

describe("what it refuses", () => {
    it("is a 404 for a site that isn't there", async () => {
        siteFind.mockResolvedValue(null);
        await expect(
            service(onPlan(FREE_PLAN_ID)).read("nope", "v"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is a 429 past the visitor's limit", async () => {
        site("k7m2p9qa");
        const footers = service(onPlan(FREE_PLAN_ID), 1);
        await footers.read("site_1", "v");
        await expect(footers.read("site_1", "v")).rejects.toBeInstanceOf(
            HttpException,
        );
    });
});
