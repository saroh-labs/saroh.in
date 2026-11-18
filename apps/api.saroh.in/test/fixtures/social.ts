import { randomBytes } from "node:crypto";

import { prisma } from "@saroh/database";
import { resolveAllAccess } from "@saroh/pricing-catalog";
import { SEED_CATALOG } from "@saroh/pricing-catalog/seed";

import type {
    OrganizationContext,
    OrgRole,
} from "../../src/common/types/organization-context";
import { env } from "../../src/env";
import type { CatalogueAccessService } from "../../src/modules/billing/catalogue-access.service";
import type { FeatureFlagService } from "../../src/modules/feature-flags/feature-flags.service";
import { SocialAccess } from "../../src/modules/social/access/social-access";

/**
 * Saroh Social's db specs' world: a throwaway SOCIAL_ENC_KEY and API
 * address for the run, a business with one person, and the access gate on
 * the sample catalogue with the rollout and plan the spec chooses.
 */

const mutableEnv = env as { SOCIAL_ENC_KEY?: string; API_PUBLIC_URL?: string };
const saved = { ...mutableEnv };

/** For `beforeAll`: a key for this run only, never a value in the repo. */
export function socialEnv(): void {
    mutableEnv.SOCIAL_ENC_KEY = randomBytes(32).toString("base64");
    mutableEnv.API_PUBLIC_URL = "https://api.example.com";
}

/** For `afterAll`. */
export function restoreSocialEnv(): void {
    Object.assign(mutableEnv, saved);
}

let seq = 0;
export const uniq = (label: string) =>
    `${label}-${process.pid}x${Date.now() % 100000}-${++seq}`;

/** Who may use Social, as the spec sets it: rolled out, on a plan. */
export interface SocialWorld {
    flag: boolean;
    planId: "free" | "grow" | "pro";
    addon: boolean;
}

export function socialAccessFor(world: SocialWorld): SocialAccess {
    const flags = {
        isEnabled: jest.fn(() => Promise.resolve(world.flag)),
    } as unknown as FeatureFlagService;
    const catalogue = {
        resolve: jest.fn(() =>
            Promise.resolve({
                source: "catalogue",
                modules: resolveAllAccess({
                    catalog: SEED_CATALOG,
                    planId: world.planId,
                    overrides: [],
                    addons: world.addon
                        ? [{ addonId: "social-grow", quantity: 1 }]
                        : [],
                    now: new Date(),
                }),
            }),
        ),
    } as unknown as CatalogueAccessService;
    return new SocialAccess(flags, catalogue);
}

/** A business with one person of `role`, and their context. */
export async function socialBusiness(
    role: OrgRole = "OWNER",
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Chai & Crumb", slug: uniq("social") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("asha")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role },
    });
    return {
        organizationId: org.id,
        userId: user.id,
        role,
        edition: "INDIA",
    } as OrganizationContext;
}
