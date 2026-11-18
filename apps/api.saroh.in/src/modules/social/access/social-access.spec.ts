/**
 * Who may use Saroh Social (U1): the permission, the `MODULE_SOCIAL`
 * rollout, then the catalogue's `social` row, read from the sample
 * catalogue (Free locked, Grow locked until its add-on, Pro included).
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        socialPost: { count: jest.fn(() => Promise.resolve(2)) },
        socialRequest: { count: jest.fn(() => Promise.resolve(0)) },
        subscription: { findUnique: jest.fn(() => Promise.resolve(null)) },
        businessProfile: {
            findUnique: jest.fn(() =>
                Promise.resolve({ timezone: "Asia/Kolkata" }),
            ),
        },
    },
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { resolveAllAccess } from "@saroh/pricing-catalog";
import { SEED_CATALOG } from "@saroh/pricing-catalog/seed";

import type {
    OrganizationContext,
    OrgRole,
} from "../../../common/types/organization-context";
import type { CatalogueAccessService } from "../../billing/catalogue-access.service";
import type { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { resolveCapabilities } from "../../organizations/organization-policy";
import { SocialAccess } from "./social-access";

const now = new Date("2026-11-18T06:00:00Z");

function person(role: OrgRole, extras: string[] = []): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role,
        roleKey: role,
        actions: resolveCapabilities(role, null, extras),
    } as OrganizationContext;
}

function access(
    planId: string,
    { flag = true, addon = false }: { flag?: boolean; addon?: boolean } = {},
) {
    const flags = {
        isEnabled: jest.fn(() => Promise.resolve(flag)),
    } as unknown as FeatureFlagService;
    const catalogue = {
        resolve: jest.fn(() =>
            Promise.resolve({
                source: "catalogue",
                modules: resolveAllAccess({
                    catalog: SEED_CATALOG,
                    planId,
                    overrides: [],
                    addons: addon
                        ? [{ addonId: "social-grow", quantity: 1 }]
                        : [],
                    now,
                }),
            }),
        ),
    } as unknown as CatalogueAccessService;
    return new SocialAccess(flags, catalogue);
}

const code = async (p: Promise<unknown>) => {
    try {
        await p;
        return "passed";
    } catch (error) {
        if (error instanceof ForbiddenException) {
            const body = error.getResponse() as { details?: { code?: string } };
            return body.details?.code ?? "forbidden";
        }
        if (error instanceof NotFoundException) return "not-found";
        throw error;
    }
};

describe("SocialAccess", () => {
    const owner = person("OWNER");

    it("locks Free and Grow without the add-on, with the plan's reason", async () => {
        expect(
            await code(access("free").assertOn(owner, "social:post", now)),
        ).toBe("MODULE_LOCKED");
        expect(
            await code(access("grow").assertOn(owner, "social:post", now)),
        ).toBe("MODULE_LOCKED");
    });

    it("lets Grow with the add-on and Pro in, Grow with Pro's allowance", async () => {
        const grow = await access("grow", { addon: true }).assertOn(
            owner,
            "social:post",
            now,
        );
        const pro = await access("pro").assertOn(owner, "social:post", now);
        expect(grow.state).toBe("on");
        expect(grow.limit).toBe(pro.limit);
        expect(pro.state).toBe("on");
    });

    it("answers not found while MODULE_SOCIAL is off", async () => {
        expect(
            await code(
                access("pro", { flag: false }).assertOn(
                    owner,
                    "social:read",
                    now,
                ),
            ),
        ).toBe("not-found");
    });

    it("lets whoever holds social:post post, and refuses a Reviewer and a plain Member", async () => {
        const pro = access("pro");
        expect(
            await code(pro.assertOn(person("ADMIN"), "social:post", now)),
        ).toBe("passed");
        expect(
            await code(
                pro.assertOn(
                    person("MEMBER", ["social:post"]),
                    "social:post",
                    now,
                ),
            ),
        ).toBe("passed");
        expect(
            await code(pro.assertOn(person("MEMBER"), "social:post", now)),
        ).toBe("ROLE_DENIED");
        expect(
            await code(pro.assertOn(person("REVIEWER"), "social:read", now)),
        ).toBe("ROLE_DENIED");
    });

    it("says locked, with the plan to move to, and the month's count when on", async () => {
        const locked = await access("grow").view(owner, now);
        expect(locked).toMatchObject({
            state: "locked",
            upgradeTo: { planId: "pro" },
            usage: null,
        });
        const on = await access("pro").view(owner, now);
        expect(on).toMatchObject({
            state: "on",
            canPost: true,
            usage: { used: 2, requested: false },
        });
        expect(
            (await access("pro", { flag: false }).view(owner, now)).state,
        ).toBe("unavailable");
    });
});
