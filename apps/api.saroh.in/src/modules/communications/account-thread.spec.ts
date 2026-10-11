// Whether Saroh may post its own updates into a business's account threads
// (12 Oct 2026): the account area, the rollout flag and the business's own
// choice, asked in one place. No database: the flag and the profile are
// stand-ins. Its callers' specs stand this rule in and say what each does
// with a no (`notice-reach.spec.ts`, `customer-notify.handler.spec.ts`,
// `invoice-send.service.spec.ts`); `account-updates-off.spec.ts` runs the
// reach through the rule itself.

const flagOn = jest.fn();
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: jest.fn().mockImplementation(() => ({
        isEnabled: flagOn,
    })),
}));
jest.mock("../site-accounts/account-area", () => ({
    accountAreaOn: jest.fn(),
}));
jest.mock("@saroh/database", () => ({
    prisma: { businessProfile: { findUnique: jest.fn() } },
}));

import { prisma } from "@saroh/database";

import { accountAreaOn } from "../site-accounts/account-area";
import {
    accountThreadOffered,
    accountThreadOn,
    accountUpdatesChosen,
} from "./account-thread";

const areaOn = accountAreaOn as jest.Mock;
const profile = prisma.businessProfile.findUnique as jest.Mock;

/** The three gates as they stand for one business. */
function gates(area: boolean, flag: boolean, chosen: boolean | "no profile") {
    areaOn.mockReturnValue(area);
    flagOn.mockResolvedValue(flag);
    profile.mockResolvedValue(
        chosen === "no profile" ? null : { accountUpdates: chosen },
    );
}

beforeEach(() => jest.clearAllMocks());

describe("accountThreadOn: Saroh's own posts into a customer's Messages", () => {
    // area, rollout flag, the business's choice → posts
    it.each([
        [true, true, true, true],
        [true, true, false, false],
        [true, false, true, false],
        [true, false, false, false],
        [false, true, true, false],
        [false, true, false, false],
        [false, false, true, false],
        [false, false, false, false],
    ])(
        "area %s, rollout flag %s, the business's choice %s: %s",
        async (area, flag, chosen, posts) => {
            gates(area, flag, chosen);
            expect(await accountThreadOn("org_1")).toBe(posts);
        },
    );

    it("asks the flag for this business, by its key", async () => {
        gates(true, true, true);
        await accountThreadOn("org_1");
        expect(flagOn).toHaveBeenCalledWith("ACCOUNT_THREAD", "org_1");
        expect(profile).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            select: { accountUpdates: true },
        });
    });

    it("a business with no profile yet has not turned anything off", async () => {
        gates(true, true, "no profile");
        expect(await accountUpdatesChosen("org_1")).toBe(true);
        expect(await accountThreadOn("org_1")).toBe(true);
    });

    it("reads nothing while the account area is off", async () => {
        gates(false, true, true);
        expect(await accountThreadOn("org_1")).toBe(false);
        expect(flagOn).not.toHaveBeenCalled();
        expect(profile).not.toHaveBeenCalled();
    });
});

describe("accountThreadOffered: whether the choice can have an effect", () => {
    it.each([
        [true, true, true],
        [true, false, false],
        [false, true, false],
        [false, false, false],
    ])("area %s, rollout flag %s: %s", async (area, flag, offered) => {
        // Off by the business's own hand: still offered, to turn back on.
        gates(area, flag, false);
        expect(await accountThreadOffered("org_1")).toBe(offered);
        expect(profile).not.toHaveBeenCalled();
    });
});
