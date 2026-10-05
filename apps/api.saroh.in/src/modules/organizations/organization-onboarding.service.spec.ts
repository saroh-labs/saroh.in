import { BadRequestException, ConflictException } from "@nestjs/common";

// Mock the database package so the service never touches a real Postgres. The
// `$transaction` mock simply invokes its callback with the same mocked client,
// so we can assert every write happens inside the one transaction.
jest.mock("@saroh/database", () => {
    const client = {
        organization: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        businessProfile: {
            create: jest.fn(),
        },
        // Read by the address check: a website already served at an
        // address makes it taken, as much as a business reserving it.
        site: {
            findUnique: jest.fn(),
        },
        // An address another business held before a change (DEC-069).
        addressReservation: {
            findUnique: jest.fn(),
        },
        membership: {
            create: jest.fn(),
        },
    };
    return {
        currentOrgContext: () => undefined,
        isRlsEnforcementEnabled: () => false,
        outsideOrgContext: <T>(fn: () => T) => fn(),
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { prisma } from "@saroh/database";

import type { AuditService } from "../audit/audit.service";
import { AuditAction, AuditOutcome } from "../audit/audit.service";
import type { OnboardOrganizationDto } from "./dto";
import { OrganizationOnboardingService } from "./organization-onboarding.service";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const orgCreate = prisma.organization.create as jest.Mock;
const siteFindUnique = (
    prisma as unknown as { site: { findUnique: jest.Mock } }
).site.findUnique;
const heldFindUnique = (
    prisma as unknown as { addressReservation: { findUnique: jest.Mock } }
).addressReservation.findUnique;
const profileCreate = prisma.businessProfile.create as jest.Mock;
const membershipCreate = prisma.membership.create as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

describe("OrganizationOnboardingService.onboard", () => {
    // AuditService.record is fire-and-forget (never throws); a jest mock stands
    // in so we can also assert onboarding emits the audit event.
    const record = jest.fn().mockResolvedValue(undefined);
    const audit = { record } as unknown as AuditService;
    const service = new OrganizationOnboardingService(audit);

    beforeEach(() => {
        jest.clearAllMocks();
        // Default happy-path stubs; individual tests override as needed.
        orgFindUnique.mockResolvedValue(null);
        siteFindUnique.mockResolvedValue(null);
        heldFindUnique.mockResolvedValue(null);
        orgCreate.mockResolvedValue({ id: "org_1", slug: "acme" });
        profileCreate.mockResolvedValue({ id: "bp_1" });
        membershipCreate.mockResolvedValue({ id: "mem_1" });
    });

    it("creates org + profile + OWNER membership atomically in one transaction", async () => {
        const dto: OnboardOrganizationDto = {
            name: "Acme",
            profile: { legalName: "Acme Inc", type: "company", country: "US" },
        };

        const result = await service.onboard("user_1", dto);

        expect(result).toEqual({ id: "org_1", slug: "acme" });

        // Everything runs inside exactly one $transaction.
        expect(transaction).toHaveBeenCalledTimes(1);

        expect(orgCreate).toHaveBeenCalledWith({
            // No kind sent (an app from before DEC-070): a business.
            data: { name: "Acme", slug: "acme", kind: "BUSINESS" },
            select: { id: true, slug: true },
        });
        expect(profileCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                legalName: "Acme Inc",
                // An old client's spelling is stored as `pvt` (F10b).
                type: "pvt",
                country: "US",
                taxId: undefined,
                contactEmail: undefined,
                website: undefined,
            },
        });
        expect(membershipCreate).toHaveBeenCalledWith({
            data: { organizationId: "org_1", userId: "user_1", role: "OWNER" },
        });
    });

    it("stores a private limited company as pvt, and takes a new type as sent (F10b)", async () => {
        await service.onboard("user_1", {
            name: "Acme",
            profile: { type: "pvt" },
        });
        expect(profileCreate).toHaveBeenLastCalledWith({
            data: expect.objectContaining({ type: "pvt" }),
        });

        await service.onboard("user_1", {
            name: "Acme",
            profile: { type: "partnership" },
        });
        expect(profileCreate).toHaveBeenLastCalledWith({
            data: expect.objectContaining({ type: "partnership" }),
        });
    });

    describe('setup\'s "Is it registered?" (prelaunch)', () => {
        it("keeps Registered, which sends no type, so go-live can ask for the real one", async () => {
            await service.onboard("user_1", {
                name: "Acme",
                profile: { registered: true, country: "IN" },
            });
            const { data } = profileCreate.mock.lastCall?.[0] as {
                data: Record<string, unknown>;
            };
            expect(data.legallyRegistered).toBe(true);
            expect(data.type).toBeUndefined();
        });

        it("reads Not registered (the individual type) as not registered", async () => {
            await service.onboard("user_1", {
                name: "Acme",
                profile: { type: "individual" },
            });
            expect(profileCreate).toHaveBeenLastCalledWith({
                data: expect.objectContaining({
                    type: "individual",
                    legallyRegistered: false,
                }),
            });
        });

        it("leaves it unasked when setup didn't ask", async () => {
            await service.onboard("user_1", {
                name: "Acme",
                profile: { country: "IN" },
            });
            const { data } = profileCreate.mock.lastCall?.[0] as {
                data: Record<string, unknown>;
            };
            expect(data.legallyRegistered).toBeUndefined();
        });
    });

    it("emits an organization.onboard SUCCESS audit event after commit", async () => {
        await service.onboard("user_1", { name: "Acme" });

        expect(record).toHaveBeenCalledTimes(1);
        expect(record).toHaveBeenCalledWith({
            action: AuditAction.OrganizationOnboard,
            actorUserId: "user_1",
            organizationId: "org_1",
            targetType: "organization",
            targetId: "org_1",
            outcome: AuditOutcome.Success,
            metadata: { slug: "acme", kind: "BUSINESS" },
        });
    });

    describe("what is being set up (DEC-070)", () => {
        it.each(["BUSINESS", "SOLO", "WORK"] as const)(
            "stores %s as chosen, and audits it",
            async (kind) => {
                await service.onboard("user_1", { name: "Asha Rao", kind });

                expect(orgCreate).toHaveBeenCalledWith({
                    data: { name: "Asha Rao", slug: "asha-rao", kind },
                    select: { id: true, slug: true },
                });
                expect(record).toHaveBeenCalledWith(
                    expect.objectContaining({
                        metadata: { slug: "acme", kind },
                    }),
                );
            },
        );

        it("stores a business when an older app sends no kind", async () => {
            await service.onboard("user_1", { name: "Rye" });
            expect(orgCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ kind: "BUSINESS" }),
                }),
            );
        });
    });

    it("derives ownership from the passed userId, not the DTO", async () => {
        // A malicious client crams an ownerId/userId/role into the body; the
        // service must ignore all of it and use the authenticated actor.
        const dto = {
            name: "Acme",
            userId: "attacker",
            ownerId: "attacker",
            role: "ADMIN",
        } as unknown as OnboardOrganizationDto;

        await service.onboard("actor_42", dto);

        expect(membershipCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                userId: "actor_42",
                role: "OWNER",
            },
        });
        const membershipArg = membershipCreate.mock.calls[0][0].data;
        expect(membershipArg.userId).toBe("actor_42");
        expect(membershipArg.userId).not.toBe("attacker");
        expect(membershipArg.role).toBe("OWNER");
    });

    it("skips the BusinessProfile when no profile fields are supplied", async () => {
        await service.onboard("user_1", { name: "Acme" });
        expect(profileCreate).not.toHaveBeenCalled();
        expect(membershipCreate).toHaveBeenCalledTimes(1);
    });

    it("skips the BusinessProfile when the profile object is empty", async () => {
        await service.onboard("user_1", { name: "Acme", profile: {} });
        expect(profileCreate).not.toHaveBeenCalled();
    });

    it("throws Conflict on a slug collision and creates nothing", async () => {
        orgFindUnique.mockResolvedValue({ id: "existing" });

        await expect(
            service.onboard("user_1", { name: "Acme" }),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(orgCreate).not.toHaveBeenCalled();
        expect(membershipCreate).not.toHaveBeenCalled();
        expect(profileCreate).not.toHaveBeenCalled();
    });

    it("throws BadRequest when the name has no slug-able characters", async () => {
        await expect(
            service.onboard("user_1", { name: "!!!" }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(transaction).not.toHaveBeenCalled();
        expect(orgCreate).not.toHaveBeenCalled();
    });

    it("derives the slug from the organization name", async () => {
        orgCreate.mockResolvedValue({ id: "org_2", slug: "my-shop" });
        await service.onboard("user_1", { name: "  My Shop!  " });
        expect(orgFindUnique).toHaveBeenCalledWith({
            where: { slug: "my-shop" },
            select: { id: true },
        });
        expect(orgCreate).toHaveBeenCalledWith({
            data: { name: "  My Shop!  ", slug: "my-shop", kind: "BUSINESS" },
            select: { id: true, slug: true },
        });
    });

    describe("the address the business reserves", () => {
        it("uses the address the merchant chose, not the name's", async () => {
            await service.onboard("user_1", {
                name: "Rye & Co. Bakery",
                address: "ryeandco",
            });
            expect(orgCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        name: "Rye & Co. Bakery",
                        slug: "ryeandco",
                        kind: "BUSINESS",
                    },
                }),
            );
        });

        it("refuses a reserved address on the address field, creating nothing", async () => {
            const err = await service
                .onboard("user_1", { name: "Rye", address: "api" })
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(BadRequestException);
            expect((err as BadRequestException).getResponse()).toMatchObject({
                details: { field: "address" },
            });
            expect(transaction).not.toHaveBeenCalled();
        });

        it("counts an address as taken when another business's website lives there", async () => {
            siteFindUnique.mockResolvedValue({ organizationId: "org_other" });
            const err = await service
                .onboard("user_1", { name: "Rye", address: "ryeandco" })
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(ConflictException);
            expect((err as ConflictException).getResponse()).toMatchObject({
                details: { field: "address" },
            });
            expect(orgCreate).not.toHaveBeenCalled();
        });

        it("refuses an address with two hyphens in a row, in the rule's words (DEC-071)", async () => {
            const err = await service
                .onboard("user_1", { name: "My Shop", address: "my--shop" })
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(BadRequestException);
            expect((err as BadRequestException).getResponse()).toMatchObject({
                message: "An address can't have two hyphens in a row",
                details: { field: "address" },
            });
            expect(transaction).not.toHaveBeenCalled();
        });

        it("counts an address another business still holds after a change as taken", async () => {
            heldFindUnique.mockResolvedValue({
                organizationId: "org_other",
                reservedUntil: new Date(Date.now() + 86_400_000),
            });
            const err = await service
                .onboard("user_1", { name: "Rye", address: "ryeandco" })
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(ConflictException);
            expect(orgCreate).not.toHaveBeenCalled();
        });

        it("cuts a long name's address to 57 characters, with no hyphen at the cut", async () => {
            // 56 letters, a space, then more: the cut lands on the hyphen.
            await service.onboard("user_1", {
                name: `${"a".repeat(56)} bakery`,
            });
            expect(orgCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ slug: "a".repeat(56) }),
                }),
            );
        });
    });
});

describe("OrganizationOnboardingService.checkAddress", () => {
    const service = new OrganizationOnboardingService({
        record: jest.fn(),
    } as unknown as AuditService);

    beforeEach(() => {
        jest.clearAllMocks();
        orgFindUnique.mockResolvedValue(null);
        siteFindUnique.mockResolvedValue(null);
        heldFindUnique.mockResolvedValue(null);
    });

    it("says a free address is available, normalised", async () => {
        expect(await service.checkAddress("  RyeAndCo ")).toEqual({
            address: "ryeandco",
            available: true,
        });
    });

    it.each([
        ["ab", /at least 3/],
        ["-rye", /hyphen/],
        ["rye co", /lowercase/],
        ["support", /kept for Saroh/],
        ["test", /kept for Saroh/],
        ["my--shop", /^An address can't have two hyphens in a row$/],
        ["a".repeat(58), /^An address can have at most 57 characters$/],
    ])("says why %s cannot be used", async (address, reason) => {
        const answer = await service.checkAddress(address);
        expect(answer.available).toBe(false);
        expect(answer.reason).toMatch(reason);
    });

    it("says an address another business reserved is taken", async () => {
        orgFindUnique.mockResolvedValue({ id: "org_other" });
        expect(await service.checkAddress("ryeandco")).toMatchObject({
            available: false,
            reason: "Another business already has this address",
        });
    });
});
