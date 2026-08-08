import { ForbiddenException } from "@nestjs/common";

// Mock the database package so the service never touches a real Postgres. The
// `$transaction` mock invokes its callback with the same mocked client, so we
// can assert the rename and the profile upsert land in the ONE transaction.
jest.mock("@saroh/database", () => {
    const client = {
        organization: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        businessProfile: {
            upsert: jest.fn(),
        },
        membership: {
            findMany: jest.fn(),
            count: jest.fn(),
        },
    };
    return {
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit.service";
import type { UpdateOrganizationDto } from "./dto";
import { OrganizationSettingsService } from "./organization-settings.service";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const orgUpdate = prisma.organization.update as jest.Mock;
const profileUpsert = prisma.businessProfile.upsert as jest.Mock;
const membershipFindMany = prisma.membership.findMany as jest.Mock;
const membershipCount = prisma.membership.count as jest.Mock;

const ctx = (role: OrgRole = "OWNER") => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
});

describe("OrganizationSettingsService", () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const audit = { record } as unknown as AuditService;
    const service = new OrganizationSettingsService(audit);

    beforeEach(() => {
        jest.clearAllMocks();
        orgFindUnique.mockResolvedValue({
            id: "org_1",
            name: "Acme",
            slug: "acme",
            businessProfile: {
                legalName: "Acme Inc",
                type: "company",
                country: "IN",
                taxId: "TAX1",
                contactEmail: "hi@acme.test",
                website: "https://acme.test",
            },
        });
    });

    describe("get", () => {
        it("returns the org identity with its profile for OWNER/ADMIN", async () => {
            const settings = await service.get(ctx("ADMIN"));
            expect(settings.name).toBe("Acme");
            expect(settings.profile?.legalName).toBe("Acme Inc");
        });

        it("denies a MEMBER — legal/tax identity is not in the org:read floor", async () => {
            await expect(service.get(ctx("MEMBER"))).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            expect(orgFindUnique).not.toHaveBeenCalled();
        });
    });

    describe("update", () => {
        it("denies a MEMBER and writes nothing", async () => {
            await expect(
                service.update(ctx("MEMBER"), { name: "Evil" }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(orgUpdate).not.toHaveBeenCalled();
            expect(profileUpsert).not.toHaveBeenCalled();
            expect(record).not.toHaveBeenCalled();
        });

        it("renames the org and upserts the profile in one transaction", async () => {
            const dto: UpdateOrganizationDto = {
                name: "Acme Global",
                profile: { legalName: "Acme Global Inc" },
            };

            await service.update(ctx(), dto);

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(orgUpdate).toHaveBeenCalledWith({
                where: { id: "org_1" },
                data: { name: "Acme Global" },
            });
            expect(profileUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { organizationId: "org_1" },
                    update: { legalName: "Acme Global Inc" },
                }),
            );
        });

        it("upserts, so an org onboarded with a name alone can add a profile later", async () => {
            orgFindUnique.mockResolvedValue({
                id: "org_1",
                name: "Acme",
                slug: "acme",
                businessProfile: null,
            });

            const settings = await service.update(ctx(), {
                profile: { taxId: "TAX9" },
            });

            expect(profileUpsert).toHaveBeenCalledWith({
                where: { organizationId: "org_1" },
                create: { organizationId: "org_1", taxId: "TAX9" },
                update: { taxId: "TAX9" },
            });
            expect(settings.profile).toBeNull();
        });

        it("patches only the fields sent — never blanks the untouched ones", async () => {
            await service.update(ctx(), { profile: { country: "US" } });

            expect(orgUpdate).not.toHaveBeenCalled();
            expect(profileUpsert).toHaveBeenCalledWith({
                where: { organizationId: "org_1" },
                create: { organizationId: "org_1", country: "US" },
                update: { country: "US" },
            });
        });

        it("preserves an explicit empty string, which is how the UI clears a field", async () => {
            await service.update(ctx(), { profile: { taxId: "" } });

            expect(profileUpsert).toHaveBeenCalledWith(
                expect.objectContaining({ update: { taxId: "" } }),
            );
        });

        it("writes nothing and emits no audit row when the patch is empty", async () => {
            await service.update(ctx(), {});

            expect(orgUpdate).not.toHaveBeenCalled();
            expect(profileUpsert).not.toHaveBeenCalled();
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(record).not.toHaveBeenCalled();
        });

        it("audits the changed field NAMES only — never the PII values", async () => {
            await service.update(ctx(), {
                name: "Acme Global",
                profile: { taxId: "SECRET-TAX", contactEmail: "cfo@acme.test" },
            });

            expect(record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: AuditAction.ProfileUpdate,
                    actorUserId: "user_1",
                    organizationId: "org_1",
                    metadata: { fields: ["name", "taxId", "contactEmail"] },
                }),
            );
            const audited = JSON.stringify(record.mock.calls[0][0]);
            expect(audited).not.toContain("SECRET-TAX");
            expect(audited).not.toContain("cfo@acme.test");
        });

        it("never re-slugs on rename — the slug is the stable public identifier", async () => {
            await service.update(ctx(), { name: "Totally Different Name" });

            expect(orgUpdate).toHaveBeenCalledWith({
                where: { id: "org_1" },
                data: { name: "Totally Different Name" },
            });
            const written = orgUpdate.mock.calls[0][0] as { data: object };
            expect(written.data).not.toHaveProperty("slug");
        });
    });

    // Pre-flight for account deletion. The authoritative refusal is the
    // beforeDelete hook in @saroh/auth; this only lets the UI say it earlier.
    describe("listSoleOwned", () => {
        const owned = [
            {
                organizationId: "org_1",
                organization: { id: "org_1", name: "Acme", slug: "acme" },
            },
            {
                organizationId: "org_2",
                organization: { id: "org_2", name: "Solo", slug: "solo" },
            },
        ];

        it("returns only orgs with no OTHER owner", async () => {
            membershipFindMany.mockResolvedValue(owned);
            // org_1 has a co-owner; org_2 does not.
            membershipCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

            expect(await service.listSoleOwned("user_1")).toEqual([
                { id: "org_2", name: "Solo", slug: "solo" },
            ]);
        });

        it("excludes the user themself when counting co-owners", async () => {
            membershipFindMany.mockResolvedValue([owned[0]]);
            membershipCount.mockResolvedValue(0);

            await service.listSoleOwned("user_1");

            expect(membershipCount).toHaveBeenCalledWith({
                where: {
                    organizationId: "org_1",
                    role: "OWNER",
                    userId: { not: "user_1" },
                },
            });
        });

        it("returns nothing when the user owns no organization", async () => {
            membershipFindMany.mockResolvedValue([]);

            expect(await service.listSoleOwned("user_1")).toEqual([]);
            expect(membershipCount).not.toHaveBeenCalled();
        });
    });
});
