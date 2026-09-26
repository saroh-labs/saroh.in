jest.mock("@saroh/database", () => ({
    prisma: {
        featureFlagOverride: { findUnique: jest.fn() },
        featureFlag: { findUnique: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import { FeatureFlagService } from "./feature-flags.service";
import { FLAG_KEYS, FLAG_METADATA } from "./flags";

const override = prisma.featureFlagOverride.findUnique as jest.Mock;
const global = prisma.featureFlag.findUnique as jest.Mock;

describe("every flag has a plan to go", () => {
    it.each(FLAG_KEYS)(
        "%s says what it is for, who owns it and when it is reviewed",
        (key) => {
            const meta = FLAG_METADATA[key];
            expect(meta.purpose.length).toBeGreaterThan(20);
            expect(meta.owner.length).toBeGreaterThan(0);
            expect(meta.removeWhen.length).toBeGreaterThan(10);
            expect(meta.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(Number.isNaN(new Date(meta.reviewBy).getTime())).toBe(false);
        },
    );
});

describe("FeatureFlagService.explain matches isEnabled", () => {
    const service = new FeatureFlagService();
    beforeEach(() => jest.clearAllMocks());

    it("reports a business's own override first", async () => {
        override.mockResolvedValue({ enabled: true });
        global.mockResolvedValue({ enabledByDefault: false });
        await expect(service.explain("MODULE_CRM", "org_1")).resolves.toEqual({
            value: true,
            source: "OVERRIDE",
        });
        await expect(service.isEnabled("MODULE_CRM", "org_1")).resolves.toBe(
            true,
        );
    });

    it("falls back to the default for everyone", async () => {
        override.mockResolvedValue(null);
        global.mockResolvedValue({ enabledByDefault: true });
        await expect(service.explain("MODULE_CRM", "org_1")).resolves.toEqual({
            value: true,
            source: "DEFAULT",
        });
    });

    it("fails closed for a flag never configured", async () => {
        override.mockResolvedValue(null);
        global.mockResolvedValue(null);
        await expect(service.explain("MODULE_CRM")).resolves.toEqual({
            value: false,
            source: "UNCONFIGURED",
        });
        await expect(service.isEnabled("MODULE_CRM")).resolves.toBe(false);
    });

    it("fails closed for a key the registry does not know", async () => {
        await expect(service.explain("NOT_A_FLAG", "org_1")).resolves.toEqual({
            value: false,
            source: "UNKNOWN_KEY",
        });
        expect(override).not.toHaveBeenCalled();
    });
});
