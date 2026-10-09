/**
 * A team member past the plan's limit after a move to a lower plan (#800)
 * is refused on the storefront routes too — the ones that never build an
 * organization context — with the MEMBER_PAUSED words, before their role
 * or the legacy dual-read fallback is asked. The legacy path
 * (ORG_AUTHORIZATION off) never reads membership and is unchanged. What is
 * paused is the core's (`over-limit.service.ts`), mocked here.
 */
import { ForbiddenException } from "@nestjs/common";

jest.mock("@saroh/database", () => ({
    prisma: {
        store: { findFirst: jest.fn() },
        membership: { findUnique: jest.fn() },
        organizationRole: { findUnique: jest.fn().mockResolvedValue(null) },
        organization: { findUnique: jest.fn() },
        storeOwner: { findUnique: jest.fn() },
        storeMembers: { findUnique: jest.fn() },
    },
}));

const pausedNow = jest.fn();
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: (...a: unknown[]) => pausedNow(...a) },
}));

import { prisma } from "@saroh/database";

import { MEMBER_PAUSED } from "../billing/paused-errors";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "./stores.service";

const storeFindFirst = prisma.store.findFirst as jest.Mock;
const membershipFindUnique = prisma.membership.findUnique as jest.Mock;
const organizationFindUnique = prisma.organization.findUnique as jest.Mock;
const storeOwnerFindUnique = prisma.storeOwner.findUnique as jest.Mock;

function flags(on: boolean): FeatureFlagService {
    return {
        isEnabled: jest.fn().mockResolvedValue(on),
    } as unknown as FeatureFlagService;
}

function pausing(memberIds: string[]) {
    return {
        organizationId: "org_1",
        since: new Date(),
        memberIds: new Set(memberIds),
        invitationIds: new Set<string>(),
        diaryIds: new Set<string>(),
        products: null,
        posts: null,
        storeIds: new Set<string>(),
        siteIds: new Set<string>(),
    };
}

async function code(p: Promise<unknown>): Promise<string | null> {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    if (!(err instanceof ForbiddenException)) return null;
    const body = err.getResponse() as { details?: { code?: string } };
    return body.details?.code ?? null;
}

describe("StoresService — a paused team member (#800)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        storeFindFirst.mockResolvedValue({
            id: "store_1",
            organizationId: "org_1",
        });
        organizationFindUnique.mockResolvedValue({ name: "Rye Bakery" });
        membershipFindUnique.mockResolvedValue({
            id: "mem_late",
            role: "ADMIN",
            extraActions: [],
        });
        // A legacy storefront grant too: it must not let them in.
        storeOwnerFindUnique.mockResolvedValue({ id: "owner_row" });
        pausedNow.mockResolvedValue(pausing(["mem_late"]));
    });

    it("refuses every storefront entry with MEMBER_PAUSED, before the legacy fallback", async () => {
        {
            const stores = new StoresService(flags(true));
            expect(await code(stores.getForUser("store_1", "user_late"))).toBe(
                MEMBER_PAUSED,
            );
            expect(await code(stores.canWrite("store_1", "user_late"))).toBe(
                MEMBER_PAUSED,
            );
            expect(
                await code(
                    stores.orderWriteOrganization(
                        "store_1",
                        "user_late",
                        "order:create",
                    ),
                ),
            ).toBe(MEMBER_PAUSED);
            expect(
                await code(
                    stores.memberAllows("store_1", "user_late", "order:read"),
                ),
            ).toBe(MEMBER_PAUSED);
            expect(
                await code(
                    stores.moneyAllows("store_1", "user_late", "payment:read"),
                ),
            ).toBe(MEMBER_PAUSED);
        }
    });

    it("leaves the legacy path (ORG_AUTHORIZATION off) as it was: it never reads membership", async () => {
        const stores = new StoresService(flags(false));
        await expect(
            stores.getForUser("store_1", "user_late"),
        ).resolves.toMatchObject({ id: "store_1" });
        expect(pausedNow).not.toHaveBeenCalled();
    });

    it("lets a member who is kept in", async () => {
        pausedNow.mockResolvedValue(pausing(["mem_other"]));
        const stores = new StoresService(flags(true));
        await expect(
            stores.getForUser("store_1", "user_kept"),
        ).resolves.toMatchObject({ id: "store_1" });
    });

    it("never pauses the owner, nor asks", async () => {
        membershipFindUnique.mockResolvedValue({
            id: "mem_owner",
            role: "OWNER",
            extraActions: [],
        });
        pausedNow.mockResolvedValue(pausing(["mem_owner"]));
        const stores = new StoresService(flags(true));
        await expect(
            stores.getForUser("store_1", "user_owner"),
        ).resolves.toMatchObject({ id: "store_1" });
        expect(pausedNow).not.toHaveBeenCalled();
    });

    it("lets everyone in when nothing is paused", async () => {
        pausedNow.mockResolvedValue(null);
        const stores = new StoresService(flags(true));
        await expect(stores.canWrite("store_1", "user_late")).resolves.toBe(
            true,
        );
    });
});
