/**
 * S1-006 store authorization — cross-tenant regression suite (the security core
 * of the ticket). Pure unit tests: Prisma and FeatureFlagService are mocked, so
 * nothing touches a database. Proves that org-A principals cannot reach org-B
 * stores on either path, that legacy StoreMembers staff survive the transition
 * via dual-read, that denied roles are rejected, and that with the flag OFF the
 * behavior is exactly the pre-S1-006 legacy path (org membership is ignored).
 */
import { ConflictException, NotFoundException } from "@nestjs/common";

// Mock the database package so the service never touches a real Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
        store: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        },
        membership: {
            findUnique: jest.fn(),
        },
        storeOwner: {
            findUnique: jest.fn(),
        },
        storeMembers: {
            findUnique: jest.fn(),
        },
    },
}));

import { prisma } from "@saroh/database";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";

import { StoresService } from "./stores.service";

const storeFindFirst = prisma.store.findFirst as jest.Mock;
const membershipFindUnique = prisma.membership.findUnique as jest.Mock;
const storeOwnerFindUnique = prisma.storeOwner.findUnique as jest.Mock;
const storeMembersFindUnique = prisma.storeMembers.findUnique as jest.Mock;

const STORE_B_ID = "store_B";
const ORG_B = "org_B";

/** Configure the mock DB for a store belonging to `organizationId`. */
function setupStore(opts: {
    organizationId: string | null;
    /** Membership role of the caller in THIS store's org (null = none). */
    membershipRole?: string | null;
    /** Whether the caller is a legacy StoreOwner of this store. */
    legacyOwner?: boolean;
    /** Legacy StoreMembers role of the caller on this store (null = none). */
    legacyMemberRole?: string | null;
    /** Store row exists at all (default true). */
    exists?: boolean;
}) {
    const exists = opts.exists ?? true;
    const storeRow = exists
        ? {
              id: STORE_B_ID,
              organizationId: opts.organizationId,
              name: "B",
              slug: "b",
          }
        : null;

    const legacyHasRead = Boolean(opts.legacyOwner || opts.legacyMemberRole);

    storeFindFirst.mockImplementation((args: { where: { OR?: unknown } }) => {
        // getForUserLegacy uses an OR filter; the plain load does not.
        if (args.where.OR) {
            return Promise.resolve(exists && legacyHasRead ? storeRow : null);
        }
        return Promise.resolve(storeRow);
    });

    membershipFindUnique.mockResolvedValue(
        opts.membershipRole ? { role: opts.membershipRole } : null,
    );
    storeOwnerFindUnique.mockResolvedValue(
        opts.legacyOwner ? { id: "o" } : null,
    );
    storeMembersFindUnique.mockResolvedValue(
        opts.legacyMemberRole ? { role: opts.legacyMemberRole } : null,
    );
}

/** A FeatureFlagService test double whose isEnabled returns `on`. */
function flags(on: boolean): FeatureFlagService {
    return {
        isEnabled: jest.fn().mockResolvedValue(on),
    } as unknown as FeatureFlagService;
}

const USER = "user_A"; // a principal from org A, probing org B's store.

describe("StoresService authorization (S1-006)", () => {
    beforeEach(() => jest.clearAllMocks());

    describe("flag ON — Organization path", () => {
        const service = () => new StoresService(flags(true));

        it("denies cross-tenant READ: org-A owner has no membership in org B", async () => {
            // Caller is OWNER of org A but has NO membership in org B and no
            // legacy owner/member record on store B.
            setupStore({ organizationId: ORG_B, membershipRole: null });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it("denies cross-tenant WRITE: org-A owner has no membership in org B", async () => {
            setupStore({ organizationId: ORG_B, membershipRole: null });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                false,
            );
        });

        it("allows READ + WRITE for an OWNER member of the store's org", async () => {
            setupStore({ organizationId: ORG_B, membershipRole: "OWNER" });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).resolves.toMatchObject({ id: STORE_B_ID });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                true,
            );
        });

        it("allows READ but DENIES WRITE for a MEMBER role (store:write not granted)", async () => {
            // MEMBER may store:read but not store:write; no legacy grant either.
            setupStore({ organizationId: ORG_B, membershipRole: "MEMBER" });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).resolves.toMatchObject({ id: STORE_B_ID });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                false,
            );
        });

        it("DUAL-READ: a legacy StoreMembers staffer (not migrated to Membership) keeps access", async () => {
            // No org membership at all, but a legacy write-capable member row.
            setupStore({
                organizationId: ORG_B,
                membershipRole: null,
                legacyMemberRole: "EDITOR",
            });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).resolves.toMatchObject({ id: STORE_B_ID });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                true,
            );
        });

        it("DUAL-READ: a legacy StoreOwner keeps write access without a Membership", async () => {
            setupStore({
                organizationId: ORG_B,
                membershipRole: null,
                legacyOwner: true,
            });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                true,
            );
        });

        it("DUAL-READ: a legacy VIEWER member can read but not write", async () => {
            setupStore({
                organizationId: ORG_B,
                membershipRole: null,
                legacyMemberRole: "VIEWER",
            });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).resolves.toMatchObject({ id: STORE_B_ID });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                false,
            );
        });

        it("rejects operations on an org-less Store (application-layer NOT NULL guard)", async () => {
            setupStore({ organizationId: null, membershipRole: null });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).rejects.toBeInstanceOf(ConflictException);
            await expect(
                service().canWrite(STORE_B_ID, USER),
            ).rejects.toBeInstanceOf(ConflictException);
        });

        it("still 404s a missing store without leaking existence", async () => {
            setupStore({
                organizationId: ORG_B,
                membershipRole: "OWNER",
                exists: false,
            });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).rejects.toBeInstanceOf(NotFoundException);
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                false,
            );
        });
    });

    describe("flag OFF — legacy path is unchanged (org membership ignored)", () => {
        const service = () => new StoresService(flags(false));

        it("denies cross-tenant READ even when the caller is the store's org OWNER", async () => {
            // Flag OFF: membership must NOT be consulted. Caller is OWNER of the
            // store's org but has no legacy owner/member row → denied.
            setupStore({ organizationId: ORG_B, membershipRole: "OWNER" });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(membershipFindUnique).not.toHaveBeenCalled();
        });

        it("denies cross-tenant WRITE even when the caller is the store's org OWNER", async () => {
            setupStore({ organizationId: ORG_B, membershipRole: "OWNER" });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                false,
            );
            expect(membershipFindUnique).not.toHaveBeenCalled();
        });

        it("grants a legacy owner/member exactly as before", async () => {
            setupStore({
                organizationId: ORG_B,
                membershipRole: null,
                legacyOwner: true,
            });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).resolves.toMatchObject({ id: STORE_B_ID });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                true,
            );
            expect(membershipFindUnique).not.toHaveBeenCalled();
        });

        it("does NOT invoke the org-less guard for a null-org store (pure legacy)", async () => {
            // With the flag off an org-less store is fine; it just uses legacy.
            setupStore({
                organizationId: null,
                membershipRole: null,
                legacyMemberRole: "MANAGER",
            });
            await expect(
                service().getForUser(STORE_B_ID, USER),
            ).resolves.toMatchObject({ id: STORE_B_ID });
            await expect(service().canWrite(STORE_B_ID, USER)).resolves.toBe(
                true,
            );
        });
    });
});
